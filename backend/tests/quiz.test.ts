import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { quizBank, legacyQuizBank } from '../src/modules/study/quiz-bank.js';
import { completeQuiz, dailyQuiz, pinnedQuiz, questionForDay } from '../src/modules/study/quiz.js';
import { dayKey, localDay } from '../src/modules/study/progress-metrics.js';
import { createDatabase } from '../src/database.js';

describe('original daily quiz bank', () => {
  it('contains eight independently identified four-choice questions in each of fifteen topics', () => {
    expect(quizBank).toHaveLength(120);
    expect(new Set(quizBank.map((row) => row.id)).size).toBe(120);
    expect(new Set(quizBank.map((row) => row.prompt)).size).toBe(120);
    const topics = new Set(quizBank.map((row) => row.topic));
    expect(topics.size).toBe(15);
    for (const topic of topics) expect(quizBank.filter((row) => row.topic === topic)).toHaveLength(8);
    for (const question of quizBank) {
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices[question.answer]).toBeTruthy();
      expect(question.explanation.length).toBeGreaterThan(12);
    }
  });
  it('rotates through the complete bank while retaining the historical four-question mapping', () => {
    const start = Date.parse('2032-01-01');
    const selected = Array.from({ length: 120 }, (_, day) => questionForDay(new Date(start + day * 86_400_000).toISOString().slice(0, 10)).id);
    expect(new Set(selected).size).toBe(120);
    expect(questionForDay('2026-11-21', true)).toEqual(legacyQuizBank[Math.floor(Date.parse('2026-11-21') / 86_400_000) % 4]);
  });
  it('uses the same IST day before and after the UTC midnight and rotates at 18:30 UTC', () => {
    expect(localDay(new Date('2032-01-01T18:29:59Z'))).toBe('2032-01-01');
    expect(localDay(new Date('2032-01-01T18:30:00Z'))).toBe('2032-01-02');
    expect(localDay(new Date('2032-01-01T23:59:59Z'))).toBe(localDay(new Date('2032-01-02T00:00:00Z')));
  });
});

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
describe.skipIf(!connection)('daily quiz with persisted PostgreSQL snapshots', () => {
  let db: ReturnType<typeof createDatabase>;
  const users: string[] = [];
  beforeAll(async () => {
    const url = new URL(connection!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') throw new Error('Use a disposable loopback practice_test database.');
    db = createDatabase(connection!);
    for (const role of ['STUDENT', 'STUDENT', 'STUDENT', 'TEACHER'] as const) {
      const user = await db.user.create({ data: { name: 'Quiz fixture', email: randomUUID() + '@quiz.practice.test', passwordHash: 'not-a-login-hash', role }, select: { id: true } });
      users.push(user.id);
    }
  });
  afterAll(async () => {
    vi.useRealTimers();
    if (db) { await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); }
  });
  it('pins one snapshot across simultaneous reads and follows it even when its text differs from the bank', async () => {
    const day = '2098-07-11';
    await db.practiceDailyQuiz.deleteMany({ where: { day } });
    const versions = await Promise.all(Array.from({ length: 8 }, () => pinnedQuiz(db, day)));
    expect(new Set(versions.map((row) => row.questionId)).size).toBe(1);
    await db.practiceDailyQuiz.update({ where: { day }, data: { prompt: 'A previously deployed prompt', explanation: 'The persisted review explanation.' } });
    expect((await pinnedQuiz(db, day)).prompt).toBe('A previously deployed prompt');
    await db.practiceDailyQuiz.delete({ where: { day } });
  });
  it('keeps historical score-only attempts and reconstructs their original daily question', async () => {
    const day = '2098-07-12';
    await db.practiceDailyQuiz.deleteMany({ where: { day } });
    await db.practiceQuizAttempt.create({ data: { userId: users[0]!, day, score: 1, total: 1 } });
    expect((await pinnedQuiz(db, day)).questionId).toBe(questionForDay(day, true).id);
    expect((await dailyQuiz(db, users[0]!, day))?.result?.score).toBe(1);
    await db.practiceDailyQuiz.delete({ where: { day } });
  });
  it('records skip independently and gives concurrent answer and skip requests the same immutable result', async () => {
    const day = dayKey();
    const snapshot = await pinnedQuiz(db, day);
    expect((await dailyQuiz(db, users[0]!, day))?.correct).toBeNull();
    const results = await Promise.all([completeQuiz(db, users[0]!, day, null), completeQuiz(db, users[0]!, day, snapshot.answer)]);
    expect(results[0]).toEqual(results[1]);
    const saved = await dailyQuiz(db, users[0]!, day);
    expect(saved?.result).toMatchObject({ skipped: results[0]!.skipped, choice: results[0]!.choice });
    expect(saved?.correct).toBe(snapshot.answer);
    const skipped = await completeQuiz(db, users[1]!, day, null);
    expect(skipped).toMatchObject({ skipped: true, score: 0, choice: null });
    expect(await completeQuiz(db, users[1]!, day, snapshot.answer)).toEqual(skipped);
    const wrongChoice = (snapshot.answer + 1) % 4;
    expect(await completeQuiz(db, users[2]!, day, wrongChoice)).toMatchObject({ skipped: false, score: 0, choice: wrongChoice });
  });
  it('rejects a previous IST day and keeps staff out of learner warmups', async () => {
    await expect(completeQuiz(db, users[1]!, '2001-01-01', 0)).rejects.toMatchObject({ code: 'DAY_CHANGED' });
    expect(await dailyQuiz(db, users[3]!, dayKey())).toBeNull();
    await expect(completeQuiz(db, users[3]!, dayKey(), 0)).rejects.toMatchObject({ code: 'LEARNER_ONLY' });
  });
});
