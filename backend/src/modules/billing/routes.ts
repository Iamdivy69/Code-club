import { PracticeMembershipPlan } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { recordPracticeAudit } from '../admin/audit.js';
import type { PracticeOptions } from '../practice/routes.js';
import { studentAccess } from '../placement/cohort-roster.js';
import { grantExpiry, lockMembership, membershipLabel, membershipStatus, plans } from './policy.js';

type Options = Omit<PracticeOptions, 'execute'> & { billingEnabled?: boolean };
const reason = z.string().trim().min(3).max(280);
const grantFields = { id: true, plan: true, grantedAt: true, expiresAt: true, reason: true, revokedAt: true, revocationReason: true } as const;

export const billingRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, billingEnabled = false }) => {
  app.get('/plans', async () => ({
    enabled: billingEnabled, checkoutAvailable: false,
    plans: Object.entries(plans).map(([id, plan]) => ({ id, ...plan, currency: 'INR' })),
  }));

  app.get('/membership', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return membershipStatus(db, id, billingEnabled);
  });

  async function requireAdmin(id: string) {
    if (!await db.user.findFirst({ where: { id, role: 'SUPER_ADMIN', ...studentAccess }, select: { id: true } })) {
      throw new AppError(403, 'FORBIDDEN', 'Practice administration is required.');
    }
  }

  app.post('/admin/lookup', async (request, reply) => {
    const { id } = await authenticate(request);
    await requireAdmin(id);
    const { email } = z.object({ email: z.email().max(254).transform((value) => value.toLowerCase()) }).parse(request.body);
    const user = await db.user.findUnique({ where: { email }, select: {
      id: true, name: true, practiceMembershipGrants: {
        select: grantFields, orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }], take: 50,
      },
    } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'No account matches this email.');
    reply.header('Cache-Control', 'private, no-store');
    return { userId: user.id, name: user.name, grants: user.practiceMembershipGrants };
  });

  app.post('/admin/grants', async (request, reply) => {
    const { id } = await authenticate(request);
    await requireAdmin(id);
    const input = z.object({ userId: z.uuid(), requestKey: z.uuid(), plan: z.enum(PracticeMembershipPlan).exclude(['ambassador_reward']), reason }).parse(request.body);
    const grant = await db.$transaction(async (tx) => {
      await lockMembership(tx, input.userId);
      if (!await tx.user.findFirst({ where: { id: input.userId, ...studentAccess }, select: { id: true } })) {
        throw new AppError(404, 'NOT_FOUND', 'An active approved account is required.');
      }
      const now = new Date();
      const created = await tx.practiceMembershipGrant.createMany({ skipDuplicates: true, data: {
        id: input.requestKey, userId: input.userId, plan: input.plan, reason: input.reason, issuedById: id,
        grantedAt: now, expiresAt: grantExpiry(input.plan, now),
      } });
      const matching = await tx.practiceMembershipGrant.findFirst({
        where: { id: input.requestKey, userId: input.userId, issuedById: id, plan: input.plan, reason: input.reason },
        select: grantFields,
      });
      if (!matching) throw new AppError(409, 'GRANT_REQUEST_CHANGED', 'Use a new request for these grant details.');
      if (created.count) await recordPracticeAudit(tx, id, 'practice_membership_granted',
        { id: matching.id, type: 'membership grant', label: membershipLabel(matching.plan) });
      return matching;
    });
    return reply.code(201).send(grant);
  });

  app.post('/admin/grants/:id/revoke', async (request) => {
    const { id } = await authenticate(request);
    await requireAdmin(id);
    const { id: grantId } = z.object({ id: z.uuid() }).parse(request.params);
    const input = z.object({ reason }).parse(request.body);
    return db.$transaction(async (tx) => {
      const grant = await tx.practiceMembershipGrant.findUnique({ where: { id: grantId }, select: { userId: true, plan: true } });
      if (!grant) throw new AppError(404, 'NOT_FOUND', 'Membership grant not found.');
      await lockMembership(tx, grant.userId);
      const revoked = await tx.practiceMembershipGrant.updateMany({
        where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: id, revocationReason: input.reason },
      });
      if (revoked.count) await recordPracticeAudit(tx, id, 'practice_membership_revoked',
        { id: grantId, type: 'membership grant', label: membershipLabel(grant.plan) });
      return tx.practiceMembershipGrant.findUniqueOrThrow({ where: { id: grantId }, select: grantFields });
    });
  });
};
