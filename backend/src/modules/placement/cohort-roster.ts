import Papa from 'papaparse';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { CohortImportResult, CohortImportStatus } from '../practice/contracts.js';

export const rosterByteLimit = 2 * 1024 * 1024;
const rosterRowLimit = 10_000;
const emailFormat = z.email().max(254);
export const rosterAddress = z.string().trim().toLowerCase().pipe(emailFormat);
export const studentAccess = { isActive: true, deletedAt: null, approvalStatus: 'APPROVED' } as const;
export const activeClass = { isActive: true, deletedAt: null, university: { isActive: true } } as const;
export const openPracticeClass = { ...activeClass, practiceCohortArchive: { is: null } } as const;

type ImportRow = { row: number; email: string; issue?: 'duplicate' | 'invalid-email' };
type Cohort = { id: string; universityId: string; maxStudents: number; university: { emailDomains: string[] } };

export function parseRoster(text: string): ImportRow[] {
  if (text.includes('\0') || Buffer.byteLength(text, 'utf8') > rosterByteLimit) {
    throw new AppError(400, 'ROSTER_FILE', 'Choose a UTF-8 CSV file under 2 MB.');
  }
  const csv = text.replace(/^\uFEFF/, '');
  let nextLine = 1;
  let previous = 0;
  let emailColumn = -1;
  let error: string | undefined;
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  Papa.parse<string[]>(csv, {
    delimiter: ',',
    step(result, parser) {
      const line = nextLine;
      const cursor = result.meta.cursor;
      nextLine += csv.slice(previous, cursor).match(/\r\n|\r|\n/g)?.length ?? 0;
      previous = cursor;
      if (result.errors.length) error = 'The CSV contains invalid quoting.';
      else if (result.data.length === 1 && !result.data[0]?.trim()) return;
      else if (emailColumn < 0) {
        const columns = result.data.flatMap((cell, index) => cell.trim().toLowerCase() === 'email' ? [index] : []);
        if (columns.length !== 1) error = 'The CSV must have exactly one email column.';
        else emailColumn = columns[0]!;
      } else if (rows.length >= rosterRowLimit) error = 'The CSV exceeds 10,000 rows.';
      else {
        const email = (result.data[emailColumn] ?? '').trim().toLowerCase();
        if (!emailFormat.safeParse(email).success) rows.push({ row: line, email: email.slice(0, 254), issue: 'invalid-email' });
        else if (seen.has(email)) rows.push({ row: line, email, issue: 'duplicate' });
        else {
          seen.add(email);
          rows.push({ row: line, email });
        }
      }
      if (error) parser.abort();
    },
  });
  if (error || !rows.length) throw new AppError(400, 'ROSTER_FILE', error ?? 'The CSV must contain an email column and at least one student row.');
  return rows;
}

export async function addRosterRows(tx: Prisma.TransactionClient, cohort: Cohort, actor: string, rows: ImportRow[]): Promise<CohortImportResult> {
  const addresses = rows.filter((row) => !row.issue).map(({ email }) => email);
  const [accounts, roster, invites] = await Promise.all([
    tx.user.findMany({
      where: { email: { in: addresses, mode: 'insensitive' } },
      select: { id: true, email: true, role: true, isActive: true, deletedAt: true, emailVerified: true, approvalStatus: true,
        student: { select: { universityId: true } } },
    }),
    tx.classStudent.findMany({ where: { classId: cohort.id }, select: { studentId: true } }),
    tx.practiceCohortInvite.findMany({ where: { classId: cohort.id }, select: { email: true } }),
  ]);
  const byEmail = new Map(accounts.map((user) => [user.email.toLowerCase(), user]));
  const enrolled = new Set(roster.map(({ studentId }) => studentId));
  const pending = new Set(invites.map(({ email }) => email));
  const domains = new Set(cohort.university.emailDomains.map((domain) => domain.trim().toLowerCase()));
  let seats = Math.max(0, cohort.maxStudents - roster.length - invites.length);
  const add: Prisma.ClassStudentCreateManyInput[] = [];
  const reserve: Prisma.PracticeCohortInviteCreateManyInput[] = [];
  const clear: string[] = [];
  const summary: CohortImportResult['summary'] = {
    enrolled: 0, invited: 0, 'already-member': 0, 'already-invited': 0, duplicate: 0, 'invalid-email': 0, unavailable: 0, capacity: 0,
  };

  function decide(email: string): CohortImportStatus {
    const account = byEmail.get(email);
    const hasSeat = pending.has(email);
    if (account) {
      if (account.role !== 'STUDENT' || account.student?.universityId !== cohort.universityId ||
          !account.isActive || account.deletedAt || account.approvalStatus === 'REJECTED') return 'unavailable';
      if (enrolled.has(account.id)) {
        if (hasSeat) { clear.push(email); seats++; }
        return 'already-member';
      }
      if (account.emailVerified && account.approvalStatus === 'APPROVED') {
        if (hasSeat && roster.length + add.length >= cohort.maxStudents) return 'capacity';
        if (!hasSeat && !seats) return 'capacity';
        if (hasSeat) clear.push(email);
        else seats--;
        add.push({ classId: cohort.id, studentId: account.id });
        return 'enrolled';
      }
    } else if (!domains.has(email.split('@').at(-1) ?? '')) return 'unavailable';
    if (hasSeat) return 'already-invited';
    if (!seats) return 'capacity';
    seats--;
    reserve.push({ classId: cohort.id, email, invitedBy: actor });
    return 'invited';
  }

  const result = rows.map(({ row, email, issue }) => {
    const status = issue ?? decide(email);
    summary[status]++;
    return { row, email, status };
  });
  await tx.classStudent.createMany({ data: add, skipDuplicates: true });
  await tx.practiceCohortInvite.createMany({ data: reserve, skipDuplicates: true });
  await tx.practiceCohortInvite.deleteMany({ where: { classId: cohort.id, email: { in: clear } } });
  return { rows: result, summary };
}

export async function activateCohortInvites(db: PrismaClient, userId: string) {
  const verified = { ...studentAccess, role: 'STUDENT', emailVerified: true } as const;
  const student = await db.student.findFirst({
    where: { userId, user: verified },
    select: { universityId: true, user: { select: { email: true } } },
  });
  if (!student) return;
  const email = student.user.email.toLowerCase();
  const invites = await db.practiceCohortInvite.findMany({
    where: { email, classroom: { ...openPracticeClass, universityId: student.universityId } }, select: { classId: true },
  });
  for (const { classId } of invites) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM classes WHERE id = ${classId}::uuid FOR UPDATE`;
      const current = await tx.student.findFirst({
        where: { userId, universityId: student.universityId, user: { ...verified, email: student.user.email } },
        select: { userId: true },
      });
      if (!current) return;
      const cohort = await tx.class.findFirst({
        where: {
          id: classId, ...openPracticeClass, universityId: student.universityId, practiceCohortInvites: { some: { email } },
        },
        select: {
          maxStudents: true, _count: { select: { enrollments: true } },
          enrollments: { where: { studentId: userId }, select: { studentId: true } },
        },
      });
      if (!cohort || (!cohort.enrollments.length && cohort._count.enrollments >= cohort.maxStudents)) return;
      await tx.classStudent.createMany({ data: [{ classId, studentId: userId }], skipDuplicates: true });
      await tx.practiceCohortInvite.deleteMany({ where: { classId, email } });
    });
  }
}
