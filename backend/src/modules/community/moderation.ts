import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { requirePracticeAdmin } from '../admin/access.js';
import { recordPracticeAudit } from '../admin/audit.js';
import { problemSlug } from '../practice/problem-spec.js';
import type { PracticeOptions } from '../practice/routes.js';

const testcase = z.object({ input: z.record(z.string(), z.json()), expectedOutput: z.json() });
export const contributionInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('new_problem'), title: z.string().trim().min(3).max(120),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']), topic: z.string().trim().min(2).max(50),
    functionName: z.string().regex(/^[A-Za-z_$][\w$]*$/).max(100),
    statement: z.string().trim().min(10).max(10000),
    examples: z.array(z.object({ input: z.string().min(1).max(2000), output: z.string().min(1).max(2000), explanation: z.string().max(2000).optional() })).min(1).max(10),
    testcases: z.array(testcase).min(1).max(25) }),
  z.object({ type: z.literal('testcase_improvement'), problemSlug,
    testcases: z.array(testcase).min(1).max(25), reason: z.string().trim().min(10).max(2000) }),
]);
const target = z.object({ targetType: z.enum(['FEATURE', 'OPPORTUNITY']), targetId: z.uuid() });
const reportInput = target.extend({ reason: z.string().trim().min(10).max(1000) });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Published community item not found.');

export const moderationRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.post('/contributions', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    const payload = contributionInput.parse(request.body);
    if (payload.type === 'testcase_improvement' && !await db.problem.findFirst({
      where: { slug: payload.problemSlug, isPublished: true, practiceContract: { enabled: true, contestOnly: false } }, select: { id: true },
    })) throw new AppError(404, 'NOT_FOUND', 'Published practice problem not found.');
    reply.header('Cache-Control', 'private, no-store');
    const entry = await db.practicePublication.create({ data: {
      authorId: id, kind: 'CONTRIBUTION', payload,
      title: payload.type === 'new_problem' ? payload.title : ('Testcase improvement: ' + payload.problemSlug).slice(0, 120),
      body: payload.type === 'new_problem' ? payload.statement : payload.reason,
    }, select: { id: true, kind: true, state: true, title: true, body: true, createdAt: true, payload: true } });
    return reply.code(201).send(entry);
  });
  app.post('/reports', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    const input = reportInput.parse(request.body);
    const entry = await db.$transaction(async tx => {
      // Serialize retries for this reporter; no duplicate pending review for the same target.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const visible = input.targetType === 'FEATURE'
        ? await tx.practicePublication.findFirst({ where: { id: input.targetId, kind: 'FEATURE', state: { in: ['APPROVED', 'SHIPPED'] } }, select: { title: true } })
        : await tx.practiceOpportunity.findFirst({ where: { id: input.targetId, published: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] }, select: { title: true } });
      if (!visible) throw notFound();
      const existing = await tx.practicePublication.findFirst({ where: { authorId: id, kind: 'REPORT', state: 'PENDING', AND: [
        { payload: { path: ['targetType'], equals: input.targetType } }, { payload: { path: ['targetId'], equals: input.targetId } },
      ] }, select: { id: true, state: true } });
      return existing ?? tx.practicePublication.create({ data: { authorId: id, kind: 'REPORT',
        title: ('Report: ' + visible.title).slice(0, 120), body: input.reason,
        payload: { targetType: input.targetType, targetId: input.targetId },
      }, select: { id: true, state: true } });
    });
    reply.header('Cache-Control', 'private, no-store');
    return reply.code(201).send(entry);
  });
  app.patch('/admin/reports/:id', async (request, reply) => {
    const { id: actor } = await authenticate(request);
    await requirePracticeAdmin(db, actor);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { state, reason } = z.object({ state: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(3).max(1000) }).parse(request.body);
    reply.header('Cache-Control', 'private, no-store');
    return db.$transaction(async tx => {
      await requirePracticeAdmin(tx, actor);
      const entry = await tx.practicePublication.findFirst({ where: { id, kind: 'REPORT' }, select: { id: true, title: true, state: true, payload: true } });
      if (!entry) throw new AppError(404, 'NOT_FOUND', 'Community report not found.');
      if (entry.state !== 'PENDING') throw new AppError(409, 'REPORT_REVIEWED', 'This report has already been reviewed.');
      const reference = target.parse(entry.payload);
      const changed = await tx.practicePublication.updateMany({ where: { id, kind: 'REPORT', state: 'PENDING' },
        data: { state, reviewedAt: new Date(), reviewReason: reason } });
      if (!changed.count) throw new AppError(409, 'REPORT_REVIEWED', 'This report has already been reviewed.');
      if (state === 'APPROVED') {
        const removed = reference.targetType === 'FEATURE'
          ? await tx.practicePublication.updateMany({ where: { id: reference.targetId, kind: 'FEATURE', state: { in: ['APPROVED', 'SHIPPED'] } }, data: { state: 'WITHDRAWN', reviewedAt: new Date(), reviewReason: reason } })
          : await tx.practiceOpportunity.updateMany({ where: { id: reference.targetId, published: true }, data: { published: false } });
        if (removed.count) await recordPracticeAudit(tx, actor, 'practice_publication_removed', {
          id: reference.targetId, type: reference.targetType === 'FEATURE' ? 'feature request' : 'opportunity', reason,
        });
      }
      await recordPracticeAudit(tx, actor, 'practice_report_reviewed', { id, type: 'community report', label: entry.title, state, reason });
      return { state, removed: state === 'APPROVED' };
    });
  });
};
