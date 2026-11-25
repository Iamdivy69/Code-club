import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import { z, ZodError } from 'zod';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { makeSessions, sessionDays } from './auth/sessions.js';
import type { Execute } from './modules/practice/judge.js';
import { attachPracticeExecutor } from './execution.js';
import { practicePlatform } from './platform.js';
import { createStandaloneAccount, signupInput } from './auth/signup.js';
import { emailAddress } from './auth/account-state.js';
import { accountRecovery, resetPasswordInput, verifyEmailInput } from './auth/recovery.js';
import { smtpDelivery, type MailDelivery } from './modules/notifications/smtp.js';
import { googleCallback, googleProvider, type GoogleProvider } from './auth/google-provider.js';
import { registerGoogleSignIn } from './auth/google-sign-in.js';

const loginInput = z.object({ email: emailAddress, password: z.string().min(1).max(72) });
const emailInput = z.strictObject({ email: emailAddress });
const requestLinkLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
const consumeLinkLimit = { config: { rateLimit: { max: 12, timeWindow: '15 minutes' } } };

export function createApp(db: PrismaClient, config: Config, overrideExecute?: Execute, overrideMail?: MailDelivery,
  overrideGoogle?: GoogleProvider) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : {
      serializers: {
        req(request: FastifyRequest) {
          const version = request.headers['accept-version'];
          return { method: request.method,
            url: request.url.split('?', 1)[0] === googleCallback ? googleCallback : request.url,
            version: typeof version === 'string' ? version : undefined, host: request.host,
            remoteAddress: request.ip, remotePort: request.socket?.remotePort };
        },
      },
    },
    bodyLimit: 300_000,
  });
  const executor = attachPracticeExecutor(app, config, overrideExecute);
  const mailEnabled = config.PRACTICE_ACCOUNT_EMAIL_ENABLED === 'true';
  if (mailEnabled && process.env.EMAIL_ENABLED !== 'true' && !overrideMail) throw new Error('Enable SMTP email for standalone account links.');
  const mail = overrideMail ?? (mailEnabled ? smtpDelivery(process.env, config.NODE_ENV === 'production') : undefined);
  const allowSignup = config.NODE_ENV !== 'production' || config.PRACTICE_PUBLIC_SIGNUP_ENABLED === 'true';
  const signupEnabled = allowSignup && (config.NODE_ENV !== 'production' || Boolean(mail));
  const google = overrideGoogle ?? googleProvider(config);
  const auth = makeSessions(db, config, Boolean(mail));
  const recovery = accountRecovery(db, mail);
  async function sendLink(kind: Parameters<typeof recovery.sendLink>[0], email: string) {
    try { await recovery.sendLink(kind, email); }
    catch { app.log.warn({ kind }, 'Account email could not be delivered'); }
  }
  const cookieName = 'refreshToken';
  const cookieOptions = {
    path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax',
  } as const;
  function setSessionCookie(reply: FastifyReply, value: string) {
    reply.setCookie(cookieName, value, { ...cookieOptions, maxAge: sessionDays * 86_400 });
  }
  app.register(cookie);
  app.register(helmet);
  app.register(rateLimit, { global: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Check the submitted fields.' });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    const status = typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode : 500;
    if (status === 429) return reply.code(429).send({ error: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' });
    if (status === 400 || status === 413 || status === 415) return reply.code(status).send({ error: 'BAD_REQUEST', message: 'The request could not be read.' });
    request.log.error({ kind: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'The request failed. Please try again.' });
  });

  app.get('/api/practice/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return {
      database: 'ready',
      ...executor.status(),
    };
  });
  app.get('/api/auth/options', async () => ({ signupEnabled, accountEmailEnabled: Boolean(mail), googleEnabled: Boolean(google) }));
  if (google) registerGoogleSignIn(app, { db, provider: google, auth, allowSignup,
    sendVerification: mail ? (email) => sendLink('verification', email) : undefined,
    refreshCookie: cookieName, setSessionCookie,
  });
  if (signupEnabled) app.post('/api/auth/signup', requestLinkLimit, async (request, reply) => {
    const input = signupInput.parse(request.body);
    await createStandaloneAccount(db, input);
    reply.header('Cache-Control', 'no-store').code(201).send({ created: true, verificationRequired: Boolean(mail) });
    await sendLink('verification', input.email);
  });
  app.post('/api/auth/resend-verification', requestLinkLimit, async (request, reply) => {
    const { email } = emailInput.parse(request.body);
    reply.header('Cache-Control', 'no-store').code(202).send({ accepted: true });
    await sendLink('verification', email);
  });
  app.post('/api/auth/forgot-password', requestLinkLimit, async (request, reply) => {
    const { email } = emailInput.parse(request.body);
    reply.header('Cache-Control', 'no-store').code(202).send({ accepted: true });
    await sendLink('reset', email);
  });
  app.post('/api/auth/verify-email', consumeLinkLimit, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    await recovery.verifyEmail(verifyEmailInput.parse(request.body).token);
    return { verified: true };
  });
  app.post('/api/auth/reset-password', consumeLinkLimit, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { token, newPassword } = resetPasswordInput.parse(request.body);
    await recovery.resetPassword(token, newPassword);
    return reply.clearCookie(cookieName, cookieOptions).send({ reset: true });
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = loginInput.parse(request.body);
    const { user, accessToken, refreshToken } = await auth.login(input.email, input.password, request);
    setSessionCookie(reply, refreshToken);
    return { user, accessToken };
  });
  app.get('/api/auth/me', async (request) => ({ user: await auth.authenticate(request) }));
  app.post('/api/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { user, accessToken, refreshToken } = await auth.refresh(request.cookies[cookieName]);
    setSessionCookie(reply, refreshToken);
    return { user, accessToken };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    await auth.revoke(request.cookies[cookieName]);
    return reply.clearCookie(cookieName, cookieOptions).code(204).send();
  });
  app.register(practicePlatform, { prefix: '/api/practice', db, execute: executor.execute, authenticate: auth.authenticate,
    billingEnabled: config.PRACTICE_BILLING_ENABLED,
    proofSecret: config.PRACTICE_PROFILE_SIGN_SECRET ?? config.JWT_PRIVATE_KEY ?? config.JWT_SECRET,
  });
  return app;
}
