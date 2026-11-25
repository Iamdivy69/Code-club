import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import { studentAccess } from './cohort-roster.js';
import { notify } from '../notifications/service.js';

const verifiedUser = { role: 'TEACHER', emailVerified: true, ...studentAccess } as const;
const verifiedTeacher = { university: { isActive: true }, user: verifiedUser } as const;
const userSummary = { id: true, name: true, email: true } as const;
const universitySummary = { id: true, name: true } as const;

export async function teachingScope(db: Prisma.TransactionClient, id: string) {
  const teacher = await db.teacher.findFirst({
    where: { ...verifiedTeacher, userId: id },
    select: { universityId: true, practicePlacementMember: { select: { universityId: true } } },
  });
  if (!teacher) throw new AppError(403, 'FORBIDDEN', 'A verified DSA teacher account is required.');
  return { universityId: teacher.universityId, member: teacher.practicePlacementMember?.universityId === teacher.universityId };
}

export async function lockTeachingScope(tx: Prisma.TransactionClient, id: string) {
  const { universityId } = await teachingScope(tx, id);
  await tx.$queryRaw`SELECT id FROM universities WHERE id = ${universityId}::uuid FOR SHARE`;
  const scope = await teachingScope(tx, id);
  if (scope.universityId !== universityId) throw new AppError(409, 'UNIVERSITY_CHANGED', 'Your university changed. Refresh and try again.');
  return scope;
}

function forbidden(): never {
  throw new AppError(403, 'FORBIDDEN', 'Only the placement team lead or a super admin can manage this team.');
}

function missingMember(): never {
  throw new AppError(404, 'NOT_FOUND', 'An eligible teacher was not found on this university team.');
}

async function teamScope(db: Prisma.TransactionClient, actor: string, requested?: string) {
  const user = await db.user.findFirst({ where: { id: actor, ...studentAccess }, select: { role: true } });
  if (!user) return forbidden();
  if (user.role === 'SUPER_ADMIN') {
    if (!requested) throw new AppError(400, 'UNIVERSITY_REQUIRED', 'Choose a university.');
    return { universityId: requested, admin: true, member: true };
  }
  const scope = await teachingScope(db, actor);
  if (requested && requested !== scope.universityId) return forbidden();
  return { ...scope, admin: false };
}

async function requireUniversity(db: Prisma.TransactionClient, id: string) {
  const university = await db.university.findFirst({ where: { id, isActive: true }, select: universitySummary });
  if (!university) throw new AppError(404, 'NOT_FOUND', 'University not found.');
  return university;
}

export async function placementReportUniversity(db: Prisma.TransactionClient, actor: string, requested?: string) {
  const { universityId, member } = await teamScope(db, actor, requested);
  if (!member) throw new AppError(403, 'FORBIDDEN', 'Placement team access is required to view reports.');
  return requireUniversity(db, universityId);
}

const leadNotice = { title: 'You are the placement team lead', message: 'You can manage membership and transfer leadership for your university.' };
const teamNotices = {
  invite: { title: 'Added to the placement team', message: 'You can now manage cohorts and view readiness reports for your university.' },
  remove: { title: 'Placement team access removed', message: 'Your team access has changed. You can still manage the DSA classes you own.' },
  transfer: leadNotice,
  designate: leadNotice,
} as const;

type TeamAction =
  | { type: 'designate'; email: string; expectedPrimary: string | null }
  | { type: 'invite'; email: string }
  | { type: 'transfer'; userId: string; expectedPrimary: string }
  | { type: 'remove'; userId: string };

