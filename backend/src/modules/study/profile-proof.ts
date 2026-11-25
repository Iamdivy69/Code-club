import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PracticeProfileProof, Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { levelFor, points } from './progress-metrics.js';

type Options = Omit<PracticeOptions, 'execute'> & { proofSecret?: string };
type DifficultyCounts = Pick<PracticeProfileProof, 'easy' | 'medium' | 'hard'>;
type Progress = { problem: { difficulty: keyof typeof points } };
const solvedProgress = {
  where: { status: 'SOLVED' },
  select: { problem: { select: { difficulty: true } } },
} satisfies Prisma.User$practiceProgressArgs;
const eligibleAccount = { isActive: true, deletedAt: null, approvalStatus: 'APPROVED' } as const;

function counts(progress: Progress[]): DifficultyCounts {
  const total = { easy: 0, medium: 0, hard: 0 };
  for (const { problem } of progress) {
    if (problem.difficulty === 'EASY') total.easy++;
    else if (problem.difficulty === 'MEDIUM') total.medium++;
    else total.hard++;
  }
  return total;
}

function matches(one: DifficultyCounts, other: DifficultyCounts) {
  return one.easy === other.easy && one.medium === other.medium && one.hard === other.hard;
}

function digest(proof: Omit<PracticeProfileProof, 'digest'>, secret: string) {
  const key = createHmac('sha256', secret).update('dsa-v2/practice/profile-proof/v1').digest();
  return createHmac('sha256', key).update(JSON.stringify([
    proof.id, proof.userId, proof.handle, proof.signedAt.toISOString(), proof.easy, proof.medium, proof.hard,
  ])).digest();
}

function valid(proof: PracticeProfileProof, secret: string) {
  return /^[0-9a-f]{64}$/.test(proof.digest) && timingSafeEqual(digest(proof, secret), Buffer.from(proof.digest, 'hex'));
}

function snapshot(proof: PracticeProfileProof) {
  const { id, handle, signedAt, easy, medium, hard } = proof;
  const xp = easy * points.EASY + medium * points.MEDIUM + hard * points.HARD;
  return { id, handle, signedAt: signedAt.toISOString(), easy, medium, hard, solved: easy + medium + hard, xp, level: levelFor(xp) };
}

export const profileProofRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, proofSecret }) => {
  app.post('/profile/sign', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'no-store');
    if (!proofSecret) throw new AppError(503, 'PROOF_UNAVAILABLE', 'Profile signing is unavailable.');
    return db.$transaction(async (tx) => {
      // A profile save locks this same row before revoking obsolete proof links.
      await tx.$queryRaw`SELECT user_id FROM practice_profiles WHERE user_id = ${id}::uuid FOR UPDATE`;
      const profile = await tx.practiceProfile.findFirst({
        where: { userId: id, isPublic: true, user: eligibleAccount },
        select: { handle: true, proof: true, user: { select: { practiceProgress: solvedProgress } } },
      });
      if (!profile) throw new AppError(409, 'PROFILE_PRIVATE', 'Publish your practice profile before signing.');
      const current = counts(profile.user.practiceProgress);
      const previous = profile.proof;
      if (previous && previous.handle === profile.handle && matches(previous, current) && valid(previous, proofSecret)) {
        return snapshot(previous);
      }
      const values = { id: randomUUID(), userId: id, handle: profile.handle, signedAt: new Date(), ...current };
      const signature = digest(values, proofSecret).toString('hex');
      const proof = await tx.practiceProfileProof.upsert({
        where: { userId: id }, create: { ...values, digest: signature }, update: { ...values, digest: signature },
      });
      return snapshot(proof);
    });
  });

  app.get('/profile/verify/:id', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const result = await db.$transaction(async (tx) => {
      const proof = await tx.practiceProfileProof.findFirst({
        where: { id, profile: { isPublic: true, user: eligibleAccount } },
        include: { profile: { select: { handle: true, user: { select: { practiceProgress: solvedProgress } } } } },
      });
      if (!proof || proof.profile.handle !== proof.handle) throw new AppError(404, 'NOT_FOUND', 'Profile verification link unavailable.');
      if (!proofSecret || !valid(proof, proofSecret)) return { status: 'invalid' } as const;
      return { status: matches(proof, counts(proof.profile.user.practiceProgress)) ? 'verified' : 'changed', snapshot: snapshot(proof) } as const;
    }, { isolationLevel: 'RepeatableRead' });
    return result;
  });
};
