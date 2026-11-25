import { registrationOpen } from '../admin/settings.js';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../../errors.js';
import { recordPracticeAudit } from '../admin/audit.js';
import type { PracticeOptions } from '../practice/routes.js';
import { publishedPractice } from '../practice/visibility.js';
import { versionTransaction } from '../practice/version-transaction.js';
import { assessmentDeadline } from './assessment.js';
import { teamRoutes } from './team-routes.js';
import { reportRoutes } from './report-routes.js';
import { officerRoutes } from './officer-routes.js';
import { institutionRoutes } from './institution-routes.js';
import { publishAssignmentNotice, sendManualReminder } from './assignment-notices.js';
import { archiveAssignment, assignmentCompletion, assignmentProgress, assignmentRoster, assignmentStudent } from './assignment-progress.js';
import { candidateDirectory, directoryFacets, directoryQuery } from './candidate-directory.js';
import { languages } from '../practice/languages.js';
import { notify } from '../notifications/service.js';
import { lockTeachingScope, teachingScope } from './team.js';
import { activateCohortInvites, activeClass, addRosterRows, openPracticeClass, parseRoster, rosterAddress, rosterByteLimit, studentAccess } from './cohort-roster.js';

const idSchema = z.object({ id: z.uuid() });
const assignmentTarget = z.object({ id: z.uuid(), assignmentId: z.uuid() });
const slugs = z.array(z.string().min(1).max(200)).min(1).max(10);
const label = z.string().trim().min(3).max(100);
const interestCooldown = 7 * 86_400_000;
const newestInterest = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.PracticeRecruiterInterestOrderByWithRelationInput[];
const studentPlacement = '/practice/placement?view=student';
const candidateHandle = z.string().regex(/^[a-z][a-z0-9-]{2,31}$/);
const problemView = { id: true, slug: true, title: true } as const;
const catalog = { ...publishedPractice, practiceContract: { ...publishedPractice.practiceContract, hiddenSetEnabled: true, catalogue: { is: null } } } as const;
const cohortFields = z.object({ name: label, code: z.string().trim().min(2).max(50), degree: z.string().trim().min(2).max(100), batch: z.string().trim().min(2).max(20) });
const cohortSummary = { id: true, name: true, code: true, batch: true, degree: true } as const;
const archiveSelect = { select: { archivedAt: true } } as const;
function missing(subject: string): never { throw new AppError(404, 'NOT_FOUND', subject + ' not found.'); }

