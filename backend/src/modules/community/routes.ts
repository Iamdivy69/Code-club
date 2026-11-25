import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { recordPracticeAudit } from '../admin/audit.js';
import type { PracticeOptions } from '../practice/routes.js';
import { grant } from './credits.js';
import { moderationRoutes } from './moderation.js';
import { ambassadorRoutes, createAmbassadorApplication } from './ambassador.js';
import { opportunityFields, opportunityImportRoutes } from './opportunity-import.js';

const idInput = z.object({ id: z.uuid() });
const kind = z.enum(['FEATURE', 'CONTRIBUTION', 'AMBASSADOR']);
const publication = { id: true, kind: true, state: true, title: true, body: true, createdAt: true } as const;
const opportunity = { id: true, title: true, summary: true, company: true, category: true, remote: true, closesAt: true, applyUrl: true } as const;
const reward = { id: true, title: true, details: true, cost: true, stock: true } as const;
const adminOnly = () => new AppError(403, 'FORBIDDEN', 'Practice administration is required.');
const missing = (label: string) => new AppError(404, 'NOT_FOUND', label + ' not found.');

export const communityRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'> & { billingEnabled?: boolean }> = async (app, { authenticate, db, billingEnabled }) => {
  async function admin(userId: string) {
    if (!(await db.user.findFirst({ where: { id: userId, role: 'SUPER_ADMIN' }, select: { id: true } }))) throw adminOnly();
  }
  await app.register(moderationRoutes, { db, authenticate });
  await app.register(opportunityImportRoutes, { db, authenticate });
  await app.register(ambassadorRoutes, { db, authenticate, billingEnabled });
  const activeOpportunity = () => ({ published: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] });

  app.get('/board', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const { id } = await authenticate(request);
    const [entries, mine, role] = await Promise.all([
      db.practicePublication.findMany({
        where: { kind: 'FEATURE', state: { in: ['APPROVED', 'SHIPPED'] } },
        orderBy: { createdAt: 'desc' }, take: 100,
        select: { ...publication, _count: { select: { votes: true } }, votes: { where: { userId: id }, select: { userId: true } } },
      }),
      db.practicePublication.findMany({ where: { authorId: id }, orderBy: { createdAt: 'desc' }, select: { ...publication, payload: true, reviewReason: true }, take: 100 }),
      db.user.findUniqueOrThrow({ where: { id }, select: { role: true } }),
    ]);
    return { admin: role.role === 'SUPER_ADMIN', mine,
      requests: entries.map(({ votes, _count, ...entry }) => ({ ...entry, votes: _count.votes, voted: votes.length > 0 })) };
  });
  app.post('/board', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    const values = z.object({ kind, title: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(15_000) }).parse(request.body);
    const entry = values.kind === 'AMBASSADOR'
      ? await db.$transaction((tx) => createAmbassadorApplication(tx, id, { collegeName: values.title, motivation: values.body }))
      : await db.practicePublication.create({ data: { ...values, authorId: id }, select: publication });
    return reply.code(201).send(entry);
  });
  app.put('/board/:id/vote', async (request) => {
    const { id } = await authenticate(request);
    const entryId = idInput.parse(request.params).id;
    const { voted } = z.object({ voted: z.boolean() }).parse(request.body);
    const entry = await db.practicePublication.findFirst({ where: { id: entryId, kind: 'FEATURE', state: { in: ['APPROVED', 'SHIPPED'] } }, select: { id: true } });
    if (!entry) throw missing('Feature request');
    if (voted) await db.practicePublicationVote.createMany({ data: [{ publicationId: entryId, userId: id }], skipDuplicates: true });
    else await db.practicePublicationVote.deleteMany({ where: { publicationId: entryId, userId: id } });
    return { voted, votes: await db.practicePublicationVote.count({ where: { publicationId: entryId } }) };
  });
  app.post('/board/:id/withdraw', async (request) => {
    const { id } = await authenticate(request);
    const result = await db.practicePublication.updateMany({ where: { id: idInput.parse(request.params).id, authorId: id, state: 'PENDING' }, data: { state: 'WITHDRAWN' } });
    if (!result.count) throw missing('Pending submission');
    return { withdrawn: true };
  });
  app.get('/admin/board', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const { id } = await authenticate(request); await admin(id);
    return { entries: await db.practicePublication.findMany({ where: { OR: [{ state: 'PENDING' }, { state: 'APPROVED', kind: 'FEATURE' }] },
      select: { ...publication, ambassadorCollegeDomain: true, payload: true, reviewReason: true }, orderBy: { createdAt: 'asc' }, take: 200,
    }) };
  });
  app.patch('/admin/board/:id', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    const entryId = idInput.parse(request.params).id;
    const { state, reason } = z.object({ state: z.enum(['APPROVED', 'REJECTED', 'SHIPPED']), reason: z.string().trim().max(500).optional() }).parse(request.body);
    return db.$transaction(async (tx) => {
      const changed = await tx.practicePublication.updateMany({
        where: { id: entryId, ...(state === 'SHIPPED' ? { kind: 'FEATURE', state: 'APPROVED' } : { state: 'PENDING', kind: { not: 'REPORT' } }) },
        data: { state, reviewedAt: new Date(), reviewReason: reason || null },
      });
      if (!changed.count) throw missing('Reviewable submission');
      const entry = await tx.practicePublication.findUniqueOrThrow({ where: { id: entryId }, select: { authorId: true, kind: true, title: true } });
      const rejection = entry.kind === 'AMBASSADOR' && state === 'REJECTED' ? reason || null : null;
      if (rejection) await tx.practicePublication.update({ where: { id: entryId }, data: { ambassadorRejectionReason: rejection } });
      if (entry.kind === 'CONTRIBUTION' && state === 'APPROVED') await grant(tx, entry.authorId, 'contribution:' + entryId, 'CONTRIBUTION_APPROVED');
      if (state === 'SHIPPED') await grant(tx, entry.authorId, 'feature:' + entryId, 'FEATURE_REQUEST_SHIPPED');
      await recordPracticeAudit(tx, id, 'practice_publication_reviewed', { id: entryId, type: 'community submission', label: entry.title, state, reason: reason || undefined });
      return { state };
    });
  });

  app.get('/opportunities', async (request) => {
    const query = z.object({ q: z.string().trim().max(80).optional(), category: opportunityFields.shape.category.optional(), remote: z.enum(['true', 'false']).optional(), closingSoon: z.enum(['true', 'false']).optional() }).parse(request.query);
    return { opportunities: await db.practiceOpportunity.findMany({ where: {
      ...activeOpportunity(), ...(query.category && { category: query.category }), ...(query.remote && { remote: query.remote === 'true' }), ...(query.closingSoon === 'true' && { closesAt: { gt: new Date(), lte: new Date(Date.now() + 7 * 86400000) } }), ...(query.q ? { AND: [{ OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { company: { contains: query.q, mode: 'insensitive' } }] }] } : {}),
    }, orderBy: { createdAt: 'desc' }, take: 100, select: opportunity }) };
  });
  app.post('/opportunities/:id/click', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const result = await db.practiceOpportunity.updateMany({ where: { id: idInput.parse(request.params).id, ...activeOpportunity() }, data: { clicks: { increment: 1 } } });
    if (!result.count) throw missing('Opportunity');
    return { recorded: true };
  });
  app.get('/admin/opportunities', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    const rows = await db.practiceOpportunity.findMany({
      select: { ...opportunity, clicks: true, published: true, sourceUrl: true, verifiedAt: true, importFingerprint: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    });
    return { opportunities: rows.map(({ importFingerprint, ...row }) => ({ ...row, imported: Boolean(importFingerprint) })) };
  });
  app.post('/admin/opportunities', async (request, reply) => {
    const { id } = await authenticate(request); await admin(id);
    const body = opportunityFields.extend({
      published: z.boolean(), closesAt: z.iso.datetime().nullable(),
    }).parse(request.body);
    const created = await db.$transaction(async (tx) => {
      const entry = await tx.practiceOpportunity.create({
        data: { ...body, closesAt: body.closesAt ? new Date(body.closesAt) : null }, select: { id: true },
      });
      await recordPracticeAudit(tx, id, 'practice_opportunity_created',
        { id: entry.id, type: 'opportunity', label: body.title, state: body.published ? 'Published' : 'Draft' });
      return entry;
    });
    return reply.code(201).send(created);
  });
  app.patch('/admin/opportunities/:id', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    const { published } = z.object({ published: z.boolean() }).parse(request.body);
    const { id: entryId } = idInput.parse(request.params);
    return db.$transaction(async (tx) => {
      const entry = await tx.practiceOpportunity.findUnique({ where: { id: entryId }, select: { title: true, importFingerprint: true, verifiedAt: true } });
      if (!entry) throw missing('Opportunity');
      if (published && entry.importFingerprint && !entry.verifiedAt) {
        throw new AppError(409, 'OPPORTUNITY_VERIFICATION_REQUIRED', 'Verify the official source before publishing.');
      }
      const changed = await tx.practiceOpportunity.updateMany({ where: { id: entryId, published: !published }, data: { published } });
      if (changed.count) await recordPracticeAudit(tx, id, published ? 'practice_opportunity_published' : 'practice_opportunity_unpublished',
        { id: entryId, type: 'opportunity', label: entry.title });
      return { published };
    });
  });

  app.get('/credits', async (request) => {
    const { id } = await authenticate(request);
    const [balance, entries, store, redemptions, qualified, referred, profile] = await Promise.all([
      db.practiceCredit.aggregate({ where: { userId: id }, _sum: { amount: true } }),
      db.practiceCredit.findMany({ where: { userId: id }, select: { id: true, reason: true, amount: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.practiceReward.findMany({ where: { available: true }, select: reward, orderBy: { cost: 'asc' } }),
      db.practiceRedemption.findMany({ where: { userId: id }, select: { id: true, state: true, cost: true, reward: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.practiceReferral.count({ where: { referrerId: id, qualifiedAt: { not: null } } }),
      db.practiceReferral.count({ where: { referrerId: id } }),
      db.practiceProfile.findUnique({ where: { userId: id }, select: { handle: true } }),
    ]);
    return { balance: balance._sum.amount ?? 0, entries, store, redemptions, qualified, referred, referral: profile?.handle ?? null };
  });
  app.post('/credits/redeem', async (request) => {
    const { id } = await authenticate(request);
    const { rewardId, requestKey } = z.object({ rewardId: z.uuid(), requestKey: z.uuid() }).parse(request.body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const replay = await tx.practiceRedemption.findUnique({ where: { userId_requestKey: { userId: id, requestKey } }, select: { id: true, rewardId: true, state: true } });
      if (replay) {
        if (replay.rewardId !== rewardId) throw new AppError(409, 'REDEMPTION_CONFLICT', 'That reference was used for another reward.');
        return { id: replay.id, state: replay.state };
      }
      await tx.$queryRaw`SELECT id FROM practice_rewards WHERE id = ${rewardId}::uuid FOR UPDATE`;
      const available = await tx.practiceReward.findUnique({ where: { id: rewardId }, select: { available: true, stock: true, cost: true } });
      if (!available?.available || !available.stock) throw new AppError(409, 'NO_STOCK', 'This reward is unavailable.');
      const balance = await tx.practiceCredit.aggregate({ where: { userId: id }, _sum: { amount: true } });
      if ((balance._sum.amount ?? 0) < available.cost) throw new AppError(409, 'BALANCE', 'There are not enough credits for this reward.');
      const created = await tx.practiceRedemption.create({ data: { userId: id, rewardId, requestKey, cost: available.cost }, select: { id: true, state: true } });
      await tx.practiceReward.update({ where: { id: rewardId }, data: { stock: { decrement: 1 } } });
      await tx.practiceCredit.create({ data: { userId: id, amount: -available.cost, eventKey: 'redeem:' + created.id, reason: 'REDEMPTION' } });
      return created;
    });
  });
  app.post('/credits/redemptions/:id/cancel', async (request) => {
    const { id } = await authenticate(request);
    const redemptionId = idInput.parse(request.params).id;
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const changed = await tx.practiceRedemption.updateMany({ where: { id: redemptionId, userId: id, state: 'PENDING' }, data: { state: 'CANCELLED' } });
      if (!changed.count) throw missing('Pending redemption');
      const row = await tx.practiceRedemption.findUniqueOrThrow({ where: { id: redemptionId }, select: { cost: true, rewardId: true } });
      await tx.practiceReward.update({ where: { id: row.rewardId }, data: { stock: { increment: 1 } } });
      await tx.practiceCredit.create({ data: { userId: id, amount: row.cost, eventKey: 'refund:' + redemptionId, reason: 'REDEMPTION_REFUND' } });
      return { state: 'CANCELLED' };
    });
  });
  app.post('/admin/rewards', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    const data = z.object({ title: z.string().trim().min(3).max(120), details: z.string().trim().min(2).max(1500),
      stock: z.number().int().min(1).max(10000), cost: z.number().int().min(1).max(1_000_000) }).parse(request.body);
    return db.$transaction(async (tx) => {
      const created = await tx.practiceReward.create({ data, select: reward });
      await recordPracticeAudit(tx, id, 'practice_reward_created', { id: created.id, type: 'reward', label: created.title });
      return created;
    });
  });
  app.get('/admin/redemptions', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    return { redemptions: await db.practiceRedemption.findMany({ where: { state: 'PENDING' },
      select: { id: true, cost: true, reward: { select: { title: true } }, user: { select: { name: true, email: true } } }, take: 100 }) };
  });
  app.post('/admin/redemptions/:id/fulfill', async (request) => {
    const { id } = await authenticate(request); await admin(id);
    const { id: redemptionId } = idInput.parse(request.params);
    return db.$transaction(async (tx) => {
      const changed = await tx.practiceRedemption.updateMany({
        where: { id: redemptionId, state: 'PENDING' }, data: { state: 'FULFILLED' },
      });
      if (!changed.count) throw missing('Pending redemption');
      const row = await tx.practiceRedemption.findUniqueOrThrow({
        where: { id: redemptionId }, select: { reward: { select: { title: true } } },
      });
      await recordPracticeAudit(tx, id, 'practice_redemption_fulfilled', { id: redemptionId, type: 'redemption', label: row.reward.title });
      return { fulfilled: true };
    });
  });
};
