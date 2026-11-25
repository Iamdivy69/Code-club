import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { recruiterRoles, type CandidateDirectoryPage, type CandidateDirectoryRow } from '../practice/contracts.js';
import { languageKey } from '../practice/languages.js';
import { currentStreak, levelFor, points } from '../study/progress-metrics.js';
import { externalStatsSnapshot } from '../study/external-stats.js';

export const directoryQuery = z.object({
  q: z.string().trim().max(64).default(''),
  university: z.uuid().optional(),
  topic: z.string().trim().min(1).max(100).optional(),
  language: languageKey.optional(),
  minSolved: z.coerce.number().int().min(0).max(1_000_000).default(0),
  maxSolved: z.coerce.number().int().min(0).max(1_000_000).default(1_000_000),
  preferredRole: z.enum(recruiterRoles).optional(),
  expectedGraduation: z.coerce.number().int().min(1900).max(2200).optional(),
  availableForWork: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.base64url().max(128).optional(),
}).refine((value) => value.minSolved <= value.maxSolved, {
  path: ['minSolved'], message: 'Minimum solves must be less than or equal to maximum solves.',
});

const cursorSchema = z.object({
  xp: z.number().int().nonnegative().max(2_147_483_647), handle: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/),
});

function pageCursor(value?: string) {
  if (!value) return undefined;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { throw new AppError(400, 'DIRECTORY_CURSOR', 'Invalid candidate page cursor.'); }
}

function discoverable(actor: string, filters = Prisma.empty) {
  return Prisma.sql`
    SELECT account.id, profile.handle, profile.bio, profile.available_for_work, profile.preferred_role,
      profile.expected_graduation, university.name AS college, university.id AS college_id
    FROM practice_profiles profile
    JOIN users account ON account.id = profile.user_id
    LEFT JOIN students student ON student.user_id = account.id AND account.email_verified
    LEFT JOIN universities university ON university.id = student.university_id AND university.is_active
    WHERE profile.is_public AND profile.hiring_open AND account.id <> ${actor}::uuid
      AND account.role = 'STUDENT' AND account.is_active AND account.deleted_at IS NULL
      AND account.approval_status = 'APPROVED' ${filters}
  `;
}

const solvedQuery = Prisma.sql`
  SELECT progress.user_id, progress.problem_id, progress.first_solved_at, problem.topic, problem.difficulty
  FROM eligible account
  JOIN practice_progress progress ON progress.user_id = account.id AND progress.status = 'SOLVED'
  JOIN practice_problem_contracts contract ON contract.problem_id = progress.problem_id AND NOT contract.contest_only
  JOIN problems problem ON problem.id = contract.problem_id
`;