export function placementTeam(db: PrismaClient) {
  return {
    async universities(actor: string, search: string) {
      const admin = await db.user.findFirst({ where: { id: actor, role: 'SUPER_ADMIN', ...studentAccess }, select: { id: true } });
      if (!admin) return forbidden();
      return db.university.findMany({
        where: { isActive: true, ...(search && { name: { contains: search, mode: 'insensitive' } }) },
        orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 50, select: universitySummary,
      });
    },
    async read(actor: string, requested?: string) {
      const { universityId, admin, member } = await teamScope(db, actor, requested);
      const university = await requireUniversity(db, universityId);
      const rows = !member ? [] : await db.practicePlacementMember.findMany({
        where: { universityId, teacher: { universityId } },
        orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }, { userId: 'asc' }],
        select: { isPrimary: true, joinedAt: true, teacher: { select: {
          user: { select: { ...userSummary, role: true, isActive: true, emailVerified: true, approvalStatus: true, deletedAt: true } },
        } } },
      });
      const members = rows.map(({ teacher: { user }, isPrimary, joinedAt }) => ({
        id: user.id, name: user.name, email: user.email, isPrimary, joinedAt,
        eligible: user.role === 'TEACHER' && user.emailVerified && user.isActive && user.approvalStatus === 'APPROVED' && !user.deletedAt,
      }));
      const primary = members.find((item) => item.isPrimary);
      return { university, member, actor, canManage: admin || primary?.id === actor,
        canDesignate: admin && !primary?.eligible, primaryId: primary?.id ?? null, members };
    },
    async change(actor: string, requested: string | undefined, action: TeamAction) {
      return db.$transaction(async (tx) => {
        const { universityId } = await teamScope(tx, actor, requested);
        await tx.$queryRaw`SELECT id FROM universities WHERE id = ${universityId}::uuid FOR UPDATE`;
        const scope = await teamScope(tx, actor, requested);
        if (scope.universityId !== universityId) return forbidden();
        await requireUniversity(tx, universityId);
        const primary = await tx.practicePlacementMember.findFirst({
          where: { universityId, isPrimary: true },
          select: { userId: true, teacher: { select: { universityId: true, user: { select: {
            role: true, emailVerified: true, isActive: true, approvalStatus: true, deletedAt: true,
          } } } } },
        });
        if (!scope.admin && (!scope.member || actor !== primary?.userId)) return forbidden();
        if (action.type === 'designate' && !scope.admin) return forbidden();

        let userId: string;
        if (action.type === 'invite' || action.type === 'designate') {
          const target = await tx.teacher.findFirst({
            where: { ...verifiedTeacher, universityId, user: { ...verifiedUser, email: action.email } }, select: { userId: true },
          });
          if (!target) return missingMember();
          userId = target.userId;
        } else {
          userId = action.userId;
        }
        const existing = await tx.practicePlacementMember.findUnique({ where: { userId }, select: {
          universityId: true, teacher: { select: { universityId: true } },
        } });

        switch (action.type) {
          case 'invite':
            if (existing?.universityId === universityId) throw new AppError(409, 'ALREADY_ON_TEAM', 'This teacher is already on the placement team.');
            await tx.practicePlacementMember.upsert({ where: { userId }, create: { userId, universityId },
              update: { universityId, isPrimary: false, joinedAt: new Date() } });
            break;
          case 'remove':
            if (existing?.universityId !== universityId || existing.teacher.universityId !== universityId) return missingMember();
            if (userId === primary?.userId) {
              const others = await tx.practicePlacementMember.count({ where: { universityId, userId: { not: userId }, teacher: { universityId } } });
              if (!scope.admin || others) throw new AppError(409, 'PRIMARY_REQUIRED', 'Transfer the team lead role before removing this member.');
            }
            await tx.practicePlacementMember.delete({ where: { userId } });
            break;
          case 'transfer':
          case 'designate': {
            const inUniversity = primary?.teacher.universityId === universityId;
            if (action.expectedPrimary !== (inUniversity ? primary!.userId : null)) {
              throw new AppError(409, 'PRIMARY_CHANGED', 'The team lead changed. Refresh and try again.');
            }
            if (action.type === 'designate' && inUniversity) {
              const user = primary!.teacher.user;
              if (user.role === 'TEACHER' && user.emailVerified && user.isActive && user.approvalStatus === 'APPROVED' && !user.deletedAt) {
                throw new AppError(409, 'PRIMARY_EXISTS', 'This university already has a team lead.');
              }
            }
            if (action.type === 'transfer') {
              if (existing?.universityId !== universityId || userId === primary?.userId) return missingMember();
              const eligible = await tx.teacher.findFirst({
                where: { ...verifiedTeacher, userId, universityId }, select: { userId: true },
              });
              if (!eligible) return missingMember();
            }
            if (primary) await tx.practicePlacementMember.update({ where: { userId: primary.userId }, data: { isPrimary: false } });
            await tx.practicePlacementMember.upsert({
              where: { userId }, create: { userId, universityId, isPrimary: true },
              update: { universityId, isPrimary: true },
            });
            break;
          }
        }
        await tx.auditLog.create({ data: { userId: actor, eventType: 'practice_placement_team_' + action.type,
          resourceType: 'university', resourceId: universityId, metadata: { teacherId: userId } } });
        await notify(tx, [userId], { ...teamNotices[action.type], link: '/practice/placement?view=team' });
        return { userId };
      });
    },
  };
}
