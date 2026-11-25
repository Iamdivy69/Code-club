import type { FastifyPluginAsync } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { LeaderboardPage, LeaderboardRow } from '../practice/contracts.js';
import type { PracticeOptions } from '../practice/routes.js';
import { currentStreak, levelFor, points } from './progress-metrics.js';

const globalCap = 500;
const collegeCap = 100;
const publicRead = { config: { rateLimit: { max: 45, timeWindow: '1 minute' } } };
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20).transform((limit) => Math.min(limit, 50)),
});

type RankedProfile = Omit<LeaderboardRow, 'rank' | 'level' | 'streak'> & { days: string[]; total: number };

function publicAccounts(universityId?: string) {
  const scope = universityId ? Prisma.sql`AND college.id = ${universityId}::uuid` : Prisma.empty;
  return Prisma.sql`
    SELECT account.id, profile.handle, college.name AS college, college.id AS college_id
    FROM practice_profiles profile
    JOIN users account ON account.id = profile.user_id
    LEFT JOIN students student ON student.user_id = account.id AND account.email_verified
    LEFT JOIN universities college ON college.id = student.university_id AND college.is_active
    WHERE profile.is_public AND account.is_active AND account.deleted_at IS NULL
      AND account.approval_status = 'APPROVED' ${scope}
  `;
}

export async function rankedPage(db: Pick<PrismaClient, '$queryRaw'>, page: number, limit: number, cap: number, universityId?: string): Promise<LeaderboardPage> {
  const offset = (page - 1) * limit;
  if (offset >= cap) return { rows: [], total: 0, page, limit, capped: true, hasNext: false };
  const count = Math.min(limit, cap - offset);
  const records = await db.$queryRaw<Array<RankedProfile | { handle: null; total: number }>>`
    WITH eligible AS (${publicAccounts(universityId)}),
    scores AS (
      SELECT person.id, person.handle, person.college,
        COUNT(problem.id)::int AS solved,
        COUNT(*) FILTER (WHERE problem.difficulty = 'EASY')::int AS easy,
        COUNT(*) FILTER (WHERE problem.difficulty = 'MEDIUM')::int AS medium,
        COUNT(*) FILTER (WHERE problem.difficulty = 'HARD')::int AS hard
      FROM eligible person
      LEFT JOIN practice_progress progress ON progress.user_id = person.id AND progress.status = 'SOLVED'
      LEFT JOIN practice_problem_contracts contract ON contract.problem_id = progress.problem_id AND NOT contract.contest_only
      LEFT JOIN problems problem ON problem.id = contract.problem_id
      GROUP BY person.id, person.handle, person.college
    ),
    page_rows AS (
      SELECT scores.*, easy * ${points.EASY}::int + medium * ${points.MEDIUM}::int + hard * ${points.HARD}::int AS xp
      FROM scores
      ORDER BY xp DESC, solved DESC, id
      LIMIT ${count} OFFSET ${offset}
    )
    SELECT board.handle, board.college, board.solved, board.easy, board.medium, board.hard, board.xp,
      times.days, totals.total
    FROM (SELECT COUNT(*)::int AS total FROM eligible) totals
    LEFT JOIN page_rows board ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(ARRAY_AGG(DISTINCT TO_CHAR(progress.first_solved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')), '{}') AS days
      FROM practice_progress progress
      JOIN practice_problem_contracts contract ON contract.problem_id = progress.problem_id AND NOT contract.contest_only
      WHERE progress.user_id = board.id AND progress.status = 'SOLVED' AND progress.first_solved_at IS NOT NULL
    ) times ON board.id IS NOT NULL
    ORDER BY board.xp DESC, board.solved DESC, board.id
  `;
  const total = records[0]?.total ?? 0;
  const rows = records.flatMap((record, index) => {
    if (record.handle === null) return [];
    const { total: _total, days, ...row } = record;
    return [{ ...row, rank: offset + index + 1, level: levelFor(row.xp), streak: currentStreak(new Set(days)) }];
  });
  return { rows, total, page, limit, capped: total > cap, hasNext: offset + rows.length < Math.min(total, cap) };
}

type Options = Pick<PracticeOptions, 'db' | 'authenticate'>;

export const leaderboardRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate }) => {
  app.get('/global', publicRead, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { page, limit } = paging.parse(request.query);
    return rankedPage(db, page, limit, globalCap);
  });

  app.get('/college', publicRead, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { id } = await authenticate(request);
    return db.$transaction(async (tx) => {
      const enrollment = await tx.student.findUnique({
        where: { userId: id },
        select: { user: { select: { emailVerified: true } }, university: { select: { id: true, isActive: true, name: true } } },
      });
      if (!enrollment?.user.emailVerified) {
        throw new AppError(403, 'COLLEGE_NOT_VERIFIED', 'Verify your email and use an enrolled student account to see your college rankings.');
      }
      if (!enrollment.university.isActive) {
        throw new AppError(403, 'COLLEGE_UNAVAILABLE', 'Your college rankings are unavailable. Contact your institution administrator.');
      }
      const board = await rankedPage(tx, 1, collegeCap, collegeCap, enrollment.university.id);
      return { ...board, college: enrollment.university.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });

  app.get('/institutions', publicRead, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const institutions = await db.$queryRaw<Array<{ name: string; count: number }>>`
      SELECT eligible.college AS name, COUNT(*)::int AS count
      FROM (${publicAccounts()}) eligible
      WHERE eligible.college_id IS NOT NULL
      GROUP BY eligible.college_id, eligible.college
      HAVING COUNT(*) >= 2
      ORDER BY count DESC, name, eligible.college_id
      LIMIT 50
    `;
    return { institutions };
  });
};
