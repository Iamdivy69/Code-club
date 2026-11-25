import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const referralHandle = z.string().regex(/^[a-z][a-z0-9-]{2,31}$/);

export async function recordSignupReferral(tx: Prisma.TransactionClient, referredId: string, handle: string) {
  const referrer = await tx.practiceProfile.findFirst({
    where: {
      handle, userId: { not: referredId },
      user: { isActive: true, deletedAt: null, approvalStatus: 'APPROVED' },
    },
    select: { userId: true },
  });
  if (referrer) await tx.practiceReferral.create({ data: { referredId, referrerId: referrer.userId } });
}
