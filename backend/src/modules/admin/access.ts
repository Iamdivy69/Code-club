import type { Prisma } from '@prisma/client';
import { AppError } from '../../errors.js';
import { studentAccess } from '../placement/cohort-roster.js';

export async function requirePracticeAdmin(db: Prisma.TransactionClient, id: string) {
  if (!await db.user.findFirst({ where: { id, role: 'SUPER_ADMIN', ...studentAccess }, select: { id: true } })) {
    throw new AppError(403, 'FORBIDDEN', 'Practice administration is required.');
  }
}
