import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { googleCallback, googleProvider, type GoogleProvider } from '../src/auth/google-provider.js';
import { createDatabase } from '../src/database.js';
import type { MailMessage } from '../src/modules/notifications/smtp.js';

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
const site = new URL('https://practice.test');
const password = 'integration-password-only';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const config = {
  NODE_ENV: 'test' as const, PORT: 5010, DATABASE_URL: connection ?? 'postgresql://localhost/practice_test',
  JWT_SECRET: 'google-integration-signing-key-at-least-32-bytes',
};

it('builds Google’s official authorization URL using the standalone origin and PKCE', () => {
  expect(googleProvider(config)).toBeUndefined();
  expect(() => googleProvider({ ...config, PRACTICE_GOOGLE_CLIENT_ID: 'fixture-client' })).toThrow();
  const settings = { ...config, PRACTICE_GOOGLE_CLIENT_ID: 'fixture-client',
    PRACTICE_GOOGLE_CLIENT_SECRET: 'fixture-secret', FRONTEND_URL: site.href };
  expect(() => googleProvider({ ...settings, FRONTEND_URL: 'https://practice.test/nested' })).toThrow();
  const provider = googleProvider(settings)!;
  const url = new URL(provider.authorize({ state: 'state', nonce: 'nonce', challenge: 'pkce-challenge' }));
  expect(url.origin).toBe('https://accounts.google.com');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    redirect_uri: site.origin + googleCallback, response_type: 'code', scope: 'openid email profile',
    state: 'state', nonce: 'nonce', code_challenge: 'pkce-challenge', code_challenge_method: 'S256',
  });
  expect(url.href).not.toContain('fixture-secret');
});

