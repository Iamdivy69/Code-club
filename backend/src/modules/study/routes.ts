import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { recruiterRoles } from '../practice/contracts.js';
import { getProblem, listProblems } from '../practice/repository.js';
import { publishedPractice, executablePractice } from '../practice/visibility.js';
import { leaderboardRoutes, rankedPage } from './leaderboard.js';
import { coachingRoutes } from './coaching.js';
import { learnerAnalyticsRoutes } from './learner-analytics.js';
import { weeklyReviewRoutes } from './weekly-review.js';
import { certificateRoutes, certificateTitle } from './certificates.js';
import { dayKey, dayMs, localDay, points, streak } from './progress-metrics.js';
import { dailyQuiz, completeQuiz } from './quiz.js';
import { editionRoutes } from './editions.js';

import { profileProofRoutes } from './profile-proof.js';
import { downloadActivityReport } from '../billing/policy.js';
import { practiceProfileReport } from './profile-report.js';
import { externalStatsFields, externalStatsRoutes, externalStatsSnapshot } from './external-stats.js';

type Options = Omit<PracticeOptions, 'execute'> & { proofSecret?: string; billingEnabled?: boolean };
const handle = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{2,31}$/);
const slug = z.string().max(200).min(1);
const allowed = publishedPractice;
const profileSettings = {
  handle: true, bio: true, isPublic: true, hiringOpen: true, sharePlacement: true,
  availableForWork: true, preferredRole: true, expectedGraduation: true,
} as const;

