import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editionChapters, editionOverview, editionProgress, type EditionChapter } from '../src/modules/study/editions.js';
import { createDatabase } from '../src/database.js';

it('releases two original four-mission chapters and keeps three chapters upcoming', () => {
  expect(editionChapters.map((chapter) => chapter.missions.length)).toEqual([4, 4, 0, 0, 0]);
  expect(new Set(editionChapters.flatMap((chapter) => chapter.missions.map((mission) => mission.id))).size).toBe(8);
  const result = editionProgress(editionChapters, [], new Set());
  expect(result.map((chapter) => chapter.status)).toEqual(['available', 'locked', 'upcoming', 'upcoming', 'upcoming']);
  expect(result[0]?.missions[0]?.status).toBe('unavailable');
});

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
describe.skipIf(!connection)('Edition UUID bindings and accepted submission progress', () => {
  let db: ReturnType<typeof createDatabase>;
  let userId: string;
  const ids: string[] = [];
  let chapters: EditionChapter[];
  beforeAll(async () => {
    const url = new URL(connection!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') throw new Error('Use a disposable loopback practice_test database.');
    db = createDatabase(connection!);
    const user = await db.user.create({ data: { name: 'Edition fixture', email: randomUUID() + '@edition.practice.test', role: 'STUDENT', passwordHash: 'not-for-login' } });
    userId = user.id;
    const missions = [];
    for (let index = 0; index < 4; index++) {
      const suffix = randomUUID();
      const slug = 'edition-fixture-' + suffix;
      const problem = await db.problem.create({ data: { slug, title: 'Edition fixture ' + index, description: 'Original disposable exercise.', topic: 'Arrays', difficulty: 'EASY',
        isPublished: true, practiceContract: { create: { enabled: true, functionName: 'fixture', parameterOrder: [] } } } });
      ids.push(problem.id);
      missions.push({ id: 'fixture-' + suffix, slug, objective: 'Complete the fixture.' });
    }
    chapters = [{ id: 'first', title: 'First', description: 'First chapter', missions: missions.slice(0, 2) },
      { id: 'second', title: 'Second', description: 'Second chapter', missions: missions.slice(2) },
      { id: 'later', title: 'Later', description: 'Upcoming', missions: [] }];
  });
  afterAll(async () => {
    if (!db) return;
    await db.practiceEditionMission.deleteMany({ where: { problemId: { in: ids } } });
    await db.practiceProgressReset.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.problem.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  async function solve(index: number, extra: { createdAt?: Date; progressEligible?: boolean } = {}) {
    await db.practiceSubmission.create({ data: { userId, problemId: ids[index]!, problemVersion: 1, code: 'fixture', language: 'javascript',
      verdict: 'ACCEPTED', passed: 1, total: 1, visiblePassed: 1, hiddenPassed: 0, requestKey: randomUUID(), requestDigest: randomUUID(), ...extra } });
  }
  it('unlocks sequentially, survives a rename, retains completed withdrawn missions, and respects reset and in-flight boundaries', async () => {
    const first = await editionOverview(db, userId, chapters);
    expect(first.chapters[0]?.missions.map((mission) => mission.status)).toEqual(['available', 'locked']);
    expect(first.chapters[1]?.status).toBe('locked');
    await solve(1);
    expect((await editionOverview(db, userId, chapters)).chapters[0]?.missions[1]?.status).toBe('locked');
    await db.problem.update({ where: { id: ids[0]! }, data: { slug: 'renamed-edition-' + randomUUID() } });
    const renamed = await editionOverview(db, userId, chapters);
    expect(renamed.chapters[0]?.missions[0]?.problemId).toBe(ids[0]);
    expect(renamed.chapters[0]?.missions[0]?.slug).toMatch(/^renamed-edition-/);
    await solve(0);
    const second = await editionOverview(db, userId, chapters);
    expect(second.chapters[0]?.status).toBe('completed');
    expect(second.chapters[1]?.missions.map((mission) => mission.status)).toEqual(['available', 'locked']);
    await db.problem.update({ where: { id: ids[0]! }, data: { isPublished: false } });
    expect((await editionOverview(db, userId, chapters)).chapters[0]?.missions[0]).toMatchObject({ status: 'completed', slug: null });
    await db.problem.update({ where: { id: ids[2]! }, data: { isPublished: false } });
    expect((await editionOverview(db, userId, chapters)).chapters[1]?.missions[0]?.status).toBe('unavailable');
    await db.problem.updateMany({ where: { id: { in: ids } }, data: { isPublished: true } });
    const resetAt = new Date(Date.now() + 1000);
    const resetId = randomUUID();
    await db.practiceProgressReset.create({ data: { id: resetId, userId, actorId: userId, resetAt, snapshot: {} } });
    await db.practiceProgressEpoch.create({ data: { userId, resetId, resetAt } });
    const reset = await editionOverview(db, userId, chapters);
    expect(reset.chapters[0]?.missions.map((mission) => mission.status)).toEqual(['available', 'locked']);
    await solve(0, { createdAt: new Date(+resetAt + 1000), progressEligible: false });
    expect((await editionOverview(db, userId, chapters)).chapters[0]?.missions[0]?.status).toBe('available');
    await solve(0, { createdAt: resetAt, progressEpoch: resetId });
    expect((await editionOverview(db, userId, chapters)).chapters[0]?.missions.map((mission) => mission.status)).toEqual(['completed', 'available']);
    await solve(1, { createdAt: resetAt, progressEpoch: resetId });
    await solve(2, { createdAt: resetAt, progressEpoch: resetId });
    await solve(3, { createdAt: resetAt, progressEpoch: resetId });
    expect((await editionOverview(db, userId, chapters)).chapters.map((chapter) => chapter.status)).toEqual(['completed', 'completed', 'upcoming']);
  });
});
