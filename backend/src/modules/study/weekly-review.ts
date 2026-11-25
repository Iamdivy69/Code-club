import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { coachingConnection, parseCompletionJson, structuredCompletion } from '../ai/structured-completion.js';
import type { WeeklyReviewPreference } from '../practice/contracts.js';
import type { PracticeOptions } from '../practice/routes.js';
import { publishedPractice } from '../practice/visibility.js';
import { currentStreak, dayMs, localDay, points } from './progress-metrics.js';

const eligibleStudent = {
  role: 'STUDENT', approvalStatus: 'APPROVED', isActive: true, deletedAt: null,
  emailVerified: true, practiceAccountRestriction: null,
} satisfies Prisma.UserWhereInput;

const reviewText = z.string().trim().min(1).max(420);
const reviewShape = z.strictObject({ headline: reviewText, review: reviewText, recommendation: reviewText });
const request = z.strictObject({ enabled: z.boolean() });

type Review = z.infer<typeof reviewShape>;
type Message = { to: string; subject: string; text: string; messageId: string };
type Delivery = { review: (summary: Summary) => Promise<Review>; send: (message: Message) => Promise<void>; site: URL };

function completedWeek(now: Date) {
  const day = new Date(localDay(now));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  const monday = +day - daysSinceMonday * dayMs;
  const end = new Date(monday - 330 * 60_000);
  return { period: new Date(monday - 7 * dayMs), start: new Date(+end - 7 * dayMs), end };
}

async function summaryFor(db: PrismaClient, userId: string, start: Date, end: Date) {
  const submissionCounts = db.practiceSubmission.groupBy({
    by: ['problemId', 'verdict'], orderBy: [{ problemId: 'asc' }, { verdict: 'asc' }],
    where: { userId, createdAt: { gte: start, lt: end }, problem: publishedPractice,
      competitionScore: null, assessmentScore: null },
    _count: { _all: true },
  });
  const [attempts, solves] = await db.$transaction([
    submissionCounts,
    db.practiceProgress.findMany({
      where: { userId, firstSolvedAt: { lt: end }, problem: publishedPractice },
      select: { problemId: true, firstSolvedAt: true, problem: { select: { topic: true, difficulty: true } } },
    }),
  ], { isolationLevel: 'RepeatableRead' });
  const accepted = new Set<string>();
  let acceptedSubmissions = 0;
  let submissions = 0;
  for (const group of attempts) {
    submissions += group._count._all;
    if (group.verdict !== 'ACCEPTED') continue;
    accepted.add(group.problemId);
    acceptedSubmissions += group._count._all;
  }
  if (!accepted.size) return null;
  const topics = new Set(solves.filter(({ problemId }) => accepted.has(problemId)).map(({ problem }) => problem.topic.slice(0, 100)));
  const solveDays = new Set(solves.flatMap(({ firstSolvedAt }) => firstSolvedAt ? [localDay(firstSolvedAt)] : []));
  return {
    solved: accepted.size, attempted: new Set(attempts.map(({ problemId }) => problemId)).size,
    submissions, acceptedSubmissions, acceptancePercent: Math.round(100 * acceptedSubmissions / submissions),
    topics: [...topics].sort().slice(0, 30), totalSolved: solves.length,
    xp: solves.reduce((total, { problem }) => total + points[problem.difficulty], 0),
    streak: currentStreak(solveDays, localDay(new Date(+end - 1))),
  };
}

type Summary = NonNullable<Awaited<ReturnType<typeof summaryFor>>>;

export function weeklyReviewGenerator() {
  const connection = coachingConnection();
  if (!connection) return null;
  return async (summary: Summary) => {
    const response = await structuredCompletion(connection, {
      instructions: 'Write a constructive weekly coding-practice review grounded in the supplied aggregate numbers. Return JSON with exactly three plain text fields: headline (one specific sentence), review (two or three sentences), and recommendation (one specific next exercise type). Do not invent activity.',
      data: JSON.stringify(summary), tokens: 380,
    });
    return reviewShape.parse(parseCompletionJson(response));
  };
}

function messageTo(user: { email: string; name: string }, summary: Summary, review: Review, start: Date, end: Date, site: URL, token: string): Message {
  const lastDay = localDay(new Date(+end - 1));
  return {
    to: user.email,
    subject: 'Your weekly Practice review · ' + lastDay,
    messageId: '<practice-review-' + token + '@' + site.hostname + '>',
    text: [
      'Hi ' + user.name + ',', review.headline,
      localDay(start) + ' to ' + lastDay + ' (India Standard Time)',
      summary.solved + ' solved · ' + summary.attempted + ' attempted · ' + summary.acceptancePercent + '% acceptance',
      summary.totalSolved + ' solved overall · ' + summary.xp + ' XP · ' + summary.streak + ' day streak',
      ...(summary.topics.length ? ['Topics: ' + summary.topics.join(', ')] : []),
      review.review, 'Next step: ' + review.recommendation,
      'Open Practice: ' + new URL('/practice/dashboard?tab=analytics', site).href,
      'Manage weekly emails: ' + new URL('/practice/dashboard?tab=profile', site).href,
    ].join('\n\n'),
  };
}

