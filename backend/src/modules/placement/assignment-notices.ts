import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import { notify } from '../notifications/service.js';
import { openPracticeClass } from './cohort-roster.js';
import { assignmentMissing, assignmentProgress, assignmentRoster } from './assignment-progress.js';

const dayMs = 86_400_000;
const assignmentLink = '/practice/placement?view=student';
const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

const noticeFields = {
  classId: true, title: true, startsAt: true, dueAt: true, problemIds: true,
  classroom: { select: { universityId: true } },
} as const;

type Assignment = Prisma.PracticeAssignmentGetPayload<{ select: typeof noticeFields }>;

async function enrolled(db: Prisma.TransactionClient, classId: string, universityId: string) {
  const rows = await db.classStudent.findMany({
    where: assignmentRoster(classId, universityId),
    select: { studentId: true },
  });
  return rows.map((row) => row.studentId);
}

export async function publishAssignmentNotice(db: Prisma.TransactionClient, assignment: { classId: string; title: string; dueAt: Date }, universityId: string) {
  const students = await enrolled(db, assignment.classId, universityId);
  await notify(db, students, { title: 'New class assignment', message: assignment.title + ' is due ' + date.format(assignment.dueAt) + ' IST.',
    link: assignmentLink });
}

async function remindIncomplete(db: Prisma.TransactionClient, assignment: Assignment) {
  const audience = await enrolled(db, assignment.classId, assignment.classroom.universityId);
  const accepted = await assignmentProgress(db, assignment, audience);
  const incomplete = audience.filter((id) => (accepted.get(id)?.size ?? 0) < assignment.problemIds.length);
  return notify(db, incomplete, { title: 'Assignment reminder',
    message: assignment.title + ' is due ' + date.format(assignment.dueAt) + ' IST.', link: assignmentLink });
}

export async function sendManualReminder(db: Prisma.TransactionClient, classId: string, id: string) {
  const assignment = await db.practiceAssignment.findFirst({ where: { id, classId }, select: { ...noticeFields, archived: true } });
  if (!assignment) return assignmentMissing();
  const now = new Date();
  if (assignment.archived || assignment.startsAt > now || assignment.dueAt <= now) {
    throw new AppError(409, 'ASSIGNMENT_CLOSED', 'Only active assignments can be reminded.');
  }
  return { remindedCount: await remindIncomplete(db, assignment) };
}

export async function sendAutomaticReminders(db: PrismaClient, now = new Date()) {
  const due = { autoRemindedAt: null, archived: false, startsAt: { lte: now }, dueAt: { gt: now, lte: new Date(+now + dayMs) },
    classroom: openPracticeClass } satisfies Prisma.PracticeAssignmentWhereInput;
  const candidates = await db.practiceAssignment.findMany({ where: due, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: 100, select: { id: true, classId: true } });
  const result = { scanned: candidates.length, handled: 0, reminded: 0, errors: 0 };
  for (const candidate of candidates) {
    try {
      const reminded = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM classes WHERE id = ${candidate.classId}::uuid FOR UPDATE`;
        const assignment = await tx.practiceAssignment.findFirst({ where: { ...due, id: candidate.id, classId: candidate.classId }, select: noticeFields });
        if (!assignment) return null;
        const count = await remindIncomplete(tx, assignment);
        await tx.practiceAssignment.update({ where: { id: candidate.id }, data: { autoRemindedAt: now } });
        return count;
      });
      if (reminded !== null) {
        result.handled++;
        result.reminded += reminded;
      }
    } catch {
      result.errors++;
    }
  }
  return result;
}
