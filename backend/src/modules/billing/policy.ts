import type { Prisma, PrismaClient, PracticeMembershipPlan } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { dayMs } from '../study/progress-metrics.js';
import { practiceProfileReport } from '../study/profile-report.js';

export const billingSettings = {
  PRACTICE_BILLING_ENABLED: z.preprocess((value) => value || undefined,
    z.enum(['true', 'false']).transform((value) => value === 'true').optional()),
};

export const plans = {
  pro_monthly: { label: 'Pro Monthly', amountPaise: 19_900, durationDays: 30 },
  pro_yearly: { label: 'Pro Yearly', amountPaise: 199_900, durationDays: 365 },
  founding_lifetime: { label: 'Founding Lifetime', amountPaise: 199_900, durationDays: null },
  lifetime: { label: 'Lifetime', amountPaise: 299_900, durationDays: null },
} satisfies Record<Exclude<PracticeMembershipPlan, 'ambassador_reward'>, { label: string; amountPaise: number; durationDays: number | null }>;

export const membershipLabel = (plan: PracticeMembershipPlan) => plan === 'ambassador_reward' ? 'Ambassador reward' : plans[plan].label;

export function grantExpiry(plan: keyof typeof plans, now: Date) {
  const days = plans[plan].durationDays;
  return days === null ? null : new Date(+now + days * dayMs);
}

export async function lockMembership(db: Prisma.TransactionClient, userId: string) {
  await db.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

export function activeMembership(db: Prisma.TransactionClient, userId: string, now = new Date()) {
  return db.practiceMembershipGrant.findFirst({
    where: { userId, revokedAt: null, grantedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ expiresAt: { sort: 'desc', nulls: 'first' } }, { grantedAt: 'desc' }, { id: 'desc' }],
    select: { plan: true, expiresAt: true },
  });
}

/** Editorial access is based on retained learning history, independently of personal XP resets. */
export async function editorialAccess(db: Prisma.TransactionClient, userId: string, problemId: string) {
  const actor = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (actor?.role === 'SUPER_ADMIN' || actor?.role === 'ADMIN') return true;
  if (await activeMembership(db, userId)) return true;
  if (await db.practiceSubmission.findFirst({ where: { userId, problemId, verdict: 'ACCEPTED' }, select: { id: true } })) return true;
  return Boolean(await db.studentProgress.findFirst({ where: { studentId: userId, problemId, status: 'SOLVED' }, select: { problemId: true } }));
}
function billingMonth(now: Date) {
  return now.toISOString().slice(0, 7);
}

export async function membershipStatus(db: PrismaClient, userId: string, enabled: boolean) {
  const now = new Date();
  const [grant, consumed] = await Promise.all([
    activeMembership(db, userId, now),
    enabled ? db.practiceProfileDownload.findUnique({ where: { userId }, select: { month: true } }) : null,
  ]);
  const month = billingMonth(now);
  return {
    enabled, plan: grant?.plan ?? 'free', expiresAt: grant?.expiresAt ?? null,
    profilePdf: { remaining: !enabled || grant ? null : consumed?.month === month ? 0 : 1, month },
  };
}

export async function downloadActivityReport(db: PrismaClient, userId: string, enabled: boolean, requestKey: string) {
  if (!enabled) return practiceProfileReport(db, userId);
  return db.$transaction(async (tx) => {
    await lockMembership(tx, userId);
    const now = new Date();
    if (await activeMembership(tx, userId, now)) return practiceProfileReport(tx, userId);
    const month = billingMonth(now);
    const prior = await tx.practiceProfileDownload.findUnique({ where: { userId } });
    if (prior?.month === month) {
      if (prior.requestKey === requestKey) return prior.snapshot;
      throw new AppError(402, 'ACTIVITY_DOWNLOAD_LIMIT', 'Your free activity report has already been downloaded this month.');
    }
    const snapshot = await practiceProfileReport(tx, userId);
    const download = { month, requestKey, snapshot };
    await tx.practiceProfileDownload.upsert({ where: { userId }, create: { userId, ...download }, update: download });
    return snapshot;
  });
}