export async function sendWeeklyReviews(db: PrismaClient, delivery: Delivery | null, now = new Date()) {
  const { period, start, end } = completedWeek(now);
  const counts = { eligible: 0, sent: 0, errors: 0, unconfirmed: 0 };
  const available = {
    enabled: true,
    OR: [
      { period: null }, { period: { lt: period } },
      { period, dispatchAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    ],
    user: { ...eligibleStudent, practiceSubmissions: { some: {
      verdict: 'ACCEPTED', createdAt: { gte: start, lt: end }, problem: publishedPractice,
      competitionScore: null, assessmentScore: null,
    } } },
  } satisfies Prisma.PracticeWeeklyReviewWhereInput;
  if (!delivery) return { ...counts, eligible: await db.practiceWeeklyReview.count({ where: available }) };

  let cursor: string | undefined;
  for (;;) {
    const batch: { userId: string }[] = await db.practiceWeeklyReview.findMany({
      where: { ...available, ...(cursor && { userId: { gt: cursor } }) },
      orderBy: { userId: 'asc' }, take: 100, select: { userId: true },
    });
    if (!batch.length) return counts;
    cursor = batch.at(-1)!.userId;
    for (const { userId } of batch) {
      const token = randomUUID();
      const claim = await db.practiceWeeklyReview.updateMany({
        where: { ...available, userId },
        data: { period, leaseToken: token, leaseUntil: new Date(Date.now() + 120_000), dispatchAt: null },
      });
      if (!claim.count) continue;
      counts.eligible++;
      const owner = { userId, period, leaseToken: token };
      const release = { leaseToken: null, leaseUntil: null };
      try {
        const summary = await summaryFor(db, userId, start, end);
        if (!summary) continue;
        const review = await delivery.review(summary);
        const recipient = await db.$transaction(async (tx) => {
          const reserved = await tx.practiceWeeklyReview.updateMany({
            where: { ...owner, enabled: true, user: eligibleStudent, dispatchAt: null, leaseUntil: { gt: new Date() } },
            data: { dispatchAt: new Date() },
          });
          if (!reserved.count) return null;
          return tx.user.findFirst({ where: { id: userId, ...eligibleStudent }, select: { email: true, name: true } });
        });
        if (!recipient) continue;
        try {
          await delivery.send(messageTo(recipient, summary, review, start, end, delivery.site, token));
          await db.practiceWeeklyReview.updateMany({ where: owner, data: { lastSentAt: new Date() } });
          counts.sent++;
        } catch {
          // SMTP acceptance can be ambiguous after a dropped connection.
          counts.unconfirmed++;
        }
      } catch {
        counts.errors++;
      } finally {
        await db.practiceWeeklyReview.updateMany({ where: owner, data: release });
      }
    }
  }
}

export const weeklyReviewRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  async function preference(userId: string): Promise<WeeklyReviewPreference> {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, emailVerified: true, practiceWeeklyReview: { select: { enabled: true, lastSentAt: true } } },
    });
    return { eligible: user.role === 'STUDENT', emailVerified: user.emailVerified,
      deliveryEnabled: process.env.PRACTICE_WEEKLY_REVIEW_ENABLED === 'true' && process.env.EMAIL_ENABLED !== 'false',
      enabled: user.practiceWeeklyReview?.enabled ?? false, lastSentAt: user.practiceWeeklyReview?.lastSentAt?.toISOString() ?? null };
  }

  app.get('/weekly-review', async (incoming, reply) => {
    const { id } = await authenticate(incoming);
    reply.header('Cache-Control', 'private, no-store');
    return preference(id);
  });
  app.put('/weekly-review', async (incoming, reply) => {
    const { id } = await authenticate(incoming);
    reply.header('Cache-Control', 'private, no-store');
    const input = request.parse(incoming.body);
    if (!(await preference(id)).eligible) throw new AppError(403, 'WEEKLY_REVIEW_ACCOUNT', 'Weekly reviews are available to student accounts.');
    await db.practiceWeeklyReview.upsert({ where: { userId: id }, create: { userId: id, ...input }, update: input });
    return preference(id);
  });
};
