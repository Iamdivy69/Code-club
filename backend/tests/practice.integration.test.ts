import { createHash, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { seedPractice } from '../prisma/fixtures.js';
import { seedStaff } from '../prisma/staff.js';
import { seedLibrary } from '../prisma/library.js';
import type { Execute } from '../src/modules/practice/judge.js';
import { weightedExpectation } from '../src/modules/practice/contracts.js';
import { sendAutomaticReminders } from '../src/modules/placement/assignment-notices.js';
import { learnerAnalytics } from '../src/modules/study/learner-analytics.js';
import { analyticsPeriods } from '../src/modules/admin/analytics.js';
import { sendWeeklyReviews, weeklyReviewGenerator } from '../src/modules/study/weekly-review.js';
import type { MailMessage } from '../src/modules/notifications/smtp.js';

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
const testPassword = 'local-integration-only-2026';
const fixtureRunner: Execute = async (source, language, stdin) => {
  if (source === 'compiler fixture') {
    return { status: 3, stdout: language + ':' + stdin, stderr: '', compileOutput: '', time: .01, memory: 900 };
  }
  if (language === 'javascript' && source.includes('new WeightedPicker(')) {
    let stdout = '';
    let state = 173;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    runInNewContext(source, { console: { log: (value: string) => { stdout = value; } }, Math: { random } }, { timeout: 1000 });
    return { status: 3, stdout, stderr: '', compileOutput: '', time: .01, memory: 900 };
  }
  const hiddenCase = source.includes('countAbove([-11');
  const malformed = source.startsWith('malformed');
  const stdout = source.startsWith('return-zero') ? '0'
    : hiddenCase ? (source.startsWith('sample-only') ? 'wrong-private-output' : '4')
    : source.includes('countAbove([1,6,3,8]') ? '2' : '0';
  return { status: malformed ? 6 : 3, stdout,
    stderr: '', compileOutput: malformed ? 'Could not parse fixture.' : '', time: .012, memory: 1250 };
};

describe.skipIf(!connection)('practice API with PostgreSQL', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof createApp>;
  let seed: Awaited<ReturnType<typeof seedPractice>>;
  let student: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') {
      throw new Error('Use a disposable local database named practice_test.');
    }
    db = createDatabase(connection!);
    seed = await seedPractice(db, testPassword);
    await seedLibrary(db);
    app = createApp(db, {
      NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!,
      JWT_SECRET: 'local-test-signing-key-with-sufficient-length',
    }, fixtureRunner);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: seed.user.email, password: testPassword } });
    expect(login.statusCode).toBe(200);
    expect(login.cookies[0]?.httpOnly).toBe(true);
    student = login.json().accessToken;
    sessionCookie = login.cookies[0]!.value;
  }, 10000);

  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  it('rotates a refresh token and requires authentication for the catalogue', async () => {
    expect((await app.inject('/api/practice/problems')).statusCode).toBe(401);
    const refresh = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: sessionCookie } });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.cookies[0]?.value).not.toBe(sessionCookie);
    const replay = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: sessionCookie } });
    expect(replay.statusCode).toBe(401);
  });

  it('preserves the existing demo student password when fixtures are reseeded', async () => {
    const studentHash = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    await seedPractice(db, 'different-fixture-seed-password');
    const after = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    expect(after).toEqual(studentHash);
  });

  it('verifies standalone signup and lets one recovery link revoke every existing session', async () => {
    const outbox: MailMessage[] = [];
    const accountApp = createApp(db, {
      NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!,
      JWT_SECRET: 'account-workflow-test-signing-key-at-least-32-bytes',
    }, fixtureRunner, { site: new URL('https://staging.practice.test'), async send(message) { outbox.push(message); } });
    const email = 'account-workflow-' + randomUUID() + '@practice.test';
    const replacement = 'a-different-fixture-password';
    const post = (action: string, payload: Record<string, string>) =>
      accountApp.inject({ method: 'POST', url: '/api/auth/' + action, payload });
    const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');
    async function link(sequence: number, path: string) {
      await vi.waitFor(() => expect(outbox).toHaveLength(sequence));
      const message = outbox.at(-1)!;
      expect(message.to).toBe(email);
      const line = message.text.split('\n').find((value) => value.startsWith('https://'))!;
      const url = new URL(line);
      expect(url.origin).toBe('https://staging.practice.test');
      expect(url.pathname).toBe(path);
      expect(url.search).toBe('');
      return new URLSearchParams(url.hash.slice(1)).get('token')!;
    }

    try {
      const options = await accountApp.inject('/api/auth/options');
      expect(options.json()).toMatchObject({ accountEmailEnabled: true, signupEnabled: true });
      const signup = await post('signup', { name: 'Recovery fixture', email, password: testPassword });
      expect(signup.statusCode).toBe(201);
      expect(signup.json()).toEqual({ created: true, verificationRequired: true });
      const first = await link(1, '/verify-email');
      expect(signup.body).not.toContain(first);
      const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true, emailVerified: true } });
      expect(user.emailVerified).toBe(false);
      expect(await db.emailVerificationToken.findUnique({ where: { token: first } })).toBeNull();
      expect((await post('login', { email, password: testPassword })).json().error).toBe('EMAIL_VERIFICATION_REQUIRED');
      await db.emailVerificationToken.update({ where: { token: digest(first) }, data: { expiresAt: new Date(0) } });
      expect((await post('verify-email', { token: first })).json().error).toBe('INVALID_ACCOUNT_LINK');
      expect((await post('resend-verification', { email })).statusCode).toBe(202);
      const verifiedWith = await link(2, '/verify-email');
      expect(verifiedWith).not.toBe(first);
      expect((await post('verify-email', { token: verifiedWith })).statusCode).toBe(200);
      expect((await post('verify-email', { token: verifiedWith })).statusCode).toBe(400);
      expect(await db.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } })).toEqual({ emailVerified: true });

      const login = await post('login', { email, password: testPassword });
      const second = await post('login', { email, password: testPassword });
      expect(login.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const unknown = await post('forgot-password', { email: 'missing-' + email });
      const requested = await Promise.all([post('forgot-password', { email }), post('forgot-password', { email })]);
      expect(requested.map(({ statusCode }) => statusCode)).toEqual([202, 202]);
      expect(requested[0]!.json()).toEqual(unknown.json());
      expect(requested[0]!.headers['cache-control']).toBe('no-store');
      const resetLink = await link(3, '/reset-password');
      expect(await db.passwordResetToken.findUnique({ where: { token: resetLink } })).toBeNull();
      expect(await db.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
      expect((await post('reset-password', { token: resetLink, newPassword: 'short' })).statusCode).toBe(400);
      const resets = await Promise.all([
        post('reset-password', { token: resetLink, newPassword: replacement }),
        post('reset-password', { token: resetLink, newPassword: replacement }),
      ]);
      expect(resets.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
      for (const stale of [login, second]) {
        const authorization = 'Bearer ' + stale.json().accessToken;
        expect((await accountApp.inject({ url: '/api/auth/me', headers: { authorization } })).statusCode).toBe(401);
        expect((await accountApp.inject({
          method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: stale.cookies[0]!.value },
        })).statusCode).toBe(401);
      }
      expect((await post('login', { email, password: testPassword })).statusCode).toBe(401);
      expect((await post('login', { email, password: replacement })).statusCode).toBe(200);

      expect((await post('forgot-password', { email })).statusCode).toBe(202);
      const blocked = await link(4, '/reset-password');
      await db.user.update({ where: { id: user.id }, data: { approvalStatus: 'REJECTED' } });
      expect((await post('reset-password', { token: blocked, newPassword: testPassword })).json().error).toBe('INVALID_ACCOUNT_LINK');
    } finally {
      await accountApp.close();
      await db.user.deleteMany({ where: { email } });
    }
  }, 15000);

  it('runs only visible testcases, grades hidden cases, and exposes no hidden input or output', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const problem = await app.inject({ url: '/api/practice/problems/count-above', headers });
    expect(problem.json().problem.cases).toHaveLength(2);
    expect(problem.body).not.toContain('[-11,-3,-3,17,0]');
    const before = await db.practiceSubmission.count({ where: { userId: seed.user.id } });
    const payload = { problemSlug: seed.problem.slug, language: 'javascript', code: 'sample-only' };
    const run = await app.inject({ method: 'POST', url: '/api/practice/judge/run', payload, headers });
    expect(run.statusCode).toBe(200);
    expect(run.json().results.map((item: { passed: boolean }) => item.passed)).toEqual([true, true]);
    expect(await db.practiceSubmission.count({ where: { userId: seed.user.id } })).toBe(before);
    const submit = await app.inject({ method: 'POST', url: '/api/practice/judge/submit', headers, payload: { ...payload, requestKey: randomUUID() } });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().submission).toMatchObject({ verdict: 'Wrong Answer', visiblePassed: 2, hiddenPassed: 1, total: 4, diagnostic: null });
    expect(submit.body).not.toContain('wrong-private-output');
    expect(submit.body).not.toContain('[-11,-3,-3,17,0]');
  });

  it('records only the first rating for an owned Accepted submission', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const peer = await db.user.create({ data: {
      name: 'Reflection fixture', email: 'reflection-' + randomUUID() + '@practice.test', role: 'STUDENT', passwordHash,
    } });
    const inputs = { problemId: seed.problem.id, problemVersion: 1, language: 'javascript',
      code: 'reflection fixture', requestDigest: 'reflection-fixture', total: 4, visiblePassed: 2, hiddenPassed: 0 };
    const accepted = await db.practiceSubmission.create({ data: {
      ...inputs, userId: seed.user.id, verdict: 'ACCEPTED', requestKey: randomUUID(), passed: 4, hiddenPassed: 2,
    } });
    const wrong = await db.practiceSubmission.create({ data: {
      ...inputs, userId: seed.user.id, verdict: 'WRONG_ANSWER', requestKey: randomUUID(), passed: 2,
    } });
    const route = (id: string) => '/api/practice/submissions/' + id + '/reflection';
    const rate = (id: string, rating: string, authorization = headers.authorization) => app.inject({
      method: 'POST', url: route(id), headers: { authorization }, payload: { rating },
    });
    try {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login',
        payload: { email: peer.email, password: testPassword }, remoteAddress: '127.0.0.12' });
      expect(login.statusCode).toBe(200);
      const peerAuth = 'Bearer ' + login.json().accessToken;
      expect((await app.inject({ method: 'POST', url: route(accepted.id), payload: { rating: 'easy' } })).statusCode).toBe(401);
      expect((await rate(accepted.id, 'easy', peerAuth)).statusCode).toBe(404);
      expect((await rate(wrong.id, 'easy')).json().error).toBe('REFLECTION_REQUIRES_ACCEPTED');
      expect((await rate(accepted.id, 'unknown')).statusCode).toBe(400);

      const results = await Promise.all([rate(accepted.id, 'manageable'), rate(accepted.id, 'challenging')]);
      expect(results.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
      const saved = results[0]!.json().rating;
      expect(['manageable', 'challenging']).toContain(saved);
      expect(results[1]!.json().rating).toBe(saved);
      const getStored = () => db.practiceSubmission.findUniqueOrThrow({ where: { id: accepted.id },
        select: { reflectionRating: true, reflectedAt: true } });
      const first = await getStored();
      expect(first).toEqual({ reflectionRating: saved, reflectedAt: expect.any(Date) });
      expect((await rate(accepted.id, 'easy')).json().rating).toBe(saved);
      expect(await getStored()).toEqual(first);
      const detail = await app.inject({ url: '/api/practice/submissions/' + accepted.id, headers });
      expect(detail.json().submission).toMatchObject({ id: accepted.id, reflectionRating: saved, verdict: 'Accepted' });
      const history = await app.inject({ url: '/api/practice/submissions?slug=count-above', headers });
      expect(history.json().submissions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: accepted.id, reflectionRating: saved }),
        expect.objectContaining({ id: wrong.id, reflectionRating: null }),
      ]));
    } finally {
      await db.practiceSubmission.deleteMany({ where: { id: { in: [accepted.id, wrong.id] } } });
      await db.user.delete({ where: { id: peer.id } });
    }
  });

  it('runs custom tests and standalone source without writing submissions or progress', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const runPayload = { problemSlug: 'count-above', code: 'return-zero', language: 'javascript' };
    const counters = () => Promise.all([
      db.practiceSubmission.count({ where: { userId: seed.user.id } }),
      db.practiceProgress.count({ where: { userId: seed.user.id } }),
    ]);
    const before = await counters();
    const run = await app.inject({ method: 'POST', url: '/api/practice/judge/run', headers, payload: {
      ...runPayload, testcases: [{ input: { values: [99], threshold: 100 }, expectedOutput: 0 }],
    } });
    expect(run.statusCode).toBe(200);
    expect(run.json().results).toEqual([expect.objectContaining({ expected: '0', actual: '0', passed: true })]);
    const invalid = await app.inject({ method: 'POST', url: '/api/practice/judge/run', headers, payload: {
      ...runPayload, testcases: [{ input: { values: [99], threshold: '100' }, expectedOutput: 0 }],
    } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toContain('INVALID_TEST_CASE');
    const payload = { code: 'compiler fixture', language: 'python', stdin: 'first line\nsecond line' };
    expect((await app.inject({ method: 'POST', url: '/api/practice/compiler/run', payload })).statusCode).toBe(401);
    const compiler = await app.inject({ method: 'POST', url: '/api/practice/compiler/run', headers, payload });
    expect(compiler.statusCode).toBe(200);
    expect(compiler.json()).toMatchObject({ status: 'Finished', stdout: 'python:' + payload.stdin, truncated: false });
    expect(await counters()).toEqual(before);
  });

  it('publishes all three advanced exercise shapes and rejects an invalid tree selector before Judge0', async () => {
    const headers = { authorization: 'Bearer ' + student };
    for (const slug of ['shared-branch', 'tree-checkpoint', 'row-endpoints']) {
      const response = await app.inject({ url: '/api/practice/problems/' + slug, headers });
      expect(response.statusCode).toBe(200);
      expect(response.json().problem.languages).toHaveLength(6);
      expect(response.json().problem.cases).toHaveLength(2);
    }
    const result = await app.inject({
      method: 'POST', url: '/api/practice/judge/run', headers,
      payload: {
        problemSlug: 'shared-branch', code: 'function sharedBranch() {}', language: 'javascript',
        testcases: [{ input: { root: [3, 4, 4], first: 3, second: 4 }, expectedOutput: 3 }],
      },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('INVALID_TEST_CASE');
  });

  it('grades weighted draws in Run and Submit while retaining ordinary exact cases', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const problemSlug = 'weighted-ticket-draw';
    const payload = { problemSlug, language: 'javascript' };
    const code = `class WeightedPicker {
      constructor(weights) { this.weights = weights; this.total = weights.reduce((a, b) => a+b, 0); }
      draw() {
        let ticket = Math.random() * this.total;
        for (let i = 0; i < this.weights.length; i++) {
          ticket -= this.weights[i];
          if (ticket < 0) return i;
        }
      }
    }`;
    const biased = 'class WeightedPicker { draw() { return 0; } }';
    const request = (action: 'run' | 'submit', values: object) =>
      app.inject({ method: 'POST', url: '/api/practice/judge/' + action, headers, payload: { ...payload, ...values } });
    const detail = await app.inject({ url: '/api/practice/problems/' + problemSlug, headers });
    expect(detail.json().problem.cases).toHaveLength(2);
    expect(detail.json().problem.cases[0].comparison).toBeUndefined();
    expect(detail.json().problem.cases[1].comparison).toBe('weighted-indices');
    const run = await request('run', { code });
    expect(run.statusCode, run.body).toBe(200);
    expect(run.json().results.map(({ passed }: { passed: boolean }) => passed)).toEqual([true, true]);
    expect(run.json().results[0].actual).toBe('[0]');
    expect(JSON.parse(run.json().results[1].actual)).toMatchObject({ draws: 8192, counts: [expect.any(Number), expect.any(Number)] });
    const wrong = await request('submit', { code: biased, requestKey: randomUUID() });
    expect(wrong.json().submission).toMatchObject({ verdict: 'Wrong Answer', visiblePassed: 1, hiddenPassed: 0 });
    const right = await request('submit', { code, requestKey: randomUUID() });
    expect(right.json()).toMatchObject({ solved: true, submission: { verdict: 'Accepted', passed: 4, hiddenPassed: 2 } });
    const invalid = await request('run', { code, testcases: [{
      input: { operations: ['WeightedPicker', 'draw'], arguments: [[[0, 7]], []] }, expectedOutput: weightedExpectation,
    }] });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe('INVALID_TEST_CASE');
  });

  it('issues only eligible certification tracks and keeps an existing practice path verifiable', async () => {
    const nonce = randomUUID().slice(0, 8);
    const prefix = 'cert-test-' + nonce + '-';
    const owner = await db.user.create({ data: {
      name: 'Certificate Reader', role: 'STUDENT', email: prefix + 'owner@practice.test',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    const legacy = await db.practiceCertificate.create({
      data: { userId: owner.id, track: 'Arrays', issuerName: 'Earlier Recipient' },
    });
    const routes = '/api/practice/study';
    try {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: owner.email, password: testPassword } });
      expect(login.statusCode).toBe(200);
      const headers = { authorization: 'Bearer ' + login.json().accessToken };
      const registry = await app.inject({ url: routes + '/certificate-tracks', headers });
      expect(registry.statusCode).toBe(200);
      expect(registry.json().tracks.map(({ id, required }: { id: string; required: number }) => [id, required])).toEqual([
        ['arrays', 10], ['dynamic-programming', 15], ['graphs', 10], ['trees', 8], ['binary-search', 6],
        ['stacks', 8], ['two-pointers', 6], ['backtracking', 6], ['linked-list', 6], ['heap', 6],
      ]);
      expect((await app.inject({ url: routes + '/certificate-tracks' })).statusCode).toBe(401);
      expect((await app.inject({ url: routes + '/certificates/' + legacy.id + '/document' })).statusCode).toBe(401);
      const former = await app.inject({ url: routes + '/verify/' + legacy.id });
      expect(former.json()).toMatchObject({ id: legacy.id, track: 'Arrays', title: 'Arrays', kind: 'practice-path', issuerName: 'Earlier Recipient' });
      const preserved = await app.inject({ method: 'POST', url: routes + '/certificates', headers, payload: { track: 'Arrays' } });
      expect(preserved.json().id).toBe(legacy.id);
      const reserved = await app.inject({ method: 'POST', url: routes + '/certificates', headers, payload: { track: 'certification:arrays' } });
      expect(reserved.statusCode).toBe(400);

      async function recordSolve(index: number, exclusive = false) {
        await db.problem.create({ data: {
          slug: prefix + index, title: 'Certificate fixture ' + index, topic: 'Arrays', description: 'Disposable exercise',
          difficulty: 'EASY', isPublished: !exclusive,
          practiceContract: { create: { enabled: true, contestOnly: exclusive, functionName: 'solve', parameterOrder: [] } },
          practiceProgress: { create: { userId: owner.id, status: 'SOLVED', attemptCount: 1, acceptedCount: 1, firstSolvedAt: new Date(), lastAttemptAt: new Date() } },
        } });
      }
      await Promise.all(Array.from({ length: 9 }, (_, i) => recordSolve(i)));
      await recordSolve(90, true);
      const claim = () => app.inject({ method: 'POST', url: routes + '/certificate-tracks/arrays/claim', headers });
      const incomplete = await claim();
      expect(incomplete.statusCode).toBe(409);
      expect(incomplete.json().error).toBe('TRACK_INCOMPLETE');
      await recordSolve(9);
      const issued = await Promise.all([claim(), claim()]);
      expect(issued.map((response) => response.statusCode)).toEqual([200, 200]);
      const id = issued[0]!.json().id;
      expect(id).not.toBe(legacy.id);
      expect(issued[1]!.json().id).toBe(id);
      const verified = await app.inject({ url: routes + '/verify/' + id });
      expect(verified.json()).toMatchObject({ id, title: 'Arrays Master', issuerName: 'Certificate Reader', kind: 'certification' });
      expect(verified.body).not.toContain(owner.email);
      expect((await app.inject({ url: routes + '/verify/' + randomUUID() })).statusCode).toBe(404);
      const download = await app.inject({ url: routes + '/certificates/' + id + '/document', headers });
      expect(download.headers['cache-control']).toBe('no-store');
      expect(download.json()).toEqual(verified.json());
      const after = await app.inject({ url: routes + '/certificate-tracks', headers });
      expect(after.json().tracks[0]).toMatchObject({ solved: 10, certificateId: id });
    } finally {
      await db.problem.deleteMany({ where: { slug: { startsWith: prefix } } });
      await db.user.delete({ where: { id: owner.id } });
    }
  }, 15_000);

  it('persists bookmarks, private notes and playlists from the real catalogue', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const saved = await app.inject({ method: 'PUT', url: '/api/practice/study/problems/first-decrease', headers,
      payload: { saved: true, note: 'Use an adjacent pair.' } });
    expect(saved.json()).toEqual({ study: { saved: true, note: 'Use an adjacent pair.' } });
    const detail = await app.inject({ url: '/api/practice/problems/first-decrease', headers });
    expect(detail.json().problem).toMatchObject({ saved: true, note: 'Use an adjacent pair.' });
    expect(detail.json().problem.languages).toHaveLength(6);
    const list = await app.inject({ method: 'POST', url: '/api/practice/study/playlists', headers,
      payload: { name: 'Warm up', slugs: ['first-decrease', 'count-above'] } });
    expect(list.statusCode).toBe(201);
    const playlists = await app.inject({ url: '/api/practice/study/playlists', headers });
    const match = playlists.json().playlists.find((row: { id: string }) => row.id === list.json().id);
    expect(match.problems.map((item: { slug: string }) => item.slug)).toEqual(['first-decrease', 'count-above']);
  });

  it('ranks opted-in practice profiles and limits college results to verified student records', async () => {
    const nonce = randomUUID().slice(0, 8);
    const prefix = 'rank-' + nonce + '-';
    const university = await db.university.create({ data: { name: 'Ranking University ' + nonce, emailDomains: ['ranking.test'] } });
    const otherUniversity = await db.university.create({ data: { name: 'Other University ' + nonce, emailDomains: ['ranking.test'] } });
    const exclusive = await db.problem.create({ data: {
      title: 'Exclusive Ranking Fixture', slug: prefix + 'exclusive', topic: 'Testing', difficulty: 'HARD', description: 'Fixture',
      practiceContract: { create: { functionName: 'check', parameterOrder: [], enabled: true, contestOnly: true } },
    } });
    async function player(label: string, universityId: string, { verified = true, publicProfile = true, active = true } = {}) {
      const handle = prefix + label;
      return db.user.create({ data: {
        email: handle + '@ranking.test', name: 'Ranking Fixture', role: 'STUDENT', passwordHash: seed.user.passwordHash,
        emailVerified: verified, isActive: active, practiceProfile: { create: { handle, isPublic: publicProfile } },
        student: { create: { universityId, registerNumber: handle, degree: 'Computing', batch: 'Ranking' } },
      } });
    }
    const path = '/api/practice/study/leaderboard';
    try {
      const [middle, hard, foreign, hidden, inactive, unverified] = await Promise.all([
        player('middle', university.id),
        player('hard', university.id),
        player('foreign', otherUniversity.id),
        player('hidden', university.id, { publicProfile: false }),
        player('inactive', university.id, { active: false }),
        player('unverified', university.id, { verified: false }),
      ]);
      const problems = await db.problem.findMany({
        where: { slug: { in: ['strongest-window', 'longest-level-run', 'tree-checkpoint'] } },
        select: { id: true, difficulty: true },
      });
      const now = new Date();
      const before = new Date(+now - 86_400_000);
      const solved = (userId: string, problemId: string, when = now) => ({
        userId, problemId, status: 'SOLVED' as const, firstSolvedAt: when, lastAttemptAt: when, attemptCount: 1, acceptedCount: 1,
      });
      await db.practiceProgress.createMany({ data: [
        ...problems.filter((problem) => problem.difficulty === 'MEDIUM').map((problem, i) => solved(middle.id, problem.id, i === 0 ? before : now)),
        solved(hard.id, problems.find((problem) => problem.difficulty === 'HARD')!.id),
        solved(hard.id, exclusive.id),
        solved(hidden.id, seed.problem.id),
        solved(inactive.id, seed.problem.id),
      ] });
      const noSession = await app.inject({ url: path + '/college' });
      expect(noSession.statusCode).toBe(401);
      const global = await app.inject({ url: path + '/global?limit=50' });
      expect(global.statusCode, global.body).toBe(200);
      expect(global.headers['cache-control']).toBe('no-store');
      const rows = global.json().rows as Array<{ handle: string; rank: number; college: string | null }>;
      expect(rows.find(({ handle }) => handle + '@ranking.test' === foreign.email)?.college).toBe(otherUniversity.name);
      expect(rows.map(({ handle }) => handle)).not.toContain(prefix + 'hidden');
      expect(rows.map(({ handle }) => handle)).not.toContain(prefix + 'inactive');
      expect(rows.find(({ handle }) => handle === prefix + 'unverified')?.college).toBeNull();
      expect(global.body).not.toContain('@ranking.test');
      expect(rows.find(({ handle }) => handle === prefix + 'middle')!.rank).toBeLessThan(rows.find(({ handle }) => handle === prefix + 'hard')!.rank);
      const page = await app.inject({ url: path + '/global?limit=1&page=' + rows.find(({ handle }) => handle === prefix + 'hard')!.rank });
      expect(page.json()).toMatchObject({ limit: 1, rows: [{ handle: prefix + 'hard', xp: 50, solved: 1 }] });
      expect((await app.inject({ url: path + '/global?page=26' })).json()).toMatchObject({ capped: true, rows: [], hasNext: false });

      const login = async (email: string) => {
        const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: testPassword } });
        expect(response.statusCode).toBe(200);
        return { authorization: 'Bearer ' + response.json().accessToken };
      };
      const headers = await login(middle.email);
      const college = await app.inject({ url: path + '/college?universityId=' + otherUniversity.id, headers });
      expect(college.statusCode, college.body).toBe(200);
      expect(college.json()).toMatchObject({ total: 2, college: university.name, rows: [
        { rank: 1, handle: prefix + 'middle', xp: 50, solved: 2, level: 3, streak: 2, easy: 0, medium: 2, hard: 0 },
        { rank: 2, handle: prefix + 'hard', xp: 50, solved: 1, hard: 1 },
      ] });
      const institutions = await app.inject({ url: path + '/institutions' });
      expect(institutions.json().institutions).toContainEqual({ name: university.name, count: 2 });
      expect(institutions.json().institutions).not.toContainEqual({ name: otherUniversity.name, count: 1 });
      const notVerified = await app.inject({ url: path + '/college', headers: await login(unverified.email) });
      expect(notVerified.json()).toMatchObject({ error: 'COLLEGE_NOT_VERIFIED' });
      await db.university.update({ where: { id: university.id }, data: { isActive: false } });
      const unavailable = await app.inject({ url: path + '/college', headers });
      expect(unavailable.json()).toMatchObject({ error: 'COLLEGE_UNAVAILABLE' });
      await db.practiceProfile.update({ where: { userId: middle.id }, data: { isPublic: false } });
      const withdrawn = await app.inject({ url: path + '/global' });
      expect(withdrawn.json().rows.map(({ handle }: { handle: string }) => handle)).not.toContain(prefix + 'middle');
      expect((await app.inject({ url: path, headers })).json().rows).toContainEqual({ handle: prefix + 'hard', xp: 50, solved: 1 });
      expect((await app.inject({ url: path + '/global?page=0' })).statusCode).toBe(400);
      expect((await app.inject({ url: path + '/global?limit=500' })).json().limit).toBe(50);
    } finally {
      await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
      await db.problem.delete({ where: { id: exclusive.id } });
      await db.university.deleteMany({ where: { id: { in: [university.id, otherUniversity.id] } } });
    }
  });

  it('locks an invite-only event, requires joining, and awards points once for each accepted problem', async () => {
    const competitor = await db.user.create({ data: {
      email: randomUUID() + '@practice.test', name: 'Guest Player', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    const secondLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: competitor.email, password: testPassword } });
    const guest = { authorization: 'Bearer ' + secondLogin.json().accessToken };
    const headers = { authorization: 'Bearer ' + student };
    const created = await app.inject({ method: 'POST', url: '/api/practice/competitions', headers, payload: {
      title: 'Practice match', kind: 'BATTLE', isPrivate: true, startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60000).toISOString(), problemSlugs: ['count-above'],
    } });
    expect(created.statusCode).toBe(201);
    const { id, joinCode } = created.json();
    const eventUrl = '/api/practice/competitions/' + id;
    expect((await app.inject({ url: eventUrl, headers: guest })).statusCode).toBe(404);
    const submit = () => app.inject({ method: 'POST', url: '/api/practice/judge/submit', headers, payload: {
      problemSlug: 'count-above', language: 'javascript', code: 'correct', competitionId: id, requestKey: randomUUID(),
    } });
    expect((await submit()).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: eventUrl + '/join', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/practice/competitions/join-private', headers: guest, payload: { invite: joinCode } })).statusCode).toBe(200);
    expect((await submit()).json().submission.verdict).toBe('Accepted');
    expect((await submit()).json().submission.verdict).toBe('Accepted');
    const board = await app.inject({ url: eventUrl, headers });
    expect(board.json().rows.map((row: { points: number }) => row.points)).toEqual([100, 0]);
    expect(board.json().teams.map((row: { points: number }) => row.points)).toEqual([100, 0]);
    expect((await app.inject({ url: eventUrl, headers: guest })).json().joinCode).toBeNull();
  });

  it('enforces the managed battle lifecycle and awards a shared team solve once', async () => {
    async function player(name: string) {
      const user = await db.user.create({ data: {
        email: randomUUID() + '@practice.test', name, role: 'STUDENT',
        passwordHash: seed.user.passwordHash, emailVerified: true,
      } });
      const session = await app.inject({
        method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.21', payload: { email: user.email, password: testPassword },
      });
      expect(session.statusCode).toBe(200);
      return { id: user.id, headers: { authorization: 'Bearer ' + session.json().accessToken } };
    }
    const [host, alpha, beta, spectator, outsider] = await Promise.all(
      ['Host', 'Alpha', 'Beta', 'Spectator', 'Outsider'].map(player),
    );
    const base = '/api/practice/competitions';
    const draft = { title: 'Team lobby', kind: 'BATTLE', durationMinutes: 30, maxTeamSize: 2, problemSlugs: ['count-above'] };
    const request = (method: 'GET' | 'POST' | 'DELETE', url: string, actor: typeof host, payload?: object) =>
      app.inject({ method, url, headers: actor.headers, remoteAddress: '127.0.0.21', payload });
    expect((await request('POST', base, host, { ...draft, durationMinutes: 20 })).statusCode).toBe(400);
    const openings = await Promise.all([request('POST', base, host, draft), request('POST', base, host, draft)]);
    expect(openings.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(openings.find((response) => response.statusCode === 409)?.json().error).toBe('BATTLE_ALREADY_OPEN');
    const { id, joinCode } = openings.find((response) => response.statusCode === 201)!.json();
    expect(joinCode).toMatch(/^[0-9A-F]{6}$/);
    const room = base + '/' + id;
    const get = (actor = host) => request('GET', room, actor);
    const manage = (action: string, payload?: object, actor = host) => request('POST', room + '/' + action, actor, payload);
    const invite = (actor: typeof host) => request('POST', base + '/join-private', actor, { invite: joinCode.toLowerCase() });
    const submit = (actor: typeof host) => request('POST', '/api/practice/judge/submit', actor, {
      problemSlug: 'count-above', language: 'javascript', code: 'correct', competitionId: id, requestKey: randomUUID(),
    });

    expect((await get()).json()).toMatchObject({
      status: 'Lobby', isPrivate: true, startsAt: null, endsAt: null, battleDurationMinutes: 30, battleMaxTeamSize: 2,
      joined: false, roster: [], joinCode,
    });
    expect((await request('GET', base, outsider)).json().events).not.toContainEqual(expect.objectContaining({ id }));
    expect((await get(outsider)).statusCode).toBe(404);
    expect((await manage('join', undefined, alpha)).statusCode).toBe(404);
    expect((await manage('start')).json().error).toBe('BATTLE_TEAMS_REQUIRED');
    expect((await invite(alpha)).json()).toEqual({ id, team: null });
    expect((await get(alpha)).json()).toMatchObject({ joinCode: null, problems: [], myTeam: null });
    expect((await get(alpha)).json().roster[0]).not.toHaveProperty('userId');
    expect((await manage('assign-teams', { mode: 'random' }, alpha)).statusCode).toBe(403);
    expect((await request('DELETE', room, alpha)).statusCode).toBe(403);
    expect((await submit(alpha)).json().error).toBe('COMPETITION_CLOSED');
    expect((await manage('leave', undefined, alpha)).statusCode).toBe(200);
    expect((await get(alpha)).statusCode).toBe(404);
    expect((await manage('join')).json()).toEqual({ id, team: null });
    expect((await manage('leave')).json().error).toBe('BATTLE_HOST');
    const joins = await Promise.all([alpha, beta, spectator].map(invite));
    expect(joins.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect((await invite(outsider)).json().error).toBe('COMPETITION_FULL');

    const assign = (assignments: { userId: string; team: number | null }[]) => manage('assign-teams', { mode: 'manual', assignments });
    expect((await assign([{ userId: outsider.id, team: 0 }])).json().error).toBe('BATTLE_ASSIGNMENT');
    expect((await assign([host, alpha, beta].map(({ id: userId }) => ({ userId, team: 0 })))).json().error).toBe('BATTLE_TEAM_FULL');
    expect((await get()).json().roster.every((entry: { team: number | null }) => entry.team === null)).toBe(true);
    expect((await manage('assign-teams', { mode: 'random' })).statusCode).toBe(200);
    expect((await get()).json().roster.map((entry: { team: number }) => entry.team).sort()).toEqual([0, 0, 1, 1]);
    expect((await assign([
      { userId: host.id, team: 0 }, { userId: alpha.id, team: 0 }, { userId: beta.id, team: 1 }, { userId: spectator.id, team: null },
    ])).statusCode).toBe(200);

    const starts = await Promise.all([manage('start'), manage('start')]);
    expect(starts.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const active = (await get()).json();
    expect(active.status).toBe('Active');
    expect(Date.parse(active.endsAt) - Date.parse(active.startsAt)).toBe(30 * 60_000);
    expect((await manage('assign-teams', { mode: 'random' })).statusCode).toBe(409);
    expect((await manage('leave', undefined, alpha)).statusCode).toBe(409);
    expect((await request('DELETE', room, host)).statusCode).toBe(409);
    expect((await invite(outsider)).json().error).toBe('BATTLE_STARTED');
    expect((await submit(spectator)).json().error).toBe('TEAM_REQUIRED');
    expect((await get(alpha)).json()).toMatchObject({ problems: [{ slug: 'count-above' }], myTeam: 0 });
    expect((await submit(host)).json().submission.verdict).toBe('Accepted');
    expect((await get(alpha)).json().problems[0]).toMatchObject({ solved: false, teamSolved: true });
    expect((await get(beta)).json().problems[0]).toMatchObject({ solved: false, teamSolved: false });
    for (const actor of [alpha, alpha]) expect((await submit(actor)).json().submission.verdict).toBe('Accepted');
    expect((await get(alpha)).json().problems[0]).toMatchObject({ solved: true, teamSolved: true });
    const score = (await get()).json();
    expect(score.rows.map((row: { points: number }) => row.points)).toEqual([100, 100, 0, 0]);
    expect(score.teams).toEqual([
      { name: 'Team Alpha', points: 100, solved: 1 }, { name: 'Team Beta', points: 0, solved: 0 },
    ]);

    await db.practiceCompetition.update({ where: { id }, data: {
      startsAt: new Date(Date.now() - 31 * 60_000), endsAt: new Date(Date.now() - 60_000),
    } });
    expect((await get()).json()).toMatchObject({ status: 'Ended', teams: score.teams });
    expect((await submit(alpha)).json().error).toBe('COMPETITION_CLOSED');
    const next = await request('POST', base, host, draft);
    expect(next.statusCode).toBe(201);
    const nextRoom = base + '/' + next.json().id;
    expect((await request('POST', base + '/join-private', alpha, { invite: next.json().joinCode })).statusCode).toBe(200);
    expect((await request('GET', nextRoom, alpha)).statusCode).toBe(200);
    expect((await request('DELETE', nextRoom, host)).statusCode).toBe(204);
    expect((await request('GET', nextRoom, alpha)).statusCode).toBe(404);
    expect((await request('GET', nextRoom, host)).statusCode).toBe(404);
  });

  it('seals an exclusive problem through the contest window and retains the result in contest history', async () => {
    await seedStaff(db, testPassword);
    const remoteAddress = '127.0.0.27';
    async function login(email: string) {
      const session = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress, payload: { email, password: testPassword } });
      expect(session.statusCode).toBe(200);
      return { authorization: 'Bearer ' + session.json().accessToken };
    }
    const host = await login('admin@practice.test');
    const member = { authorization: 'Bearer ' + student };
    const guestRecord = await db.user.create({ data: {
      email: randomUUID() + '@practice.test', name: 'Contest observer', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    const guest = await login(guestRecord.email);
    const slug = 'sealed-' + randomUUID();
    const draft = {
      slug, title: 'Sealed Threshold Exercise', topic: 'Arrays', difficulty: 'EASY', contestOnly: true,
      description: 'Count each number strictly above the supplied threshold.',
      functionName: 'countAbove', parameterOrder: ['values', 'threshold'],
      starters: { javascript: 'function countAbove(values, threshold) {}' },
      visible: [{ input: { values: [1, 6, 3, 8], threshold: 4 }, expected: 2 }],
      hidden: [{ input: { values: [-11, -3, -3, 17, 0], threshold: -4 }, expected: 4 }],
      editorial: 'Traverse the array and count matching entries.',
    };
    const base = '/api/practice';
    const request = (method: 'GET' | 'POST' | 'PUT', url: string, headers = host, payload?: object) =>
      app.inject({ method, url: base + url, headers, remoteAddress, payload });
    const created = await request('POST', '/admin/problems', host, draft);
    expect(created.statusCode).toBe(201);
    const problemId = created.json().id;
    expect((await request('PUT', '/admin/problems/' + slug + '/publish', host, { published: true })).json().isPublished).toBe(true);
    expect((await db.problem.findUniqueOrThrow({ where: { id: problemId } })).isPublished).toBe(false);
    const problem = '/problems/' + slug;
    const listed = (response: { body: string }) => response.body.includes(slug);
    expect((await request('GET', problem)).statusCode).toBe(404);
    expect(listed(await request('GET', '/problems'))).toBe(false);
    expect(listed(await request('GET', '/competitions/problem-options'))).toBe(true);
    expect(listed(await request('GET', '/competitions/problem-options?kind=BATTLE'))).toBe(false);
    expect(listed(await request('GET', '/competitions/problem-options', member))).toBe(false);
    const start = Date.now() + 60_000;
    const schedule = { title: 'Exclusive contest', kind: 'CONTEST', isPrivate: true,
      startsAt: new Date(start).toISOString(), endsAt: new Date(start + 60_000).toISOString(), problemSlugs: [slug] };
    expect((await request('POST', '/competitions', member, schedule)).statusCode).toBe(400);
    expect((await request('POST', '/competitions', host, { ...schedule, kind: 'BATTLE' })).statusCode).toBe(400);
    const event = await request('POST', '/competitions', host, schedule);
    expect(event.statusCode).toBe(201);
    const { id: competitionId, joinCode } = event.json();
    const contest = '/competitions/' + competitionId;
    expect((await request('POST', '/competitions/join-private', member, { invite: joinCode })).statusCode).toBe(200);

    const code = { problemSlug: slug, language: 'javascript', code: 'correct' };
    const run = (headers = host) => request('POST', '/judge/run', headers, code);
    const submit = (headers = host, requestKey = randomUUID(), scored = true) => request('POST', '/judge/submit', headers, {
      ...code, requestKey, ...(scored && { competitionId }),
    });
    expect((await run()).json().results[0].passed).toBe(true);
    const hostPreview = await request('GET', problem);
    expect(hostPreview.json().problem).toMatchObject({ contestOnly: true, editorial: draft.editorial });
    expect(hostPreview.body).not.toContain('[-11,-3,-3,17,0]');
    expect((await request('GET', problem, member)).statusCode).toBe(404);
    expect((await run(member)).statusCode).toBe(404);
    expect((await submit(member)).statusCode).toBe(404);
    expect((await request('GET', contest, member)).json().problems).toEqual([]);

    await db.practiceCompetition.update({ where: { id: competitionId }, data: { startsAt: new Date(Date.now() - 1000) } });
    expect((await request('GET', problem, guest)).statusCode).toBe(404);
    expect((await run(guest)).statusCode).toBe(404);
    expect((await submit(guest)).statusCode).toBe(404);
    expect((await request('GET', problem, member)).json().problem.status).toBe('NOT_STARTED');
    expect((await run(member)).json().results[0].passed).toBe(true);
    const key = randomUUID();
    const accepted = await submit(member, key);
    expect(accepted.json()).toMatchObject({ solved: true, submission: { verdict: 'Accepted', hiddenPassed: 1 } });
    expect((await submit(member, key)).json()).toEqual(accepted.json());
    expect((await request('GET', contest, member)).json().rows).toContainEqual(expect.objectContaining({ solved: 1, points: 100 }));
    expect(await db.practiceProgress.count({ where: { problemId } })).toBe(0);
    expect(await db.studentProgress.count({ where: { problemId } })).toBe(0);
    expect((await request('GET', problem, member)).json().problem.status).toBe('SOLVED');
    expect((await request('PUT', '/study/problems/' + slug, member, { saved: true })).statusCode).toBe(404);
    expect((await request('POST', '/study/playlists', member, { name: 'Exclusive', slugs: [slug] })).statusCode).toBe(400);
    expect((await request('PUT', '/admin/problems/' + slug + '/publish', host, { published: false })).statusCode).toBe(409);

    const ended = new Date(Date.now() - 1000);
    await db.practiceCompetition.update({ where: { id: competitionId }, data: { endsAt: ended, startsAt: new Date(+ended - 60_000) } });
    expect((await request('GET', problem, guest)).statusCode).toBe(200);
    expect((await request('GET', '/submissions?slug=' + slug, member)).json().submissions).toHaveLength(1);
    expect((await request('GET', '/submissions?slug=' + slug, guest)).json().submissions).toEqual([]);
    expect((await submit(guest, randomUUID(), false)).json().submission.verdict).toBe('Accepted');
    expect(listed(await request('GET', '/study/daily', guest))).toBe(false);
    expect(listed(await request('GET', '/problems', guest))).toBe(false);
    expect((await request('PUT', '/admin/problems/' + slug + '/publish', host, { published: false })).statusCode).toBe(200);
    expect((await request('GET', problem, guest)).statusCode).toBe(404);
  });

  it('imports a roster, activates verified reservations, and archives only Practice', async () => {
    await seedStaff(db, testPassword);
    const placement = '/api/practice/placement';
    const source = randomUUID().slice(0, 8);
    const pendingAddress = 'class-' + source + '@practice.test';
    const revokedAddress = 'revoked-' + source + '@practice.test';
    const capacityAddress = 'capacity-' + source + '@practice.test';
    const foreignAddress = 'foreign-' + source + '@practice.test';
    const home = await db.teacher.findFirstOrThrow({
      where: { user: { email: 'teacher@practice.test' } }, select: { universityId: true },
    });
    const outside = await db.university.create({ data: { name: 'Different Cohort University ' + source, emailDomains: ['practice.test'] } });
    let cohortId: string | undefined;
    let pendingUserId: string | undefined;
    let outsideUserId: string | undefined;
    async function login(email: string) {
      const result = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: testPassword } });
      expect(result.statusCode, result.body).toBe(200);
      return { authorization: 'Bearer ' + result.json().accessToken };
    }
    async function person(email: string, universityId: string, emailVerified: boolean) {
      return db.user.create({ data: {
        email, name: 'Cohort Fixture', passwordHash: seed.user.passwordHash, role: 'STUDENT', emailVerified,
        student: { create: { universityId, registerNumber: email, degree: 'Computing', batch: 'Fixture' } },
      } });
    }
    try {
      outsideUserId = (await person(foreignAddress, outside.id, true)).id;
      const teacher = await login('teacher@practice.test');
      const created = await app.inject({ method: 'POST', url: placement + '/cohorts', headers: teacher,
        payload: { name: 'CSV cohort ' + source, code: 'CSV-' + source, degree: 'Computing', batch: 'Fixture' } });
      expect(created.statusCode, created.body).toBe(201);
      cohortId = created.json().id as string;
      const path = placement + '/cohorts/' + cohortId;
      await db.class.update({ where: { id: cohortId }, data: { maxStudents: 3 } });
      const csv = [
        '\uFEFFName,Email', '"Reader, First",STUDENT@PRACTICE.TEST', 'Pending,' + pendingAddress,
        'Duplicate,STUDENT@practice.test', 'Invalid,wrong', 'Foreign,' + foreignAddress,
        'To revoke,' + revokedAddress, 'Full,' + capacityAddress, 'Outside,unknown@elsewhere.test',
      ].join('\r\n');
      const upload = () => app.inject({ method: 'POST', url: path + '/import', headers: { ...teacher, 'content-type': 'text/plain' }, payload: csv });
      const concurrent = await Promise.all([upload(), upload()]);
      expect(concurrent.map((result) => result.statusCode)).toEqual([200, 200]);
      const imported = concurrent.find((result) => result.json().summary.enrolled === 1)!;
      expect(imported.json().rows.map(({ status }: { status: string }) => status)).toEqual([
        'enrolled', 'invited', 'duplicate', 'invalid-email', 'unavailable', 'invited', 'capacity', 'unavailable',
      ]);
      const repeated = concurrent.find((result) => result.json().summary.enrolled === 0)!;
      expect(repeated.json().rows.map(({ status }: { status: string }) => status)).toContain('already-invited');
      expect(await db.practiceCohortInvite.count({ where: { classId: cohortId } })).toBe(2);
      const revoked = await app.inject({ method: 'POST', url: path + '/invites/revoke', headers: teacher, payload: { email: revokedAddress } });
      expect(revoked.statusCode).toBe(204);

      const invited = await person(pendingAddress, home.universityId, false);
      pendingUserId = invited.id;
      const invitedHeaders = await login(pendingAddress);
      const task = await app.inject({ method: 'POST', url: path + '/assignments', headers: teacher,
        payload: { title: 'Cohort archive exercise', dueAt: new Date(Date.now() + 90_000).toISOString(), problemSlugs: ['count-above'] } });
      expect(task.statusCode, task.body).toBe(201);
      const assignments = () => app.inject({ url: placement + '/assignments', headers: invitedHeaders });
      expect((await assignments()).json().assignments).toEqual([]);
      await db.user.update({ where: { id: invited.id }, data: { emailVerified: true } });
      expect((await assignments()).json().assignments).toEqual([expect.objectContaining({ id: task.json().id })]);
      expect(await db.practiceCohortInvite.count({ where: { classId: cohortId } })).toBe(0);

      const renamed = await app.inject({ method: 'PATCH', url: path, headers: teacher, payload: { name: 'Renamed cohort ' + source } });
      expect(renamed.json().name).toBe('Renamed cohort ' + source);
      const archive = () => app.inject({ method: 'POST', url: path + '/archive', headers: teacher });
      const first = await archive();
      const again = await archive();
      expect(first.json()).toMatchObject({ alreadyArchived: false });
      expect(again.json()).toMatchObject({ alreadyArchived: true, archivedAt: first.json().archivedAt });
      expect((await upload()).statusCode).toBe(409);
      expect((await app.inject({ method: 'PATCH', url: path, headers: teacher, payload: { name: 'Cannot edit archived' } })).statusCode).toBe(409);
      const archived = await app.inject({ url: placement + '/cohorts?status=archived&q=' + source, headers: teacher });
      expect(archived.json().cohorts.map(({ id }: { id: string }) => id)).toEqual([cohortId]);
      expect((await app.inject({ url: path, headers: teacher })).json()).toMatchObject({ roster: expect.arrayContaining([expect.objectContaining({ id: invited.id })]) });
      expect((await assignments()).json().assignments).toEqual([]);
      expect(await db.class.findUnique({ where: { id: cohortId }, select: { isActive: true, _count: { select: { enrollments: true } } } }))
        .toMatchObject({ isActive: true, _count: { enrollments: 2 } });
      expect((await app.inject({ url: path, headers: invitedHeaders })).statusCode).toBe(403);
    } finally {
      if (cohortId) await db.class.delete({ where: { id: cohortId } });
      await db.user.deleteMany({ where: { id: { in: [outsideUserId, pendingUserId].filter((id): id is string => Boolean(id)) } } });
      await db.university.delete({ where: { id: outside.id } });
    }
  }, 15_000);

  it('scopes placement teams to their university and transfers a single lead under concurrency', async () => {
    await seedStaff(db, testPassword);
    const base = '/api/practice/placement';
    const stamp = randomUUID().slice(0, 8);
    const home = await db.university.create({ data: { name: 'Placement team ' + stamp, emailDomains: ['practice.test'] } });
    const outside = await db.university.create({ data: { name: 'Outside team ' + stamp, emailDomains: ['practice.test'] } });
    const people: string[] = [];
    let cohortId: string | undefined;
    async function login(email: string) {
      const result = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.12',
        payload: { email, password: testPassword } });
      expect(result.statusCode, result.body).toBe(200);
      return { authorization: 'Bearer ' + result.json().accessToken };
    }
    async function teacher(name: string, universityId: string) {
      const user = await db.user.create({ data: {
        email: name.toLowerCase() + '-' + stamp + '@practice.test', name, role: 'TEACHER', emailVerified: true,
        passwordHash: seed.user.passwordHash, teacher: { create: { universityId } },
      } });
      people.push(user.id);
      return { ...user, headers: await login(user.email) };
    }
    try {
      const lead = await teacher('Lead', home.id);
      const second = await teacher('Second', home.id);
      const third = await teacher('Third', home.id);
      const foreign = await teacher('Foreign', outside.id);
      const admin = await login('admin@practice.test');
      const adminScope = '?universityId=' + home.id;
      const list = (headers: typeof lead.headers, scope = '') => app.inject({ url: base + '/team' + scope, headers });
      const designate = (headers: typeof lead.headers, email: string, expectedPrimary: string | null) => app.inject({
        method: 'POST', url: base + '/team/primary' + adminScope, headers, payload: { email, expectedPrimary },
      });
      const add = (headers: typeof lead.headers, email: string) => app.inject({
        method: 'POST', url: base + '/team/invite', headers, payload: { email },
      });
      const transfer = (headers: typeof lead.headers, userId: string, expectedPrimary: string, scope = '') => app.inject({
        method: 'POST', url: base + '/team/' + userId + '/make-primary' + scope, headers, payload: { expectedPrimary },
      });
      expect((await list(lead.headers)).json()).toMatchObject({ member: false, members: [] });
      expect((await list(foreign.headers, adminScope)).statusCode).toBe(403);
      expect((await designate(lead.headers, lead.email, null)).statusCode).toBe(403);
      expect((await designate(admin, lead.email, null)).statusCode).toBe(201);
      expect((await designate(admin, second.email, lead.id)).statusCode).toBe(409);
      expect((await list(lead.headers)).json()).toMatchObject({ member: true, canManage: true, primaryId: lead.id });

      const cohort = await app.inject({ method: 'POST', url: base + '/cohorts', headers: lead.headers,
        payload: { name: 'Placement team cohort', code: stamp, degree: 'Computing', batch: '2027' } });
      expect(cohort.statusCode, cohort.body).toBe(201);
      cohortId = cohort.json().id as string;
      const path = base + '/cohorts/' + cohortId;
      const reporting = base + '/reports/overview';
      const period = '?from=2025-01-20&to=2025-01-20';
      expect((await app.inject({ url: reporting + period, headers: second.headers })).statusCode).toBe(403);
      expect((await app.inject({ url: reporting + '?universityId=' + outside.id, headers: lead.headers })).statusCode).toBe(403);
      expect((await app.inject({ url: reporting + '?from=2025-01-21&to=2025-01-20', headers: lead.headers })).statusCode).toBe(400);
      const learners = await Promise.all(['Sharing', 'Hidden'].map(async (label) => {
        const email = label.toLowerCase() + '-' + stamp + '@practice.test';
        const user = await db.user.create({ data: {
          email, name: label + ' Learner', role: 'STUDENT', emailVerified: true, passwordHash: seed.user.passwordHash,
          student: { create: { universityId: home.id, registerNumber: email, degree: 'Computing', batch: '2027' } },
        } });
        people.push(user.id);
        await db.classStudent.create({ data: { classId: cohortId!, studentId: user.id } });
        await db.practiceProgress.create({ data: { userId: user.id, problemId: seed.problem.id,
          status: 'SOLVED', attemptCount: 1, acceptedCount: 1, firstSolvedAt: new Date(), lastAttemptAt: new Date() } });
        return user;
      }));
      const sharing = await login(learners[0]!.email);
      const profile = { handle: 'readiness-' + stamp, bio: '', isPublic: false, hiringOpen: false };
      const saveProfile = (sharePlacement?: boolean) => app.inject({ method: 'PUT', url: '/api/practice/study/profile',
        headers: sharing, payload: { ...profile, sharePlacement } });
      expect((await saveProfile(true)).json()).toMatchObject({ isPublic: false, sharePlacement: true });
      expect((await saveProfile()).json()).toMatchObject({ sharePlacement: true });
      await db.practiceAssignment.create({ data: { classId: cohortId, title: 'Reporting window', problemIds: [seed.problem.id],
        startsAt: new Date('2025-01-20T00:30:00+05:30'), dueAt: new Date('2025-01-22T00:00:00+05:30') } });
      await db.practiceSubmission.create({ data: { userId: learners[0]!.id, problemId: seed.problem.id, problemVersion: 1,
        language: 'python', code: 'example', verdict: 'ACCEPTED', passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0,
        requestKey: randomUUID(), requestDigest: 'synthetic-report-fixture', createdAt: new Date('2025-01-21T11:00:00+05:30') } });
      const report = await app.inject({ url: reporting + period, headers: lead.headers });
      expect(report.statusCode, report.body).toBe(200);
      expect(report.headers['cache-control']).toBe('private, no-store');
      expect(report.json()).toMatchObject({
        totals: { students: 1, active: 1, totalSolved: 1, averageSolved: 1, score: 30 },
        optedOut: 1, unassigned: 0,
        cohorts: [expect.objectContaining({ id: cohortId, students: 1, topTopics: [expect.objectContaining({ solves: 1 })] })],
        assignments: { total: 1, opportunities: 1, completed: 1, percent: 100 },
        rankings: [{ name: 'Sharing Learner', solved: 1, streak: 1 }],
      });
      expect(report.body).not.toContain('Hidden Learner');
      const adminReport = await app.inject({ url: reporting + period + '&universityId=' + home.id, headers: admin });
      expect(adminReport.json()).toEqual(report.json());
      const nextDay = await app.inject({ url: reporting + '?from=2025-01-21&to=2025-01-21', headers: lead.headers });
      expect(nextDay.json()).toMatchObject({ totals: { totalSolved: 1 }, assignments: { total: 0, opportunities: 0, completed: 0 } });
      expect((await saveProfile(false)).json()).toMatchObject({ sharePlacement: false });
      expect((await app.inject({ url: reporting + period, headers: lead.headers })).json()).toMatchObject({
        totals: { students: 0, totalSolved: 0, score: 0 }, optedOut: 2, rankings: [], assignments: { completed: 0, opportunities: 0 },
      });
      expect((await app.inject({ url: path, headers: second.headers })).statusCode).toBe(404);
      expect((await add(lead.headers, foreign.email)).statusCode).toBe(404);
      expect((await add(lead.headers, seed.user.email)).statusCode).toBe(404);
      expect((await add(lead.headers, second.email.toUpperCase())).statusCode).toBe(201);
      expect((await add(second.headers, third.email)).statusCode).toBe(403);
      expect((await add(lead.headers, second.email)).statusCode).toBe(409);
      expect((await add(lead.headers, third.email)).statusCode).toBe(201);
      expect((await list(second.headers)).json()).toMatchObject({ member: true, canManage: false, primaryId: lead.id });
      expect((await app.inject({ url: path, headers: foreign.headers })).statusCode).toBe(404);
      expect((await app.inject({ url: base + '/cohorts', headers: second.headers })).json().cohorts)
        .toContainEqual(expect.objectContaining({ id: cohortId }));
      expect((await app.inject({ method: 'PATCH', url: path, headers: second.headers, payload: { name: 'Edited by teammate' } })).statusCode).toBe(200);

      const transfers = await Promise.all([
        transfer(lead.headers, second.id, lead.id), transfer(lead.headers, third.id, lead.id),
      ]);
      expect(transfers.map((result) => result.statusCode).sort()).toEqual([200, 403]);
      const promoted = [second, third][transfers.findIndex((result) => result.statusCode === 200)]!;
      const removed = promoted.id === second.id ? third : second;
      expect(await db.practicePlacementMember.count({ where: { universityId: home.id, isPrimary: true } })).toBe(1);
      expect((await transfer(admin, lead.id, lead.id, adminScope)).statusCode).toBe(409);
      expect((await app.inject({ method: 'DELETE', url: base + '/team/' + promoted.id, headers: promoted.headers })).statusCode).toBe(409);
      expect((await app.inject({ method: 'DELETE', url: base + '/team/' + removed.id, headers: promoted.headers })).statusCode).toBe(204);
      expect((await app.inject({ url: path, headers: removed.headers })).statusCode).toBe(404);
      expect(await db.teacher.findUnique({ where: { userId: removed.id } })).toMatchObject({ universityId: home.id });
      expect(await db.class.findUnique({ where: { id: cohortId } })).toMatchObject({ primaryTeacherId: lead.id });

      await db.user.update({ where: { id: promoted.id }, data: { emailVerified: false } });
      expect((await list(admin, adminScope)).json()).toMatchObject({ canDesignate: true, primaryId: promoted.id });
      expect((await designate(admin, lead.email, promoted.id)).statusCode).toBe(201);
      expect((await list(admin, adminScope)).json()).toMatchObject({ canDesignate: false, primaryId: lead.id });
      expect(await db.auditLog.count({ where: { resourceType: 'university', resourceId: home.id,
        eventType: { startsWith: 'practice_placement_team_' } } })).toBe(6);
    } finally {
      if (cohortId) await db.class.delete({ where: { id: cohortId } });
      await db.auditLog.deleteMany({ where: { resourceId: home.id, resourceType: 'university' } });
      await db.user.deleteMany({ where: { id: { in: people } } });
      await db.university.deleteMany({ where: { id: { in: [home.id, outside.id] } } });
    }
  }, 15_000);

  it('onboards a verified institution and independently grants and revokes placement privileges', async () => {
    await seedStaff(db, testPassword);
    const suffix = randomUUID().slice(0, 8);
    const domain = 'campus-' + suffix + '.ac.test';
    const universityName = 'Institution fixture ' + suffix;
    const recipients = ['lead@' + domain, 'learner@' + domain, 'enrolled@' + domain];
    const [leadEmail, learnerEmail, enrolledEmail] = recipients as [string, string, string];
    const base = '/api/practice/placement';
    const institution = base + '/institution';
    const ownedReviews: string[] = [];
    let createdUniversity: string | undefined;
    let existingUniversity: string | undefined;
    async function session(email: string, offset: number) {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login',
        payload: { email, password: testPassword }, remoteAddress: '127.0.1.' + offset });
      expect(login.statusCode).toBe(200);
      return { authorization: 'Bearer ' + login.json().accessToken };
    }
    const request = (method: 'GET' | 'POST' | 'DELETE', url: string, headers: { authorization: string }, payload?: object) =>
      app.inject({ method, url, headers, payload });
    const submit = { name: universityName, evidence: 'Verified institutional registry and staff directory.' };

    try {
      for (const [index, email] of recipients.entries()) {
        const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', remoteAddress: '127.0.2.' + (index + 1),
          payload: { name: 'Institution applicant ' + index, email, password: testPassword } });
        expect(signup.statusCode).toBe(201);
      }
      const [lead, learner, enrolled, admin] = await Promise.all([
        session(leadEmail, 1), session(learnerEmail, 2), session(enrolledEmail, 3), session('admin@practice.test', 4),
      ]);
      expect((await request('POST', institution + '/application', lead, submit)).json().error).toBe('INSTITUTION_EMAIL');
      await db.user.updateMany({ where: { email: { in: recipients } }, data: { emailVerified: true } });
      const owner = await db.user.findUniqueOrThrow({ where: { email: leadEmail }, select: { id: true } });
      const peer = await db.user.findUniqueOrThrow({ where: { email: learnerEmail }, select: { id: true } });
      const enrolledUser = await db.user.findUniqueOrThrow({ where: { email: enrolledEmail }, select: { id: true } });
      existingUniversity = (await db.university.create({ data: { name: 'Existing DSA ' + suffix, emailDomains: ['other-' + suffix + '.test'] } })).id;
      await db.student.update({ where: { userId: enrolledUser.id }, data: { universityId: existingUniversity } });

      const submissions = await Promise.all([
        request('POST', institution + '/application', lead, submit), request('POST', institution + '/application', lead, submit),
      ]);
      expect(submissions.map(({ statusCode }) => statusCode).sort()).toEqual([200, 201]);
      const application = submissions[0]!.json().id as string;
      ownedReviews.push(application);
      expect(submissions[1]!.json().id).toBe(application);
      expect((await request('POST', institution + '/application', learner, submit)).json().error).toBe('INSTITUTION_PENDING');
      expect((await request('GET', institution, learner)).json().history).toEqual([]);
      expect((await request('GET', institution + '/reviews', learner)).statusCode).toBe(403);
      expect((await request('POST', institution + '/join', learner)).json().error).toBe('INSTITUTION_UNVERIFIED');
      expect((await request('GET', base + '/officer/application', lead)).statusCode).toBe(403);

      const review = (id: string, action: object) => request('POST', institution + '/reviews/' + id + '/decision', admin, action);
      expect((await review(application, { status: 'REJECTED', version: 1, reason: 'The supplied verification was incomplete.' })).statusCode).toBe(200);
      const retry = await request('POST', institution + '/application', lead, submit);
      expect(retry.statusCode).toBe(201);
      const retryId = retry.json().id as string;
      ownedReviews.push(retryId);
      const approval = await review(retryId, { status: 'APPROVED', version: 1 });
      expect(approval.statusCode).toBe(200);
      createdUniversity = approval.json().universityId as string;
      expect(await db.university.findUnique({ where: { id: createdUniversity }, select: { emailDomains: true } }))
        .toEqual({ emailDomains: [domain] });
      expect((await review(retryId, { status: 'APPROVED', version: 1 })).statusCode).toBe(409);
      expect((await request('GET', institution, learner)).json()).toMatchObject({ canJoin: true, recognized: { id: createdUniversity } });
      expect((await request('POST', institution + '/join', enrolled)).json().error).toBe('INSTITUTION_TRANSFER_REQUIRED');
      expect((await request('POST', institution + '/join', learner)).json().university.id).toBe(createdUniversity);
      expect((await request('POST', institution + '/join', learner)).statusCode).toBe(200);
      expect(await db.student.findUnique({ where: { userId: peer.id }, select: { universityId: true } })).toEqual({ universityId: createdUniversity });
      expect(await db.user.findUnique({ where: { id: peer.id }, select: { role: true } })).toEqual({ role: 'STUDENT' });

      expect((await request('GET', base + '/officer/application', lead)).json()).toMatchObject({ member: false, provisionsTeacher: true, university: { id: createdUniversity } });
      const staffApplication = await request('POST', base + '/officer/application', lead, {
        evidence: [{ kind: 'staff_id', label: 'Verified staff directory listing', reference: domain }],
      });
      expect(staffApplication.statusCode).toBe(201);
      expect((await request('GET', base + '/reports/overview', lead)).statusCode).toBe(403);
      const staffApproval = await request('POST', base + '/officer/reviews/' + staffApplication.json().id + '/decision', admin,
        { status: 'APPROVED', version: 1 });
      expect(staffApproval.statusCode).toBe(200);
      expect(await db.teacher.findUnique({ where: { userId: owner.id }, select: { universityId: true } })).toEqual({ universityId: createdUniversity });
      expect((await request('GET', base + '/me', lead)).json()).toMatchObject({ college: true, reports: true });
      expect((await request('GET', base + '/reports/overview', lead)).statusCode).toBe(200);
      expect((await request('GET', base + '/reports/overview?universityId=' + existingUniversity, lead)).statusCode).toBe(403);

      expect((await review(retryId, { status: 'REVOKED', version: 2, reason: 'This institution moved to a new domain.' })).statusCode).toBe(200);
      expect((await request('GET', institution, learner)).json()).toMatchObject({ recognized: null, canJoin: false, currentUniversity: { id: createdUniversity } });
      expect((await request('POST', institution + '/join', learner)).statusCode).toBe(403);
      expect((await request('GET', base + '/reports/overview', lead)).statusCode).toBe(200);
      expect((await request('DELETE', base + '/team/' + owner.id + '?universityId=' + createdUniversity, admin)).statusCode).toBe(204);
      expect((await request('GET', base + '/me', lead)).json()).toMatchObject({ college: true, reports: false });
      expect((await request('GET', base + '/reports/overview', lead)).statusCode).toBe(403);
      expect(await db.auditLog.count({ where: { resourceId: retryId, eventType: { in: ['practice_institution_approved', 'practice_institution_revoked'] } } })).toBe(2);
    } finally {
      await db.auditLog.deleteMany({ where: { resourceId: { in: [...ownedReviews, ...(createdUniversity ? [createdUniversity] : [])] } } });
      await db.practiceInstitutionApplication.deleteMany({ where: { domain } });
      await db.user.deleteMany({ where: { email: { in: recipients } } });
      await db.university.deleteMany({ where: { id: { in: [createdUniversity, existingUniversity].filter((value): value is string => Boolean(value)) } } });
    }
  }, 20000);

  it('reviews placement officer evidence and grants exactly one lead for concurrent approvals', async () => {
    await seedStaff(db, testPassword);
    const base = '/api/practice/placement/officer';
    const stamp = randomUUID().slice(0, 8);
    const domain = stamp + '.practice.test';
    const home = await db.university.create({ data: { name: 'Officer verification ' + stamp, emailDomains: [domain] } });
    const teacherIds: string[] = [];
    async function login(email: string) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.13',
        payload: { email, password: testPassword } });
      expect(response.statusCode, response.body).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    }
    async function teacher(label: string, email: string) {
      const user = await db.user.create({ data: { name: label, role: 'TEACHER', emailVerified: true,
        email, passwordHash: seed.user.passwordHash, teacher: { create: { universityId: home.id } } } });
      teacherIds.push(user.id);
      return { ...user, headers: await login(email) };
    }
    try {
      const first = await teacher('First officer', 'first@' + domain);
      const second = await teacher('Second officer', 'second@' + domain);
      const third = await teacher('Third officer', 'third@' + domain);
      const outsider = await teacher('Other address', stamp + '@elsewhere.test');
      const admin = await login('admin@practice.test');
      const create = (headers: typeof first.headers) => app.inject({ method: 'POST', url: base + '/application',
        remoteAddress: '127.0.0.13', headers, payload: {} });
      const add = (headers: typeof first.headers, id: string, items: object[]) => app.inject({
        method: 'POST', url: base + '/application/' + id + '/evidence', remoteAddress: '127.0.0.13', headers, payload: { evidence: items },
      });
      const decide = (id: string, status: string, version = 1, reason = '') => app.inject({
        method: 'POST', url: base + '/reviews/' + id + '/decision', remoteAddress: '127.0.0.13', headers: admin, payload: { status, version, reason },
      });
      const own = (headers: typeof first.headers) => app.inject({ url: base + '/application', headers });

      expect((await create(outsider.headers)).statusCode).toBe(403);
      expect((await create({ authorization: 'Bearer ' + student })).statusCode).toBe(403);
      const creates = await Promise.all([create(first.headers), create(first.headers)]);
      expect(creates.map((item) => item.statusCode).sort()).toEqual([201, 409]);
      const firstRequest = creates.find((item) => item.statusCode === 201)!.json().id as string;
      const secondRequest = (await create(second.headers)).json().id as string;
      const thirdRequest = (await create(third.headers)).json().id as string;
      const item = { kind: 'document', label: 'Appointment letter', reference: 'https://university.example/staff' };
      expect((await add(second.headers, firstRequest, [item])).statusCode).toBe(404);
      expect((await add(first.headers, firstRequest, [{ ...item, kind: 'email' }])).statusCode).toBe(400);
      const added = await add(first.headers, firstRequest, Array.from({ length: 10 }, () => item));
      expect(added.json()).toEqual({ version: 2 });
      expect((await add(first.headers, firstRequest, [item])).statusCode).toBe(400);
      const pending = await app.inject({ url: base + '/reviews', headers: admin });
      expect(pending.headers['cache-control']).toBe('private, no-store');
      expect(pending.json().applications).toContainEqual(expect.objectContaining({ id: firstRequest, version: 2,
        submittedEmail: first.email, evidence: expect.arrayContaining([expect.objectContaining(item)]) }));
      expect((await app.inject({ url: base + '/reviews', headers: first.headers })).statusCode).toBe(403);
      expect((await decide(firstRequest, 'APPROVED')).statusCode).toBe(409);
      expect(await db.practicePlacementMember.count({ where: { universityId: home.id } })).toBe(0);

      const approvals = await Promise.all([decide(firstRequest, 'APPROVED', 2), decide(secondRequest, 'APPROVED')]);
      expect(approvals.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(await db.practicePlacementMember.count({ where: { universityId: home.id } })).toBe(2);
      expect(await db.practicePlacementMember.count({ where: { universityId: home.id, isPrimary: true } })).toBe(1);
      expect((await add(first.headers, firstRequest, [item])).statusCode).toBe(409);
      expect((await own(first.headers)).json()).toMatchObject({ member: true, history: [{ status: 'APPROVED' }] });
      await db.user.update({ where: { id: third.id }, data: { emailVerified: false } });
      expect((await decide(thirdRequest, 'APPROVED')).statusCode).toBe(409);
      expect((await decide(thirdRequest, 'REJECTED')).statusCode).toBe(400);
      expect((await decide(thirdRequest, 'REJECTED', 1, 'Confirm the institutional email.')).statusCode).toBe(200);
      await db.user.update({ where: { id: third.id }, data: { emailVerified: true } });
      expect((await own(third.headers)).json()).toMatchObject({ member: false, history: [{ reason: 'Confirm the institutional email.' }] });
      expect((await create(third.headers)).statusCode).toBe(201);
      const approvalNotice = await app.inject({ url: '/api/practice/notifications', headers: first.headers });
      expect(approvalNotice.json().notifications).toEqual([expect.objectContaining({ title: 'Placement officer application approved' })]);
      const rejectionNotice = await app.inject({ url: '/api/practice/notifications', headers: third.headers });
      expect(rejectionNotice.json().notifications).toEqual([expect.objectContaining({ title: 'Placement officer application reviewed' })]);
      expect(rejectionNotice.body).not.toContain('Confirm the institutional email.');
      expect(await db.user.count({ where: { id: { in: teacherIds }, role: 'TEACHER' } })).toBe(4);
      expect(await db.auditLog.count({ where: { resourceType: 'university', resourceId: home.id,
        eventType: { startsWith: 'practice_officer_application_' } } })).toBe(3);
    } finally {
      await db.auditLog.deleteMany({ where: { resourceId: home.id, resourceType: 'university' } });
      await db.user.deleteMany({ where: { id: { in: teacherIds } } });
      await db.university.delete({ where: { id: home.id } });
    }
  }, 15_000);

  it('scopes assignment notices and reminders to eligible recipients and runs the automatic sweep once', async () => {
    await seedStaff(db, testPassword);
    const stamp = randomUUID().slice(0, 8);
    const placement = '/api/practice/placement';
    const inbox = '/api/practice/notifications';
    const home = await db.teacher.findFirstOrThrow({ where: { user: { email: 'teacher@practice.test' } }, select: { universityId: true } });
    const foreignSchool = await db.university.create({ data: { name: 'Reminder scope fixture', emailDomains: ['practice.test'] } });
    const users: string[] = [];
    let classId: string | undefined;
    async function login(email: string) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.14',
        payload: { email, password: testPassword } });
      expect(response.statusCode, response.body).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    }
    async function learner(label: string, universityId: string) {
      const email = label + '-' + stamp + '@practice.test';
      const user = await db.user.create({ data: { email, name: label, role: 'STUDENT', emailVerified: true,
        passwordHash: seed.user.passwordHash, student: { create: { universityId, registerNumber: email, degree: 'Computing', batch: 'Test' } } } });
      users.push(user.id);
      return { id: user.id, headers: await login(email) };
    }
    async function accept(userId: string, createdAt: Date) {
      await db.practiceSubmission.create({ data: { userId, problemId: seed.problem.id, problemVersion: 1, language: 'python',
        code: 'fixture', verdict: 'ACCEPTED', passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0, requestKey: randomUUID(),
        requestDigest: 'reminder-test', createdAt } });
    }
    try {
      const teacher = await login('teacher@practice.test');
      const waiting = await learner('waiting', home.universityId);
      const finished = await learner('finished', home.universityId);
      const foreign = await learner('foreign', foreignSchool.id);
      const cohort = await app.inject({ method: 'POST', url: placement + '/cohorts', headers: teacher,
        payload: { name: 'Reminder cohort ' + stamp, code: stamp, degree: 'Computing', batch: 'Test' } });
      expect(cohort.statusCode, cohort.body).toBe(201);
      classId = cohort.json().id as string;
      await db.classStudent.createMany({ data: users.map((studentId) => ({ classId: classId!, studentId })) });
      const path = placement + '/cohorts/' + classId + '/assignments';
      const assignment = await app.inject({ method: 'POST', url: path, headers: teacher,
        payload: { title: 'Class practice', dueAt: new Date(Date.now() + 3_600_000).toISOString(), problemSlugs: ['count-above'] } });
      expect(assignment.statusCode, assignment.body).toBe(201);
      const assignmentId = assignment.json().id as string;
      const published = await db.practiceAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
      await accept(finished.id, new Date(+published.startsAt + 1));
      const remind = () => app.inject({ method: 'POST', url: path + '/' + assignmentId + '/remind', headers: teacher });
      expect((await remind()).json()).toEqual({ remindedCount: 1 });

      const read = (headers: typeof waiting.headers, query = '') => app.inject({ url: inbox + query, headers });
      const first = await read(waiting.headers, '?limit=1');
      expect(first.headers['cache-control']).toBe('private, no-store');
      const id = first.json().notifications[0]?.id;
      expect(first.json().next).toBe(id);
      const second = await read(waiting.headers, '?limit=1&before=' + id);
      expect(second.json().notifications.map((row: { id: string }) => row.id)).not.toContain(id);
      expect([first.json().notifications[0].title, second.json().notifications[0].title].sort())
        .toEqual(['Assignment reminder', 'New class assignment']);
      expect((await read(foreign.headers, '?before=' + id)).json()).toEqual({ notifications: [], next: null });
      expect((await read(foreign.headers, '/unread-count')).json()).toEqual({ count: 0 });
      expect((await read(finished.headers, '/unread-count')).json()).toEqual({ count: 1 });
      await app.inject({ method: 'POST', url: inbox + '/' + id + '/read', headers: foreign.headers });
      expect((await read(waiting.headers, '/unread-count')).json()).toEqual({ count: 2 });
      await app.inject({ method: 'POST', url: inbox + '/' + id + '/read', headers: waiting.headers });
      expect((await read(waiting.headers, '?unread=true')).json().notifications).toHaveLength(1);
      await app.inject({ method: 'POST', url: inbox + '/read-all', headers: waiting.headers });
      expect((await read(waiting.headers, '/unread-count')).json()).toEqual({ count: 0 });

      const sweepTime = new Date('2035-01-01T12:00:00Z');
      const due = await db.practiceAssignment.create({ data: {
        classId, title: 'Scheduled practice', startsAt: new Date(+sweepTime - 3_600_000),
        dueAt: new Date(+sweepTime + 3_600_000), problemIds: [seed.problem.id],
      } });
      const later = await db.practiceAssignment.create({ data: {
        classId, title: 'Later practice', startsAt: new Date(+sweepTime - 3_600_000),
        dueAt: new Date(+sweepTime + 172_800_000), problemIds: [seed.problem.id],
      } });
      await accept(finished.id, sweepTime);
      const sweeps = await Promise.all([sendAutomaticReminders(db, sweepTime), sendAutomaticReminders(db, sweepTime)]);
      expect(sweeps.map(({ handled }) => handled).sort()).toEqual([0, 1]);
      expect(sweeps.reduce((total, result) => total + result.reminded, 0)).toBe(1);
      expect((await db.practiceAssignment.findUniqueOrThrow({ where: { id: due.id } })).autoRemindedAt).toEqual(sweepTime);
      expect((await db.practiceAssignment.findUniqueOrThrow({ where: { id: later.id } })).autoRemindedAt).toBeNull();
      expect((await read(waiting.headers, '?unread=true')).json().notifications)
        .toEqual([expect.objectContaining({ title: 'Assignment reminder', message: expect.stringContaining('Scheduled practice') })]);
      expect((await read(finished.headers, '/unread-count')).json()).toEqual({ count: 1 });
      const completionPath = path + '/' + assignmentId + '/completion';
      const before = await app.inject({ url: completionPath, headers: teacher });
      expect(before.statusCode, before.body).toBe(200);
      expect(before.headers['cache-control']).toBe('private, no-store');
      expect(before.json()).toMatchObject({
        archived: false, completed: 1,
        problems: [{ id: seed.problem.id, slug: seed.problem.slug }],
        students: [{ id: waiting.id, solved: 0, missing: [seed.problem.id] }, { id: finished.id, solved: 1, missing: [] }],
      });
      expect((await app.inject({ url: completionPath, headers: waiting.headers })).statusCode).toBe(403);
      const foreignWork = await app.inject({ url: placement + '/assignments', headers: foreign.headers });
      expect(foreignWork.json().assignments).toEqual([]);
      const archive = () => app.inject({ method: 'POST', url: path + '/' + assignmentId + '/archive', headers: teacher });
      const archived = await Promise.all([archive(), archive()]);
      expect(archived.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(archived.map((response) => response.json().alreadyArchived).sort()).toEqual([false, true]);
      const archivedAt = archived[0]!.json().archivedAt;
      expect(archived[1]!.json().archivedAt).toBe(archivedAt);
      await accept(waiting.id, new Date(+new Date(archivedAt) + 1));
      const historical = await app.inject({ url: completionPath, headers: teacher });
      expect(historical.json()).toMatchObject({ archived: true, scoringEndsAt: archivedAt, completed: 1 });
      expect((await app.inject({ url: placement + '/assignments', headers: waiting.headers })).json().assignments
        .every(({ id }: { id: string }) => id !== assignmentId)).toBe(true);
      expect((await app.inject({ url: placement + '/cohorts/' + classId, headers: teacher })).json().assignments)
        .toContainEqual(expect.objectContaining({ id: assignmentId, archived: true, completed: 1, totalStudents: 2 }));
      expect((await remind()).statusCode).toBe(409);
      await db.practiceCohortArchive.create({ data: { classId } });
      expect((await archive()).statusCode).toBe(409);
    } finally {
      if (classId) await db.class.delete({ where: { id: classId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.university.delete({ where: { id: foreignSchool.id } });
    }
  }, 15_000);

  it('ranks opted-in candidates by verified XP and applies private directory filters across pages', async () => {
    await seedStaff(db, testPassword);
    const stamp = randomUUID().slice(0, 8);
    const directory = '/api/practice/placement/candidates';
    const college = await db.university.create({ data: { name: 'Directory University ' + stamp, emailDomains: ['practice.test'] } });
    const hiddenCollege = await db.university.create({ data: { name: 'Private University ' + stamp, emailDomains: ['practice.test'] } });
    const users: string[] = [];
    const fixtures: string[] = [];
    async function login(email: string) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.15',
        payload: { email, password: testPassword } });
      expect(response.statusCode, response.body).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    }
    async function exercise(label: string, contestOnly: boolean) {
      const item = await db.problem.create({ data: { slug: label + '-' + stamp, title: 'Directory exercise ' + label, description: 'Synthetic test',
        topic: 'Trees', difficulty: 'HARD', isPublished: true,
        practiceContract: { create: { functionName: 'solve', parameterOrder: [], enabled: true, contestOnly } } } });
      fixtures.push(item.id);
      return item.id;
    }
    async function person(letter: string, universityId: string, visible = true, verified = true) {
      const handle = 'directory-' + letter + '-' + stamp;
      const email = handle + '@practice.test';
      const user = await db.user.create({ data: { email, name: 'Directory ' + letter, role: 'STUDENT', emailVerified: verified,
        passwordHash: seed.user.passwordHash, student: { create: { universityId, registerNumber: email, degree: 'Computing', batch: '2027' } } } });
      users.push(user.id);
      const headers = await login(email);
      const profile = { handle, bio: 'Verified practice learner', isPublic: true, hiringOpen: visible };
      const saved = await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers,
        payload: { ...profile, preferredRole: letter === 'b' ? 'Frontend' : 'Backend',
          availableForWork: letter === 'a', expectedGraduation: letter === 'b' ? 2028 : 2027 } });
      expect(saved.statusCode, saved.body).toBe(200);
      return { ...user, handle, headers, profile };
    }
    async function progress(userId: string, problemId: string, language?: string) {
      const now = new Date();
      await db.practiceProgress.create({ data: { userId, problemId, status: 'SOLVED', attemptCount: 1, acceptedCount: 1,
        firstSolvedAt: now, lastAttemptAt: now } });
      if (language) await db.practiceSubmission.create({ data: { userId, problemId, problemVersion: 1,
        language, code: 'fixture', verdict: 'ACCEPTED', passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0,
        requestKey: randomUUID(), requestDigest: 'directory-test' } });
    }
    try {
      const recruiterEmail = 'directory-recruiter-' + stamp + '@practice.test';
      const recruiter = await db.user.create({ data: { email: recruiterEmail, name: 'Directory recruiter', role: 'STUDENT', emailVerified: true,
        passwordHash: seed.user.passwordHash, practiceRecruiter: { create: { company: 'Directory Labs', workEmail: recruiterEmail } } } });
      users.push(recruiter.id);
      const recruiterHeaders = await login(recruiterEmail);
      const admin = await login('admin@practice.test');
      const candidates = (filters = '') => app.inject({ url: directory + '?q=' + stamp + filters, headers: recruiterHeaders });
      expect((await candidates()).statusCode).toBe(403);
      expect((await app.inject({ url: directory + '/filters', headers: recruiterHeaders })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PATCH', url: '/api/practice/placement/admin/recruiters/' + recruiter.id,
        headers: admin, payload: { status: 'APPROVED' } })).statusCode).toBe(200);

      const alpha = await person('a', college.id);
      const beta = await person('b', college.id);
      const gamma = await person('c', college.id, true, false);
      const hidden = await person('d', hiddenCollege.id, false);
      const hard = await exercise('hard', false);
      const special = await exercise('contest', true);
      await progress(alpha.id, hard, 'python');
      await progress(alpha.id, special, 'typescript');
      await progress(beta.id, hard, 'javascript');
      await progress(gamma.id, seed.problem.id);
      await progress(hidden.id, hard);

      const first = await candidates('&limit=1');
      expect(first.statusCode, first.body).toBe(200);
      expect(first.headers['cache-control']).toBe('private, no-store');
      expect(first.json().candidates).toEqual([expect.objectContaining({ handle: alpha.handle, xp: 50, solved: 1, hard: 1,
        streak: 1, college: college.name, topTopics: ['Trees'], availableForWork: true, expectedGraduation: 2027 })]);
      expect(first.body).not.toContain(alpha.email);
      expect(first.body).not.toContain(alpha.id);
      const next = await candidates('&limit=1&cursor=' + first.json().next);
      expect(next.json().candidates.map(({ handle }: { handle: string }) => handle)).toEqual([beta.handle]);
      const last = await candidates('&limit=1&cursor=' + next.json().next);
      expect(last.json()).toMatchObject({ candidates: [{ handle: gamma.handle, college: null }], next: null });

      const filtered = await candidates('&university=' + college.id + '&topic=trees&language=python&preferredRole=Backend&minSolved=1&maxSolved=1&expectedGraduation=2027&availableForWork=true');
      expect(filtered.json().candidates.map(({ handle }: { handle: string }) => handle)).toEqual([alpha.handle]);
      expect((await candidates('&language=typescript')).json().candidates).toEqual([]);
      expect((await candidates('&minSolved=3&maxSolved=2')).statusCode).toBe(400);
      expect((await candidates('&cursor=' + Buffer.from('{"xp":3000000000,"handle":"valid"}').toString('base64url'))).statusCode).toBe(400);
      const filterOptions = await app.inject({ url: directory + '/filters', headers: recruiterHeaders });
      expect(filterOptions.json()).toMatchObject({ universities: expect.arrayContaining([{ id: college.id, name: college.name }]),
        topics: expect.arrayContaining(['Trees']), languages: expect.arrayContaining([{ key: 'python', label: 'Python' }]) });
      expect(filterOptions.body).not.toContain(hiddenCollege.name);

      const hide = await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers: alpha.headers,
        payload: { ...alpha.profile, hiringOpen: false } });
      expect(hide.json()).toMatchObject({ hiringOpen: false, preferredRole: 'Backend', expectedGraduation: 2027 });
      expect((await candidates()).json().candidates.map(({ handle }: { handle: string }) => handle)).toEqual([beta.handle, gamma.handle]);
      const publicPage = await app.inject('/api/practice/study/public-profile/' + alpha.handle);
      expect(publicPage.statusCode, publicPage.body).toBe(200);
      expect(publicPage.json()).not.toHaveProperty('preferredRole');
      expect(publicPage.json()).not.toHaveProperty('expectedGraduation');
    } finally {
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.problem.deleteMany({ where: { id: { in: fixtures } } });
      await db.university.deleteMany({ where: { id: { in: [college.id, hiddenCollege.id] } } });
    }
  }, 20000);

  it('enrolls students in a scoped cohort and grades a verified recruiter assessment', async () => {
    const headers = { authorization: 'Bearer ' + student };
    await seedStaff(db, testPassword);
    async function role(email: string) {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: testPassword } });
      expect(login.statusCode).toBe(200);
      return { authorization: 'Bearer ' + login.json().accessToken };
    }
    const teacher = await role('teacher@practice.test');
    const admin = await role('admin@practice.test');
    const applicant = await db.user.create({ data: {
      email: randomUUID() + '@practice.test', name: 'Test Recruiter', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    const recruiter = await role(applicant.email);
    const base = '/api/practice/placement';
    expect((await app.inject({ url: base + '/cohorts', headers })).statusCode).toBe(403);
    const cls = await app.inject({ method: 'POST', url: base + '/cohorts', headers: teacher,
      payload: { name: 'Placement practice', code: randomUUID(), degree: 'Computer Science', batch: '2026' } });
    expect(cls.statusCode).toBe(201);
    const cohort = base + '/cohorts/' + cls.json().id;
    expect((await app.inject({ method: 'POST', url: cohort + '/students', headers: teacher,
      payload: { emails: [seed.user.email, 'outside@practice.test'] } })).json()).toMatchObject({ added: 1, unknown: ['outside@practice.test'] });
    expect((await app.inject({ method: 'POST', url: cohort + '/assignments', headers: teacher,
      payload: { title: 'Array warmup', dueAt: new Date(Date.now() + 60000).toISOString(), problemSlugs: ['count-above'] } })).statusCode).toBe(201);
    expect((await app.inject({ url: base + '/assignments', headers })).json().assignments[0].title).toBe('Array warmup');
    expect((await app.inject({ url: base + '/candidates', headers: recruiter })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: base + '/recruiters', headers: recruiter, payload: { company: 'Practice Labs' } });
    expect((await app.inject({ method: 'PATCH', url: base + '/admin/recruiters/' + applicant.id, headers: admin,
      payload: { status: 'APPROVED' } })).statusCode).toBe(200);
    const handle = 'candidate-' + randomUUID().slice(0, 8);
    await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers, payload: { handle, bio: '', isPublic: true, hiringOpen: true } });
    expect((await app.inject({ url: base + '/candidates?q=' + handle, headers: recruiter })).json().candidates[0].handle).toBe(handle);
    const message = 'Interview invitation ' + randomUUID();
    const outreach = (content: string) => app.inject({ method: 'POST', url: base + '/interest', headers: recruiter,
      payload: { handle, message: content } });
    const delivered = await Promise.all([outreach(message), outreach(message)]);
    expect(delivered.map((result) => result.statusCode)).toEqual([200, 200]);
    expect((await outreach(message + ' changed')).statusCode).toBe(429);

    const requestKey = randomUUID();
    const invite = (title = 'Timed practice test') => app.inject({ method: 'POST', url: base + '/tests', headers: recruiter,
      payload: { handle, title, minutes: 15, problemSlugs: ['count-above'], requestKey } });
    const tests = await Promise.all([invite(), invite()]);
    expect(tests.map((result) => [result.statusCode, result.json()])).toEqual([[201, { id: requestKey }], [201, { id: requestKey }]]);
    const id = requestKey;
    expect((await invite('Different test')).statusCode).toBe(409);
    const studentNotices = (await app.inject({ url: '/api/practice/notifications', headers })).json().notifications;
    const pair = { recruiterId: applicant.id, candidateId: seed.user.id };
    const firstMessage = await db.practiceRecruiterInterest.findFirstOrThrow({ where: { ...pair, message } });
    expect(studentNotices.filter((notice: { message: string }) => notice.message.endsWith(message))).toEqual([
      expect.objectContaining({ title: 'A recruiter is interested in you',
        link: '/practice/placement?view=student&message=' + firstMessage.id + '#recruiter-messages' }),
    ]);
    expect(studentNotices.filter((notice: { link: string }) => notice.link.includes(id))).toEqual([
      expect.objectContaining({ title: 'You’ve received a skills test', link: '/practice/placement?view=student&assessment=' + id + '#skills-tests' }),
    ]);
    const recruiterNotices = (await app.inject({ url: '/api/practice/notifications', headers: recruiter })).json().notifications;
    expect(recruiterNotices).toHaveLength(0);
    const exact = (viewer: typeof headers) => app.inject({ url: base + '/tests?assessment=' + id, headers: viewer });
    expect((await exact(admin)).json().tests).toEqual([]);
    expect((await exact(headers)).json().tests).toEqual([expect.objectContaining({ id, status: 'Invited', tasks: [] })]);

    await db.practiceRecruiterInterest.update({ where: { id: firstMessage.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    const followup = message + ' follow-up';
    expect((await outreach(followup)).statusCode).toBe(200);
    const received = (await app.inject({ url: base + '/interest', headers })).json().messages
      .filter((item: { message: string }) => item.message === message || item.message === followup);
    expect(received.map((item: { message: string }) => item.message)).toEqual([followup, message]);
    const original = base + '/interest?message=' + firstMessage.id;
    expect((await app.inject({ url: original, headers })).json().messages).toEqual([expect.objectContaining({ id: firstMessage.id, message })]);
    expect((await app.inject({ url: original, headers: recruiter })).json().messages).toEqual([]);
    const sent = base + '/interests/sent';
    expect((await app.inject({ url: sent, headers })).statusCode).toBe(403);
    const history = await app.inject({ url: sent, headers: recruiter });
    expect(history.headers['cache-control']).toBe('private, no-store');
    expect(history.json().messages).toEqual([
      { id: received[0].id, candidateHandle: handle, message: followup, createdAt: received[0].createdAt },
      { id: firstMessage.id, candidateHandle: handle, message, createdAt: received[1].createdAt },
    ]);
    expect((await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers,
      payload: { handle, bio: '', isPublic: true, hiringOpen: false } })).statusCode).toBe(200);
    expect((await outreach(followup)).statusCode).toBe(404);
    expect((await invite()).statusCode).toBe(404);
    await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers,
      payload: { handle: handle + '-renamed', bio: '', isPublic: false } });
    expect((await app.inject({ url: sent, headers: recruiter })).json()).toEqual(history.json());
    const submit = () => app.inject({ method: 'POST', url: '/api/practice/judge/submit', headers, remoteAddress: '127.0.0.3', payload: {
      language: 'javascript', code: 'correct', problemSlug: 'count-above', assessmentId: id, requestKey: randomUUID(),
    } });
    expect((await submit()).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: base + '/tests/' + id + '/start', headers })).statusCode).toBe(200);
    expect((await submit()).json().submission.verdict).toBe('Accepted');
    expect((await app.inject({ method: 'POST', url: base + '/tests/' + id + '/finish', headers })).statusCode).toBe(200);
    expect((await submit()).statusCode).toBe(409);
    const report = (await app.inject({ url: base + '/tests', headers: recruiter })).json().tests.find((row: { id: string }) => row.id === id);
    expect(report).toMatchObject({ total: 1, solved: 1, status: 'Submitted' });
  }, 15000);

  it('reports scoped UTC analytics with distinct rolling activity and public catalogue rankings', async () => {
    const base = '/api/practice/admin/analytics';
    const login = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@practice.test', password: testPassword } });
    expect(login.statusCode).toBe(200);
    const headers = { authorization: 'Bearer ' + login.json().accessToken };
    const get = (url = base) => app.inject({ url, headers });
    expect((await app.inject(base)).statusCode).toBe(401);
    expect((await app.inject({ url: base + '/trend', headers: { authorization: 'Bearer ' + student } })).statusCode).toBe(403);
    expect((await get(base + '/trend?bucket=invalid')).statusCode).toBe(400);

    const midnight = new Date('2024-03-01T12:30:00Z');
    expect(analyticsPeriods('monthly', midnight).slice(-2)).toEqual([
      { label: '2024-02', start: '2024-02-01T00:00:00.000Z', end: '2024-03-01T00:00:00.000Z' },
      { label: '2024-03', start: '2024-03-01T00:00:00.000Z', end: '2024-04-01T00:00:00.000Z' },
    ]);
    expect(analyticsPeriods('weekly', midnight).slice(-1)).toEqual([
      { label: 'Week of 2024-02-24', start: '2024-02-24T00:00:00.000Z', end: '2024-03-02T00:00:00.000Z' },
    ]);

    const priorResponse = await get();
    expect(priorResponse.statusCode).toBe(200);
    expect(priorResponse.headers['cache-control']).toBe('private, no-store');
    const before = priorResponse.json();
    const baseline = new Map();
    for (const bucket of ['daily', 'weekly', 'monthly']) {
      const response = await get(base + '/trend?bucket=' + bucket);
      expect(response.statusCode).toBe(200);
      baseline.set(bucket, response.json());
    }
    const stamp = randomUUID();
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * 86_400_000);
    const contest = await db.problem.create({ data: {
      slug: 'analytics-contest-' + stamp, title: 'Analytics contest exercise', topic: 'Arrays',
      description: 'A disposable private contest exercise.', difficulty: 'EASY', isPublished: true,
      practiceContract: { create: { functionName: 'solve', parameterOrder: [], enabled: true, contestOnly: true } },
    } });
    const users = await db.user.createManyAndReturn({ data: [9, 8, 3].map((days, index) => ({
      email: 'analytics-' + index + '-' + stamp + '@practice.test', name: 'Analytics fixture', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, createdAt: ago(days),
    })) });
    try {
      const [first, second, third] = users;
      const normal = seed.problem.id;
      await db.practiceSubmission.createMany({ data: [
        { userId: first!.id, problemId: normal, createdAt: ago(8), verdict: 'ACCEPTED' },
        { userId: first!.id, problemId: normal, createdAt: ago(1), verdict: 'ACCEPTED' },
        { userId: first!.id, problemId: normal, createdAt: ago(1), verdict: 'WRONG_ANSWER' },
        { userId: second!.id, problemId: normal, createdAt: ago(8), verdict: 'ACCEPTED' },
        { userId: third!.id, problemId: contest.id, createdAt: ago(2), verdict: 'ACCEPTED' },
        { userId: second!.id, problemId: normal, createdAt: ago(-1), verdict: 'ACCEPTED' },
      ].map((row) => ({
        ...row, problemVersion: 1, verdict: row.verdict as 'ACCEPTED' | 'WRONG_ANSWER', language: 'typescript',
        code: 'private-analytics-fixture-source', requestKey: randomUUID(), requestDigest: 'analytics-fixture',
        passed: Number(row.verdict === 'ACCEPTED'), total: 1, visiblePassed: Number(row.verdict === 'ACCEPTED'), hiddenPassed: 0,
      })) });
      const latest = await get();
      expect(latest.statusCode).toBe(200);
      expect(latest.body).not.toContain('private-analytics-fixture-source');
      const metrics = latest.json();
      expect(metrics.accounts.students).toBe(before.accounts.students + 3);
      expect(metrics.practice).toMatchObject({ published: before.practice.published, submissions: before.practice.submissions + 5, accepted: before.practice.accepted + 4 });
      expect(metrics.engagement).toMatchObject({
        active7Days: before.engagement.active7Days + 2, active30Days: before.engagement.active30Days + 3,
        previous7Days: before.engagement.previous7Days + 2, retained: before.engagement.retained + 1,
      });
      const priorTypeScript = before.languages.find((row: { language: string }) => row.language === 'typescript');
      expect(metrics.languages).toEqual(expect.arrayContaining([{
        language: 'typescript', submissions: (priorTypeScript?.submissions ?? 0) + 5, accepted: (priorTypeScript?.accepted ?? 0) + 4,
      }]));
      const beforeRank = before.problems.mostSolved.find((row: { slug: string }) => row.slug === seed.problem.slug);
      const rank = metrics.problems.mostSolved.find((row: { slug: string }) => row.slug === seed.problem.slug);
      expect(rank.acceptedCount).toBe((beforeRank?.acceptedCount ?? 0) + 3);
      expect([...metrics.problems.mostSolved, ...metrics.problems.leastSolved].every((row: { slug: string }) => row.slug !== contest.slug)).toBe(true);

      const sum = (data: { periods: Array<Record<string, number>> }, metric: 'accepted' | 'registrations' | 'submissions') =>
        data.periods.reduce((total, entry) => total + entry[metric]!, 0);
      for (const [bucket, expected] of [['daily', 30], ['weekly', 12], ['monthly', 12]] as const) {
        const response = await get(base + '/trend?bucket=' + bucket);
        expect(response.statusCode).toBe(200);
        const current = response.json();
        const prior = baseline.get(bucket);
        expect(current.periods).toHaveLength(expected);
        expect(sum(current, 'registrations') - sum(prior, 'registrations')).toBe(3);
        expect(sum(current, 'submissions') - sum(prior, 'submissions')).toBe(5);
        expect(sum(current, 'accepted') - sum(prior, 'accepted')).toBe(4);
      }
    } finally {
      await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
      await db.problem.delete({ where: { id: contest.id } });
    }
  });

  it('filters and restricts Practice accounts with idempotent audited changes', async () => {
    await seedStaff(db, testPassword);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id } });
    const suffix = randomUUID().slice(0, 8);
    const accountName = 'Access fixture ' + suffix;
    const fixtures = await db.user.createManyAndReturn({ data: ['one', 'two'].map((part) => ({
      email: part + '-' + suffix + '@practice.test', name: accountName + ' ' + part, passwordHash, role: 'STUDENT',
    })) });
    const target = fixtures[0]!;
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@practice.test' } });
    async function signIn(email: string) {
      const result = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: testPassword } });
      expect(result.statusCode).toBe(200);
      return { authorization: 'Bearer ' + result.json().accessToken };
    }
    const studentHeaders = await signIn(target.email);
    const adminHeaders = await signIn(admin.email);
    const path = '/api/practice/admin/accounts';
    const accounts = (filter = '') => app.inject({ url: path + '?' + filter, headers: adminHeaders });
    const change = (id: string, access: string, reason: string, headers = adminHeaders) => app.inject({
      method: 'PATCH', url: path + '/' + id + '/access', headers, payload: { access, reason },
    });
    const reason = 'Policy review ' + suffix;
    try {
      expect((await app.inject(path)).statusCode).toBe(401);
      expect((await app.inject({ url: path, headers: studentHeaders })).statusCode).toBe(403);
      expect((await change(target.id, 'suspended', reason, studentHeaders)).statusCode).toBe(403);
      expect((await change(admin.id, 'suspended', reason)).json().error).toBe('PROTECTED_ACCOUNT');
      expect((await change(randomUUID(), 'suspended', reason)).statusCode).toBe(404);
      expect((await change(target.id, 'suspended', ' ')).statusCode).toBe(400);

      const filter = 'q=' + encodeURIComponent(accountName.toUpperCase()) + '&role=STUDENT&limit=1';
      const first = await accounts(filter);
      expect(first.headers['cache-control']).toBe('private, no-store');
      expect(first.body).not.toContain('passwordHash');
      expect(first.json().accounts).toHaveLength(1);
      const second = await accounts(filter + '&before=' + first.json().next);
      expect(second.json().accounts).toHaveLength(1);
      expect(first.json().accounts[0].id).not.toBe(second.json().accounts[0].id);
      expect(second.json().next).toBeNull();
      expect((await accounts('q=' + target.email + '&role=TEACHER')).json().accounts).toEqual([]);

      const suspended = await Promise.all([change(target.id, 'suspended', reason), change(target.id, 'suspended', reason)]);
      for (const response of suspended) {
        expect(response.statusCode).toBe(200);
        expect(response.json().account).toMatchObject({ id: target.id, isActive: true, suspendedAt: expect.any(String) });
      }
      expect((await accounts('q=' + target.email + '&access=suspended')).json().accounts).toHaveLength(1);
      expect((await accounts('q=' + target.email + '&access=active')).json().accounts).toEqual([]);
      for (const url of ['/api/practice/problems', '/api/practice/study/overview']) {
        const forbidden = await app.inject({ url, headers: studentHeaders });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.json().error).toBe('PRACTICE_ACCESS_SUSPENDED');
      }
      expect((await app.inject({ url: '/api/auth/me', headers: studentHeaders })).statusCode).toBe(200);
      expect((await change(target.id, 'active', 'Review complete ' + suffix)).json().account.suspendedAt).toBeNull();
      expect((await app.inject({ url: '/api/practice/problems', headers: studentHeaders })).statusCode).toBe(200);
      const audit = await app.inject({ url: '/api/practice/admin/audit?area=accounts', headers: adminHeaders });
      const entries = audit.json().entries.filter((entry: { target: { id: string } }) => entry.target.id === target.id);
      expect(entries.map((entry: { action: string }) => entry.action)).toEqual(['Practice access restored', 'Practice access suspended']);
      expect(entries[1]?.target.reason).toBe(reason);
    } finally {
      await db.auditLog.deleteMany({ where: { resourceId: target.id, eventType: { in: ['practice_account_suspended', 'practice_account_restored'] } } });
      await db.user.deleteMany({ where: { id: { in: fixtures.map(({ id }) => id) } } });
    }
  });

  it('extracts, imports, verifies, and publishes reviewed opportunities', async () => {
    await seedStaff(db, testPassword);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@practice.test', password: testPassword }, remoteAddress: '127.0.0.13' });
    expect(login.statusCode).toBe(200);
    const headers = { authorization: 'Bearer ' + login.json().accessToken };
    const base = '/api/practice/community';
    const path = base + '/admin/opportunities';
    const extract = (researchText: string, authorization = headers.authorization) => app.inject({
      method: 'POST', url: path + '/import/extract', headers: { authorization }, payload: { researchText },
      remoteAddress: authorization === headers.authorization ? '127.0.0.13' : '127.0.0.14',
    });
    const save = (opportunities: unknown[]) => app.inject({ method: 'POST', url: path + '/import/bulk', headers, payload: { opportunities } });
    const title = 'Import fixture ' + randomUUID().slice(0, 8);
    const opportunity = {
      title, company: 'Test club', category: 'Internship', summary: 'A reviewed student internship from a test source.',
      applyUrl: 'https://example.org/application', sourceUrl: 'https://example.org/opportunity',
      closingDate: '2099-08-14', remote: true,
    };
    let observed: unknown;
    let validProviderOutput = true;
    const server = createServer(async (request, response) => {
      const parts: Uint8Array[] = [];
      for await (const chunk of request) parts.push(chunk);
      observed = { url: request.url, authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(parts).toString('utf8')) };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: validProviderOutput ? JSON.stringify({ opportunities: [opportunity] }) : 'bad response' } }] }));
    });
    try {
      expect((await app.inject({ method: 'POST', url: path + '/import/extract', payload: { researchText: 'example' } })).statusCode).toBe(401);
      expect((await extract('example', 'Bearer ' + student)).statusCode).toBe(403);
      const invalid = { ...opportunity, title: title + ' incomplete', sourceUrl: 'http://example.org/' };
      const paste = await extract(JSON.stringify({ opportunities: [opportunity, invalid] }));
      expect(paste.statusCode).toBe(200);
      expect(paste.headers['cache-control']).toBe('private, no-store');
      expect(paste.json().opportunities).toMatchObject([{ title, invalidFields: [] }, { invalidFields: ['sourceUrl'] }]);
      const upstream = await extract(JSON.stringify([{ title, organization: 'Test club', type: 'research_internship', shortSummary: opportunity.summary,
        officialApplicationUrl: opportunity.applyUrl, officialSourceUrl: opportunity.sourceUrl, applicationDeadline: opportunity.closingDate, workMode: 'remote' }]));
      expect(upstream.json().opportunities[0]).toMatchObject({ ...opportunity, category: 'Research internship' });
      expect(await db.practiceOpportunity.count({ where: { title } })).toBe(0);

      vi.stubEnv('PRACTICE_OPPORTUNITY_AI_URL', '');
      expect((await extract('Pasted research, before a provider is set.')).statusCode).toBe(503);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback test address.');
      vi.stubEnv('PRACTICE_OPPORTUNITY_AI_URL', 'http://127.0.0.1:' + address.port + '/chat/completions');
      vi.stubEnv('PRACTICE_OPPORTUNITY_AI_KEY', 'disposable-research-fixture');
      vi.stubEnv('PRACTICE_OPPORTUNITY_AI_MODEL', 'fixture-model');
      const research = 'Research describes an internship in a test programme.';
      const fromAi = await extract(research);
      expect(fromAi.statusCode).toBe(200);
      expect(fromAi.json().opportunities[0]).toMatchObject(opportunity);
      expect(observed).toMatchObject({
        url: '/chat/completions', authorization: 'Bearer disposable-research-fixture',
        body: { model: 'fixture-model', response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: expect.any(String) }, { role: 'user', content: research }] },
      });
      validProviderOutput = false;
      expect((await extract(research)).statusCode).toBe(502);

      const primary = { ...opportunity, published: true, verifiedAt: new Date().toISOString() };
      const [one, two] = await Promise.all([save([primary, invalid]), save([primary])]);
      expect([one.statusCode, two.statusCode].sort()).toEqual([200, 201]);
      expect(one.json().failed).toEqual([{ index: 1, title: invalid.title, errors: ['Check official source URL'] }]);
      const inserted = [...one.json().imported, ...two.json().imported];
      expect(inserted).toHaveLength(1);
      expect([...one.json().duplicates, ...two.json().duplicates]).toHaveLength(1);
      const target = inserted[0].id;
      const record = await db.practiceOpportunity.findUniqueOrThrow({ where: { id: target } });
      expect(record).toMatchObject({ published: false, verifiedAt: null, closesAt: new Date('2099-08-14T23:59:59.999Z') });
      const publish = () => app.inject({ method: 'PATCH', url: path + '/' + target, headers, payload: { published: true } });
      const listed = () => app.inject(base + '/opportunities?q=' + encodeURIComponent(title));
      expect((await listed()).json().opportunities).toEqual([]);
      expect((await publish()).statusCode).toBe(409);
      const verify = (confirmed: boolean) => app.inject({
        method: 'PATCH', url: path + '/' + target + '/verify', headers, payload: { confirmed },
      });
      expect((await verify(false)).statusCode).toBe(400);
      expect((await verify(true)).statusCode).toBe(200);
      expect((await verify(true)).statusCode).toBe(200);
      expect((await listed()).json().opportunities).toEqual([]);
      expect((await publish()).statusCode).toBe(200);
      expect((await listed()).json().opportunities).toEqual([expect.objectContaining({ id: target, title })]);
      const events = await db.auditLog.findMany({ where: { resourceId: target }, select: { eventType: true } });
      expect(events.map(({ eventType }) => eventType).sort()).toEqual([
        'practice_opportunity_imported', 'practice_opportunity_published', 'practice_opportunity_verified',
      ]);
    } finally {
      vi.unstubAllEnvs();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
      const rows = await db.practiceOpportunity.findMany({ where: { title: { startsWith: title } }, select: { id: true } });
      await db.auditLog.deleteMany({ where: { resourceId: { in: rows.map(({ id }) => id) } } });
      await db.practiceOpportunity.deleteMany({ where: { id: { in: rows.map(({ id }) => id) } } });
    }
  });

  it('reports private learner analytics with exact IST week boundaries and bounded history', async () => {
    const now = new Date('2025-02-10T18:35:00.000Z');
    const tag = randomUUID().slice(0, 8);
    const topic = 'Analytics fixture ' + tag;
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const [owner, peer] = await db.user.createManyAndReturn({
      data: ['owner', 'peer'].map((name) => ({
        email: 'learner-' + tag + '-' + name + '@practice.test', name: 'Learner analytics fixture', passwordHash, role: 'STUDENT',
      })),
    });
    const exercises = await Promise.all((['EASY', 'MEDIUM', 'HARD', 'EASY', 'EASY'] as const).map((difficulty, index) => db.problem.create({
      data: {
        title: topic + ' ' + index, slug: 'learner-analytics-' + tag + '-' + index, topic, difficulty,
        description: 'Disposable learner analytics fixture.', isPublished: index !== 3,
        practiceContract: { create: { functionName: 'fixture', parameterOrder: [], enabled: true, contestOnly: index === 2 } },
      },
    })));
    try {
      const dates = [
        new Date('2025-02-10T18:31:00.000Z'), new Date('2025-02-04T18:30:00.000Z'),
        new Date('2025-02-04T18:29:59.999Z'), new Date(+now - 56 * 86_400_000),
      ];
      await db.practiceProgress.createMany({
        data: dates.map((firstSolvedAt, index) => ({
          userId: owner!.id, problemId: exercises[index]!.id, status: 'SOLVED', attemptCount: 1,
          acceptedCount: 1, firstSolvedAt, lastAttemptAt: firstSolvedAt,
        })),
      });
      const fixture = { problemVersion: 1, code: 'private learner analytics source', requestDigest: 'learner-analytics-fixture',
        passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0, diagnostic: 'private fixture diagnostic' };
      await db.practiceSubmission.createMany({
        data: Array.from({ length: 17 }, (_, index) => ({
          ...fixture, userId: owner!.id, problemId: exercises[index ? 0 : 2]!.id, requestKey: randomUUID(),
          language: index < 12 ? 'javascript' : 'cpp', verdict: index < 3 ? 'ACCEPTED' : 'WRONG_ANSWER',
          createdAt: new Date(+now - index * 1000), runtimeMs: [80, 120, null][index] ?? (index > 2 ? 900 : null),
        })),
      });
      await db.practiceSubmission.createMany({
        data: [{ ...fixture, userId: peer!.id, problemId: exercises[1]!.id, requestKey: randomUUID(),
          language: 'python', verdict: 'ACCEPTED', createdAt: now, runtimeMs: 20 },
        { ...fixture, userId: owner!.id, problemId: exercises[1]!.id, requestKey: randomUUID(),
          language: 'python', verdict: 'ACCEPTED', createdAt: new Date('2099-01-01T00:00:00.000Z'), runtimeMs: 20 }],
      });
      const analytics = await learnerAnalytics(db, owner!.id, now);
      expect(analytics.progress).toMatchObject({ solved: 4, xp: 95, level: 4, streak: { current: 1, best: 2 } });
      expect(analytics.progress.xpCurrent).toBeGreaterThan(0);
      expect(analytics.progress.xpCurrent).toBeLessThan(analytics.progress.xpNeeded);
      expect(analytics.submissions).toEqual({ total: 17, accepted: 3, rate: 17.6, averageRuntimeMs: 100 });
      expect(analytics.languages.map(({ label, submissions }) => [label, submissions])).toEqual([['JavaScript', 12], ['C++', 5]]);
      expect(analytics.topics.find((row) => row.topic === topic)).toEqual({ topic, available: 3, covered: 2, solved: 4 });
      expect(analytics.weeks).toHaveLength(8);
      expect(analytics.weeks.map(({ solved }) => solved)).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
      expect(analytics.weeks.at(-1)).toEqual({ start: '2025-02-05', end: '2025-02-11', solved: 2 });
      expect(analytics.recent).toHaveLength(15);
      expect(analytics.recent[0]).toMatchObject({ slug: null, verdict: 'Accepted', title: exercises[2]!.title });
      const path = '/api/practice/study/analytics';
      expect((await app.inject(path)).statusCode).toBe(401);
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.20',
        payload: { email: owner!.email, password: testPassword } });
      expect(login.statusCode).toBe(200);
      const result = await app.inject({ url: path + '?userId=' + peer!.id, headers: { authorization: 'Bearer ' + login.json().accessToken } });
      expect(result.statusCode).toBe(200);
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(result.json().submissions).toEqual(analytics.submissions);
      expect(result.body).not.toContain('private learner analytics source');
      expect(result.body).not.toContain('private fixture diagnostic');
      expect(result.body).not.toContain(peer!.id);
    } finally {
      await db.user.deleteMany({ where: { id: { in: [owner!.id, peer!.id] } } });
      await db.problem.deleteMany({ where: { id: { in: exercises.map(({ id }) => id) } } });
    }
  });

  it('generates private coaching from public practice summaries and serializes refreshes', async () => {
    const tag = randomUUID().slice(0, 8);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const [owner, peer, empty] = await db.user.createManyAndReturn({ data: ['owner', 'peer', 'empty'].map((key) => ({
      email: 'coach-' + tag + '-' + key + '@practice.test', name: 'Private coaching fixture ' + key,
      role: 'STUDENT', passwordHash,
    })) });
    const hidden = await db.problem.create({ data: {
      title: 'Private contest exercise', slug: 'coaching-private-' + tag, topic: 'Private contest topic', description: 'Disposable privacy fixture.',
      isPublished: true, difficulty: 'HARD',
      practiceContract: { create: { functionName: 'fixture', parameterOrder: [], enabled: true, contestOnly: true } },
    } });
    const output = { strongestArea: 'Your public array exercise was accepted.', weakestArea: 'Your sample has limited topic coverage.',
      nextStep: 'Try another array problem and compare two approaches.', encouragement: 'Build on the accepted result.' };
    const received: Array<{ authorization: string | undefined; request: Record<string, unknown> }> = [];
    let malformed = false;
    const server = createServer(async (request, response) => {
      const parts: Uint8Array[] = [];
      for await (const chunk of request) parts.push(chunk);
      received.push({ authorization: request.headers.authorization, request: JSON.parse(Buffer.concat(parts).toString('utf8')) });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(malformed ? { unexpected: 'private provider body' } : output) } }] }));
    });
    try {
      const input = { problemVersion: 1, language: 'javascript', code: 'private coaching source string', requestDigest: 'coaching-fixture',
        verdict: 'ACCEPTED' as const, passed: 1, visiblePassed: 1, hiddenPassed: 0, total: 1, diagnostic: 'private coaching diagnostic' };
      await db.practiceSubmission.createMany({ data: [
        { ...input, userId: owner!.id, problemId: seed.problem.id, requestKey: randomUUID() },
        { ...input, userId: owner!.id, problemId: hidden.id, requestKey: randomUUID() },
        { ...input, userId: peer!.id, problemId: seed.problem.id, requestKey: randomUUID() },
      ] });
      const signIn = async (email: string, remoteAddress: string) => {
        const login = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress,
          payload: { email, password: testPassword } });
        expect(login.statusCode).toBe(200);
        return { authorization: 'Bearer ' + login.json().accessToken };
      };
      const headers = await signIn(owner!.email, '127.0.0.21');
      const other = await signIn(peer!.email, '127.0.0.22');
      const noActivity = await signIn(empty!.email, '127.0.0.23');
      const path = '/api/practice/study/coaching';
      const get = (viewer = headers) => app.inject({ url: path, headers: viewer });
      const generate = (viewer = headers) => app.inject({ method: 'POST', url: path, headers: viewer, payload: { prompt: 'client-controlled prompt' } });

      vi.stubEnv('PRACTICE_COACHING_AI_URL', '');
      expect((await app.inject(path)).statusCode).toBe(401);
      expect((await get()).json()).toMatchObject({ enabled: false, hasActivity: true, insights: null });
      expect((await generate()).statusCode).toBe(503);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback coaching provider.');
      vi.stubEnv('PRACTICE_COACHING_AI_URL', 'http://127.0.0.1:' + address.port + '/coaching');
      vi.stubEnv('PRACTICE_COACHING_AI_KEY', 'coaching-test-secret');
      vi.stubEnv('PRACTICE_COACHING_AI_MODEL', 'coaching-test-model');
      expect((await get()).json()).toMatchObject({ enabled: true, hasActivity: true, insights: null });
      expect((await generate(noActivity)).json()).toMatchObject({ hasActivity: false, insights: null });
      expect(received).toHaveLength(0);
      const runs = await Promise.all([generate(), generate()]);
      expect(runs.map(({ statusCode }) => statusCode).sort()).toEqual([200, 429]);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ authorization: 'Bearer coaching-test-secret', request: {
        model: 'coaching-test-model', response_format: { type: 'json_object' }, max_completion_tokens: 700,
      } });
      expect(JSON.stringify(received[0]!.request)).not.toMatch(/private coaching source|private coaching diagnostic|client-controlled prompt|Private contest|coaching-private/i);
      expect(JSON.stringify(received[0]!.request)).not.toContain(owner!.email);
      expect(JSON.stringify(received[0]!.request)).not.toContain(owner!.id);
      const messages = received[0]!.request.messages as Array<{ role: string; content: string }>;
      expect(JSON.parse(messages[1]!.content).recent).toMatchObject({
        attempts: 1, accepted: 1, exercises: [{ slug: seed.problem.slug, attempts: 1, accepted: true }],
      });
      const cached = await get();
      expect(cached.headers['cache-control']).toBe('private, no-store');
      expect(cached.json().insights).toEqual(output);
      expect(Date.parse(cached.json().retryAt) - Date.parse(cached.json().generatedAt)).toBe(120_000);
      expect((await app.inject({ url: path + '?userId=' + owner!.id, headers: other })).json().insights).toBeNull();

      await db.practiceCoachingInsight.update({ where: { userId: owner!.id }, data: { retryAt: new Date(0) } });
      malformed = true;
      const failed = await generate();
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain('private provider body');
      expect((await get()).json()).toMatchObject({ insights: output, generatedAt: cached.json().generatedAt, retryAt: expect.any(String) });
    } finally {
      vi.unstubAllEnvs();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
      await db.user.deleteMany({ where: { id: { in: [owner!.id, peer!.id, empty!.id] } } });
      await db.problem.delete({ where: { id: hidden.id } });
    }
  });

  it('gates progressive AI hints, shares the versioned cache, and enforces the IST allowance', async () => {
    const tag = randomUUID().slice(0, 8);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const [owner, peer] = await db.user.createManyAndReturn({ data: ['owner', 'peer'].map((name) => ({
      email: 'hint-' + tag + '-' + name + '@practice.test', name: 'Solver hint fixture', role: 'STUDENT', passwordHash,
    })) });
    const [normal, privateProblem] = await Promise.all([false, true].map((contestOnly) => db.problem.create({
      data: {
        title: 'Hint test problem', slug: 'hint-fixture-' + tag + '-' + Number(contestOnly), topic: 'Arrays',
        description: 'A public description for the configured hint provider.', hints: ['Authored fixture hint'],
        difficulty: 'EASY', isPublished: true,
        practiceContract: { create: { functionName: 'fixture', parameterOrder: [], enabled: true, contestOnly,
          editorial: 'Private solution editorial', cases: { create: { position: 0, hidden: true,
            inputJson: '{"secret":"private hidden case"}', expectedOutputJson: '42' } } } },
      },
    })));
    const metered = createApp(db, {
      NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!, JWT_SECRET: 'local-test-signing-key-with-sufficient-length',
      PRACTICE_BILLING_ENABLED: true,
    }, fixtureRunner);
    let started!: () => void;
    let release!: () => void;
    const firstCall = new Promise<void>((done) => { started = done; });
    const hold = new Promise<void>((done) => { release = done; });
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    let malformed = false;
    const server = createServer(async (request, response) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push(parsed);
      if (requests.length === 1) {
        started();
        await hold;
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(
        malformed ? { unexpected: 'diagnostic fixture' } : { hint: 'Compare each value with the threshold.' },
      ) } }] }));
    });
    try {
      const headers = async (email: string, remoteAddress: string) => {
        const result = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress, payload: { email, password: testPassword } });
        expect(result.statusCode).toBe(200);
        return { authorization: 'Bearer ' + result.json().accessToken };
      };
      const member = await headers(owner!.email, '127.0.0.25');
      const other = await headers(peer!.email, '127.0.0.26');
      const route = (slug: string) => '/api/practice/problems/' + slug + '/hints';
      const status = (viewer = member, slug = normal!.slug) => metered.inject({ url: route(slug), headers: viewer });
      const hint = (level: number, viewer = member, slug = normal!.slug) => metered.inject({
        method: 'POST', url: route(slug), headers: viewer, payload: { level },
        remoteAddress: viewer === member ? '127.0.0.25' : '127.0.0.26',
      });
      vi.stubEnv('PRACTICE_COACHING_AI_URL', '');
      expect((await metered.inject(route(normal!.slug))).statusCode).toBe(401);
      expect((await status()).json()).toMatchObject({ enabled: false, remaining: 3 });
      expect((await hint(1)).statusCode).toBe(503);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback hint provider.');
      vi.stubEnv('PRACTICE_COACHING_AI_URL', 'http://127.0.0.1:' + address.port + '/hints');
      vi.stubEnv('PRACTICE_COACHING_AI_KEY', 'disposable-hint-key');
      vi.stubEnv('PRACTICE_COACHING_AI_MODEL', 'hint-fixture');
      expect((await status(member, privateProblem!.slug)).statusCode).toBe(404);
      expect((await hint(1, member, privateProblem!.slug)).statusCode).toBe(404);
      expect((await hint(4)).statusCode).toBe(400);
      const quota = await status();
      expect(quota.headers['cache-control']).toBe('private, no-store');
      expect(quota.json().resetAt).toMatch(/T18:30:00\.000Z$/);
      expect(requests).toHaveLength(0);

      const first = hint(1);
      await firstCall;
      try {
        expect((await hint(1, other)).statusCode).toBe(409);
        expect((await status(other)).json().remaining).toBe(3);
      } finally { release(); }
      expect((await first).json()).toMatchObject({ level: 1, cached: false, remaining: 2 });
      expect(requests[0]!.messages[0]!.content).toContain('one directional sentence');
      expect(requests[0]!.messages[1]!.content).toContain('public description');
      expect(JSON.stringify(requests[0])).not.toMatch(/private hidden case|Private solution editorial|Authored fixture hint/);

      expect((await hint(1)).json()).toMatchObject({ cached: true, remaining: 1 });
      expect((await hint(1, other)).json()).toMatchObject({ cached: true, remaining: 2 });
      expect(requests).toHaveLength(1);
      expect((await hint(2)).json()).toMatchObject({ level: 2, cached: false, remaining: 0 });
      expect(requests[1]!.messages[0]!.content).toContain('name the key algorithm pattern');
      expect((await hint(3)).statusCode).toBe(402);
      expect(requests).toHaveLength(2);

      malformed = true;
      expect((await hint(3, other)).statusCode).toBe(502);
      expect((await status(other)).json().remaining).toBe(2);
      malformed = false;
      await db.practiceHintCache.updateMany({ where: { problemId: normal!.id, level: 3 }, data: { leaseUntil: new Date(0) } });
      await db.practiceMembershipGrant.create({ data: {
        id: randomUUID(), userId: owner!.id, plan: 'pro_monthly', expiresAt: new Date(Date.now() + 86_400_000), reason: 'Hint membership fixture',
      } });
      expect((await hint(3)).json()).toMatchObject({ level: 3, cached: false, remaining: null });
      expect(requests[3]!.messages[0]!.content).toContain('numbered steps');
      await db.practiceProblemContract.update({ where: { problemId: normal!.id }, data: { contentVersion: { increment: 1 } } });
      expect((await hint(1, other)).json()).toMatchObject({ cached: false, remaining: 1 });
      expect(requests).toHaveLength(5);
      expect((await app.inject({ url: route(normal!.slug), headers: other })).json().remaining).toBeNull();
    } finally {
      release();
      vi.unstubAllEnvs();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
      await metered.close();
      await db.user.deleteMany({ where: { id: { in: [owner!.id, peer!.id] } } });
      await db.problem.deleteMany({ where: { id: { in: [normal!.id, privateProblem!.id] } } });
    }
  });

  it('sends a weekly review once to an eligible student after explicit opt-in', async () => {
    const now = new Date('2025-01-21T10:00:00+05:30');
    const start = new Date('2025-01-13T00:00:00+05:30');
    const end = new Date('2025-01-20T00:00:00+05:30');
    const people: string[] = [];
    async function enrol(name: string, { emailVerified = true, enabled = true, suspended = false } = {}) {
      const user = await db.user.create({ data: {
        name, email: randomUUID() + '@practice.test', role: 'STUDENT', passwordHash: seed.user.passwordHash, emailVerified,
        practiceWeeklyReview: { create: { enabled } },
        ...(suspended && { practiceAccountRestriction: { create: {} } }),
      } });
      people.push(user.id);
      return user;
    }
    async function submit(userId: string, createdAt: Date, verdict: 'ACCEPTED' | 'WRONG_ANSWER' = 'ACCEPTED') {
      return db.practiceSubmission.create({ data: {
        userId, problemId: seed.problem.id, problemVersion: 1, language: 'javascript', code: 'private fixture source',
        verdict, passed: verdict === 'ACCEPTED' ? 4 : 2, total: 4, visiblePassed: 2, hiddenPassed: verdict === 'ACCEPTED' ? 2 : 0,
        requestKey: randomUUID(), requestDigest: 'weekly-review-fixture', createdAt,
      } });
    }
    async function logIn(email: string, remoteAddress: string) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: testPassword }, remoteAddress });
      expect(response.statusCode).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    }
    const prompts: unknown[] = [];
    const provider = createServer(async (incoming, outgoing) => {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      prompts.push(JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content));
      if (prompts.length === 1) { outgoing.writeHead(502).end(); return; }
      outgoing.setHeader('content-type', 'application/json');
      outgoing.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        headline: 'You solved one array problem.', review: 'Two of your three submissions passed.',
        recommendation: 'Try a sliding-window exercise next.',
      }) } }] }));
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const address = provider.address();
    if (!address || typeof address === 'string') throw new Error('Expected a local fixture port');
    vi.stubEnv('PRACTICE_COACHING_AI_URL', 'http://127.0.0.1:' + address.port);
    vi.stubEnv('PRACTICE_COACHING_AI_KEY', 'weekly-review-fixture');
    vi.stubEnv('PRACTICE_COACHING_AI_MODEL', 'weekly-review-fixture');
    try {
      const owner = await enrol('Weekly review student', { enabled: false });
      const optedOut = await enrol('Opted out student', { enabled: false });
      const unverified = await enrol('Unverified student', { emailVerified: false });
      const suspended = await enrol('Suspended student', { suspended: true });
      const outside = await enrol('Outside review window');
      for (const user of [owner, optedOut, unverified, suspended]) await submit(user.id, start);
      await submit(owner.id, new Date(+end - 1));
      await submit(owner.id, new Date(+start + 1000), 'WRONG_ANSWER');
      await submit(owner.id, end);
      await submit(outside.id, end);
      await db.practiceProgress.create({ data: {
        userId: owner.id, problemId: seed.problem.id, status: 'SOLVED', firstSolvedAt: start, lastAttemptAt: start, acceptedCount: 1, attemptCount: 1,
      } });
      const path = '/api/practice/study/weekly-review';
      expect((await app.inject(path)).statusCode).toBe(401);
      expect(await sendWeeklyReviews(db, null, now)).toMatchObject({ eligible: 0 });
      const headers = await logIn(owner.email, '127.0.0.28');
      const before = await app.inject({ url: path, headers });
      expect(before.headers['cache-control']).toBe('private, no-store');
      expect(before.json()).toMatchObject({ eligible: true, enabled: false, emailVerified: true, lastSentAt: null });
      const changed = await app.inject({ method: 'PUT', url: path, headers, payload: { enabled: true } });
      expect(changed.json()).toMatchObject({ enabled: true });
      expect(await sendWeeklyReviews(db, null, now)).toMatchObject({ eligible: 1, sent: 0 });
      expect(prompts).toHaveLength(0);
      const review = weeklyReviewGenerator();
      expect(review).not.toBeNull();
      const send = vi.fn(async (_message: { to: string; text: string; subject: string }) => {});
      const delivery = { review: review!, site: new URL('https://practice.example'), send };
      expect(await sendWeeklyReviews(db, delivery, now)).toMatchObject({ eligible: 1, errors: 1, sent: 0 });
      expect(send).not.toHaveBeenCalled();
      const runs = await Promise.all([sendWeeklyReviews(db, delivery, now), sendWeeklyReviews(db, delivery, now)]);
      expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(1);
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        to: owner.email, subject: expect.stringContaining('2025-01-19'), text: expect.stringContaining('Try a sliding-window exercise next.'),
      }));
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toEqual({ solved: 1, attempted: 1, submissions: 3, acceptedSubmissions: 2, acceptancePercent: 67,
        topics: ['Arrays'], totalSolved: 1, xp: 10, streak: 0 });
      expect((await app.inject({ url: path, headers })).json().lastSentAt).toEqual(expect.any(String));
      expect(await sendWeeklyReviews(db, delivery, now)).toMatchObject({ eligible: 0, sent: 0 });

      const boundaryStudent = await enrol('Review cancelled during generation');
      await submit(boundaryStudent.id, start);
      expect(await sendWeeklyReviews(db, { ...delivery, review: async () => {
        await db.practiceWeeklyReview.update({ where: { userId: boundaryStudent.id }, data: { enabled: false } });
        return { headline: 'One solve', review: 'Good progress.', recommendation: 'Try arrays.' };
      } }, now)).toMatchObject({ eligible: 1, sent: 0 });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      await db.user.deleteMany({ where: { id: { in: people } } });
    }
  }, 15000);

  it('runs private, timed mock interviews with retry-safe follow-ups and summaries', async () => {
    const tag = randomUUID().slice(0, 8);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const [owner, peer] = await db.user.createManyAndReturn({ data: ['owner', 'peer'].map((name) => ({
      email: 'interview-' + tag + '-' + name + '@practice.test', name: 'Mock interview fixture', role: 'STUDENT', passwordHash,
    })) });
    const privateExercise = await db.problem.create({ data: {
      title: 'Contest interview fixture', slug: 'interview-contest-' + tag, topic: 'Arrays', description: 'A disposable private exercise.',
      difficulty: 'HARD', isPublished: true, practiceContract: { create: { functionName: 'fixture', parameterOrder: [], enabled: true, contestOnly: true } },
    } });
    const metered = createApp(db, {
      NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!, JWT_SECRET: 'local-test-signing-key-with-sufficient-length',
      PRACTICE_BILLING_ENABLED: true,
    }, fixtureRunner);
    const received: Array<Record<string, unknown>> = [];
    let invalid = false;
    let waitStarted!: () => void;
    let release!: () => void;
    const firstStarted = new Promise<void>((done) => { waitStarted = done; });
    const firstGate = new Promise<void>((done) => { release = done; });
    const question = 'What is the time complexity of your approach?';
    const server = createServer(async (request, response) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      received.push(JSON.parse(input.messages[1].content));
      if (received.length === 1) {
        waitStarted();
        await firstGate;
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid ? { internal: 'private provider response' } : { question }) } }] }));
    });
    try {
      const signIn = async (address: string, email: string) => {
        const login = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: address, payload: { email, password: testPassword } });
        expect(login.statusCode).toBe(200);
        return { authorization: 'Bearer ' + login.json().accessToken };
      };
      const headers = await signIn('127.0.0.27', owner!.email);
      const other = await signIn('127.0.0.28', peer!.email);
      const route = '/api/practice/interviews';
      const requestKey = randomUUID();
      const start = (slug = seed.problem.slug, key = requestKey) => app.inject({
        method: 'POST', url: route + '/start', remoteAddress: '127.0.0.27', headers, payload: { slug, requestKey: key },
      });
      const get = (id: string, actor = headers) => app.inject({ url: route + '/' + id, headers: actor });
      const finish = (id: string, actor = headers) => app.inject({ method: 'POST', url: route + '/' + id + '/finish', headers: actor });
      const reply = (id: string, answer: object, actor = headers) => app.inject({
        method: 'POST', url: route + '/' + id + '/answer', headers: actor, payload: answer,
      });
      vi.stubEnv('PRACTICE_COACHING_AI_URL', '');
      expect((await app.inject(route)).statusCode).toBe(401);
      expect((await start()).statusCode).toBe(503);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback interview provider.');
      vi.stubEnv('PRACTICE_COACHING_AI_URL', 'http://127.0.0.1:' + address.port + '/interview');
      vi.stubEnv('PRACTICE_COACHING_AI_KEY', 'disposable-interview-key');
      vi.stubEnv('PRACTICE_COACHING_AI_MODEL', 'disposable-interview-model');
      expect((await metered.inject({ method: 'POST', url: route + '/start', headers, payload: { slug: seed.problem.slug, requestKey } })).statusCode).toBe(402);
      expect((await start(privateExercise.slug)).statusCode).toBe(404);
      const started = await Promise.all([start(), start()]);
      expect(started.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
      const session = started[0]!.json();
      const id = session.id;
      expect(started[1]!.json().id).toBe(id);
      expect(session).toMatchObject({ status: 'ACTIVE', questions: 1, turns: [] });
      expect(Date.parse(session.expiresAt) - Date.parse(session.startedAt)).toBe(45 * 60_000);
      expect(session.problem.cases).toHaveLength(2);
      expect(session.problem).not.toHaveProperty('editorial');
      expect(session.problem).not.toHaveProperty('hints');
      expect((await start(seed.problem.slug, randomUUID())).json().id).toBe(id);
      expect((await start('weighted-ticket-draw', randomUUID())).statusCode).toBe(409);
      expect((await get(id, other)).statusCode).toBe(404);
      expect((await finish(id, other)).statusCode).toBe(404);

      const answer = { answer: 'I will count the matching values in one pass.', requestKey: randomUUID() };
      const pending = reply(id, answer);
      await firstStarted;
      try {
        expect((await reply(id, answer)).statusCode).toBe(409);
        expect((await reply(id, answer, other)).statusCode).toBe(404);
      } finally { release(); }
      const first = await pending;
      expect(first.statusCode).toBe(200);
      expect(first.json().turn).toMatchObject({ position: 1, answer: answer.answer, question });
      expect((await reply(id, answer)).json()).toEqual(first.json());
      expect((await reply(id, { ...answer, answer: 'Different text' })).statusCode).toBe(409);
      expect(received).toHaveLength(1);
      expect(received[0]).not.toHaveProperty('currentCode');
      expect(JSON.stringify(received[0])).not.toContain('[-11,-3,-3,17,0]');

      const withCode = { answer: 'Here is my implementation.', language: 'javascript', currentCode: 'mock-only source marker', requestKey: randomUUID() };
      expect((await reply(id, withCode)).json().turn.position).toBe(2);
      expect(received[1]).toMatchObject({ currentCode: withCode.currentCode, language: 'javascript',
        previousExchanges: [{ answer: answer.answer, question }] });
      invalid = true;
      const failure = await reply(id, { ...answer, requestKey: randomUUID() });
      expect(failure.statusCode).toBe(502);
      expect(failure.body).not.toContain('private provider response');
      const completed = await finish(id);
      expect(completed.json()).toMatchObject({ status: 'COMPLETED', questions: 3 });
      expect(completed.headers['cache-control']).toBe('private, no-store');
      expect(completed.body).not.toContain(withCode.currentCode);
      expect((await finish(id)).json().usedMs).toBe(completed.json().usedMs);
      expect((await reply(id, { ...answer, requestKey: randomUUID() })).statusCode).toBe(410);
      expect((await app.inject({ url: route, headers: other })).json().sessions).toEqual([]);

      const later = await start(seed.problem.slug, randomUUID());
      expect(later.statusCode).toBe(201);
      const next = later.json().id;
      const expiredAt = new Date(Date.now() - 1000);
      await db.practiceMockInterview.update({ where: { id: next },
        data: { expiresAt: expiredAt, startedAt: new Date(+expiredAt - 45 * 60_000) } });
      expect((await reply(next, { ...answer, requestKey: randomUUID() })).statusCode).toBe(410);
      expect((await finish(next)).json()).toMatchObject({ status: 'EXPIRED', usedMs: 45 * 60_000 });
      expect((await app.inject({ url: route, headers })).json().sessions).toHaveLength(2);
    } finally {
      release();
      vi.unstubAllEnvs();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
      await metered.close();
      await db.user.deleteMany({ where: { id: { in: [owner!.id, peer!.id] } } });
      await db.problem.delete({ where: { id: privateExercise.id } });
    }
  });

  it('lists successful Practice admin changes with scoped cursors and safe details', async () => {
    const audit = '/api/practice/admin/audit';
    const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@practice.test', password: testPassword } });
    expect(adminLogin.statusCode).toBe(200);
    const headers = { authorization: 'Bearer ' + adminLogin.json().accessToken };
    const studentHeaders = { authorization: 'Bearer ' + student };
    expect((await app.inject(audit)).statusCode).toBe(401);
    expect((await app.inject({ url: audit, headers: studentHeaders })).statusCode).toBe(403);
    const opportunity = '/api/practice/community/admin/opportunities';
    const title = 'Audit workshop ' + randomUUID().slice(0, 8);
    const body = {
      title, company: 'Audit fixture', category: 'Program', summary: 'A disposable workshop used by the audit regression.',
      applyUrl: 'https://example.test/workshop', remote: true, published: false, closesAt: null,
    };
    expect((await app.inject({ method: 'POST', url: opportunity, headers: studentHeaders, payload: body })).statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: opportunity, headers, payload: body });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const unrelated = await db.auditLog.create({ data: { eventType: 'native_login', resourceId: id, metadata: { secret: 'hidden' } } });
    try {
      const publish = () => app.inject({ method: 'PATCH', url: opportunity + '/' + id, headers, payload: { published: true } });
      expect((await publish()).statusCode).toBe(200);
      expect((await publish()).statusCode).toBe(200);
      const rows = await db.auditLog.findMany({ where: { resourceId: id, eventType: { startsWith: 'practice_' } } });
      expect(rows.map((row) => row.eventType).sort()).toEqual(['practice_opportunity_created', 'practice_opportunity_published']);
      for (const row of rows) {
        await db.auditLog.update({ where: { id: row.id }, data: {
          createdAt: new Date('2099-01-01T12:00:00Z'), metadata: { label: title, secret: 'private-metadata', ...(row.eventType.endsWith('created') && { state: 'Draft' }) },
        } });
      }
      const first = await app.inject({ url: audit + '?area=community&limit=1', headers });
      expect(first.statusCode).toBe(200);
      expect(first.headers['cache-control']).toBe('private, no-store');
      expect(first.body).not.toContain('private-metadata');
      expect(first.json().entries[0]).toMatchObject({ area: 'community', actor: { email: 'admin@practice.test' }, target: { id, label: title } });
      const { next } = first.json();
      const second = await app.inject({ url: audit + '?area=community&limit=1&before=' + next, headers });
      expect(second.json().entries[0]).toMatchObject({ area: 'community', target: { id, label: title } });
      expect(second.json().entries[0].id).not.toBe(first.json().entries[0].id);
      expect((await app.inject({ url: audit + '?area=membership&before=' + next, headers })).statusCode).toBe(400);
      expect((await app.inject({ url: audit + '?before=' + unrelated.id, headers })).statusCode).toBe(400);
    } finally {
      await db.auditLog.deleteMany({ where: { resourceId: id } });
      await db.practiceOpportunity.delete({ where: { id } });
    }
  });

  it('enforces a monthly report allowance and lets approved administrators grant and revoke access', async () => {
    const email = randomUUID() + '@billing.test';
    const owner = await db.user.create({ data: { email, name: 'Billing learner', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    const metered = createApp(db, {
      NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!, JWT_SECRET: 'local-test-signing-key-with-sufficient-length',
      PRACTICE_BILLING_ENABLED: true,
    }, fixtureRunner);
    try {
      const login = async (address: string) => {
        const response = await metered.inject({ method: 'POST', url: '/api/auth/login', payload: { email: address, password: testPassword } });
        expect(response.statusCode).toBe(200);
        return { authorization: 'Bearer ' + response.json().accessToken };
      };
      const headers = await login(email);
      const admin = await login('admin@practice.test');
      const prefix = '/api/practice';
      const billing = prefix + '/billing';
      const profileReport = prefix + '/study/profile/report';
      const status = async () => (await metered.inject({ url: billing + '/membership', headers })).json();
      const download = (requestKey = randomUUID()) => metered.inject({
        method: 'POST', url: profileReport, headers, payload: { requestKey },
      });
      expect((await metered.inject(billing + '/plans')).json()).toMatchObject({ enabled: true, checkoutAvailable: false });
      expect((await metered.inject(billing + '/membership')).statusCode).toBe(401);
      expect((await metered.inject({ url: profileReport, headers })).statusCode).toBe(405);
      expect(await status()).toMatchObject({ plan: 'free', profilePdf: { remaining: 1 } });
      const firstKey = randomUUID();
      const attempts = await Promise.all([download(firstKey), download(firstKey)]);
      expect(attempts.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(attempts[0]!.json()).toEqual(attempts[1]!.json());
      expect((await download()).statusCode).toBe(402);
      expect(await status()).toMatchObject({ plan: 'free', profilePdf: { remaining: 0 } });

      const lookup = (viewer: typeof headers) => metered.inject({ method: 'POST', url: billing + '/admin/lookup', headers: viewer, payload: { email } });
      expect((await lookup(headers)).statusCode).toBe(403);
      expect((await lookup(admin)).json()).toMatchObject({ userId: owner.id, grants: [] });
      const requestKey = randomUUID();
      const payload = { userId: owner.id, plan: 'pro_monthly', reason: 'Test access grant', requestKey };
      const issue = (viewer: typeof headers, details = payload) => metered.inject({ method: 'POST', url: billing + '/admin/grants', headers: viewer, payload: details });
      expect((await issue(headers)).statusCode).toBe(403);
      const grants = await Promise.all([issue(admin), issue(admin)]);
      expect(grants.map((response) => response.statusCode)).toEqual([201, 201]);
      expect(grants[0]!.json()).toEqual(grants[1]!.json());
      expect((await issue(admin, { ...payload, plan: 'lifetime' })).statusCode).toBe(409);
      expect(await status()).toMatchObject({ plan: 'pro_monthly', profilePdf: { remaining: null } });
      expect((await download()).statusCode).toBe(200);
      expect((await download()).statusCode).toBe(200);

      const revoked = await metered.inject({ method: 'POST', url: billing + '/admin/grants/' + requestKey + '/revoke',
        headers: admin, payload: { reason: 'Test grant revoked' } });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json()).toMatchObject({ id: requestKey, revocationReason: 'Test grant revoked' });
      expect(await db.auditLog.count({ where: { resourceId: requestKey, eventType: 'practice_membership_granted' } })).toBe(1);
      expect(await db.auditLog.count({ where: { resourceId: requestKey, eventType: 'practice_membership_revoked' } })).toBe(1);
      expect((await download()).statusCode).toBe(402);
      await db.practiceProfileDownload.update({ where: { userId: owner.id }, data: { month: '2000-01' } });
      const reset = await Promise.all([download(), download()]);
      expect(reset.map((response) => response.statusCode).sort()).toEqual([200, 402]);

      const expired = await issue(admin, { ...payload, requestKey: randomUUID() });
      expect(expired.statusCode).toBe(201);
      await db.practiceMembershipGrant.update({ where: { id: expired.json().id }, data: { expiresAt: new Date(0) } });
      expect(await status()).toMatchObject({ plan: 'free', profilePdf: { remaining: 0 } });
      expect((await app.inject({ method: 'POST', url: profileReport, headers, payload: { requestKey: randomUUID() } })).statusCode).toBe(200);
    } finally {
      await metered.close();
      await db.user.delete({ where: { id: owner.id } });
    }
  });

  it('exports practice activity for the authenticated owner without publishing their profile', async () => {
    const stamp = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: {
      email: stamp + '@activity-report.test', name: 'विद्या 李', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    try {
      const endpoint = '/api/practice/study/profile/report';
      expect((await app.inject(endpoint)).statusCode).toBe(401);
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: testPassword } });
      expect(login.statusCode).toBe(200);
      const headers = { authorization: 'Bearer ' + login.json().accessToken };
      const report = () => app.inject({ url: endpoint + '?userId=' + seed.user.id, headers });
      expect((await report()).json()).toMatchObject({ name: user.name, handle: null, solved: 0, xp: 0, level: 1,
        strongestTopics: [], recentSolves: [], difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 }, streak: { current: 0, best: 0 } });
      const handle = 'activity-' + stamp;
      expect((await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers,
        payload: { handle, bio: '', isPublic: false } })).statusCode).toBe(200);
      const medium = await db.problem.findUniqueOrThrow({ where: { slug: 'clip-tree-leaves' } });
      const attempted = await db.problem.findUniqueOrThrow({ where: { slug: 'letter-transitions' } });
      const today = new Date();
      const yesterday = new Date(+today - 86_400_000);
      await db.practiceProgress.createMany({ data: [
        { userId: user.id, problemId: seed.problem.id, status: 'SOLVED', firstSolvedAt: yesterday, lastAttemptAt: yesterday, acceptedCount: 1, attemptCount: 1 },
        { userId: user.id, problemId: medium.id, status: 'SOLVED', firstSolvedAt: today, lastAttemptAt: today, acceptedCount: 1, attemptCount: 1 },
        { userId: user.id, problemId: attempted.id, status: 'ATTEMPTED', lastAttemptAt: today, attemptCount: 1 },
      ] });
      const response = await report();
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json()).toMatchObject({
        name: user.name, handle, solved: 2, xp: 35, streak: { current: 2, best: 2 },
        difficulty: { EASY: 1, MEDIUM: 1, HARD: 0 }, strongestTopics: [{ topic: 'Arrays', solved: 1 }, { topic: 'Trees', solved: 1 }],
        recentSolves: [
          { title: medium.title, difficulty: 'MEDIUM', solvedAt: today.toISOString() },
          { title: seed.problem.title, difficulty: 'EASY', solvedAt: yesterday.toISOString() },
        ],
      });
      expect(response.body).not.toContain(user.email);
      expect((await app.inject('/api/practice/study/public-profile/' + handle)).statusCode).toBe(404);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('signs the current public stats and revokes old verification links after consent or handle changes', async () => {
    const stamp = randomUUID().slice(0, 8);
    const user = await db.user.create({ data: {
      email: stamp + '@profile-proof.test', name: 'Practice learner', role: 'STUDENT',
      passwordHash: seed.user.passwordHash, emailVerified: true,
    } });
    try {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: testPassword } });
      expect(login.statusCode).toBe(200);
      const headers = { authorization: 'Bearer ' + login.json().accessToken };
      const base = '/api/practice/study/profile';
      const handle = 'proof-' + stamp;
      const save = (isPublic: boolean, nextHandle = handle) => app.inject({
        method: 'PUT', url: base, headers, payload: { handle: nextHandle, bio: '', isPublic },
      });
      const sign = () => app.inject({ method: 'POST', url: base + '/sign', headers });
      const verify = (id: string) => app.inject(base + '/verify/' + id);

      expect((await app.inject({ method: 'POST', url: base + '/sign' })).statusCode).toBe(401);
      expect((await sign()).statusCode).toBe(409);
      expect((await save(true)).statusCode).toBe(200);
      const [first, retry] = await Promise.all([sign(), sign()]);
      expect(first.statusCode).toBe(200);
      const proof = first.json();
      expect(proof).toMatchObject({ handle, solved: 0, easy: 0, medium: 0, hard: 0, xp: 0, level: 1 });
      expect(retry.json()).toEqual(proof);
      const verified = await verify(proof.id);
      expect(verified.headers['cache-control']).toBe('no-store');
      expect(verified.json()).toEqual({ status: 'verified', snapshot: proof });
      expect(verified.body).not.toContain(user.id);
      expect(proof).not.toHaveProperty('digest');

      const now = new Date();
      await db.practiceProgress.create({ data: {
        userId: user.id, problemId: seed.problem.id, status: 'SOLVED', firstSolvedAt: now,
        lastAttemptAt: now, acceptedCount: 1, attemptCount: 1,
      } });
      expect((await verify(proof.id)).json()).toEqual({ status: 'changed', snapshot: proof });
      const current = (await sign()).json();
      expect(current).toMatchObject({ solved: 1 });
      expect(current.id).not.toBe(proof.id);
      expect((await verify(proof.id)).statusCode).toBe(404);

      await db.practiceProfileProof.update({ where: { id: current.id }, data: { easy: 9 } });
      expect((await verify(current.id)).json()).toEqual({ status: 'invalid' });
      const repaired = (await sign()).json();
      expect((await verify(repaired.id)).json().status).toBe('verified');
      expect((await save(false)).statusCode).toBe(200);
      expect((await verify(repaired.id)).statusCode).toBe(404);
      expect((await save(true)).statusCode).toBe(200);
      expect((await verify(repaired.id)).statusCode).toBe(404);

      const republished = (await sign()).json();
      expect((await save(true, handle + '-new')).statusCode).toBe(200);
      expect((await verify(republished.id)).statusCode).toBe(404);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('reviews ambassadors and schedules each earned referral benefit exactly once', async () => {
    await seedStaff(db, testPassword);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: seed.user.id }, select: { passwordHash: true } });
    const tag = randomUUID().slice(0, 8);
    const users = await db.user.createManyAndReturn({ data: Array.from({ length: 28 }, (_, index) => ({
      email: 'milestone-' + tag + '-' + index + '@practice.test', name: 'Ambassador fixture ' + index, role: 'STUDENT', passwordHash,
    })) });
    const [owner, denied, legacy, ...invitees] = users;
    const url = '/api/practice/community/ambassador';
    const metered = createApp(db, { NODE_ENV: 'test', PORT: 5010, DATABASE_URL: connection!,
      JWT_SECRET: 'local-test-signing-key-with-sufficient-length', PRACTICE_BILLING_ENABLED: true }, fixtureRunner);
    async function signIn(email: string, address: string) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: address, payload: { email, password: testPassword } });
      expect(response.statusCode).toBe(200);
      return { authorization: 'Bearer ' + response.json().accessToken };
    }
    try {
      const admin = await signIn('admin@practice.test', '127.0.0.16');
      const applicant = await signIn(owner!.email, '127.0.0.17');
      const rejected = await signIn(denied!.email, '127.0.0.18');
      const existing = await signIn(legacy!.email, '127.0.0.19');
      const post = (suffix: string, payload: object, headers = applicant) => app.inject({ method: 'POST', url: url + suffix, payload, headers });
      const status = (headers = applicant) => app.inject({ url, headers });
      const review = (id: string, headers: typeof applicant, state: string, reason?: string) => app.inject({
        method: 'PATCH', url: '/api/practice/community/admin/board/' + id, headers, payload: { state, reason },
      });
      expect((await app.inject(url)).statusCode).toBe(401);
      expect((await status()).json()).toEqual({ application: null, dashboard: null });
      expect((await post('/claim', { milestone: '5_referrals' })).statusCode).toBe(403);

      const values = { collegeName: 'Ambassador Test College', collegeDomain: 'College.example', motivation: 'Run student practice sessions.' };
      const applications = await Promise.all([post('/apply', values), post('/apply', values)]);
      expect(applications.map((response) => response.statusCode).sort()).toEqual([201, 409]);
      const id = applications.find((response) => response.statusCode === 201)!.json().id;
      expect((await status()).json().application).toMatchObject({ id, state: 'PENDING', collegeDomain: 'college.example' });
      expect((await review(id, applicant, 'APPROVED')).statusCode).toBe(403);
      expect((await review(id, admin, 'APPROVED')).statusCode).toBe(200);
      const firstStatus = await status();
      expect(firstStatus.headers['cache-control']).toBe('private, no-store');
      expect(firstStatus.json().dashboard).toMatchObject({ referral: expect.stringMatching(/^amb-[a-f0-9]{28}$/), referred: 0, earnedDays: 0 });
      expect((await status()).json().dashboard.referral).toBe(firstStatus.json().dashboard.referral);

      const denial = await post('/apply', values, rejected);
      expect((await review(denial.json().id, admin, 'REJECTED', 'Campus activities could not be confirmed.')).statusCode).toBe(200);
      expect((await status(rejected)).json()).toMatchObject({ application: {
        state: 'REJECTED', rejectionReason: 'Campus activities could not be confirmed.',
      }, dashboard: null });
      await db.practicePublication.create({ data: {
        authorId: legacy!.id, kind: 'AMBASSADOR', state: 'APPROVED', title: 'Legacy college', body: 'An existing approved application.',
      } });
      expect((await status(existing)).json().application).toMatchObject({ state: 'APPROVED', collegeName: 'Legacy college' });

      const refer = (start: number, end: number) => db.practiceReferral.createMany({
        data: invitees.slice(start, end).map((user) => ({ referredId: user.id, referrerId: owner!.id })),
      });
      const claim = (milestone: string) => post('/claim', { milestone });
      await refer(0, 5);
      const claims = await Promise.all([claim('5_referrals'), claim('5_referrals')]);
      expect(claims.map((response) => response.json())).toEqual(Array(2).fill({ milestone: '5_referrals', rewardDays: 14 }));
      expect((await claim('10_referrals')).statusCode).toBe(409);
      await refer(5, 25);
      expect((await claim('10_referrals')).json().rewardDays).toBe(30);
      expect((await claim('25_referrals')).json().rewardDays).toBe(90);
      expect((await db.practiceCredit.count({ where: { userId: owner!.id } }))).toBe(0);
      expect((await status()).json().dashboard).toMatchObject({ referred: 25, earnedDays: 134, bankedDays: 134 });
      expect((await post('/activate', {})).json().error).toBe('AMBASSADOR_ACTIVATION_DISABLED');

      const priorExpiry = new Date(Date.now() + 30 * 86_400_000);
      const prior = await db.practiceMembershipGrant.create({ data: {
        id: randomUUID(), userId: owner!.id, plan: 'pro_monthly', expiresAt: priorExpiry, reason: 'Disposable existing membership',
      } });
      const activate = () => metered.inject({ method: 'POST', url: url + '/activate', headers: applicant });
      const issued = await Promise.all([activate(), activate()]);
      expect(issued.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(issued.map((response) => response.json().activatedDays).sort((a, b) => a - b)).toEqual([0, 134]);
      const reward = await db.practiceMembershipGrant.findFirstOrThrow({ where: { userId: owner!.id, plan: 'ambassador_reward' } });
      expect(reward.grantedAt).toEqual(priorExpiry);
      expect(reward.expiresAt).toEqual(new Date(+priorExpiry + 134 * 86_400_000));
      expect((await status()).json().dashboard).toMatchObject({ earnedDays: 134, bankedDays: 0 });
      expect(await db.practiceAmbassadorClaim.count({ where: { userId: owner!.id, grantId: reward.id } })).toBe(3);
      const membership = () => metered.inject({ url: '/api/practice/billing/membership', headers: applicant });
      expect((await membership()).json().plan).toBe('pro_monthly');
      await db.practiceMembershipGrant.update({ where: { id: prior.id }, data: { revokedAt: new Date() } });
      expect((await membership()).json().plan).toBe('free');
      await db.practiceMembershipGrant.update({ where: { id: reward.id }, data: { grantedAt: new Date(Date.now() - 1000) } });
      expect((await membership()).json()).toMatchObject({ plan: 'ambassador_reward', profilePdf: { remaining: null } });
      expect(await db.auditLog.count({ where: { resourceId: id, eventType: 'practice_ambassador_claimed' } })).toBe(3);
      expect(await db.auditLog.count({ where: { resourceId: reward.id, eventType: 'practice_ambassador_activated' } })).toBe(1);
    } finally {
      await metered.close();
      const targets = users.map(({ id }) => id);
      const applications = await db.practicePublication.findMany({ where: { authorId: { in: targets } }, select: { id: true } });
      await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: targets } }, { resourceId: { in: applications.map(({ id }) => id) } }] } });
      await db.user.deleteMany({ where: { id: { in: targets } } });
    }
  });

  it('qualifies a referral on the first practice solve and records only one debit for a retried redemption', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@practice.test', password: testPassword } });
    const admin = { authorization: 'Bearer ' + login.json().accessToken };
    const handle = 'mentor-' + randomUUID().slice(0, 8);
    const refEmail = randomUUID() + '@practice.test';
    const base = '/api/practice/community';
    try {
      vi.stubEnv('REWARD_AMOUNT_REFERRAL_QUALIFIED_REFERRER', '40');
      vi.stubEnv('REWARD_AMOUNT_CONTRIBUTION_APPROVED', '10');
      expect((await app.inject({ method: 'PUT', url: '/api/practice/study/profile', headers,
        payload: { handle, bio: '', isPublic: false } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/auth/signup',
        payload: { name: 'Referred learner', email: refEmail, password: testPassword, referral: handle } })).statusCode).toBe(201);
      const enrolled = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: refEmail, password: testPassword } });
      expect(enrolled.statusCode).toBe(200);
      const referralHeaders = { authorization: 'Bearer ' + enrolled.json().accessToken };
      const balance = async () => (await app.inject({ url: base + '/credits', headers })).json().balance;
      const before = await balance();
      const referredId = enrolled.json().user.id;
      const contract = await db.practiceProblemContract.findUniqueOrThrow({ where: { problemId: seed.problem.id } });
      const battle = await db.practiceCompetition.create({ data: {
        title: 'Referral test battle', kind: 'BATTLE', isPrivate: true, hostId: seed.user.id,
        startsAt: new Date(Date.now() - 3000), endsAt: new Date(Date.now() + 60_000),
        problems: { create: { problemId: seed.problem.id, position: 0, version: contract.contentVersion } },
        players: { create: { userId: referredId, displayName: 'Referred learner', team: 0 } },
      } });
      const solve = (competitionId?: string) => app.inject({
        method: 'POST', url: '/api/practice/judge/submit', headers: referralHeaders, remoteAddress: '127.0.0.4',
        payload: { problemSlug: 'count-above', code: 'correct', language: 'javascript', requestKey: randomUUID(), competitionId },
      });
      const battleSolve = await solve(battle.id);
      expect(battleSolve.json().submission.verdict).toBe('Accepted');
      expect((await db.practiceReferral.findUniqueOrThrow({ where: { referredId } })).qualifiedAt).toBeNull();
      expect(await balance()).toBe(before);
      expect((await solve()).json().submission.verdict).toBe('Accepted');
      expect((await db.practiceReferral.findUniqueOrThrow({ where: { referredId } })).qualifiedAt).toBeInstanceOf(Date);
      expect((await solve()).json().submission.verdict).toBe('Accepted');
      expect(await balance()).toBe(before + 40);
      const contributed = await app.inject({ method: 'POST', url: base + '/board', headers,
        payload: { title: 'Practice example', body: 'Add an editorial illustrating indexed array traversal.', kind: 'CONTRIBUTION' } });
      const review = base + '/admin/board/' + contributed.json().id;
      expect((await app.inject({ method: 'PATCH', url: review, headers, payload: { state: 'APPROVED' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PATCH', url: review, headers: admin, payload: { state: 'APPROVED' } })).statusCode).toBe(200);
      expect(await balance()).toBe(before + 50);
      expect(contributed.statusCode).toBe(201);
      const authoring = '/api/practice/admin/problems';
      const draft = { slug: 'first-' + randomUUID(), title: 'Return the First Value', topic: 'Arrays', difficulty: 'EASY',
        description: 'Return the first value from a nonempty input array.',
        functionName: 'first', parameterOrder: ['values'], starters: { javascript: 'function first(values) {}' },
        visible: [{ input: { values: [1] }, expected: 1 }], hidden: [{ input: { values: [78955, 32] }, expected: 78955 }],
      };
      expect((await app.inject({ method: 'POST', url: authoring, headers, payload: draft })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: authoring, headers: admin, payload: draft })).statusCode).toBe(201);
      const problemUrl = '/api/practice/problems/' + draft.slug;
      expect((await app.inject({ url: problemUrl, headers })).statusCode).toBe(404);
      expect((await app.inject({ method: 'PUT', url: authoring + '/' + draft.slug + '/publish', headers: admin,
        payload: { published: true } })).statusCode).toBe(200);
      const publicDetail = await app.inject({ url: problemUrl, headers });
      expect(publicDetail.json().problem.cases).toHaveLength(1);
      expect(publicDetail.body).not.toContain('78955');
      const reward = await app.inject({ method: 'POST', url: base + '/admin/rewards', headers: admin,
        payload: { title: 'Practice sticker', details: 'Local test only.', cost: 17, stock: 1 } });
      const payload = { rewardId: reward.json().id, requestKey: randomUUID() };
      const redeem = () => app.inject({ method: 'POST', url: base + '/credits/redeem', headers, payload });
      const [result, retry] = await Promise.all([redeem(), redeem()]);
      expect(result.statusCode).toBe(200);
      expect(retry.json()).toEqual(result.json());
      expect(await balance()).toBe(before + 33);
      expect((await app.inject({ method: 'POST', url: base + '/credits/redemptions/' + result.json().id + '/cancel', headers })).statusCode).toBe(200);
      expect(await balance()).toBe(before + 50);
    } finally { vi.unstubAllEnvs(); }
  }, 15000);

  it('records one outcome on concurrent replay, projects progress, and preserves a solve after failure', async () => {
    const headers = { authorization: 'Bearer ' + student };
    const before = await db.practiceSubmission.count({ where: { userId: seed.user.id } });
    const payload = { problemSlug: seed.problem.slug, language: 'javascript', code: 'correct', requestKey: randomUUID() };
    const request = () => app.inject({ method: 'POST', url: '/api/practice/judge/submit', payload, headers });
    const [first, retry] = await Promise.all([request(), request()]);
    expect(first.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({ submission: { verdict: 'Accepted', passed: 4 }, solved: true });
    expect(await db.practiceSubmission.count({ where: { userId: seed.user.id } })).toBe(before + 1);
    const conflict = await app.inject({ method: 'POST', url: '/api/practice/judge/submit', payload: { ...payload, code: 'different' }, headers });
    expect(conflict.statusCode).toBe(409);
    const failure = await app.inject({ method: 'POST', url: '/api/practice/judge/submit', payload: { ...payload, code: 'malformed', requestKey: randomUUID() }, headers });
    expect(failure.json()).toMatchObject({ solved: true, submission: { verdict: 'Compilation Error' } });
    expect(await db.studentProgress.findUnique({ where: { studentId_problemId: { studentId: seed.user.id, problemId: seed.problem.id } } })).toMatchObject({ status: 'SOLVED' });
    expect(await db.roadmapProgress.findUnique({ where: { studentId_roadmapProblemId: { studentId: seed.user.id, roadmapProblemId: seed.roadmap.id } } })).toMatchObject({ status: 'SOLVED' });
    const history = await app.inject({ url: '/api/practice/submissions?slug=count-above', headers });
    expect(history.json().submissions[0].verdict).toBe('Compilation Error');
  });
});
