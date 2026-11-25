import { registrationOpen } from '../admin/settings.js';
import type { Prisma, PrismaClient, PracticeReviewStatus } from '@prisma/client';
import { AppError } from '../../errors.js';
import type { OfficerEvidence, OfficerEvidenceInput } from '../practice/contracts.js';
import { studentAccess } from './cohort-roster.js';
import { notify } from '../notifications/service.js';
import { institutionDomain, lockInstitutionDomain, recognizedInstitution, standaloneLearner } from './institution-identity.js';

const proofLimit = 10;
const applicationFields = {
  id: true, status: true, submittedEmail: true, submittedAt: true, reviewedAt: true, reason: true,
  evidence: true, version: true,
} satisfies Prisma.PracticeOfficerApplicationSelect;
const universityFields = { id: true, name: true, emailDomains: true } as const;
const schoolName = { id: true, name: true } as const;

function requestMissing(): never {
  throw new AppError(404, 'NOT_FOUND', 'Placement officer application not found.');
}

function emailAllowed(email: string, domains: string[]) {
  const domain = email.split('@').at(-1)?.toLowerCase();
  return domains.some((entry) => entry.trim().toLowerCase() === domain);
}

async function eligibleApplicant(db: Prisma.TransactionClient, id: string) {
  const user = await db.user.findFirst({
    where: { id, emailVerified: true, ...studentAccess },
    select: { email: true, role: true,
      teacher: { select: { university: { select: { ...universityFields, isActive: true } }, practicePlacementMember: { select: { universityId: true } } } },
      student: { select: { universityId: true, degree: true, batch: true, registerNumber: true, _count: { select: { enrollments: true } } } },
    },
  });
  if (!user) return null;
  if (user.role === 'TEACHER' && user.teacher?.university.isActive) {
    const { id: universityId, name, emailDomains } = user.teacher.university;
    return { id, member: user.teacher.practicePlacementMember?.universityId === universityId,
      email: user.email, university: { id: universityId, name }, institutionalEmail: emailAllowed(user.email, emailDomains), provisionsTeacher: false };
  }
  const domain = user.role === 'STUDENT' && !user.teacher ? institutionDomain(user.email) : null;
  const university = domain ? await recognizedInstitution(db, domain) : null;
  if (!university || !standaloneLearner(user.student, university.id)) return null;
  return { id, member: false, email: user.email, university, institutionalEmail: true, provisionsTeacher: true };
}

async function applicant(db: Prisma.TransactionClient, id: string) {
  const found = await eligibleApplicant(db, id);
  if (!found) throw new AppError(403, 'FORBIDDEN', 'A verified DSA teacher or eligible standalone applicant is required.');
  return found;
}

