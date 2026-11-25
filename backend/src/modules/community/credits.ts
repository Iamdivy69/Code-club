import type { Prisma } from '@prisma/client';

type Policy = 'CONTRIBUTION_APPROVED' | 'FEATURE_REQUEST_SHIPPED' | 'REFERRAL_QUALIFIED_REFERRER' | 'REFERRAL_QUALIFIED_REFERRED';

export async function grant(tx: Prisma.TransactionClient, userId: string, eventKey: string, policy: Policy) {
  const raw = process.env['REWARD_AMOUNT_' + policy];
  const amount = Number(raw);
  if (!raw || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) return;
  await tx.practiceCredit.createMany({ data: [{ userId, eventKey, reason: policy, amount }], skipDuplicates: true });
}

export async function qualifyReferral(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const association = await tx.practiceReferral.findUnique({ where: { referredId: userId }, select: { referrerId: true, qualifiedAt: true } });
  if (!association || association.qualifiedAt) return;
  const result = await tx.practiceReferral.updateMany({ where: { referredId: userId, qualifiedAt: null }, data: { qualifiedAt: now } });
  if (!result.count) return;
  await grant(tx, association.referrerId, 'referrer:' + userId, 'REFERRAL_QUALIFIED_REFERRER');
  await grant(tx, userId, 'referred:' + userId, 'REFERRAL_QUALIFIED_REFERRED');
}
