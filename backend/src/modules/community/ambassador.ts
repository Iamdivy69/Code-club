import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { recordPracticeAudit } from '../admin/audit.js';
import { activeMembership, lockMembership } from '../billing/policy.js';
import type { PracticeOptions } from '../practice/routes.js';
import { dayMs } from '../study/progress-metrics.js';

const milestones = {
  '5_referrals': { threshold: 5, rewardDays: 14 },
  '10_referrals': { threshold: 10, rewardDays: 30 },
  '25_referrals': { threshold: 25, rewardDays: 90 },
} as const;
const milestoneId = z.enum(['5_referrals', '10_referrals', '25_referrals']);
const requestApplication = z.object({
  collegeName: z.string().trim().min(2).max(200),
  collegeDomain: z.string().trim().toLowerCase().max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  motivation: z.string().trim().max(1000).default(''),
});
const publicationFields = { id: true, kind: true, title: true, body: true, state: true, createdAt: true } as const;
const ambassadorFields = {
  ...publicationFields, ambassadorCollegeName: true, ambassadorCollegeDomain: true, ambassadorRejectionReason: true,
} as const;
const notApproved = () => new AppError(403, 'AMBASSADOR_APPROVAL_REQUIRED', 'Your ambassador application needs approval.');

export async function createAmbassadorApplication(db: Prisma.TransactionClient, userId: string, values: {
  collegeName: string; collegeDomain?: string; motivation: string;
}) {
  await lockMembership(db, userId);
  const existing = await db.practicePublication.findFirst({
    where: { authorId: userId, kind: 'AMBASSADOR', state: { in: ['PENDING', 'APPROVED', 'REJECTED'] } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'AMBASSADOR_ALREADY_APPLIED', 'You already have an ambassador application.');
  return db.practicePublication.create({
    data: {
      authorId: userId, kind: 'AMBASSADOR', title: values.collegeName.slice(0, 120), body: values.motivation,
      ambassadorCollegeName: values.collegeName, ambassadorCollegeDomain: values.collegeDomain,
    },
    select: publicationFields,
  });
}

function approvedApplication(db: Prisma.TransactionClient, authorId: string) {
  return db.practicePublication.findFirst({
    where: { authorId, kind: 'AMBASSADOR', state: 'APPROVED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: ambassadorFields,
  });
}

async function referralLinkCode(db: Prisma.TransactionClient, userId: string) {
  const existing = await db.practiceProfile.findUnique({ where: { userId }, select: { handle: true } });
  if (existing) return existing.handle;
  const handle = 'amb-' + randomUUID().replace(/-/g, '').slice(0, 28);
  await db.practiceProfile.createMany({ data: [{ userId, handle }], skipDuplicates: true });
  return (await db.practiceProfile.findUnique({ where: { userId }, select: { handle: true } }))?.handle ?? null;
}

function rewardTotal(rows: { rewardDays: number }[]) {
  return rows.reduce((total, row) => total + row.rewardDays, 0);
}

type Options = Omit<PracticeOptions, 'execute'> & { billingEnabled?: boolean };
export const ambassadorRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, billingEnabled = false }) => {
  app.get('/ambassador', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    const approved = await approvedApplication(db, id);
    const application = approved ?? await db.practicePublication.findFirst({
      where: { authorId: id, kind: 'AMBASSADOR', state: { in: ['PENDING', 'REJECTED'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: ambassadorFields,
    });
    const status = application && {
      id: application.id, state: application.state, collegeName: application.ambassadorCollegeName ?? application.title,
      collegeDomain: application.ambassadorCollegeDomain, appliedAt: application.createdAt,
      rejectionReason: application.ambassadorRejectionReason,
    };
    if (!approved) return { application: status, dashboard: null };
    const [referral, referred, claims] = await Promise.all([
      referralLinkCode(db, id),
      db.practiceReferral.count({ where: { referrerId: id } }),
      db.practiceAmbassadorClaim.findMany({ where: { userId: id }, select: { milestoneId: true, rewardDays: true, activatedAt: true } }),
    ]);
    return {
      application: status,
      dashboard: {
        referral, referred, billingEnabled, earnedDays: rewardTotal(claims),
        bankedDays: rewardTotal(claims.filter(({ activatedAt }) => !activatedAt)),
        milestones: Object.entries(milestones).map(([id, item]) => ({
          id, ...item, achieved: referred >= item.threshold, claimed: claims.some((row) => row.milestoneId === id),
        })),
      },
    };
  });

  app.post('/ambassador/apply', async (request, reply) => {
    const { id } = await authenticate(request);
    const input = requestApplication.parse(request.body);
    const application = await db.$transaction((tx) => createAmbassadorApplication(tx, id, input));
    return reply.code(201).send(application);
  });

  app.post('/ambassador/claim', async (request) => {
    const { id } = await authenticate(request);
    const { milestone } = z.object({ milestone: milestoneId }).parse(request.body);
    const item = milestones[milestone];
    return db.$transaction(async (tx) => {
      await lockMembership(tx, id);
      const application = await approvedApplication(tx, id);
      if (!application) throw notApproved();
      const prior = await tx.practiceAmbassadorClaim.findUnique({ where: { userId_milestoneId: { userId: id, milestoneId: milestone } } });
      if (prior) return { milestone, rewardDays: prior.rewardDays };
      const referred = await tx.practiceReferral.count({ where: { referrerId: id } });
      if (referred < item.threshold) {
        throw new AppError(409, 'AMBASSADOR_MILESTONE_PENDING', 'This milestone requires ' + item.threshold + ' referral signups.');
      }
      await tx.practiceAmbassadorClaim.create({ data: { userId: id, milestoneId: milestone, rewardDays: item.rewardDays } });
      await recordPracticeAudit(tx, id, 'practice_ambassador_claimed', {
        id: application.id, type: 'ambassador application', label: item.threshold + ' referral signups', state: item.rewardDays + ' days earned',
      });
      return { milestone, rewardDays: item.rewardDays };
    });
  });

  app.post('/ambassador/activate', async (request) => {
    const { id } = await authenticate(request);
    if (!billingEnabled) throw new AppError(409, 'AMBASSADOR_ACTIVATION_DISABLED', 'Access-day activation is unavailable. Your earned days are saved.');
    return db.$transaction(async (tx) => {
      await lockMembership(tx, id);
      if (!await approvedApplication(tx, id)) throw notApproved();
      const now = new Date();
      const current = await activeMembership(tx, id, now);
      const pending = await tx.practiceAmbassadorClaim.findMany({ where: { userId: id, activatedAt: null }, select: { rewardDays: true } });
      const rewardDays = rewardTotal(pending);
      if (!rewardDays) return { activatedDays: 0, expiresAt: current?.expiresAt ?? null };
      if (current && !current.expiresAt) throw new AppError(409, 'AMBASSADOR_LIFETIME_ACCESS', 'You already have lifetime access. Your earned days are saved.');
      const tail = await tx.practiceMembershipGrant.findFirst({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' }, select: { expiresAt: true },
      });
      const startsAt = tail?.expiresAt ?? now;
      const expiresAt = new Date(startsAt.getTime() + rewardDays * dayMs);
      const grantId = randomUUID();
      await tx.practiceMembershipGrant.create({ data: {
        id: grantId, userId: id, plan: 'ambassador_reward', grantedAt: startsAt, expiresAt,
        reason: rewardDays + ' earned ambassador access days',
      } });
      await tx.practiceAmbassadorClaim.updateMany({ where: { userId: id, activatedAt: null }, data: { grantId, activatedAt: now } });
      await recordPracticeAudit(tx, id, 'practice_ambassador_activated', {
        id: grantId, type: 'membership grant', label: 'Ambassador reward', state: rewardDays + ' days activated',
      });
      return { activatedDays: rewardDays, expiresAt };
    });
  });
};
