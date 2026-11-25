import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
describe.skipIf(!connection)('membership benefit enforcement', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof createApp>;
  let owner: string;
  let staff: string;
  let problem: string;
  let slug: string;
  let learnerHeaders: { authorization: string };
  let staffHeaders: { authorization: string };
  let providerCalls = 0;
  let pause = false;
  let release = () => {};
  let started = () => {};
  let waiting = Promise.resolve();
  const server = createServer(async (_request, response) => {
    providerCalls++;
    started();
    if (pause) await waiting;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: 'What changes for an empty input?' }) } }] }));
  });
  beforeAll(async () => {
    const url = new URL(connection!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') throw new Error('Use disposable loopback practice_test.');
    db = createDatabase(connection!);
    const password = 'membership-benefit-fixture-only';
    const passwordHash = await bcrypt.hash(password, 10);
    const learner = await db.user.create({ data: { name: 'Benefit learner', email: randomUUID() + '@benefits.test', passwordHash, role: 'STUDENT', emailVerified: true } });
    const admin = await db.user.create({ data: { name: 'Benefit admin', email: randomUUID() + '@benefits.test', passwordHash, role: 'SUPER_ADMIN', emailVerified: true } });
    owner = learner.id; staff = admin.id; slug = 'benefit-fixture-' + randomUUID();
    const item = await db.problem.create({ data: { slug, title: 'Benefit fixture', topic: 'Arrays', difficulty: 'EASY', description: 'Return zero.', isPublished: true,
      starterCode: { javascript: 'function fixture() { return 0; }' }, practiceContract: { create: { enabled: true, functionName: 'fixture', parameterOrder: [], editorial: 'An authored editorial protected by the solve-first rule.',
        cases: { create: [{ position: 0, hidden: false, inputJson: '{}', expectedOutputJson: '0' }] } } } } });
    problem = item.id;
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture provider.');
    vi.stubEnv('PRACTICE_COACHING_AI_URL', 'http://127.0.0.1:' + address.port + '/completion');
    vi.stubEnv('PRACTICE_COACHING_AI_KEY', 'fixture-key'); vi.stubEnv('PRACTICE_COACHING_AI_MODEL', 'fixture-model');
    app = createApp(db, { NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!, JWT_SECRET: 'benefit-fixture-key-with-at-least-32-characters', PRACTICE_BILLING_ENABLED: true },
      async () => ({ status: 3, stdout: '0', stderr: '', compileOutput: '', time: .001, memory: 1 }));
    const login = async (email: string) => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect(response.statusCode).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    };
    learnerHeaders = await login(learner.email); staffHeaders = await login(admin.email);
  });
  afterAll(async () => {
    release(); vi.unstubAllEnvs(); await app?.close();
    if (server.listening) { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [owner, staff].filter(Boolean) } } });
      if (problem) await db.problem.delete({ where: { id: problem } });
      await db.$disconnect();
    }
  });
  const detail = () => app.inject({ url: '/api/practice/problems/' + slug, headers: learnerHeaders });
  async function grant() {
    return db.practiceMembershipGrant.create({ data: { id: randomUUID(), userId: owner, plan: 'pro_monthly', reason: 'Disposable benefit fixture', expiresAt: new Date(Date.now() + 86_400_000) } });
  }
  it('requires a solve or current membership for editorial access, preserving retained solves and staff review', async () => {
    expect((await detail()).json().problem).toMatchObject({ editorial: null, editorialLocked: true });
    expect((await app.inject({ url: '/api/practice/problems/' + slug, headers: staffHeaders })).json().problem.editorial).toContain('authored editorial');
    const membership = await grant();
    expect((await detail()).json().problem.editorial).toContain('authored editorial');
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { expiresAt: new Date(0) } });
    expect((await detail()).json().problem.editorialLocked).toBe(true);
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date() } });
    expect((await detail()).json().problem.editorialLocked).toBe(true);
    await db.practiceSubmission.create({ data: { userId: owner, problemId: problem, problemVersion: 1, language: 'javascript', code: 'fixture', verdict: 'ACCEPTED',
      passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0, requestKey: randomUUID(), requestDigest: 'fixture', progressEligible: false } });
    expect((await detail()).json().problem.editorial).toContain('authored editorial');
    await db.practiceSubmission.deleteMany({ where: { userId: owner, problemId: problem } });
  });
  it('rejects expired, revoked and in-flight revoked interview benefits while retaining transcript access and safe retries', async () => {
    const base = '/api/practice/interviews';
    const start = () => app.inject({ method: 'POST', url: base + '/start', headers: learnerHeaders, payload: { slug, requestKey: randomUUID() } });
    expect((await start()).statusCode).toBe(402);
    const membership = await grant();
    const opened = await start(); expect(opened.statusCode).toBe(201);
    const id = opened.json().id;
    const firstKey = randomUUID();
    const answer = (requestKey = randomUUID()) => app.inject({ method: 'POST', url: base + '/' + id + '/answer', headers: learnerHeaders, payload: { answer: 'Scan each item once.', requestKey } });
    expect((await answer(firstKey)).statusCode).toBe(200);
    const successfulCalls = providerCalls;
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { expiresAt: new Date(0) } });
    expect((await answer()).statusCode).toBe(402);
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date() } });
    expect((await answer()).statusCode).toBe(402); expect(providerCalls).toBe(successfulCalls);
    expect((await answer(firstKey)).statusCode).toBe(200); expect(providerCalls).toBe(successfulCalls);
    expect((await app.inject({ url: base + '/' + id, headers: learnerHeaders })).statusCode).toBe(200);
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { revokedAt: null } });
    pause = true; waiting = new Promise<void>((resolve) => { release = resolve; });
    const received = new Promise<void>((resolve) => { started = resolve; });
    const pending = answer(); await received;
    await db.practiceMembershipGrant.update({ where: { id: membership.id }, data: { revokedAt: new Date() } });
    release(); expect((await pending).statusCode).toBe(402);
    expect(await db.practiceMockInterviewTurn.count({ where: { interviewId: id } })).toBe(1);
    expect((await app.inject({ method: 'POST', url: base + '/' + id + '/finish', headers: learnerHeaders })).statusCode).toBe(200);
  });
});
