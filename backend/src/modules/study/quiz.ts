import type { PrismaClient, PracticeDailyQuiz, PracticeQuizAttempt } from '@prisma/client';
import { AppError } from '../../errors.js';
import { dayMs, dayKey } from './progress-metrics.js';
import { quizBank, legacyQuizBank } from './quiz-bank.js';

export const questionForDay = (day: string, legacy = false) => {
  const bank = legacy ? legacyQuizBank : quizBank;
  return bank[Math.floor(Date.parse(day) / dayMs) % bank.length]!;
};
const attemptFields = { score: true, total: true, skipped: true, choice: true } as const;

/** createMany/ON CONFLICT DO NOTHING makes the first persisted snapshot authoritative. */
export async function pinnedQuiz(db: PrismaClient, day: string): Promise<PracticeDailyQuiz> {
  const existing = await db.practiceDailyQuiz.findUnique({ where: { day } });
  if (existing) return existing;
  const legacy = await db.practiceQuizAttempt.count({ where: { day } }) > 0;
  const { id: questionId, ...question } = questionForDay(day, legacy);
  await db.practiceDailyQuiz.createMany({ data: [{ day, questionId, ...question }], skipDuplicates: true });
  return db.practiceDailyQuiz.findUniqueOrThrow({ where: { day } });
}

function projection(question: PracticeDailyQuiz, attempt: Pick<PracticeQuizAttempt, keyof typeof attemptFields> | null) {
  return { id: question.questionId, topic: question.topic, prompt: question.prompt, choices: question.choices,
    result: attempt, correct: attempt ? question.answer : null, explanation: attempt ? question.explanation : null };
}

export async function dailyQuiz(db: PrismaClient, userId: string, day: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  if (user.role !== 'STUDENT') return null;
  const [question, attempt] = await Promise.all([
    pinnedQuiz(db, day),
    db.practiceQuizAttempt.findUnique({ where: { userId_day: { userId, day } }, select: attemptFields }),
  ]);
  return projection(question, attempt);
}

export async function completeQuiz(db: PrismaClient, userId: string, day: string, choice: number | null) {
  if (day !== dayKey()) throw new AppError(409, 'DAY_CHANGED', 'A new daily quiz is available. Refresh the page.');
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  if (user.role !== 'STUDENT') throw new AppError(403, 'LEARNER_ONLY', 'Daily warm-ups are available to learners.');
  const question = await pinnedQuiz(db, day);
  // Recheck the boundary after database work; never submit to a day that ended while loading.
  if (day !== dayKey()) throw new AppError(409, 'DAY_CHANGED', 'A new daily quiz is available. Refresh the page.');
  await db.practiceQuizAttempt.createMany({ data: [{ userId, day, choice, skipped: choice === null,
    score: choice === question.answer ? 1 : 0, total: 1 }], skipDuplicates: true });
  const result = await db.practiceQuizAttempt.findUniqueOrThrow({ where: { userId_day: { userId, day } }, select: attemptFields });
  return { ...result, correct: question.answer, explanation: question.explanation };
}
