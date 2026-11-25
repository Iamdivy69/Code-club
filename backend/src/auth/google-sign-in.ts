import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { referralHandle } from '../modules/community/referrals.js';
import { emailAddress } from './account-state.js';
import { googleCallback, type GoogleProvider } from './google-provider.js';
import type { makeSessions } from './sessions.js';
import { createStandaloneLearner } from './signup.js';

const attemptCookie = 'practice_google_attempt';
const attemptSeconds = 600;
const random = () => randomBytes(32).toString('hex');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const key = z.string().regex(/^[a-f0-9]{64}$/);
const input = z.object({ next: z.string().optional(), referral: z.string().optional() });
const returned = z.object({ state: key, code: z.string().min(1).max(4096).optional(), error: z.string().optional() });
const claims = z.object({
  sub: z.string().min(1).max(255), nonce: key, email: emailAddress, email_verified: z.literal(true),
  name: z.string().optional(), hd: z.string().optional(),
});
const limit = { config: { rateLimit: { max: 12, timeWindow: '15 minutes' } } };

function destination(next = '') {
  if (next.length <= 500 && /^\/(practice(?:\/|[?#]|$)|solve\/)/.test(next) &&
      !/[\\\x00-\x20\x7f]/.test(next) && !/%(?:2e|2f|5c)/i.test(next.split(/[?#]/, 1)[0]!)) {
    const url = new URL(next, 'https://practice.local');
    if (/^\/(practice(?:\/|$)|solve\/)/.test(url.pathname)) return url.pathname + url.search + url.hash;
  }
  return '/practice';
}

type Options = {
  db: PrismaClient;
  provider: GoogleProvider;
  auth: ReturnType<typeof makeSessions>;
  allowSignup: boolean;
  sendVerification?: (email: string) => Promise<void>;
  refreshCookie: string;
  setSessionCookie(reply: FastifyReply, value: string): void;
};

export function registerGoogleSignIn(app: FastifyInstance, options: Options) {
  const { db, auth, provider } = options;
  const cookieOptions = { path: '/api/auth/google', httpOnly: true, sameSite: 'lax',
    secure: provider.site.protocol === 'https:' } as const;
  function privateResponse(reply: FastifyReply) {
    return reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
  }

  async function start(request: FastifyRequest, reply: FastifyReply, linkSessionId?: string) {
    const { next, referral } = input.parse(request.query);
    const state = random(), browser = random(), nonce = random();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const previous = key.safeParse(request.cookies[attemptCookie]);
    await db.practiceGoogleAttempt.deleteMany({
      where: { OR: [{ expiresAt: { lte: new Date() } }, ...(previous.success ? [{ browserDigest: sha(previous.data) }] : [])] },
    });
    await db.practiceGoogleAttempt.create({ data: {
      stateDigest: sha(state), browserDigest: sha(browser), verifier, nonce, nextPath: destination(next),
      referral: referralHandle.safeParse(referral).data, linkSessionId,
      expiresAt: new Date(Date.now() + attemptSeconds * 1000),
    } });
    privateResponse(reply).setCookie(attemptCookie, browser, { ...cookieOptions, maxAge: attemptSeconds });
    return provider.authorize({ state, nonce, challenge });
  }

  app.get('/api/auth/google/start', limit, async (request, reply) => reply.redirect(await start(request, reply), 303));
  app.get('/api/auth/google/connection', async (request, reply) => {
    privateResponse(reply);
    const { id } = await auth.authenticate(request);
    const linked = await db.practiceGoogleIdentity.findUnique({ where: { userId: id }, select: { createdAt: true } });
    return { connected: Boolean(linked) };
  });
  app.post('/api/auth/google/link', limit, async (request, reply) => {
    const sessionId = await auth.startProviderLink(request, request.cookies[options.refreshCookie]);
    return { url: await start(request, reply, sessionId) };
  });

  app.get(googleCallback, limit, async (request, reply) => {
    privateResponse(reply);
    const query = returned.safeParse(request.query);
    const browser = key.safeParse(request.cookies[attemptCookie]);
    let redirectPage = '/login';
    const finish = (status: string) => reply.redirect(redirectPage + '?google=' + status, 303);
    if (!query.success || !browser.success) return finish('expired');
    try {
      const stateDigest = sha(query.data.state);
      const browserDigest = sha(browser.data);
      const where = { stateDigest, browserDigest, expiresAt: { gt: new Date() } };
      const attempt = await db.practiceGoogleAttempt.findUnique({ where });
      if (!attempt) return finish('expired');
      if (!(await db.practiceGoogleAttempt.deleteMany({ where: { ...where, expiresAt: { gt: new Date() } } })).count) {
        return finish('expired');
      }
      reply.clearCookie(attemptCookie, cookieOptions);
      if (attempt.linkSessionId) redirectPage = '/account';
      if (query.data.error || !query.data.code) return finish('cancelled');
      const identity = claims.safeParse(await provider.redeem(query.data.code, attempt.verifier));
      if (!identity.success || identity.data.nonce !== attempt.nonce) return finish('failed');
      const { sub, email, name, hd } = identity.data;
      const domain = email.slice(email.lastIndexOf('@') + 1);
      const trustedEmail = domain === 'gmail.com' || domain === hd?.toLowerCase();
      const result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'practice-google:' + sub}, 0))`;
        const linked = await tx.practiceGoogleIdentity.findUnique({ where: { subject: sub } });
        if (attempt.linkSessionId) {
          const user = await auth.providerLinkUser(tx, attempt.linkSessionId, request.cookies[options.refreshCookie]);
          if (user.email.toLowerCase() !== email) return { status: 'email-mismatch' } as const;
          if (linked && linked.userId !== user.id) return { status: 'conflict' } as const;
          if (!linked) await tx.practiceGoogleIdentity.create({ data: { subject: sub, userId: user.id } });
          return { status: 'linked' } as const;
        }
        let userId = linked?.userId;
        if (!userId) {
          const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
          if (existing) return { status: 'connect-first' } as const;
          if (!options.allowSignup) return { status: 'signup-disabled' } as const;
          if (!trustedEmail && !options.sendVerification) return { status: 'verification-unavailable' } as const;
          // The account can choose a password later through the normal recovery flow.
          const passwordHash = await bcrypt.hash(random(), 12);
          const user = await createStandaloneLearner(tx, {
            name: name?.trim().slice(0, 100) || email.slice(0, 100), email, passwordHash,
            referral: attempt.referral ?? undefined, verified: trustedEmail,
          });
          userId = user.id;
          await tx.practiceGoogleIdentity.create({ data: { subject: sub, userId } });
          if (!trustedEmail) return { status: 'check-email', verifyEmail: email } as const;
        }
        const session = await auth.issueProviderSession(tx, userId, request);
        return { status: 'signed-in', refreshToken: session.refreshToken } as const;
      });
      if (result.status === 'signed-in') {
        options.setSessionCookie(reply, result.refreshToken);
        return reply.redirect(attempt.nextPath, 303);
      }
      if (result.status === 'check-email') await options.sendVerification?.(result.verifyEmail);
      return finish(result.status);
    } catch (error) {
      if (error instanceof AppError) {
        return finish(error.code === 'EMAIL_VERIFICATION_REQUIRED' ? 'verify-first' : 'access-denied');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return finish('conflict');
      request.log.warn({ kind: error instanceof Error ? error.name : 'UnknownError' }, 'Google sign-in attempt failed');
      return finish('failed');
    }
  });
}
