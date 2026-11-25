import type { Prisma, PrismaClient, PracticeInstitutionStatus } from '@prisma/client';
import { AppError } from '../../errors.js';
import { requirePracticeAdmin } from '../admin/access.js';
import { recordPracticeAudit } from '../admin/audit.js';
import { notify } from '../notifications/service.js';
import { studentAccess } from './cohort-roster.js';
import { independentPracticeId, institutionDomain, lockInstitutionDomain, recognizedInstitution, standaloneLearner, universitiesForDomain } from './institution-identity.js';

const scope = { role: { in: ['STUDENT', 'TEACHER'] }, ...studentAccess } satisfies Prisma.UserWhereInput;
const universityLabel = { id: true, name: true } as const;
const applicationFields = {
  id: true, domain: true, name: true, evidence: true, status: true, version: true, reason: true,
  submittedAt: true, reviewedAt: true, university: { select: universityLabel },
} satisfies Prisma.PracticeInstitutionApplicationSelect;
const ownPath = '/practice/placement?view=institution';

const forbidden = () => new AppError(403, 'INSTITUTION_ACCOUNT', 'Use an eligible student or teacher account.');
const invalidEmail = () => new AppError(403, 'INSTITUTION_EMAIL', 'Verify your institutional email address before continuing.');
const missing = () => new AppError(404, 'NOT_FOUND', 'Institution application not found.');
const changed = () => new AppError(409, 'INSTITUTION_CHANGED', 'The application changed. Refresh and review it again.');
const assigned = () => new AppError(409, 'INSTITUTION_DOMAIN_ASSIGNED', 'This domain is already assigned to a DSA university.');

async function account(db: Prisma.TransactionClient, id: string) {
  const user = await db.user.findFirst({
    where: { id, ...scope },
    select: { id: true, role: true, email: true, emailVerified: true,
      student: { select: { universityId: true, degree: true, batch: true, registerNumber: true, university: { select: universityLabel },
        _count: { select: { enrollments: true } } } },
      teacher: { select: { university: { select: universityLabel } } },
    },
  });
  if (!user) throw forbidden();
  const domain = user.emailVerified ? institutionDomain(user.email) : null;
  const currentUniversity = user.role === 'STUDENT' ? user.student?.university : user.teacher?.university;
  const independent = user.role === 'STUDENT' && user.student?.university.id === independentPracticeId && user.student._count.enrollments === 0;
  return { user, domain, currentUniversity: currentUniversity ?? null, independent };
}

async function lockDomainForApplicant(tx: Prisma.TransactionClient, id: string) {
  const before = await account(tx, id);
  if (!before.domain) throw invalidEmail();
  await lockInstitutionDomain(tx, before.domain);
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  const after = await account(tx, id);
  if (before.domain !== after.domain || before.user.email !== after.user.email) throw invalidEmail();
  return { ...after, domain: before.domain };
}

async function chooseUniversity(tx: Prisma.TransactionClient, domain: string, name: string, targetId?: string) {
  if (targetId) {
    await tx.$queryRaw`SELECT id FROM universities WHERE id = ${targetId}::uuid FOR UPDATE`;
    const target = await tx.university.findFirst({
      where: { id: { equals: targetId, not: independentPracticeId }, isActive: true },
      select: universityLabel,
    });
    if (!target) throw new AppError(404, 'UNIVERSITY_NOT_FOUND', 'Choose an active DSA university.');
    if ((await universitiesForDomain(tx, domain)).length) throw assigned();
    return tx.university.update({
      where: { id: target.id }, data: { emailDomains: { push: domain } }, select: universityLabel,
    });
  }
  await lockInstitutionDomain(tx, 'name:' + name.toLowerCase());
  if ((await universitiesForDomain(tx, domain)).length) throw assigned();
  if (await tx.university.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) {
    throw new AppError(409, 'INSTITUTION_NAME_EXISTS', 'A university with this name already exists. Choose the existing DSA record.');
  }
  return tx.university.create({ data: { name, emailDomains: [domain] }, select: universityLabel });
}

type Decision =
  | { status: 'APPROVED'; version: number; universityId?: string; reason?: string }
  | { status: 'REJECTED' | 'REVOKED'; version: number; reason: string };

