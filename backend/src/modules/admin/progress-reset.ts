import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { requirePracticeAdmin } from './access.js';
import { recordPracticeAudit } from './audit.js';

export async function lockPracticeProgress(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}
async function preview(tx: Prisma.TransactionClient, userId: string) {
  const account = await tx.user.findFirst({ where: { id: userId, role: 'STUDENT', deletedAt: null }, select: { id: true, email: true } });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Learner account not found.');
  const [progress, submissions, certificates, latest] = await Promise.all([
    tx.practiceProgress.findMany({ where: { userId }, orderBy: { problemId: 'asc' } }),
    tx.practiceSubmission.count({ where: { userId } }), tx.practiceCertificate.count({ where: { userId } }),
    tx.practiceProgressEpoch.findUnique({ where: { userId }, select: { resetId: true } }),
  ]);
  const digest = createHash('sha256').update(JSON.stringify({ account, progress, submissions, certificates, latest })).digest('hex');
  return { userId, email: account.email, problems: progress.length, solved: progress.filter(p => p.firstSolvedAt).length,
    retainedSubmissions: submissions, retainedCertificates: certificates, assignments: 'retained' as const, legacyProgress: 'retained' as const, digest };
}
export const progressResetRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  const params = z.object({ userId: z.uuid() });
  app.get('/admin/accounts/:userId/reset-preview', async (request, reply) => {
    const actor = await authenticate(request); await requirePracticeAdmin(db, actor.id);
    reply.header('Cache-Control', 'private, no-store');
    return preview(db, params.parse(request.params).userId);
  });
  app.post('/admin/accounts/:userId/reset', async (request, reply) => {
    const actor = await authenticate(request);
    const { userId } = params.parse(request.params);
    const input = z.strictObject({ requestKey: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('RESET PRACTICE'), reason: z.string().trim().min(3).max(240) }).parse(request.body);
    reply.header('Cache-Control', 'private, no-store');
    return db.$transaction(async (tx) => {
      await requirePracticeAdmin(tx, actor.id);
      await lockPracticeProgress(tx, userId);
      const previous = await tx.practiceProgressReset.findUnique({ where: { id: input.requestKey } });
      if (previous) {
        if (previous.userId !== userId || previous.actorId !== actor.id) throw new AppError(409, 'RESET_CONFLICT', 'That request belongs to another reset.');
        return previous;
      }
      const current = await preview(tx, userId);
      if (current.digest !== input.digest) throw new AppError(409, 'PROGRESS_CHANGED', 'Progress changed. Preview the reset again.');
      await tx.practiceProgress.deleteMany({ where: { userId } });
      await tx.practiceProfileProof.deleteMany({ where: { userId } });
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const resetAt = clock!.now;
      const receipt = await tx.practiceProgressReset.create({ data: { id: input.requestKey, userId, actorId: actor.id, resetAt, snapshot: current } });
      await tx.practiceProgressEpoch.upsert({ where: { userId }, create: { userId, resetId: receipt.id, resetAt }, update: { resetId: receipt.id, resetAt } });
      await recordPracticeAudit(tx, actor.id, 'practice_progress_reset', { id: userId, type: 'account', label: current.email, reason: input.reason });
      return receipt;
    });
  });
};
