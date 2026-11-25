import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type { LearnerAnalytics } from '../practice/contracts.js';
import { verdictLabel } from '../practice/evaluation.js';
import { languageKey, languages } from '../practice/languages.js';
import type { PracticeOptions } from '../practice/routes.js';
import { publishedPractice } from '../practice/visibility.js';
import { dayMs, levelProgress, localDay, points, streak } from './progress-metrics.js';

function languageLabel(value: string) {
  const code = languageKey.safeParse(value);
  return code.success ? languages[code.data].label : value;
}

function newWeeks(today: string) {
  const end = Date.parse(today);
  const day = (value: number) => new Date(value).toISOString().slice(0, 10);
  return Array.from({ length: 8 }, (_, index) => {
    const from = end + (index * 7 - 55) * dayMs;
    return { start: day(from), end: day(from + 6 * dayMs), solved: 0 };
  });
}

function rank(level: number) {
  if (level < 5) return 'Beginner';
  if (level < 15) return 'Learner';
  if (level < 30) return 'Intermediate';
  if (level < 60) return 'Advanced';
  return 'Expert';
}

export async function learnerAnalytics(db: PrismaClient, userId: string, now: Date): Promise<LearnerAnalytics> {
  const submitted = { userId, createdAt: { lte: now } };
  const firstSolvedAt = { not: null, lte: now };
  const submissionCounts = db.practiceSubmission.groupBy({
    by: ['language', 'verdict'], where: submitted, orderBy: [{ language: 'asc' }, { verdict: 'asc' }],
    _count: { _all: true, runtimeMs: true }, _sum: { runtimeMs: true },
  });
  const catalogueCounts = db.problem.groupBy({
    by: ['topic'], orderBy: { topic: 'asc' }, where: publishedPractice, _count: { _all: true },
  });
  const coverageCounts = db.problem.groupBy({
    by: ['topic'], orderBy: { topic: 'asc' },
    where: { ...publishedPractice, practiceProgress: { some: { userId, firstSolvedAt } } }, _count: { _all: true },
  });
  const [progress, counts, recent, catalogue, covered] = await db.$transaction([
    db.practiceProgress.findMany({
      where: { userId, firstSolvedAt },
      select: { firstSolvedAt: true, problem: { select: { difficulty: true, topic: true } } },
    }),
    submissionCounts,
    db.practiceSubmission.findMany({
      where: submitted, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 15,
      select: {
        id: true, createdAt: true, language: true, verdict: true,
        problem: { select: { title: true, slug: true, isPublished: true, practiceContract: {
          select: { enabled: true, contestOnly: true, catalogue: { select: { mappedLegacy: true } } },
        } } },
      },
    }),
    catalogueCounts,
    coverageCounts,
  ], { isolationLevel: 'RepeatableRead' });

  const today = localDay(now);
  const weeks = newWeeks(today);
  const first = Date.parse(weeks[0]!.start);
  const days = new Set<string>();
  const solvedByTopic = new Map<string, number>();
  let xp = 0;
  for (const { firstSolvedAt, problem } of progress) {
    const date = localDay(firstSolvedAt!);
    days.add(date);
    const week = weeks[Math.floor((Date.parse(date) - first) / (7 * dayMs))];
    if (week) week.solved++;
    xp += points[problem.difficulty];
    solvedByTopic.set(problem.topic, (solvedByTopic.get(problem.topic) ?? 0) + 1);
  }
  const availableByTopic = new Map(catalogue.map(({ topic, _count }) => [topic, _count._all]));
  const coveredByTopic = new Map(covered.map(({ topic, _count }) => [topic, _count._all]));
  const topics = [...new Set([...solvedByTopic.keys(), ...availableByTopic.keys()])].map((topic) => ({
    topic, solved: solvedByTopic.get(topic) ?? 0, covered: coveredByTopic.get(topic) ?? 0, available: availableByTopic.get(topic) ?? 0,
  })).sort((left, right) => right.solved - left.solved || left.topic.localeCompare(right.topic));

  let submissions = 0;
  let accepted = 0;
  let runtimeCount = 0;
  let runtimeSum = 0;
  const byLanguage = new Map<string, number>();
  for (const row of counts) {
    const count = row._count._all;
    submissions += count;
    byLanguage.set(row.language, (byLanguage.get(row.language) ?? 0) + count);
    if (row.verdict === 'ACCEPTED') {
      accepted += count;
      runtimeCount += row._count.runtimeMs;
      runtimeSum += row._sum.runtimeMs ?? 0;
    }
  }
  const level = levelProgress(xp);
  return {
    progress: { ...level, xp, rank: rank(level.level), solved: progress.length, streak: streak(days, today) },
    submissions: { total: submissions, accepted, rate: submissions ? Math.round(1000 * accepted / submissions) / 10 : null,
      averageRuntimeMs: runtimeCount ? Math.round(100 * runtimeSum / runtimeCount) / 100 : null },
    topics, weeks,
    languages: [...byLanguage].map(([key, submissions]) => ({ key, label: languageLabel(key), submissions }))
      .sort((left, right) => right.submissions - left.submissions || left.label.localeCompare(right.label)),
    recent: recent.map(({ id, createdAt, language, verdict, problem }) => {
      const contract = problem.practiceContract;
      const available = contract?.enabled && !contract.contestOnly && (problem.isPublished || contract.catalogue?.mappedLegacy);
      return { id, createdAt: createdAt.toISOString(), language: languageLabel(language), verdict: verdictLabel[verdict],
        title: problem.title, slug: available ? problem.slug : null };
    }),
  };
}

export const learnerAnalyticsRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/analytics', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return learnerAnalytics(db, id, new Date());
  });
};
