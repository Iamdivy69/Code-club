import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { studentAccess } from '../placement/cohort-roster.js';
import { dayMs } from '../study/progress-metrics.js';
import { requirePracticeAdmin } from './access.js';

const intervals = ['daily', 'weekly', 'monthly'] as const;
type Bucket = typeof intervals[number];
type ProblemRank = { slug: string; title: string; difficulty: string; acceptedCount: number };

function utcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function analyticsPeriods(bucket: Bucket, now: Date) {
  const duration = bucket === 'weekly' ? 7 : 1;
  const count = bucket === 'daily' ? 30 : 12;
  const edge = +utcDay(now) + dayMs;
  const month = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return Array.from({ length: count }, (_, index) => {
    const from = bucket === 'monthly' ? month(index - count + 1) : new Date(edge - (count - index) * duration * dayMs);
    const to = bucket === 'monthly' ? month(index - count + 2) : new Date(+from + duration * dayMs);
    const label = from.toISOString().slice(0, bucket === 'monthly' ? 7 : 10);
    return { start: from.toISOString(), end: to.toISOString(), label: bucket === 'weekly' ? 'Week of ' + label : label };
  });
}

async function trend(db: PrismaClient, bucket: Bucket, now: Date) {
  const periods = analyticsPeriods(bucket, now);
  const first = periods[0]!.start;
  const cutoff = now.toISOString();
  const by = bucket === 'monthly'
    ? Prisma.sql`date_trunc('month', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
    : Prisma.sql`date_bin(${bucket === 'weekly' ? 7 : 1}::int * interval '1 day', created_at, ${first}::timestamptz)`;
  const key = Prisma.sql`to_char((${by}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const [accounts, practice] = await db.$transaction([
    db.$queryRaw<Array<{ day: string; registrations: number }>>`
      SELECT ${key} AS day, COUNT(*)::int AS registrations
      FROM users WHERE created_at >= ${first}::timestamptz AND created_at < ${cutoff}::timestamptz
      GROUP BY 1`,
    db.$queryRaw<Array<{ day: string; submissions: number; accepted: number }>>`
      SELECT ${key} AS day, COUNT(*)::int AS submissions,
        COUNT(*) FILTER (WHERE verdict = 'ACCEPTED')::int AS accepted
      FROM practice_submissions WHERE created_at >= ${first}::timestamptz AND created_at < ${cutoff}::timestamptz
      GROUP BY 1`,
  ], { isolationLevel: 'RepeatableRead' });
  const byAccount = new Map(accounts.map((row) => [row.day, row.registrations]));
  const byPractice = new Map(practice.map((row) => [row.day, row]));
  return { bucket, periods: periods.map((period) => {
    const day = period.start.slice(0, 10);
    return { ...period, registrations: byAccount.get(day) ?? 0,
      submissions: byPractice.get(day)?.submissions ?? 0, accepted: byPractice.get(day)?.accepted ?? 0,
    };
  }) };
}

async function overview(db: PrismaClient, now: Date) {
  // Bind ISO values so a database session's timezone cannot reinterpret UTC boundaries.
  const cutoff = now.toISOString();
  const today = utcDay(now).toISOString();
  const seven = new Date(+now - 7 * dayMs).toISOString();
  const fourteen = new Date(+now - 14 * dayMs).toISOString();
  const thirty = new Date(+now - 30 * dayMs).toISOString();
  const [students, activeStudents, recruiters, activeRecruiters, members, activeMembers, registrationRows,
    pendingRecruiters, pendingOfficers, activity, languages, problemRows] = await db.$transaction([
    db.user.count({ where: { role: 'STUDENT', deletedAt: null } }),
    db.user.count({ where: { ...studentAccess, role: 'STUDENT' } }),
    db.practiceRecruiter.count({ where: { user: { deletedAt: null } } }),
    db.practiceRecruiter.count({ where: { status: 'APPROVED', user: studentAccess } }),
    db.practicePlacementMember.count({ where: { teacher: { user: { deletedAt: null } } } }),
    db.practicePlacementMember.count({ where: { university: { isActive: true },
      teacher: { user: { ...studentAccess, role: 'TEACHER', emailVerified: true } },
    } }),
    db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM users WHERE created_at >= ${today}::timestamptz AND created_at < ${cutoff}::timestamptz`,
    db.practiceRecruiter.count({ where: { status: 'PENDING', user: studentAccess } }),
    db.practiceOfficerApplication.count({ where: { status: 'PENDING', applicant: studentAccess } }),
    db.$queryRaw<Array<{ active7Days: number; active30Days: number; previous7Days: number; retained: number }>>`
      WITH engagement AS (
        SELECT user_id, bool_or(created_at >= ${seven}::timestamptz) AS current_week,
          bool_or(created_at >= ${fourteen}::timestamptz AND created_at < ${seven}::timestamptz) AS previous_week
        FROM practice_submissions WHERE created_at >= ${thirty}::timestamptz AND created_at < ${cutoff}::timestamptz
        GROUP BY user_id
      )
      SELECT COUNT(*)::int AS "active30Days", COUNT(*) FILTER (WHERE current_week)::int AS "active7Days",
        COUNT(*) FILTER (WHERE previous_week)::int AS "previous7Days",
        COUNT(*) FILTER (WHERE previous_week AND current_week)::int AS retained FROM engagement`,
    db.$queryRaw<Array<{ language: string; submissions: number; accepted: number }>>`
      SELECT language, COUNT(*)::int AS submissions, COUNT(*) FILTER (WHERE verdict = 'ACCEPTED')::int AS accepted
      FROM practice_submissions WHERE created_at < ${cutoff}::timestamptz
      GROUP BY language ORDER BY submissions DESC, language ASC`,
    db.$queryRaw<Array<{ published: number; neverSolved: number; mostSolved: ProblemRank[]; leastSolved: ProblemRank[] }>>`
      WITH counts AS (
        SELECT p.slug, p.title, p.difficulty::text AS difficulty, COUNT(s.id)::int AS "acceptedCount"
        FROM problems p JOIN practice_problem_contracts c ON c.problem_id = p.id
        LEFT JOIN practice_catalogue_entries ce ON ce.problem_id = p.id
        LEFT JOIN practice_submissions s ON s.problem_id = p.id AND s.verdict = 'ACCEPTED' AND s.created_at < ${cutoff}::timestamptz
        WHERE c.enabled AND NOT c.contest_only AND (p.is_published OR ce.mapped_legacy)
        GROUP BY p.id
      )
      SELECT COUNT(*)::int AS published, COUNT(*) FILTER (WHERE "acceptedCount" = 0)::int AS "neverSolved",
        (SELECT COALESCE(json_agg(entry ORDER BY entry."acceptedCount" DESC, entry.slug), '[]'::json)
          FROM (SELECT * FROM counts WHERE "acceptedCount" > 0 ORDER BY "acceptedCount" DESC, slug LIMIT 10) entry) AS "mostSolved",
        (SELECT COALESCE(json_agg(entry ORDER BY entry."acceptedCount", entry.slug), '[]'::json)
          FROM (SELECT * FROM counts WHERE "acceptedCount" > 0 ORDER BY "acceptedCount", slug LIMIT 10) entry) AS "leastSolved"
      FROM counts`,
  ], { isolationLevel: 'RepeatableRead' });
  const engagement = activity[0]!;
  const problems = problemRows[0]!;
  const submissions = languages.reduce((sum, row) => sum + row.submissions, 0);
  const accepted = languages.reduce((sum, row) => sum + row.accepted, 0);
  return {
    generatedAt: now.toISOString(),
    accounts: { students, activeStudents, recruiters, activeRecruiters, members, activeMembers, registrationsToday: registrationRows[0]!.count },
    approvals: { recruiters: pendingRecruiters, officers: pendingOfficers },
    practice: { published: problems.published, submissions, accepted, acceptanceRate: submissions ? Math.round(accepted / submissions * 100) : null },
    engagement: { ...engagement, retentionPercent: engagement.previous7Days ? Math.round(engagement.retained / engagement.previous7Days * 100) : null },
    problems, languages,
  };
}

export const practiceAnalyticsRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/analytics', async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    reply.header('Cache-Control', 'private, no-store');
    return overview(db, new Date());
  });

  app.get('/analytics/trend', async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    const { bucket } = z.object({ bucket: z.enum(intervals).default('daily') }).parse(request.query);
    reply.header('Cache-Control', 'private, no-store');
    return trend(db, bucket, new Date());
  });
};