export function institutionOnboarding(db: PrismaClient) {
  return {
    async status(actor: string) {
      const who = await account(db, actor);
      const [recognized, history] = await Promise.all([
        who.domain ? recognizedInstitution(db, who.domain) : null,
        db.practiceInstitutionApplication.findMany({
          where: { applicantId: actor }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 20, select: applicationFields,
        }),
      ]);
      return { domain: who.domain, emailVerified: who.user.emailVerified, currentUniversity: who.currentUniversity,
        recognized, canJoin: Boolean(recognized && who.independent),
        canRequestOfficer: Boolean(recognized && who.user.role === 'STUDENT' && standaloneLearner(who.user.student, recognized.id)), history };
    },

    async submit(actor: string, input: { name: string; evidence: string }) {
      return db.$transaction(async (tx) => {
        const { domain, user } = await lockDomainForApplicant(tx, actor);
        const existing = await tx.practiceInstitutionApplication.findFirst({
          where: { domain, status: { in: ['PENDING', 'APPROVED'] } }, select: { id: true, applicantId: true, status: true },
        });
        if (existing?.status === 'PENDING' && existing.applicantId === actor) return { id: existing.id, created: false };
        if (existing?.status === 'PENDING') throw new AppError(409, 'INSTITUTION_PENDING', 'An application for this domain is already awaiting review.');
        if (existing || (await universitiesForDomain(tx, domain)).length) throw assigned();
        const { id } = await tx.practiceInstitutionApplication.create({
          data: { applicantId: actor, submittedEmail: user.email, domain, ...input }, select: { id: true },
        });
        return { id, created: true };
      });
    },

    async join(actor: string) {
      return db.$transaction(async (tx) => {
        const { domain, user, currentUniversity, independent } = await lockDomainForApplicant(tx, actor);
        if (user.role !== 'STUDENT') throw forbidden();
        const recognized = await recognizedInstitution(tx, domain);
        if (!recognized) throw new AppError(403, 'INSTITUTION_UNVERIFIED', 'This domain needs an active DSA university association.');
        await tx.$queryRaw`SELECT id FROM universities WHERE id = ${recognized.id}::uuid FOR SHARE`;
        if ((await recognizedInstitution(tx, domain))?.id !== recognized.id) throw changed();
        if (currentUniversity?.id === recognized.id) return { university: recognized };
        if (!independent) {
          throw new AppError(409, 'INSTITUTION_TRANSFER_REQUIRED', 'Contact your DSA administrator to change an existing university affiliation.');
        }
        await tx.student.update({ where: { userId: actor }, data: { universityId: recognized.id } });
        return { university: recognized };
      });
    },

    async queue(actor: string, status: PracticeInstitutionStatus, page: number) {
      await requirePracticeAdmin(db, actor);
      const limit = 20;
      const rows = await db.practiceInstitutionApplication.findMany({
        where: { status }, orderBy: [{ submittedAt: status === 'PENDING' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit, take: limit + 1,
        select: { ...applicationFields, submittedEmail: true, applicant: { select: { name: true } } },
      });
      return { page, hasNext: rows.length > limit, applications: rows.slice(0, limit) };
    },

    async decide(actor: string, id: string, decision: Decision) {
      await requirePracticeAdmin(db, actor);
      const found = await db.practiceInstitutionApplication.findUnique({ where: { id }, select: { domain: true } });
      if (!found) throw missing();
      return db.$transaction(async (tx) => {
        await lockInstitutionDomain(tx, found.domain);
        await requirePracticeAdmin(tx, actor);
        const row = await tx.practiceInstitutionApplication.findUnique({
          where: { id }, select: { ...applicationFields, applicantId: true, submittedEmail: true, universityId: true },
        });
        if (!row) throw missing();
        if (row.applicantId === actor) throw new AppError(403, 'INSTITUTION_SELF_REVIEW', 'Another administrator must review this application.');
        const expected = decision.status === 'REVOKED' ? 'APPROVED' : 'PENDING';
        if (row.status !== expected || row.version !== decision.version) throw changed();

        let universityId = row.universityId;
        if (decision.status === 'APPROVED') {
          const applicant = row.applicantId && await tx.user.findFirst({
            where: { id: row.applicantId, ...scope, email: row.submittedEmail, emailVerified: true }, select: { id: true },
          });
          if (!applicant) throw new AppError(409, 'INSTITUTION_APPLICANT_CHANGED', 'The applicant’s verified account changed.');
          universityId = (await chooseUniversity(tx, row.domain, row.name, decision.universityId)).id;
        } else if (decision.status === 'REVOKED' && universityId) {
          await tx.$queryRaw`SELECT id FROM universities WHERE id = ${universityId}::uuid FOR UPDATE`;
          const university = await tx.university.findUniqueOrThrow({ where: { id: universityId }, select: { emailDomains: true } });
          await tx.university.update({
            where: { id: universityId }, data: { emailDomains: university.emailDomains.filter((value) => value.trim().toLowerCase() !== row.domain) },
          });
        }

        const status = decision.status;
        await tx.practiceInstitutionApplication.update({
          where: { id }, data: { status, universityId, reason: decision.reason || null, version: { increment: 1 },
            reviewedAt: new Date(), reviewedBy: actor },
        });
        await recordPracticeAudit(tx, actor, status === 'APPROVED' ? 'practice_institution_approved'
          : status === 'REVOKED' ? 'practice_institution_revoked' : 'practice_institution_rejected', {
          id, type: 'institution_application', label: row.domain, state: status, reason: decision.reason,
        });
        if (row.applicantId) await notify(tx, [row.applicantId], {
          title: status === 'APPROVED' ? 'Institution domain approved' : status === 'REVOKED' ? 'Institution domain revoked' : 'Institution request reviewed',
          message: 'Open institution onboarding to see the decision.', link: ownPath,
        });
        return { status, universityId };
      });
    },
  };
}