async function lockUniversity(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM universities WHERE id = ${id}::uuid FOR UPDATE`;
}

async function lockApplicant(tx: Prisma.TransactionClient, id: string) {
  const { university, email } = await applicant(tx, id);
  const domain = institutionDomain(email);
  if (domain) await lockInstitutionDomain(tx, domain);
  await lockUniversity(tx, university.id);
  const current = await applicant(tx, id);
  if (current.university.id !== university.id || current.email !== email) throw new AppError(409, 'UNIVERSITY_CHANGED', 'Your university changed. Refresh and try again.');
  if (!current.institutionalEmail) throw new AppError(403, 'INSTITUTIONAL_EMAIL', 'Use your verified university email to apply.');
  return current;
}

async function requireReviewer(db: Prisma.TransactionClient, id: string) {
  if (!await db.user.findFirst({ where: { id, role: 'SUPER_ADMIN', ...studentAccess }, select: { id: true } })) {
    throw new AppError(403, 'FORBIDDEN', 'Practice administration is required to review applications.');
  }
}

function proof(items: OfficerEvidenceInput[]): OfficerEvidence[] {
  const addedAt = new Date().toISOString();
  return items.map((item) => ({ ...item, addedAt }));
}

function evidence(value: Prisma.JsonValue) {
  return value as OfficerEvidence[];
}

const pendingChanged = () => new AppError(409, 'APPLICATION_CHANGED', 'This application changed. Refresh it before continuing.');

export function officerApplications(db: PrismaClient) {
  return {
    async status(actor: string) {
      const account = await applicant(db, actor);
      const history = await db.practiceOfficerApplication.findMany({
        where: { applicantId: actor, universityId: account.university.id },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 10, select: applicationFields,
      });
      return { ...account, history: history.map((row) => ({ ...row, evidence: evidence(row.evidence) })) };
    },

    async submit(actor: string, items: OfficerEvidenceInput[]) {
      return db.$transaction(async (tx) => {
        await registrationOpen(tx, 'officer');
        const account = await lockApplicant(tx, actor);
        if (account.member) throw new AppError(409, 'ALREADY_ON_TEAM', 'You already have placement team access.');
        const where = { applicantId: actor, universityId: account.university.id };
        const existing = await tx.practiceOfficerApplication.findFirst({ where: { ...where, status: 'PENDING' }, select: { id: true } });
        if (existing) throw new AppError(409, 'APPLICATION_PENDING', 'You already have an application awaiting review.');
        return tx.practiceOfficerApplication.create({
          data: { ...where, submittedEmail: account.email, evidence: proof(items) }, select: { id: true },
        });
      });
    },

    async append(actor: string, id: string, additions: OfficerEvidenceInput[]) {
      return db.$transaction(async (tx) => {
        const account = await lockApplicant(tx, actor);
        const row = await tx.practiceOfficerApplication.findFirst({
          where: { id, applicantId: actor, universityId: account.university.id }, select: applicationFields,
        });
        if (!row) return requestMissing();
        if (row.status !== 'PENDING' || row.submittedEmail.toLowerCase() !== account.email.toLowerCase()) throw pendingChanged();
        const combined = [...evidence(row.evidence), ...proof(additions)];
        if (combined.length > proofLimit) throw new AppError(400, 'EVIDENCE_LIMIT', 'An application can contain up to ten items of supporting evidence.');
        return tx.practiceOfficerApplication.update({
          where: { id }, data: { evidence: combined, version: { increment: 1 } }, select: { version: true },
        });
      });
    },

    async queue(actor: string, status: PracticeReviewStatus, page: number) {
      await requireReviewer(db, actor);
      const size = 20;
      const rows = await db.practiceOfficerApplication.findMany({
        where: { status }, orderBy: [{ submittedAt: status === 'PENDING' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * size, take: size + 1,
        select: { ...applicationFields, applicant: { select: { name: true, role: true } }, university: { select: schoolName } },
      });
      return { page, hasNext: rows.length > size, applications: rows.slice(0, size).map((row) => ({ ...row, evidence: evidence(row.evidence) })) };
    },

    async decide(actor: string, id: string, input: { status: 'APPROVED' | 'REJECTED'; version: number; reason?: string }) {
      await requireReviewer(db, actor);
      const lookup = await db.practiceOfficerApplication.findUnique({ where: { id }, select: { universityId: true, submittedEmail: true } });
      if (!lookup) return requestMissing();
      return db.$transaction(async (tx) => {
        const domain = institutionDomain(lookup.submittedEmail);
        if (domain) await lockInstitutionDomain(tx, domain);
        await lockUniversity(tx, lookup.universityId);
        await requireReviewer(tx, actor);
        const row = await tx.practiceOfficerApplication.findUnique({
          where: { id }, select: { ...applicationFields, applicantId: true, universityId: true },
        });
        if (!row) return requestMissing();
        if (row.applicantId === actor) throw new AppError(403, 'FORBIDDEN', 'Another super admin must review this application.');
        if (row.status !== 'PENDING' || row.version !== input.version) throw pendingChanged();

        if (input.status === 'APPROVED') {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.applicantId}::uuid FOR UPDATE`;
          const target = await eligibleApplicant(tx, row.applicantId);
          if (!target?.institutionalEmail || target.university.id !== row.universityId || target.email.toLowerCase() !== row.submittedEmail.toLowerCase()) {
            throw new AppError(409, 'APPLICANT_INELIGIBLE', 'The applicant’s verified university account changed.');
          }
          if (target.provisionsTeacher) {
            if (!evidence(row.evidence).length) throw new AppError(409, 'OFFICER_EVIDENCE_REQUIRED', 'Review supporting staff evidence before provisioning a DSA teacher.');
            await tx.teacher.create({ data: { userId: row.applicantId, universityId: row.universityId } });
            await tx.user.update({ where: { id: row.applicantId }, data: { role: 'TEACHER' } });
          }
          const lead = await tx.practicePlacementMember.findFirst({
            where: { universityId: row.universityId, isPrimary: true }, select: { userId: true },
          });
          const isPrimary = !lead || lead.userId === row.applicantId;
          const membership = { universityId: row.universityId, isPrimary };
          await tx.practicePlacementMember.upsert({
            where: { userId: row.applicantId }, create: { userId: row.applicantId, ...membership }, update: membership,
          });
        }
        await tx.practiceOfficerApplication.update({
          where: { id }, data: { status: input.status, reason: input.reason || null, reviewedAt: new Date(), reviewedBy: actor },
        });
        await tx.auditLog.create({ data: { userId: actor, eventType: 'practice_officer_application_' + input.status.toLowerCase(),
          resourceType: 'university', resourceId: row.universityId, metadata: { applicationId: id, teacherId: row.applicantId } } });
        const approved = input.status === 'APPROVED';
        await notify(tx, [row.applicantId], {
          title: approved ? 'Placement officer application approved' : 'Placement officer application reviewed',
          message: approved ? 'You now have access to your university’s placement team.' : 'Open your application to see the decision and review reason.',
          link: '/practice/placement?view=verification',
        });
        return { status: input.status };
      });
    },
  };
}
