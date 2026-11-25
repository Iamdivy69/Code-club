import type { Prisma } from '@prisma/client';
import { levelFor, localDay, points, streak } from './progress-metrics.js';

export async function practiceProfileReport(db: Prisma.TransactionClient, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      practiceProfile: { select: { handle: true } },
      practiceProgress: {
        where: { firstSolvedAt: { not: null } },
        orderBy: [{ firstSolvedAt: 'desc' }, { problemId: 'asc' }],
        select: { firstSolvedAt: true, problem: { select: { title: true, topic: true, difficulty: true } } },
      },
    },
  });

  const topics = new Map<string, number>();
  const difficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const days = new Set<string>();
  let xp = 0;
  for (const { firstSolvedAt, problem } of user.practiceProgress) {
    days.add(localDay(firstSolvedAt!));
    topics.set(problem.topic, (topics.get(problem.topic) ?? 0) + 1);
    difficulty[problem.difficulty]++;
    xp += points[problem.difficulty];
  }

  return {
    name: user.name,
    handle: user.practiceProfile?.handle ?? null,
    generatedAt: new Date().toISOString(),
    solved: user.practiceProgress.length,
    xp,
    level: levelFor(xp),
    streak: streak(days),
    difficulty,
    strongestTopics: [...topics].map(([topic, solved]) => ({ topic, solved }))
      .sort((a, b) => b.solved - a.solved || a.topic.localeCompare(b.topic)).slice(0, 8),
    recentSolves: user.practiceProgress.slice(0, 10).map(({ firstSolvedAt, problem }) => ({
      title: problem.title, difficulty: problem.difficulty, solvedAt: firstSolvedAt!.toISOString(),
    })),
  };
}