export async function candidateDirectory(db: PrismaClient, actor: string, query: z.output<typeof directoryQuery>): Promise<CandidateDirectoryPage> {
  const cursor = pageCursor(query.cursor);
  const filters = Prisma.sql`
    ${query.q ? Prisma.sql`AND position(lower(${query.q}) in profile.handle) > 0` : Prisma.empty}
    ${query.university ? Prisma.sql`AND university.id = ${query.university}::uuid` : Prisma.empty}
    ${query.preferredRole ? Prisma.sql`AND profile.preferred_role = ${query.preferredRole}` : Prisma.empty}
    ${query.expectedGraduation ? Prisma.sql`AND profile.expected_graduation = ${query.expectedGraduation}::int` : Prisma.empty}
    ${query.availableForWork ? Prisma.sql`AND profile.available_for_work` : Prisma.empty}
  `;
  const rows = await db.$queryRaw<(Omit<CandidateDirectoryRow, 'level' | 'streak' | 'leetcode'> & {
    days: string[]; externalStats: Parameters<typeof externalStatsSnapshot>[0];
  })[]>`
    WITH eligible AS (${discoverable(actor, filters)}), solves AS (${solvedQuery}),
    counts AS (
      SELECT account.id, count(s.problem_id)::int AS solved,
        count(*) FILTER (WHERE s.difficulty = 'EASY')::int AS easy,
        count(*) FILTER (WHERE s.difficulty = 'MEDIUM')::int AS medium,
        count(*) FILTER (WHERE s.difficulty = 'HARD')::int AS hard
      FROM eligible account LEFT JOIN solves s ON s.user_id = account.id
      GROUP BY account.id HAVING count(s.problem_id) BETWEEN ${query.minSolved}::int AND ${query.maxSolved}::int
        ${query.topic ? Prisma.sql`AND bool_or(lower(s.topic) = lower(${query.topic}))` : Prisma.empty}
    ),
    ranked AS (
      SELECT account.*, counts.solved, easy, medium, hard,
        easy * ${points.EASY}::int + medium * ${points.MEDIUM}::int + hard * ${points.HARD}::int AS xp
      FROM counts JOIN eligible account ON account.id = counts.id
      ${query.language ? Prisma.sql`WHERE EXISTS (
        SELECT 1 FROM solves s JOIN practice_submissions submission ON submission.user_id = s.user_id AND submission.problem_id = s.problem_id
        WHERE s.user_id = account.id AND submission.verdict = 'ACCEPTED' AND submission.language = ${query.language}
      )` : Prisma.empty}
    ),
    result_page AS (
      SELECT * FROM ranked
      ${cursor ? Prisma.sql`WHERE xp < ${cursor.xp}::int OR (xp = ${cursor.xp}::int AND handle > ${cursor.handle})` : Prisma.empty}
      ORDER BY xp DESC, handle ASC LIMIT ${query.limit + 1}
    )
    SELECT result.handle, result.bio, result.college, result.solved, result.easy, result.medium, result.hard, result.xp,
      result.available_for_work AS "availableForWork", result.preferred_role AS "preferredRole",
      result.expected_graduation AS "expectedGraduation",
      CASE WHEN stats.username IS NOT NULL THEN jsonb_build_object(
        'username', stats.username, 'source', stats.source, 'easy', stats.easy, 'medium', stats.medium,
        'hard', stats.hard, 'recordedAt', stats.recorded_at
      ) END AS "externalStats",
      ARRAY(SELECT topic FROM solves s WHERE s.user_id = result.id GROUP BY topic ORDER BY count(*) DESC, topic LIMIT 3) AS "topTopics",
      ARRAY(SELECT DISTINCT to_char(s.first_solved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
        FROM solves s WHERE s.user_id = result.id AND s.first_solved_at IS NOT NULL) AS days
    FROM result_page result
    LEFT JOIN practice_external_stats stats ON stats.user_id = result.id
      AND NOT EXISTS (SELECT 1 FROM practice_account_restrictions restriction WHERE restriction.user_id = result.id)
    ORDER BY result.xp DESC, result.handle ASC
  `;
  const candidates = rows.slice(0, query.limit).map(({ days, externalStats, ...row }) => ({
    ...row, level: levelFor(row.xp), streak: currentStreak(new Set(days)), leetcode: externalStatsSnapshot(externalStats),
  }));
  const last = candidates[candidates.length - 1];
  const next = rows.length > query.limit && last ? Buffer.from(JSON.stringify({ xp: last.xp, handle: last.handle })).toString('base64url') : null;
  return { candidates, next };
}

export async function directoryFacets(db: PrismaClient, actor: string) {
  const [row] = await db.$queryRaw<{ universities: { id: string; name: string }[]; topics: string[] }[]>`
    WITH eligible AS (${discoverable(actor)}), solves AS (${solvedQuery})
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(school) ORDER BY school.name, school.id)
        FROM (SELECT DISTINCT college_id AS id, college AS name FROM eligible WHERE college_id IS NOT NULL) school), '[]') AS universities,
      ARRAY(SELECT DISTINCT topic FROM solves ORDER BY topic) AS topics
  `;
  return row!;
}
