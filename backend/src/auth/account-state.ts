import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const emailAddress = z.email().max(254).transform((value) => value.toLowerCase());
export const newPassword = z.string().min(12).refine((value) => Buffer.byteLength(value, 'utf8') <= 72);
export const enabledAccount = {
  isActive: true, deletedAt: null, approvalStatus: 'APPROVED',
} satisfies Prisma.UserWhereInput;

export async function lockAccount(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
}
