import bcrypt from 'bcrypt';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { recordSignupReferral, referralHandle } from '../modules/community/referrals.js';
import { emailAddress, newPassword } from './account-state.js';
import { independentPracticeBatch, independentPracticeId, independentPracticeName } from '../modules/placement/institution-identity.js';

export const signupInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailAddress,
  password: newPassword,
  referral: referralHandle.optional(),
});

export async function createStandaloneLearner(tx: Prisma.TransactionClient, input: {
  name: string; email: string; passwordHash: string; referral?: string; verified?: boolean;
}) {
  const university = await tx.university.upsert({
    where: { id: independentPracticeId }, update: {},
    create: { id: independentPracticeId, name: independentPracticeName, emailDomains: [] },
    select: { id: true },
  });
  const user = await tx.user.create({
    data: { name: input.name, email: input.email, passwordHash: input.passwordHash, role: 'STUDENT',
      ...(input.verified && { emailVerified: true, emailVerifiedAt: new Date() }),
      student: { create: { universityId: university.id, degree: independentPracticeName, batch: independentPracticeBatch,
        registerNumber: 'P-' + globalThis.crypto.randomUUID() } },
    }, select: { id: true },
  });
  if (input.referral) await recordSignupReferral(tx, user.id, input.referral);
  return user;
}

export async function createStandaloneAccount(db: PrismaClient, input: z.infer<typeof signupInput>) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    await db.$transaction((tx) => createStandaloneLearner(tx, { ...input, passwordHash }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'ACCOUNT_EXISTS', 'This email already has an account.');
    }
    throw error;
  }
}
