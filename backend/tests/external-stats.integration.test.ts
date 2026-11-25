import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
const base = '/api/practice/study/external-stats';
const password = 'external-stats-fixture-only';
const stamp = () => randomUUID().slice(0, 8);

describe.skipIf(!connection)('external practice stats with PostgreSQL', () => {
  let db: ReturnType<typeof createDatabase>;
  beforeAll(() => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/practice_test') throw new Error('Use a disposable practice_test database.');
    db = createDatabase(connection!);
  });
  afterAll(async () => { await db?.$disconnect(); });

  function fixture(provider = '') {
    vi.stubEnv('PRACTICE_LEETCODE_STATS_URL', provider);
    vi.stubEnv('PRACTICE_LEETCODE_STATS_TOKEN', 'external-stats-fixture-token');
    const app = createApp(db, { NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!,
      JWT_SECRET: 'external-stats-test-signing-key-only' });
    const ids: string[] = [];
    async function newUser() {
      const label = 'leetcode-' + stamp();
      const email = label + '@practice.test';
      const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: label, email, password } });
      expect(signup.statusCode).toBe(201);
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect(login.statusCode).toBe(200);
      const { user, accessToken } = login.json();
      ids.push(user.id);
      return { id: user.id as string, email, handle: label, headers: { authorization: 'Bearer ' + accessToken } };
    }
    async function close() {
      await app.close();
      await db.user.deleteMany({ where: { id: { in: ids } } });
      vi.unstubAllEnvs();
    }
    return { app, newUser, close };
  }

  it('uses manual provenance and respects public and recruiter consent without changing Practice totals', async () => {
    const { app, newUser, close } = fixture();
    try {
      const learner = await newUser();
      const recruiter = await newUser();
      const profile = { handle: learner.handle, bio: '', isPublic: false, hiringOpen: false };
      const publicUrl = '/api/practice/study/public-profile/' + learner.handle;
      const directory = '/api/practice/placement/candidates?q=' + learner.handle;
      const updateProfile = (isPublic: boolean, hiringOpen: boolean) => app.inject({
        method: 'PUT', url: '/api/practice/study/profile', headers: learner.headers, payload: { ...profile, isPublic, hiringOpen },
      });
      const localProgress = async () => {
        const result = await app.inject({ url: '/api/practice/study/overview', headers: learner.headers });
        expect(result.statusCode).toBe(200);
        const { solved, attempts, xp, streak } = result.json();
        return { solved, attempts, xp, streak };
      };
      const before = await localProgress();
      const counts = { username: 'fixture-user', easy: 201, medium: 72, hard: 13 };
      expect((await app.inject({ url: base })).statusCode).toBe(401);
      const empty = await app.inject({ url: base, headers: learner.headers });
      expect(empty.headers['cache-control']).toBe('private, no-store');
      expect(empty.json()).toEqual({ stats: null, revision: null, syncEnabled: false });
      const disabled = await app.inject({ method: 'POST', url: base + '/preview', headers: learner.headers,
        payload: { username: counts.username } });
      expect(disabled.statusCode).toBe(503);
      const manual = (payload: Record<string, unknown>) =>
        app.inject({ method: 'PUT', url: base, headers: learner.headers, payload });
      expect((await manual({ ...counts, source: 'fetched', revision: null })).statusCode).toBe(400);
      const created = await manual({ ...counts, revision: null });
      expect(created.statusCode, created.body).toBe(200);
      expect(created.json().stats).toMatchObject({ ...counts, total: 286, source: 'manual', stale: false });
      const edited = await manual({ ...counts, easy: 202, revision: created.json().revision });
      expect(edited.json().stats.total).toBe(287);
      expect((await manual({ ...counts, revision: created.json().revision })).statusCode).toBe(409);

      expect((await updateProfile(false, false)).statusCode).toBe(200);
      expect((await app.inject(publicUrl)).statusCode).toBe(404);
      expect((await updateProfile(true, false)).statusCode).toBe(200);
      const visible = await app.inject(publicUrl);
      expect(visible.json().leetcode).toMatchObject({ total: 287, source: 'manual' });
      await db.practiceRecruiter.create({ data: { userId: recruiter.id, company: 'Fixture company',
        workEmail: recruiter.email, status: 'PENDING' } });
      const search = () => app.inject({ url: directory, headers: recruiter.headers });
      expect((await search()).statusCode).toBe(403);
      await db.practiceRecruiter.update({ where: { userId: recruiter.id }, data: { status: 'APPROVED' } });
      expect((await search()).json().candidates).toEqual([]);
      expect((await updateProfile(true, true)).statusCode).toBe(200);
      expect((await search()).json().candidates).toMatchObject([{ handle: learner.handle, solved: 0, xp: 0, leetcode: { total: 287, source: 'manual' } }]);
      await db.practiceAccountRestriction.create({ data: { userId: learner.id } });
      expect((await app.inject(publicUrl)).json().leetcode).toBeNull();
      expect((await search()).json().candidates[0].leetcode).toBeNull();
      await db.practiceAccountRestriction.delete({ where: { userId: learner.id } });
      expect((await updateProfile(false, true)).statusCode).toBe(200);
      expect((await app.inject(publicUrl)).statusCode).toBe(404);
      expect((await search()).json().candidates).toEqual([]);

      const disconnected = await app.inject({ method: 'DELETE', url: base, headers: learner.headers,
        payload: { revision: edited.json().revision } });
      expect(disconnected.json().stats).toBeNull();
      expect((await updateProfile(true, true)).statusCode).toBe(200);
      expect((await app.inject(publicUrl)).json().leetcode).toBeNull();
      expect((await search()).json().candidates[0].leetcode).toBeNull();
      expect(await localProgress()).toEqual(before);
      expect(await db.practiceCertificate.count({ where: { userId: learner.id } })).toBe(0);
      expect(await db.practiceSubmission.count({ where: { userId: learner.id } })).toBe(0);
    } finally { await close(); }
  });

  it('binds fetched previews to the user and record revision, retains stale counts, and blocks disconnect races', async () => {
    const gateway = createServer((request, response) => {
      const url = new URL(request.url!, 'http://127.0.0.1');
      const username = url.searchParams.get('username');
      response.setHeader('Content-Type', 'application/json');
      if (request.headers.authorization !== 'Bearer external-stats-fixture-token') {
        response.writeHead(403).end('{}');
      } else if (username === 'down') {
        response.writeHead(502).end('{}');
      } else if (username === 'missing') {
        response.writeHead(404).end('{}');
      } else if (username === 'broken') {
        response.end(JSON.stringify({ username }));
      } else {
        response.end(JSON.stringify({ username, easy: 0, medium: 0, hard: 0 }));
      }
    });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + (gateway.address() as AddressInfo).port + '/stats';
    const { app, newUser, close } = fixture(url);
    try {
      const owner = await newUser();
      const other = await newUser();
      const requestPreview = (username: string) => app.inject({
        method: 'POST', url: base + '/preview', headers: owner.headers, payload: { username },
      });
      const confirm = (token: string, headers = owner.headers) =>
        app.inject({ method: 'POST', url: base + '/confirm', headers, payload: { token } });
      expect((await app.inject({ url: base, headers: owner.headers })).json().syncEnabled).toBe(true);
      const preview = await requestPreview('Zero_User');
      expect(preview.statusCode, preview.body).toBe(200);
      const { token, stats } = preview.json();
      expect(stats).toMatchObject({ username: 'zero_user', source: 'fetched', total: 0, stale: false });
      expect((await confirm(token, other.headers)).statusCode).toBe(400);
      expect((await confirm(token + 'A')).statusCode).toBe(400);
      const results = await Promise.all([confirm(token), confirm(token)]);
      expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
      const saved = results.find((result) => result.statusCode === 200)!;
      expect(saved.json().stats).toMatchObject({ source: 'fetched', total: 0 });

      await db.practiceExternalStats.update({ where: { userId: owner.id }, data: { recordedAt: new Date(Date.now() - 8 * 86_400_000) } });
      expect((await requestPreview('down')).statusCode).toBe(503);
      expect((await requestPreview('missing')).statusCode).toBe(404);
      expect((await requestPreview('broken')).statusCode).toBe(503);
      const stale = await app.inject({ url: base, headers: owner.headers });
      expect(stale.json().stats).toMatchObject({ username: 'zero_user', stale: true, source: 'fetched' });
      const pending = await requestPreview('another-handle');
      expect(pending.statusCode).toBe(200);
      const disconnected = await app.inject({ method: 'DELETE', url: base, headers: owner.headers,
        payload: { revision: saved.json().revision } });
      expect(disconnected.statusCode).toBe(200);
      expect((await confirm(pending.json().token)).statusCode).toBe(409);
      expect((await app.inject({ url: base, headers: owner.headers })).json().stats).toBeNull();
      expect(await db.practiceExternalStats.findUnique({ where: { userId: owner.id }, select: { username: true, easy: true, source: true } }))
        .toEqual({ username: null, easy: 0, source: null });
    } finally {
      await close();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });
});
