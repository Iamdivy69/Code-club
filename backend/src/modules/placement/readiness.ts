import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import type { InstitutionReadinessReport } from '../practice/contracts.js';
import { currentStreak, dayKey, dayMs, points } from '../study/progress-metrics.js';
import { placementReportUniversity } from './team.js';

type Counts = { students: number; active: number; easy: number; medium: number; hard: number };
type Cohort = Counts & { id: string; name: string; archived: boolean; topTopics: { topic: string; solves: number }[] };
type Ranked = { name: string; solved: number; xp: number; days: string[] };
type Totals = Counts & { optedOut: number; assigned: number };

function readiness(row: Counts) {
  const totalSolved = row.easy + row.medium + row.hard;
  const ratio = row.students ? 1 / row.students : 0;
  return {
    ...row, totalSolved, averageSolved: Math.round(totalSolved * ratio * 10) / 10,
    activePercent: Math.round(row.active * ratio * 100),
    score: Math.round(Math.min(40, totalSolved * ratio * .4) + Math.min(30, row.hard * ratio * 1.5) + row.active * ratio * 30),
  };
}

export function reportPeriod(from?: string, to = dayKey()) {
  const end = new Date(+new Date(to + 'T00:00:00+05:30') + dayMs);
  const start = from ? new Date(from + 'T00:00:00+05:30') : new Date(+end - 30 * dayMs);
  if (start >= end || +end - +start > 366 * dayMs) {
    throw new AppError(400, 'REPORT_PERIOD', 'Choose a date range of one to 366 days.');
  }
  return { start, end, from: from ?? new Date(+start + dayMs).toISOString().slice(0, 10), to };
}