describe.skipIf(!connection)('standalone Google sign-in with PostgreSQL', () => {
  let db: ReturnType<typeof createDatabase>;

  beforeAll(() => {
    const target = new URL(connection!);
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/practice_test') {
      throw new Error('Use a disposable local database named practice_test.');
    }
    db = createDatabase(connection!);
  });
  afterAll(async () => { await db?.$disconnect(); });

  function fixture(withMail = false) {
    let identity: Record<string, unknown> = {};
    const redeemed = vi.fn(async (_code: string, _verifier: string) => identity);
    const provider: GoogleProvider = {
      site,
      authorize: ({ state, nonce, challenge }) => 'https://google-fixture.test/authorize?' +
        new URLSearchParams({ state, nonce, challenge }).toString(),
      redeem: redeemed,
    };
    const outbox: MailMessage[] = [];
    const app = createApp(db, config, undefined, withMail ? {
      site, async send(message) { outbox.push(message); },
    } : undefined, provider);
    const attemptName = 'practice_google_attempt';

    async function start({ bearer, refresh, next }: { bearer?: string; refresh?: string; next?: string } = {}) {
      const response = bearer
        ? await app.inject({ method: 'POST', url: '/api/auth/google/link', headers: { authorization: 'Bearer ' + bearer },
          cookies: refresh ? { refreshToken: refresh } : {} })
        : await app.inject({ url: '/api/auth/google/start', query: next ? { next } : {} });
      expect(response.statusCode).toBe(bearer ? 200 : 303);
      const url = new URL(bearer ? response.json().url : response.headers.location!);
      const cookie = response.cookies.find((item) => item.name === attemptName);
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, path: '/api/auth/google', sameSite: 'Lax' });
      const browser = cookie!.value;
      const state = url.searchParams.get('state')!;
      const nonce = url.searchParams.get('nonce')!;
      const attempt = await db.practiceGoogleAttempt.findUniqueOrThrow({ where: { stateDigest: sha(state) } });
      expect(attempt.browserDigest).toBe(sha(browser));
      expect(attempt.nonce).toBe(nonce);
      expect(createHash('sha256').update(attempt.verifier).digest('base64url')).toBe(url.searchParams.get('challenge'));
      return { browser, state, nonce, verifier: attempt.verifier };
    }
    function callback(attempt: Awaited<ReturnType<typeof start>>, data: Record<string, unknown>, refreshToken?: string) {
      identity = { email_verified: true, name: 'Google fixture', nonce: attempt.nonce, ...data };
      return app.inject({ url: googleCallback, query: { state: attempt.state, code: 'fixture-code' },
        cookies: { [attemptName]: attempt.browser, ...(refreshToken ? { refreshToken } : {}) } });
    }
    async function newLocalAccount() {
      const email = randomUUID() + '@practice.test';
      const created = await app.inject({ method: 'POST', url: '/api/auth/signup',
        payload: { name: 'Local fixture', email, password } });
      expect(created.statusCode).toBe(201);
      const user = await db.user.update({ where: { email }, data: { emailVerified: true } });
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect(login.statusCode).toBe(200);
      return { user, bearer: login.json().accessToken as string, refresh: login.cookies[0]!.value };
    }
    return { app, start, callback, redeemed, outbox, newLocalAccount };
  }

  it('consumes the browser-bound attempt once and reuses the DSA learner identity by subject', async () => {
    const { app, start, callback, redeemed } = fixture();
    try {
      const sub = randomUUID();
      const email = randomUUID() + '@gmail.com';
      const attempt = await start({ next: '//elsewhere.test' });
      const wrongBrowser = await callback({ ...attempt, browser: sha('other') }, { sub, email });
      expect(wrongBrowser.headers.location).toBe('/login?google=expired');
      expect(redeemed).not.toHaveBeenCalled();
      const wrongNonce = await callback(attempt, { sub, email, nonce: sha('incorrect') });
      expect(wrongNonce.headers.location).toBe('/login?google=failed');
      expect((await callback(attempt, { sub, email })).headers.location).toBe('/login?google=expired');
      expect(redeemed).toHaveBeenCalledTimes(1);
      expect(redeemed).toHaveBeenCalledWith('fixture-code', attempt.verifier);
      expect(await db.user.findUnique({ where: { email } })).toBeNull();
      const expiredAttempt = await start();
      await db.practiceGoogleAttempt.update({ where: { stateDigest: sha(expiredAttempt.state) }, data: { expiresAt: new Date(0) } });
      expect((await callback(expiredAttempt, { sub, email })).headers.location).toBe('/login?google=expired');

      const live = await start({ next: '/practice/dashboard?from=login' });
      const results = await Promise.all([callback(live, { sub, email }), callback(live, { sub, email })]);
      const success = results.find((result) => result.headers.location === '/practice/dashboard?from=login');
      expect(success?.statusCode).toBe(303);
      expect(success?.headers['cache-control']).toBe('no-store');
      expect(success?.headers['referrer-policy']).toBe('no-referrer');
      expect(results.some((result) => result.headers.location === '/login?google=expired')).toBe(true);
      const user = await db.user.findUniqueOrThrow({ where: { email }, include: { student: true } });
      expect(user).toMatchObject({ role: 'STUDENT', emailVerified: true, student: { userId: user.id } });

      const changedEmail = await callback(await start({ next: '/practice/../account' }),
        { sub, email: randomUUID() + '@gmail.com' });
      expect(changedEmail.headers.location).toBe('/practice');
      const refresh = changedEmail.cookies.find((item) => item.name === 'refreshToken')?.value;
      expect(refresh).toBeTruthy();
      const session = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: refresh! } });
      expect(session.json().user).toMatchObject({ id: user.id, email, role: 'STUDENT' });

      await db.user.update({ where: { id: user.id }, data: { isActive: false } });
      const barred = await callback(await start(), { sub, email });
      expect(barred.headers.location).toBe('/login?google=access-denied');
    } finally { await app.close(); }
  });

  it('only links a matching verified email from the same active browser session', async () => {
    const { app, start, callback, newLocalAccount } = fixture();
    try {
      const { user, bearer, refresh } = await newLocalAccount();
      const sub = randomUUID();
      const email = user.email;
      const unlinked = await callback(await start(), { sub, email });
      expect(unlinked.headers.location).toBe('/login?google=connect-first');
      expect(await db.practiceGoogleIdentity.findUnique({ where: { subject: sub } })).toBeNull();
      const response = await app.inject({ method: 'POST', url: '/api/auth/google/link',
        headers: { authorization: 'Bearer ' + bearer } });
      expect(response.statusCode).toBe(401);
      const link = () => start({ bearer, refresh });
      expect((await callback(await link(), { sub, email })).headers.location).toBe('/account?google=access-denied');
      expect((await callback(await link(), { sub, email: 'different@gmail.com' }, refresh)).headers.location)
        .toBe('/account?google=email-mismatch');
      const attached = await callback(await link(), { sub, email }, refresh);
      expect(attached.headers.location).toBe('/account?google=linked');
      expect(attached.cookies.some((item) => item.name === 'refreshToken')).toBe(false);
      const connection = await app.inject({ url: '/api/auth/google/connection', headers: { authorization: 'Bearer ' + bearer } });
      expect(connection.json()).toEqual({ connected: true });
      expect((await callback(await link(), { sub: randomUUID(), email }, refresh)).headers.location)
        .toBe('/account?google=conflict');
      expect(await db.practiceGoogleIdentity.findUnique({ where: { subject: sub } })).toMatchObject({ userId: user.id });

      const revokedAttempt = await link();
      await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { refreshToken: refresh } });
      expect((await callback(revokedAttempt, { sub, email }, refresh)).headers.location).toBe('/login?google=expired');
    } finally { await app.close(); }
  });

  it('requires CodeClub verification before signing in with a third-party email', async () => {
    const enabled = fixture(true);
    const disabled = fixture();
    try {
      const identity = { sub: randomUUID(), email: randomUUID() + '@practice.test' };
      const noMail = await disabled.callback(await disabled.start(), identity);
      expect(noMail.headers.location).toBe('/login?google=verification-unavailable');
      expect(await db.user.findUnique({ where: { email: identity.email } })).toBeNull();
      const pending = await enabled.callback(await enabled.start(), identity);
      expect(pending.headers.location).toBe('/login?google=check-email');
      expect(pending.cookies.some((item) => item.name === 'refreshToken')).toBe(false);
      const waiting = await enabled.callback(await enabled.start(), identity);
      expect(waiting.headers.location).toBe('/login?google=verify-first');
      const verification = enabled.outbox[0]!;
      expect(verification.to).toBe(identity.email);
      const fragment = new URL(verification.text.split('\n').find((line) => line.startsWith(site.origin))!).hash;
      const token = new URLSearchParams(fragment.slice(1)).get('token');
      const verified = await enabled.app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token } });
      expect(verified.statusCode).toBe(200);
      const active = await enabled.callback(await enabled.start(), identity);
      expect(active.headers.location).toBe('/practice');
    } finally { await Promise.all([enabled.app.close(), disabled.app.close()]); }
  });
});