export const studyRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, proofSecret, billingEnabled = false }) => {
  await app.register(editionRoutes, { db, authenticate });
  await app.register(leaderboardRoutes, { prefix: '/leaderboard', db, authenticate });
  await app.register(certificateRoutes, { db, authenticate });
  await app.register(profileProofRoutes, { db, authenticate, proofSecret });
  await app.register(learnerAnalyticsRoutes, { db, authenticate });
  await app.register(coachingRoutes, { db, authenticate });
  await app.register(weeklyReviewRoutes, { db, authenticate });
  await app.register(externalStatsRoutes, { prefix: '/external-stats', db, authenticate, proofSecret });
  app.get('/overview', async (request) => {
    const { id } = await authenticate(request);
    const [progress, candidates, profile, quizzes] = await Promise.all([
      db.practiceProgress.findMany({ where: { userId: id }, select: {
        problemId: true, attemptCount: true, acceptedCount: true, firstSolvedAt: true,
        problem: { select: { difficulty: true, topic: true } },
      } }),
      listProblems(db, id),
      db.practiceProfile.findUnique({ where: { userId: id }, select: profileSettings }),
      db.practiceQuizAttempt.count({ where: { userId: id } }),
    ]);
    const solved = progress.filter(({ firstSolvedAt }) => firstSolvedAt !== null);
    const completed = new Set(solved.map(({ problemId }) => problemId));
    const days = new Set(solved.flatMap((item) => item.firstSolvedAt ? [localDay(item.firstSolvedAt)] : []));
    const playable = candidates.filter(problem => !problem.practiceContract?.catalogue);
    const topicCounts = new Map<string, { topic: string; total: number; solved: number; next: string | null }>();
    for (const problem of playable) {
      const row = topicCounts.get(problem.topic) ?? { topic: problem.topic, total: 0, solved: 0, next: null };
      row.total++;
      if (completed.has(problem.id)) row.solved++;
      else row.next ??= problem.slug;
      topicCounts.set(problem.topic, row);
    }
    return {
      solved: solved.length, attempted: progress.length, attempts: progress.reduce((count, row) => count + row.attemptCount, 0),
      xp: solved.reduce((count, row) => count + points[row.problem.difficulty], 0),
      streak: streak(days), profile, quizzes, byTopic: [...topicCounts.values()],
      activity: Array.from({ length: 28 }, (_, index) => {
        const day = dayKey(index - 27);
        return { day, solved: solved.filter((row) => row.firstSolvedAt && localDay(row.firstSolvedAt) === day).length };
      }),
      next: playable.find((problem) => !completed.has(problem.id))?.slug ?? null,
    };
  });

  app.put('/problems/:slug', async (request) => {
    const { id } = await authenticate(request);
    const input = z.object({ note: z.string().max(10_000).optional(), saved: z.boolean().optional() }).parse(request.body);
    const item = await getProblem(db, z.object({ slug }).parse(request.params).slug, id, false);
    const study = await db.practiceStudyItem.upsert({
      where: { userId_problemId: { userId: id, problemId: item.id } },
      create: { userId: id, problemId: item.id, ...input },
      update: input,
      select: { saved: true, note: true },
    });
    return { study };
  });

  async function playlistProblems(slugs: string[]) {
    const rows = await db.problem.findMany({ where: { ...allowed, slug: { in: slugs } }, select: { id: true, slug: true } });
    const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
    if (rows.length !== slugs.length) throw new AppError(400, 'PLAYLIST_PROBLEM', 'Choose unique, available problems.');
    return slugs.map((value) => bySlug.get(value)!);
  }
  const playlistInput = z.object({ name: z.string().trim().min(1).max(100), slugs: z.array(slug).max(30) });
  const uuid = z.object({ id: z.uuid() });
  app.get('/playlists', async (request) => {
    const { id } = await authenticate(request);
    const lists = await db.practicePlaylist.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    const ids = [...new Set(lists.flatMap((list) => list.problemIds))];
    const rows = await db.problem.findMany({ where: { ...allowed, id: { in: ids } }, select: { id: true, slug: true, title: true } });
    const lookup = new Map(rows.map((row) => [row.id, row]));
    return { playlists: lists.map((list) => ({
      id: list.id, name: list.name, problems: list.problemIds.flatMap((value) => lookup.has(value) ? [lookup.get(value)!] : []),
    })) };
  });
  app.post('/playlists', async (request, reply) => {
    const { id } = await authenticate(request);
    const input = playlistInput.parse(request.body);
    const list = await db.practicePlaylist.create({ data: { userId: id, name: input.name, problemIds: await playlistProblems(input.slugs) }, select: { id: true } });
    return reply.code(201).send(list);
  });
  app.put('/playlists/:id', async (request, reply) => {
    const { id } = await authenticate(request);
    const input = playlistInput.parse(request.body);
    const result = await db.practicePlaylist.updateMany({
      where: { userId: id, id: uuid.parse(request.params).id }, data: { name: input.name, problemIds: await playlistProblems(input.slugs) },
    });
    if (!result.count) throw new AppError(404, 'NOT_FOUND', 'Playlist not found.');
    return reply.code(204).send();
  });
  app.delete('/playlists/:id', async (request, reply) => {
    const { id } = await authenticate(request);
    const result = await db.practicePlaylist.deleteMany({ where: { userId: id, id: uuid.parse(request.params).id } });
    if (!result.count) throw new AppError(404, 'NOT_FOUND', 'Playlist not found.');
    return reply.code(204).send();
  });

  app.get('/daily', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const { id } = await authenticate(request);
    const day = dayKey();
    const index = Math.floor(Date.parse(day) / dayMs);
    const [items, assigned, reset] = await Promise.all([
      db.problem.findMany({ where: executablePractice, select: { id: true, title: true, slug: true }, orderBy: { slug: 'asc' } }),
      db.practiceDailyChallenge.findUnique({ where: { day }, select: { problem: { select: { id: true, title: true, slug: true } } } }),
      db.practiceProgressEpoch.findUnique({ where: { userId: id }, select: { resetId: true } }),
    ]);
    const candidate = items[index % items.length];
    const assignment = assigned ?? (candidate ? await db.practiceDailyChallenge.upsert({
      where: { day }, create: { day, problemId: candidate.id }, update: {},
      select: { problem: { select: { id: true, title: true, slug: true } } },
    }) : null);
    const challenge = assignment && items.some((item) => item.id === assignment.problem.id) ? assignment.problem : null;
    const grade = challenge ? await db.practiceSubmission.findFirst({
      where: { userId: id, problemId: challenge.id, verdict: 'ACCEPTED', progressEligible: true, progressEpoch: reset?.resetId ?? null, createdAt: { gte: new Date(day + 'T00:00:00+05:30') } },
      select: { id: true },
    }) : null;
    const quiz = await dailyQuiz(db, id, day).catch((error: unknown) => {
      request.log.warn({ kind: error instanceof Error ? error.name : 'UnknownError' }, 'Daily quiz unavailable');
      return null;
    });
    // A week uses a rotating published problem, same repository and completion rule.
    const weekStart = new Date((index - (new Date(day).getUTCDay() + 6) % 7) * dayMs).toISOString().slice(0, 10);
    const weekIndex = Math.floor(Date.parse(weekStart) / (dayMs * 7));
    const weeklyCandidate = items[(weekIndex + 1) % items.length];
    const weekAssignment = weeklyCandidate ? await db.practiceDailyChallenge.upsert({
      where: { day: 'W' + weekStart.slice(2) }, create: { day: 'W' + weekStart.slice(2), problemId: weeklyCandidate.id }, update: {},
      select: { problem: { select: { id: true, title: true, slug: true } } },
    }) : null;
    const weekly = weekAssignment && items.some((item) => item.id === weekAssignment.problem.id) ? weekAssignment.problem : null;
    const weekGrade = weekly ? await db.practiceSubmission.findFirst({
      where: { userId: id, problemId: weekly.id, verdict: 'ACCEPTED', progressEligible: true, progressEpoch: reset?.resetId ?? null, createdAt: { gte: new Date(weekStart + 'T00:00:00+05:30') } },
      select: { id: true },
    }) : null;
    return { day, challenge: challenge ? { title: challenge.title, slug: challenge.slug, done: Boolean(grade) } : null,
      weekly: weekly ? { title: weekly.title, slug: weekly.slug, done: Boolean(weekGrade) } : null,
      quiz };
  });
  app.post('/daily/quiz', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    const input = z.strictObject({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), choice: z.number().int().min(0).max(3).nullable() }).parse(request.body);
    return completeQuiz(db, id, input.day, input.choice);
  });
  app.get('/profile/report', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    if (billingEnabled) return reply.header('Allow', 'POST').code(405).send({ message: 'Use Download activity report in your profile.' });
    return practiceProfileReport(db, id);
  });
  app.post('/profile/report', async (request, reply) => {
    const { id } = await authenticate(request);
    const { requestKey } = z.object({ requestKey: z.uuid() }).parse(request.body);
    reply.header('Cache-Control', 'private, no-store');
    return downloadActivityReport(db, id, billingEnabled, requestKey);
  });

  app.get('/profile', async (request) => {
    const { id } = await authenticate(request);
    return { profile: await db.practiceProfile.findUnique({ where: { userId: id }, select: { handle: true } }) };
  });
  app.put('/profile', async (request) => {
    const { id } = await authenticate(request);
    const input = z.object({
      handle, bio: z.string().trim().max(500), isPublic: z.boolean(), hiringOpen: z.boolean().default(false), sharePlacement: z.boolean().optional(),
      availableForWork: z.boolean().optional(), preferredRole: z.enum(recruiterRoles).nullable().optional(),
      expectedGraduation: z.number().int().min(1900).max(2200).nullable().optional(),
    }).parse(request.body);
    const values = { ...input, hiringOpen: input.isPublic && input.hiringOpen };
    try {
      return await db.$transaction(async (tx) => {
        const profile = await tx.practiceProfile.upsert({
          where: { userId: id }, create: { userId: id, ...values }, update: values, select: profileSettings,
        });
        await tx.practiceProfileProof.deleteMany({
          where: { userId: id, ...(profile.isPublic ? { handle: { not: profile.handle } } : {}) },
        });
        return profile;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'HANDLE_TAKEN', 'That profile handle is in use.');
      throw error;
    }
  });
  app.get('/public-profile/:handle', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const found = await db.practiceProfile.findFirst({
      where: { handle: z.object({ handle }).parse(request.params).handle, isPublic: true, user: { deletedAt: null, isActive: true } },
      select: { handle: true, bio: true, proof: { select: { id: true } }, user: { select: {
        approvalStatus: true, practiceAccountRestriction: { select: { userId: true } },
        practiceExternalStats: { select: externalStatsFields },
        practiceProgress: { where: { status: 'SOLVED' }, select: {
        problem: { select: { difficulty: true } },
      } }, practiceCertificates: { select: { id: true, track: true, createdAt: true } } } } },
    });
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
    const leetcode = found.user.approvalStatus === 'APPROVED' && !found.user.practiceAccountRestriction
      ? externalStatsSnapshot(found.user.practiceExternalStats) : null;
    return { handle: found.handle, bio: found.bio, proofId: found.proof?.id ?? null, certificates: found.user.practiceCertificates.map((cert) => ({ ...cert, title: certificateTitle(cert.track) })), solved: found.user.practiceProgress.length,
      xp: found.user.practiceProgress.reduce((total, row) => total + points[row.problem.difficulty], 0), leetcode };
  });
  app.get('/leaderboard', async (request, reply) => {
    await authenticate(request);
    reply.header('Cache-Control', 'no-store');
    const { rows } = await rankedPage(db, 1, 100, 100);
    return { rows: rows.map(({ handle, solved, xp }) => ({ handle, solved, xp })) };
  });

};
