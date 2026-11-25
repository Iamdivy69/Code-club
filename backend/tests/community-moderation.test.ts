import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../src/database.js';
import { AppError } from '../src/errors.js';
import { communityRoutes } from '../src/modules/community/routes.js';
import { contributionInput } from '../src/modules/community/moderation.js';
import { opportunityFields } from '../src/modules/community/opportunity-import.js';
import { opportunityCategories } from '../src/modules/practice/contracts.js';

const proposal = { type: 'new_problem', title: 'Public reading count', topic: 'Arrays', difficulty: 'EASY', functionName: 'countReadings',
  statement: 'Count the supplied readings in the given array.', examples: [{ input: 'values = [2,3]', output: '2' }],
  testcases: [{ input: { values: [900021] }, expectedOutput: 1 }] };
it('validates both structured contribution variants and rejects malformed grading payloads', () => {
  expect(contributionInput.parse(proposal)).toEqual(proposal);
  expect(contributionInput.parse({ type: 'testcase_improvement', problemSlug: 'batch-total', reason: 'Cover an empty input array.', testcases: [{ input: { values: [] }, expectedOutput: 0 }] }).type).toBe('testcase_improvement');
  expect(contributionInput.safeParse({ ...proposal, testcases: [{ input: null }] }).success).toBe(false);
  expect(contributionInput.safeParse({ ...proposal, type: 'report' }).success).toBe(false);
});
it('validates the full opportunity taxonomy and safe destination URLs', () => {
  for (const category of opportunityCategories) expect(opportunityFields.safeParse({ title: 'Original program', company: 'Test club', category,
    summary: 'An original opportunity fixture.', applyUrl: 'https://example.org/apply', remote: true }).success).toBe(true);
  expect(opportunityFields.safeParse({ title: 'Unsafe destination', company: 'Test club', category: 'Fellowship', summary: 'An original fixture.', applyUrl: 'javascript:alert(1)', remote: true }).success).toBe(false);
});

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
describe.skipIf(!connection)('community moderation with PostgreSQL', () => {
  const app = Fastify();
  let db: ReturnType<typeof createDatabase>;
  const people: string[] = [];
  const opportunityIds: string[] = [];
  const problemIds: string[] = [];
  let owner: string;
  let other: string;
  let admin: string;
  let feature: string;
  let contribution: string;
  let opportunity: string;
  const send = (user: string | undefined, method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown) => app.inject({
    method, url: '/community' + path, ...(user && { headers: { 'x-fixture-user': user } }), ...(payload !== undefined && { payload }),
  });
  beforeAll(async () => {
    const url = new URL(connection!);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') throw new Error('Use a disposable loopback database named practice_test.');
    db = createDatabase(connection!);
    for (const role of ['STUDENT', 'STUDENT', 'SUPER_ADMIN'] as const) {
      const person = await db.user.create({ data: { name: 'Community fixture', email: 'community-' + randomUUID() + '@practice.test', passwordHash: 'fixture-never-used-for-login',
        role, emailVerified: true, approvalStatus: 'APPROVED' }, select: { id: true } });
      people.push(person.id);
    }
    [owner, other, admin] = people as [string, string, string];
    app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AppError ? error.statusCode : error instanceof ZodError ? 400 : 500).send({ message: error.message }));
    await app.register(communityRoutes, { prefix: '/community', db, authenticate: async request => {
      const id = request.headers['x-fixture-user'];
      if (typeof id !== 'string' || !people.includes(id)) throw new AppError(401, 'UNAUTHORIZED', 'Sign in.');
      return { id };
    } });
  });
  afterAll(async () => {
    await app.close();
    if (db) {
      await db.practiceOpportunity.deleteMany({ where: { id: { in: opportunityIds } } });
      await db.problem.deleteMany({ where: { id: { in: problemIds } } });
      await db.auditLog.deleteMany({ where: { userId: { in: people } } });
      await db.user.deleteMany({ where: { id: { in: people } } });
      await db.$disconnect();
    }
  });

  it('keeps structured contributions owner/admin-only through submission, approval and review', async () => {
    expect((await send(undefined, 'POST', '/contributions', proposal)).statusCode).toBe(401);
    const submitted = await send(owner, 'POST', '/contributions', proposal);
    expect(submitted.statusCode).toBe(201);
    contribution = submitted.json().id;
    expect(submitted.json()).toMatchObject({ kind: 'CONTRIBUTION', state: 'PENDING', payload: proposal });
    expect((await send(other, 'POST', '/board/' + contribution + '/withdraw')).statusCode).toBe(404);
    expect((await send(owner, 'PATCH', '/admin/board/' + contribution, { state: 'APPROVED' })).statusCode).toBe(403);
    expect((await send(admin, 'GET', '/admin/board')).json().entries.some((row: any) => row.id === contribution && row.payload.testcases[0].input.values[0] === 900021)).toBe(true);
    expect((await send(admin, 'PATCH', '/admin/board/' + contribution, { state: 'APPROVED' })).statusCode).toBe(200);
    const mine = (await send(owner, 'GET', '/board')).json();
    const stranger = (await send(other, 'GET', '/board')).json();
    expect(mine.mine.some((row: any) => row.id === contribution)).toBe(true);
    expect(stranger.mine.some((row: any) => row.id === contribution)).toBe(false);
    expect(JSON.stringify(mine.requests)).not.toContain('900021');
    expect(JSON.stringify(stranger)).not.toContain('900021');
    expect(await db.problem.count({ where: { title: proposal.title } })).toBe(0);
  });

  it('rejects hidden/contest/draft testcase targets and malformed contributions', async () => {
    expect((await send(owner, 'POST', '/contributions', { ...proposal, testcases: [] })).statusCode).toBe(400);
    expect((await send(owner, 'POST', '/contributions', { type: 'testcase_improvement', problemSlug: 'not-public-' + randomUUID(), reason: 'Include the empty array boundary.', testcases: [{ input: { values: [] }, expectedOutput: 0 }] })).statusCode).toBe(404);
    expect((await send(owner, 'POST', '/board', { kind: 'REPORT', title: 'Forged report', body: 'Bypass structured target checks.' })).statusCode).toBe(400);
    for (const visibility of ['public', 'draft', 'contest'] as const) {
      const problem = await db.problem.create({ data: { slug: 'community-target-' + randomUUID(), title: 'Community target fixture',
        description: 'Original disposable fixture for target visibility.', topic: 'Arrays', difficulty: 'EASY', isPublished: visibility !== 'draft',
        practiceContract: { create: { functionName: 'countReadings', parameterOrder: [], enabled: true, contestOnly: visibility === 'contest' } },
      }, select: { id: true, slug: true } });
      problemIds.push(problem.id);
      const improvement = await send(owner, 'POST', '/contributions', { type: 'testcase_improvement', problemSlug: problem.slug,
        reason: 'Include the empty input boundary.', testcases: [{ input: { values: [] }, expectedOutput: 0 }] });
      expect(improvement.statusCode).toBe(visibility === 'public' ? 201 : 404);
      if (visibility === 'public') {
        expect((await send(admin, 'PATCH', '/admin/board/' + improvement.json().id, { state: 'REJECTED', reason: 'This boundary is already covered.' })).statusCode).toBe(200);
        const mine = (await send(owner, 'GET', '/board')).json().mine.find((row: any) => row.id === improvement.json().id);
        expect(mine).toMatchObject({ state: 'REJECTED', reviewReason: 'This boundary is already covered.' });
      }
    }

  });

  it('deduplicates simultaneous reports and enforces moderator resolution separately from generic reviews', async () => {
    feature = (await db.practicePublication.create({ data: { authorId: other, kind: 'FEATURE', state: 'APPROVED', title: 'Moderation fixture feature', body: 'Original public feature body.' } })).id;
    const values = { targetType: 'FEATURE', targetId: feature, reason: 'The published request contains a broken reference.' };
    const submitted = await Promise.all([send(owner, 'POST', '/reports', values), send(owner, 'POST', '/reports', values)]);
    expect(submitted.map(row => row.statusCode)).toEqual([201, 201]);
    expect(submitted[0]!.json().id).toBe(submitted[1]!.json().id);
    const id = submitted[0]!.json().id;
    expect((await send(owner, 'PATCH', '/admin/reports/' + id, { state: 'APPROVED', reason: 'Owner cannot moderate.' })).statusCode).toBe(403);
    expect((await send(admin, 'PATCH', '/admin/board/' + id, { state: 'APPROVED' })).statusCode).toBe(404);
    expect((await send(admin, 'PATCH', '/admin/reports/' + id, { state: 'REJECTED', reason: 'Reviewed; the link is valid.' })).statusCode).toBe(200);
    expect((await db.practicePublication.findUniqueOrThrow({ where: { id: feature } })).state).toBe('APPROVED');
    expect((await send(owner, 'GET', '/board')).json().mine.find((row: any) => row.id === id).reviewReason).toBe('Reviewed; the link is valid.');
    expect((await send(admin, 'PATCH', '/admin/reports/' + id, { state: 'APPROVED', reason: 'Repeated review.' })).statusCode).toBe(409);
    expect((await send(owner, 'POST', '/reports', { ...values, targetId: contribution })).statusCode).toBe(404);
  });

  it('removes an upheld feature report from discovery and voting and records one atomic audit trail', async () => {
    const reported = await send(owner, 'POST', '/reports', { targetType: 'FEATURE', targetId: feature, reason: 'Verified issue in the published request.' });
    const reportId = reported.json().id;
    expect((await send(admin, 'PATCH', '/admin/reports/' + reportId, { state: 'APPROVED', reason: 'Removed after checking the issue.' })).statusCode).toBe(200);
    expect((await db.practicePublication.findUniqueOrThrow({ where: { id: feature } })).state).toBe('WITHDRAWN');
    expect((await send(owner, 'GET', '/board')).json().requests.some((row: any) => row.id === feature)).toBe(false);
    expect((await app.inject({ method: 'PUT', url: '/community/board/' + feature + '/vote', headers: { 'x-fixture-user': owner }, payload: { voted: true } })).statusCode).toBe(404);
    expect((await send(owner, 'POST', '/reports', { targetType: 'FEATURE', targetId: feature, reason: 'Try reporting unavailable material.' })).statusCode).toBe(404);
    expect(await db.auditLog.count({ where: { userId: admin, eventType: 'practice_publication_removed', resourceId: feature } })).toBe(1);
    expect(await db.auditLog.count({ where: { userId: admin, eventType: 'practice_report_reviewed', resourceId: reportId } })).toBe(1);
  });

  it('filters rich opportunity categories, excludes restricted targets and removes upheld opportunity reports', async () => {
    const data = { title: 'Research opportunity fixture', company: 'Test organization', category: 'Research internship', summary: 'An original controlled community fixture.',
      applyUrl: 'https://example.org/fixture', remote: true, closesAt: new Date(Date.now() + 86400000), published: true };
    opportunity = (await db.practiceOpportunity.create({ data })).id;
    const draft = (await db.practiceOpportunity.create({ data: { ...data, title: 'Unpublished private title', published: false } })).id;
    const expired = (await db.practiceOpportunity.create({ data: { ...data, closesAt: new Date(Date.now() - 1000) } })).id;
    opportunityIds.push(opportunity, draft, expired);
    const rows = await send(undefined, 'GET', '/opportunities?category=Research%20internship&remote=true&closingSoon=true');
    expect(rows.statusCode).toBe(200);
    expect(rows.json().opportunities.some((row: any) => row.id === opportunity)).toBe(true);
    expect(rows.json().opportunities.some((row: any) => [draft, expired].includes(row.id))).toBe(false);
    expect(rows.body).not.toContain('Unpublished private title');
    for (const targetId of [draft, expired]) expect((await send(owner, 'POST', '/reports', { targetType: 'OPPORTUNITY', targetId, reason: 'Attempt to access a restricted target.' })).statusCode).toBe(404);
    const reported = await send(owner, 'POST', '/reports', { targetType: 'OPPORTUNITY', targetId: opportunity, reason: 'The official application is no longer available.' });
    expect((await send(admin, 'PATCH', '/admin/reports/' + reported.json().id, { state: 'APPROVED', reason: 'Checked official application and removed.' })).statusCode).toBe(200);
    expect((await send(undefined, 'GET', '/opportunities?category=Research%20internship')).json().opportunities.some((row: any) => row.id === opportunity)).toBe(false);
    expect((await send(owner, 'POST', '/opportunities/' + opportunity + '/click')).statusCode).toBe(404);
    expect((await send(other, 'GET', '/admin/board')).statusCode).toBe(403);
  });
});