export const placementRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  await app.register(teamRoutes, { db, authenticate });
  await app.register(reportRoutes, { db, authenticate });
  await app.register(officerRoutes, { db, authenticate });
  await app.register(institutionRoutes, { prefix: '/institution', db, authenticate });
  async function admin(id: string) {
    const result = await db.user.findFirst({ where: { id, role: 'SUPER_ADMIN', ...studentAccess }, select: { id: true } });
    if (!result) throw new AppError(403, 'FORBIDDEN', 'Practice administration is required.');
    return result;
  }
  async function recruiter(id: string) {
    const result = await db.practiceRecruiter.findUnique({ where: { userId: id }, select: { status: true, company: true } });
    if (result?.status !== 'APPROVED') throw new AppError(403, 'FORBIDDEN', 'Your recruiter application needs approval.');
    return result;
  }
  async function approvedCandidate(tx: Prisma.TransactionClient, handle: string, actor: string) {
    // Profile updates use the same row, so withdrawal and outreach have a defined order.
    await tx.$queryRaw`SELECT user_id FROM practice_profiles WHERE handle = ${handle} FOR UPDATE`;
    const found = await tx.practiceProfile.findFirst({
      where: { handle, userId: { not: actor }, isPublic: true, hiringOpen: true,
        user: { role: 'STUDENT', ...studentAccess } }, select: { userId: true, handle: true },
    });
    return found ?? missing('Candidate');
  }
  async function orderedProblems(ordered: string[], database: Prisma.TransactionClient = db) {
    const rows = await database.problem.findMany({ where: { ...catalog, slug: { in: ordered } },
      select: { ...problemView, practiceContract: { select: { contentVersion: true } } },
    });
    if (rows.length !== ordered.length) throw new AppError(400, 'PROBLEM_LIST', 'Choose unique published problems.');
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    return ordered.map((slug) => bySlug.get(slug)!);
  }

  app.get('/me', async (request) => {
    const { id } = await authenticate(request);
    const [actor, teacher, recruiter] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id }, select: { role: true, emailVerified: true } }),
      db.teacher.findFirst({ where: { userId: id, university: { isActive: true }, user: studentAccess },
        select: { universityId: true, practicePlacementMember: { select: { universityId: true } } } }),
      db.practiceRecruiter.findUnique({ where: { userId: id }, select: { status: true, company: true } }),
    ]);
    const college = actor.role === 'TEACHER' && actor.emailVerified && Boolean(teacher);
    const admin = actor.role === 'SUPER_ADMIN';
    return { college, admin, recruiter,
      reports: admin || (college && teacher?.practicePlacementMember?.universityId === teacher?.universityId) };
  });

  app.get('/cohorts', async (request) => {
    const { id } = await authenticate(request);
    const scope = await teachingScope(db, id);
    const { status, q } = z.object({
      status: z.enum(['active', 'archived', 'all']).default('active'), q: z.string().trim().max(100).optional(),
    }).parse(request.query);
    const archive = status === 'all' ? undefined : status === 'active' ? { is: null } : { isNot: null };
    const rows = await db.class.findMany({
      where: { ...activeClass, universityId: scope.universityId, ...(!scope.member && { primaryTeacherId: id }),
        practiceCohortArchive: archive, ...(q && { name: { contains: q, mode: 'insensitive' } }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { ...cohortSummary, practiceCohortArchive: archiveSelect, _count: { select: { enrollments: true, practiceCohortInvites: true } } },
    });
    return { cohorts: rows.map(({ practiceCohortArchive, ...cohort }) => ({ ...cohort, archivedAt: practiceCohortArchive?.archivedAt ?? null })) };
  });
  app.post('/cohorts', async (request, reply) => {
    const { id } = await authenticate(request);
    const body = cohortFields.parse(request.body);
    try {
      const created = await db.$transaction(async (tx) => {
        const { universityId } = await lockTeachingScope(tx, id);
        return tx.class.create({ data: { ...body, universityId, primaryTeacherId: id }, select: { id: true, name: true } });
      });
      return reply.code(201).send(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'COHORT_CODE', 'The university already uses that cohort code.');
      throw error;
    }
  });
  async function scopedCohort(database: Prisma.TransactionClient, userId: string, id: string, scope: Awaited<ReturnType<typeof teachingScope>>) {
    return await database.class.findFirst({
      where: { ...activeClass, id, universityId: scope.universityId, ...(!scope.member && { primaryTeacherId: userId }) },
      select: { ...cohortSummary, universityId: true, maxStudents: true, university: { select: { emailDomains: true } },
        practiceCohortArchive: archiveSelect },
    }) ?? missing('Cohort');
  }

  type Cohort = Awaited<ReturnType<typeof scopedCohort>>;
  function changeCohort<T>(actor: string, id: string, change: (tx: Prisma.TransactionClient, cohort: Cohort) => Promise<T>, allowArchive = false) {
    return db.$transaction(async (tx) => {
      const scope = await lockTeachingScope(tx, actor);
      await tx.$queryRaw`SELECT id FROM classes WHERE id = ${id}::uuid AND university_id = ${scope.universityId}::uuid
        AND (${scope.member} OR primary_teacher_id = ${actor}::uuid) FOR UPDATE`;
      const cohort = await scopedCohort(tx, actor, id, scope);
      if (cohort.practiceCohortArchive && !allowArchive) throw new AppError(409, 'COHORT_ARCHIVED', 'This cohort is archived.');
      return change(tx, cohort);
    });
  }

  app.patch('/cohorts/:id', async (request) => {
    const { id } = await authenticate(request);
    const cohortId = idSchema.parse(request.params).id;
    const changes = cohortFields.partial().refine((fields) => Object.keys(fields).length > 0).parse(request.body);
    try {
      return await changeCohort(id, cohortId, (tx) => tx.class.update({ where: { id: cohortId }, data: changes, select: cohortSummary }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'COHORT_CODE', 'The university already uses that cohort code.');
      throw error;
    }
  });

  app.post('/cohorts/:id/archive', async (request) => {
    const { id } = await authenticate(request);
    return changeCohort(id, idSchema.parse(request.params).id, async (tx, cohort) => {
      const archive = await tx.practiceCohortArchive.upsert({
        where: { classId: cohort.id }, create: { classId: cohort.id, archivedBy: id }, update: {}, select: { archivedAt: true },
      });
      return { id: cohort.id, archivedAt: archive.archivedAt, alreadyArchived: Boolean(cohort.practiceCohortArchive) };
    }, true);
  });
  app.get('/cohorts/:id', async (request) => {
    const { id } = await authenticate(request);
    const cohort = await scopedCohort(db, id, idSchema.parse(request.params).id, await teachingScope(db, id));
    const [roster, assignments, invites, eligible] = await Promise.all([
      db.classStudent.findMany({ where: { classId: cohort.id }, select: {
        student: { select: { userId: true, registerNumber: true,
          user: { select: { name: true, email: true } },
        } } },
      }),
      db.practiceAssignment.findMany({ where: { classId: cohort.id }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }] }),
      db.practiceCohortInvite.findMany({ where: { classId: cohort.id }, orderBy: { email: 'asc' }, select: { email: true, createdAt: true } }),
      db.classStudent.findMany({ where: assignmentRoster(cohort.id, cohort.universityId), select: { studentId: true } }),
    ]);
    const studentIds = roster.map(({ student }) => student.userId);
    const progress = await db.practiceProgress.groupBy({ by: ['userId'], where: { userId: { in: studentIds }, status: 'SOLVED' }, _count: { _all: true } });
    const solved = new Map(progress.map((row) => [row.userId, row._count._all]));
    const assignmentAudience = eligible.map((row) => row.studentId);
    const scored = await Promise.all(assignments.map(async (item) => {
      const accepted = await assignmentProgress(db, item, assignmentAudience, cohort.practiceCohortArchive?.archivedAt);
      const total = item.problemIds.length;
      return { id: item.id, title: item.title, dueAt: item.dueAt, archived: item.archived, total,
        totalStudents: assignmentAudience.length, completed: assignmentAudience.filter((id) => (accepted.get(id)?.size ?? 0) === total).length };
    }));
    return { cohort: { id: cohort.id, name: cohort.name, code: cohort.code, degree: cohort.degree, batch: cohort.batch,
      archivedAt: cohort.practiceCohortArchive?.archivedAt ?? null }, invites, roster: roster.map(({ student }) => ({
      id: student.userId, name: student.user.name, email: student.user.email, registerNumber: student.registerNumber,
      solved: solved.get(student.userId) ?? 0,
    })), assignments: scored };
  });
  app.post('/cohorts/:id/students', async (request) => {
    const { id } = await authenticate(request);
    const cohortId = idSchema.parse(request.params).id;
    const payload = z.union([z.object({ email: rosterAddress }), z.object({ emails: z.array(rosterAddress).min(1).max(100) })]).parse(request.body);
    if ('email' in payload) return changeCohort(id, cohortId, (tx, cohort) => addRosterRows(tx, cohort, id, [{ row: 1, email: payload.email }]));
    const set = [...new Set(payload.emails)];
    return changeCohort(id, cohortId, async (tx, cohort) => {
      const eligible = await tx.student.findMany({ where: { universityId: cohort.universityId, user: { ...studentAccess, email: { in: set } } }, select: { userId: true, user: { select: { email: true } } } });
      const enrolled = await tx.classStudent.findMany({ where: { classId: cohort.id }, select: { studentId: true } });
      const current = new Set(enrolled.map(({ studentId }) => studentId));
      const additions = eligible.filter((student) => !current.has(student.userId));
      const accepted = new Set(eligible.map(({ user }) => user.email.toLowerCase()));
      const reserved = await tx.practiceCohortInvite.count({ where: { classId: cohort.id, email: { notIn: [...accepted] } } });
      if (enrolled.length + additions.length + reserved > cohort.maxStudents) throw new AppError(409, 'COHORT_CAPACITY', 'This upload would exceed the cohort capacity.');
      await tx.classStudent.createMany({ data: additions.map((student) => ({ classId: cohort.id, studentId: student.userId })), skipDuplicates: true });
      await tx.practiceCohortInvite.deleteMany({ where: { classId: cohort.id, email: { in: [...accepted] } } });
      return { added: additions.length, unknown: set.filter((email) => !accepted.has(email)) };
    });
  });
  app.post('/cohorts/:id/import', { bodyLimit: rosterByteLimit }, async (request) => {
    const { id } = await authenticate(request);
    const cohortId = idSchema.parse(request.params).id;
    const csv = z.string().min(1).parse(request.body);
    return changeCohort(id, cohortId, (tx, cohort) => addRosterRows(tx, cohort, id, parseRoster(csv)));
  });

  app.post('/cohorts/:id/invites/revoke', async (request, reply) => {
    const { id } = await authenticate(request);
    const cohortId = idSchema.parse(request.params).id;
    const { email } = z.object({ email: rosterAddress }).parse(request.body);
    await changeCohort(id, cohortId, (tx) => tx.practiceCohortInvite.deleteMany({ where: { classId: cohortId, email } }));
    return reply.code(204).send();
  });

  app.delete('/cohorts/:id/students/:studentId', async (request, reply) => {
    const { id } = await authenticate(request);
    const target = z.object({ id: z.uuid(), studentId: z.uuid() }).parse(request.params);
    await changeCohort(id, target.id, (tx) => tx.classStudent.deleteMany({ where: { classId: target.id, studentId: target.studentId } }));
    return reply.code(204).send();
  });
  app.post('/cohorts/:id/assignments', async (request, reply) => {
    const { id } = await authenticate(request);
    const cohortId = idSchema.parse(request.params).id;
    const body = z.object({ title: label, dueAt: z.iso.datetime(), problemSlugs: slugs }).parse(request.body);
    const due = new Date(body.dueAt);
    if (+due <= Date.now()) throw new AppError(400, 'DUE_DATE', 'Choose a future due date.');
    const item = await changeCohort(id, cohortId, async (tx, cohort) => {
      const problems = await orderedProblems(body.problemSlugs, tx);
      const assignment = await tx.practiceAssignment.create({
        data: { classId: cohortId, title: body.title, dueAt: due, problemIds: problems.map(({ id }) => id) }, select: { id: true },
      });
      await publishAssignmentNotice(tx, { classId: cohortId, title: body.title, dueAt: due }, cohort.universityId);
      return assignment;
    });
    return reply.code(201).send(item);
  });
  app.post('/cohorts/:id/assignments/:assignmentId/remind', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request) => {
    const { id } = await authenticate(request);
    const target = assignmentTarget.parse(request.params);
    return changeCohort(id, target.id, (tx) => sendManualReminder(tx, target.id, target.assignmentId));
  });
  app.get('/cohorts/:id/assignments/:assignmentId/completion', async (request, reply) => {
    const { id } = await authenticate(request);
    const target = assignmentTarget.parse(request.params);
    reply.header('Cache-Control', 'private, no-store');
    return db.$transaction(async (tx) => {
      const cohort = await scopedCohort(tx, id, target.id, await teachingScope(tx, id));
      return assignmentCompletion(tx, target.assignmentId, cohort);
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/cohorts/:id/assignments/:assignmentId/archive', async (request) => {
    const { id } = await authenticate(request);
    const target = assignmentTarget.parse(request.params);
    return changeCohort(id, target.id, (tx) => archiveAssignment(tx, target.id, target.assignmentId));
  });
  app.get('/assignments', async (request) => {
    const { id } = await authenticate(request);
    await activateCohortInvites(db, id);
    const student = await db.student.findFirst({ where: { userId: id, user: assignmentStudent }, select: { universityId: true } });
    if (!student) return { assignments: [] };
    const rows = await db.practiceAssignment.findMany({ where: { archived: false, classroom: {
      ...openPracticeClass, universityId: student.universityId, enrollments: { some: { studentId: id } },
    } },
      orderBy: { dueAt: 'asc' }, select: { id: true, title: true, dueAt: true, startsAt: true, problemIds: true, classroom: { select: { name: true } } },
    });
    const problems = await db.problem.findMany({ where: { ...catalog, id: { in: rows.flatMap((row) => row.problemIds) } }, select: problemView });
    const lookup = new Map(problems.map((row) => [row.id, row]));
    return { assignments: await Promise.all(rows.map(async (row) => {
      const done = (await assignmentProgress(db, row, [id])).get(id);
      return { id: row.id, title: row.title, dueAt: row.dueAt, cohort: row.classroom.name, problems: row.problemIds.flatMap((problemId) => {
        const item = lookup.get(problemId);
        return item ? [{ ...item, solved: done?.has(problemId) ?? false }] : [];
      }) };
    })) };
  });

  app.post('/recruiters', async (request, reply) => {
    const { id } = await authenticate(request);
    const { company } = z.object({ company: label }).parse(request.body);
    const user = await db.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
    const created = await db.$transaction(async (tx) => {
      await registrationOpen(tx, 'recruiter');
      return tx.practiceRecruiter.upsert({ where: { userId: id },
      create: { userId: id, company, workEmail: user.email }, update: {}, select: { company: true, status: true } });
    });
    return reply.code(201).send(created);
  });
  app.get('/admin/recruiters', async (request) => {
    const { id } = await authenticate(request);
    await admin(id);
    return { applications: await db.practiceRecruiter.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' },
      select: { userId: true, company: true, workEmail: true, status: true }, take: 100,
    }) };
  });
  app.patch('/admin/recruiters/:id', async (request) => {
    const { id } = await authenticate(request);
    await admin(id);
    const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(request.body);
    const { id: recruiterId } = idSchema.parse(request.params);
    return db.$transaction(async (tx) => {
      const changed = await tx.practiceRecruiter.updateMany({
        where: { userId: recruiterId, status: 'PENDING' }, data: { status, reviewedAt: new Date() },
      });
      if (!changed.count) missing('Application');
      const application = await tx.practiceRecruiter.findUniqueOrThrow({ where: { userId: recruiterId }, select: { company: true } });
      await recordPracticeAudit(tx, id, 'practice_recruiter_reviewed', { id: recruiterId, type: 'recruiter', label: application.company, state: status });
      return { status };
    });
  });
  app.get('/candidates', async (request, reply) => {
    const { id } = await authenticate(request);
    await recruiter(id);
    reply.header('Cache-Control', 'private, no-store');
    return candidateDirectory(db, id, directoryQuery.parse(request.query));
  });
  app.get('/candidates/filters', async (request, reply) => {
    const { id } = await authenticate(request);
    await recruiter(id);
    reply.header('Cache-Control', 'private, no-store');
    return { ...await directoryFacets(db, id), languages: Object.values(languages).map(({ key, label }) => ({ key, label })) };
  });
  app.post('/interest', async (request) => {
    const { id } = await authenticate(request);
    const { company } = await recruiter(id);
    const input = z.object({ handle: candidateHandle, message: z.string().trim().min(1).max(1500) }).parse(request.body);
    await db.$transaction(async (tx) => {
      const candidate = await approvedCandidate(tx, input.handle, id);
      const pair = { recruiterId: id, candidateId: candidate.userId };
      const existing = await tx.practiceRecruiterInterest.findFirst({
        where: pair, orderBy: newestInterest, select: { message: true, createdAt: true },
      });
      const sentAt = new Date();
      if (existing && +sentAt - +existing.createdAt < interestCooldown) {
        if (existing.message === input.message) return;
        throw new AppError(429, 'INTEREST_COOLDOWN', 'You can send this candidate another message after seven days.');
      }
      const notice = await tx.practiceRecruiterInterest.create({
        data: { ...pair, candidateHandle: candidate.handle, message: input.message, createdAt: sentAt }, select: { id: true },
      });
      await notify(tx, [candidate.userId], {
        title: 'A recruiter is interested in you',
        message: company + ': ' + input.message.slice(0, 120),
        link: `${studentPlacement}&message=${notice.id}#recruiter-messages`,
      });
    });
    return { saved: true };
  });
  app.get('/interest', async (request, reply) => {
    const { id } = await authenticate(request);
    const { message } = z.object({ message: z.uuid().optional() }).parse(request.query);
    reply.header('Cache-Control', 'private, no-store');
    return { messages: await db.practiceRecruiterInterest.findMany({
      where: { id: message, candidateId: id, recruiter: { ...studentAccess, practiceRecruiter: { status: 'APPROVED' } } },
      select: { id: true, message: true, createdAt: true, recruiter: { select: { practiceRecruiter: { select: { company: true } } } } },
      orderBy: newestInterest,
    }) };
  });
  app.get('/interests/sent', async (request, reply) => {
    const { id } = await authenticate(request);
    await recruiter(id);
    reply.header('Cache-Control', 'private, no-store');
    return { messages: await db.practiceRecruiterInterest.findMany({
      where: { recruiterId: id }, orderBy: newestInterest, take: 100,
      select: { id: true, candidateHandle: true, message: true, createdAt: true },
    }) };
  });
  app.post('/tests', async (request, reply) => {
    const { id } = await authenticate(request);
    const { company } = await recruiter(id);
    const input = z.object({
      handle: candidateHandle, title: label, minutes: z.number().int().min(5).max(180), problemSlugs: slugs, requestKey: z.uuid().optional(),
    }).parse(request.body);
    const assessmentId = input.requestKey ?? randomUUID();
    const test = await versionTransaction(db, async (tx) => {
      const candidate = await approvedCandidate(tx, input.handle, id);
      const assets = await orderedProblems(input.problemSlugs, tx);
      const data = { id: assessmentId, recruiterId: id, candidateId: candidate.userId, title: input.title, durationMinutes: input.minutes };
      const created = await tx.practiceAssessment.createMany({ data, skipDuplicates: true });
      if (!created.count) {
        const existing = await tx.practiceAssessment.findUnique({ where: { id: assessmentId }, select: {
          recruiterId: true, candidateId: true, title: true, durationMinutes: true,
          problems: { orderBy: { position: 'asc' }, select: { problemId: true } },
        } });
        if (!existing || existing.recruiterId !== id || existing.candidateId !== candidate.userId ||
          existing.title !== input.title || existing.durationMinutes !== input.minutes ||
          existing.problems.length !== assets.length || existing.problems.some((item, index) => item.problemId !== assets[index]!.id)) {
          throw new AppError(409, 'INVITATION_REQUEST_CHANGED', 'Create a new invitation for these details.');
        }
        return { id: assessmentId };
      }
      await tx.practiceAssessmentProblem.createMany({ data: assets.map((row, position) => ({
        assessmentId, problemId: row.id, position, version: row.practiceContract!.contentVersion,
      })) });
      await notify(tx, [candidate.userId], {
        title: 'You’ve received a skills test',
        message: company + ' invited you to ' + input.title + '.',
        link: `${studentPlacement}&assessment=${assessmentId}#skills-tests`,
      });
      return { id: assessmentId };
    });
    return reply.code(201).send(test);
  });
  app.get('/tests', async (request) => {
    const { id } = await authenticate(request);
    const { assessment } = z.object({ assessment: z.uuid().optional() }).parse(request.query);
    const rows = await db.practiceAssessment.findMany({
      where: { id: assessment, OR: [{ candidateId: id }, { recruiterId: id }] }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, recruiterId: true, candidateId: true, title: true, startedAt: true, finishedAt: true, durationMinutes: true,
        problems: { orderBy: { position: 'asc' }, select: { problem: { select: problemView } } }, _count: { select: { solves: true } },
      },
    });
    return { tests: rows.map((row) => {
      const deadline = assessmentDeadline(row);
      const author = row.recruiterId === id;
      const status = row.finishedAt ? 'Submitted' : !deadline ? 'Invited' : +deadline <= Date.now() ? 'Expired' : 'In progress';
      return { id: row.id, title: row.title, author, status, deadline, minutes: row.durationMinutes,
        tasks: author || row.startedAt ? row.problems.map(({ problem }) => problem) : [],
        solved: row._count.solves, total: row.problems.length,
      };
    }) };
  });
  app.post('/tests/:id/start', async (request) => {
    const { id } = await authenticate(request);
    const testId = idSchema.parse(request.params).id;
    await db.practiceAssessment.updateMany({ where: { id: testId, candidateId: id, startedAt: null, finishedAt: null }, data: { startedAt: new Date() } });
    const row = await db.practiceAssessment.findFirst({ where: { id: testId, candidateId: id }, select: { startedAt: true, finishedAt: true, durationMinutes: true } });
    if (!row) missing('Skills test');
    return { deadline: assessmentDeadline(row) };
  });
  app.post('/tests/:id/finish', async (request) => {
    const { id } = await authenticate(request);
    const result = await db.practiceAssessment.updateMany({ where: { id: idSchema.parse(request.params).id, candidateId: id,
      startedAt: { not: null }, finishedAt: null }, data: { finishedAt: new Date() } });
    if (!result.count) missing('Active skills test');
    return { submitted: true };
  });
};