export async function institutionReadiness(db: PrismaClient, actor: string, input: { universityId?: string; from?: string; to?: string }): Promise<InstitutionReadinessReport> {
  const period = reportPeriod(input.from, input.to);
  const today = dayKey();
  return db.$transaction(async (tx) => {
    const university = await placementReportUniversity(tx, actor, input.universityId);
    const audience = Prisma.sql`
      eligible AS (
        SELECT u.id, u.name, COALESCE(pref.share_placement, false) AS shares
        FROM students s JOIN users u ON u.id = s.user_id
        LEFT JOIN practice_profiles pref ON pref.user_id = u.id
        WHERE s.university_id = ${university.id}::uuid AND u.role = 'STUDENT'
          AND u.is_active AND u.email_verified AND u.approval_status = 'APPROVED' AND u.deleted_at IS NULL
      ),
      visible AS (SELECT id, name FROM eligible WHERE shares),
      cohorts AS (
        SELECT c.id, c.name, a.class_id IS NOT NULL AS archived, a.archived_at
        FROM classes c LEFT JOIN practice_cohort_archives a ON a.class_id = c.id
        WHERE c.university_id = ${university.id}::uuid AND c.is_active AND c.deleted_at IS NULL
      ),
      members AS (
        SELECT cs.class_id, cs.student_id
        FROM class_students cs JOIN cohorts c ON c.id = cs.class_id JOIN visible v ON v.id = cs.student_id
      )`;
    const counts = Prisma.sql`
      count(s.id)::int AS students, count(s.id) FILTER (WHERE s.active)::int AS active,
      coalesce(sum(s.easy), 0)::int AS easy, coalesce(sum(s.medium), 0)::int AS medium, coalesce(sum(s.hard), 0)::int AS hard`;
    const [report] = await tx.$queryRaw<{ totals: Totals; cohorts: Cohort[]; rankings: Ranked[] }[]>`
      WITH ${audience},
      solves AS (
        SELECT q.user_id, problem.difficulty, problem.topic,
          (q.first_solved_at AT TIME ZONE 'Asia/Kolkata')::date AS day
        FROM practice_progress q JOIN visible v ON v.id = q.user_id
        JOIN practice_problem_contracts contract ON contract.problem_id = q.problem_id AND NOT contract.contest_only
        JOIN problems problem ON problem.id = q.problem_id WHERE q.status = 'SOLVED'
      ),
      student_stats AS (
        SELECT v.id, v.name,
          count(*) FILTER (WHERE difficulty = 'EASY')::int AS easy,
          count(*) FILTER (WHERE difficulty = 'MEDIUM')::int AS medium,
          count(*) FILTER (WHERE difficulty = 'HARD')::int AS hard,
          coalesce(bool_or(day BETWEEN ${today}::date - 1 AND ${today}::date), false) AS active
        FROM visible v LEFT JOIN solves q ON q.user_id = v.id GROUP BY v.id, v.name
      ),
      institution_stats AS (
        SELECT ${counts}, (SELECT count(*)::int FROM eligible WHERE NOT shares) AS "optedOut",
          (SELECT count(DISTINCT student_id)::int FROM members) AS assigned FROM student_stats s
      ),
      topics AS (
        SELECT m.class_id, q.topic, count(*)::int AS solves
        FROM members m JOIN solves q ON q.user_id = m.student_id GROUP BY m.class_id, q.topic
      ),
      cohort_stats AS (
        SELECT c.id, c.name, c.archived, ${counts},
          coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.solves DESC, item.topic)
            FROM (SELECT topic, solves FROM topics WHERE class_id = c.id ORDER BY solves DESC, topic LIMIT 5) item), '[]') AS "topTopics"
        FROM cohorts c LEFT JOIN members m ON m.class_id = c.id LEFT JOIN student_stats s ON s.id = m.student_id
        GROUP BY c.id, c.name, c.archived
      ),
      top_students AS (
        SELECT id, name, easy + medium + hard AS solved, easy * ${points.EASY}::int + medium * ${points.MEDIUM}::int + hard * ${points.HARD}::int AS xp
        FROM student_stats ORDER BY xp DESC, solved DESC, id LIMIT 40
      ),
      ranking AS (
        SELECT t.name, t.solved, t.xp,
          ARRAY(SELECT DISTINCT q.day::text FROM solves q WHERE q.user_id = t.id AND q.day IS NOT NULL AND q.day <= ${today}::date) AS days,
          row_number() OVER (ORDER BY t.xp DESC, t.solved DESC, t.id) AS rank
        FROM top_students t
      )
      SELECT (SELECT to_jsonb(s) FROM institution_stats s) AS totals,
        coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name, c.id) FROM cohort_stats c), '[]') AS cohorts,
        coalesce((SELECT jsonb_agg(to_jsonb(r) - 'rank' ORDER BY r.rank) FROM ranking r), '[]') AS rankings
    `;
    const [activity] = await tx.$queryRaw<{ total: number; opportunities: number; completed: number }[]>`
      WITH ${audience},
      assignments AS (
        SELECT a.id, a.class_id, a.problem_ids, a.starts_at, LEAST(a.due_at, a.archived_at, c.archived_at) AS due_at
        FROM practice_assignments a JOIN cohorts c ON c.id = a.class_id
        WHERE a.starts_at >= ${period.start} AND a.starts_at < ${period.end}
      )
      SELECT (SELECT count(*)::int FROM assignments) AS total, count(*)::int AS opportunities,
        count(*) FILTER (WHERE cardinality(a.problem_ids) > 0 AND NOT EXISTS (
          SELECT 1 FROM unnest(a.problem_ids) AS wanted(problem_id) WHERE NOT EXISTS (
            SELECT 1 FROM practice_submissions q
            WHERE q.user_id = m.student_id AND q.problem_id = wanted.problem_id AND q.verdict = 'ACCEPTED'
              AND q.created_at BETWEEN a.starts_at AND a.due_at
          )
        ))::int AS completed
      FROM assignments a JOIN members m ON m.class_id = a.class_id
    `;
    const { optedOut, assigned, ...totals } = report!.totals;
    return {
      university, range: { from: period.from, to: period.to },
      totals: readiness(totals), optedOut, unassigned: totals.students - assigned,
      cohorts: report!.cohorts.map((row) => ({ ...row, ...readiness(row) })),
      assignments: { ...activity!, percent: activity!.opportunities ? Math.round(100 * activity!.completed / activity!.opportunities) : 0 },
      rankings: report!.rankings.map(({ days, ...student }) => ({ ...student, streak: currentStreak(new Set(days), today) })),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
