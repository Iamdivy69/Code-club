import type { Prisma } from '@prisma/client';
import { AppError } from '../../errors.js';
import { publishedPractice } from '../practice/visibility.js';
import { studentAccess } from './cohort-roster.js';

export const assignmentStudent = { role: 'STUDENT', ...studentAccess } as const;
export const assignmentRoster = (classId: string, universityId: string) => ({
  classId, student: { universityId, user: assignmentStudent },
} satisfies Prisma.ClassStudentWhereInput);

type AssignmentWindow = { startsAt: Date; dueAt: Date; problemIds: string[]; archivedAt?: Date | null };

export function assignmentEnd(assignment: AssignmentWindow, cohortArchivedAt?: Date | null) {
  return new Date(Math.min(+assignment.dueAt, +(assignment.archivedAt ?? assignment.dueAt), +(cohortArchivedAt ?? assignment.dueAt)));
}

export async function assignmentProgress(db: Prisma.TransactionClient, assignment: AssignmentWindow, userIds: string[], cohortArchivedAt?: Date | null) {
  const rows = await db.practiceSubmission.groupBy({
    by: ['userId', 'problemId'],
    where: { userId: { in: userIds }, problemId: { in: assignment.problemIds }, verdict: 'ACCEPTED',
      createdAt: { gte: assignment.startsAt, lte: assignmentEnd(assignment, cohortArchivedAt) } },
  });
  const accepted = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = accepted.get(row.userId) ?? new Set<string>();
    ids.add(row.problemId);
    accepted.set(row.userId, ids);
  }
  return accepted;
}

export function assignmentMissing(): never {
  throw new AppError(404, 'NOT_FOUND', 'Assignment not found.');
}

export async function assignmentCompletion(db: Prisma.TransactionClient, id: string, cohort: {
  id: string; universityId: string; practiceCohortArchive: { archivedAt: Date } | null;
}) {
  const assignment = await db.practiceAssignment.findFirst({ where: { id, classId: cohort.id } });
  if (!assignment) return assignmentMissing();
  const [roster, problems] = await Promise.all([
    db.classStudent.findMany({ where: assignmentRoster(cohort.id, cohort.universityId),
      select: { student: { select: { user: { select: { id: true, name: true, email: true } } } } } }),
    db.problem.findMany({ where: { ...publishedPractice, id: { in: assignment.problemIds } },
      select: { id: true, title: true, slug: true } }),
  ]);
  const people = roster.map((row) => row.student.user);
  const archiveDate = cohort.practiceCohortArchive?.archivedAt;
  const accepted = await assignmentProgress(db, assignment, people.map((student) => student.id), archiveDate);
  const choices = new Map(problems.map((problem) => [problem.id, problem]));
  const students = people.map(({ id, ...student }) => {
    const solved = accepted.get(id);
    const missing = assignment.problemIds.filter((problemId) => !solved?.has(problemId));
    return { id, ...student, solved: assignment.problemIds.length - missing.length, missing };
  }).sort((left, right) => left.solved - right.solved || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return {
    id, title: assignment.title, startsAt: assignment.startsAt, dueAt: assignment.dueAt, archived: assignment.archived,
    scoringEndsAt: assignmentEnd(assignment, archiveDate), archivedAt: assignment.archivedAt,
    problems: assignment.problemIds.map((problemId) => choices.get(problemId) ?? { id: problemId, title: 'Unavailable problem', slug: null }),
    completed: students.filter((item) => item.missing.length === 0).length, students,
  };
}

export async function archiveAssignment(db: Prisma.TransactionClient, classId: string, id: string) {
  const assignment = await db.practiceAssignment.findFirst({
    where: { id, classId }, select: { archived: true, archivedAt: true },
  });
  if (!assignment) return assignmentMissing();
  if (assignment.archived) return { ...assignment, alreadyArchived: true };
  const updated = await db.practiceAssignment.update({ where: { id }, data: { archived: true, archivedAt: new Date() },
    select: { archived: true, archivedAt: true } });
  return { ...updated, alreadyArchived: false };
}
