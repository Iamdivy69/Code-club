import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { coachingConnection, parseCompletionJson, structuredCompletion } from '../ai/structured-completion.js';
import { activeMembership, lockMembership } from '../billing/policy.js';
import { dayMs, localDay } from '../study/progress-metrics.js';
import type { SolverHint, SolverHintStatus } from './contracts.js';
import { getProblem } from './repository.js';
import type { PracticeOptions } from './routes.js';

const levelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const hintOutput = z.strictObject({ hint: z.string().trim().min(1).max(1500).refine((hint) => !/\x60{3}/.test(hint)) });
const levels = {
  1: 'Give one directional sentence of at most 30 words. Lead the learner toward an observation without naming the algorithm or data structure.',
  2: 'Give two or three sentences that name the key algorithm pattern or data structure and explain why it fits.',
  3: 'Give three to five numbered steps in plain English so the learner can implement the approach.',
};
const system = [
  'You are a data structures and algorithms tutor. Use only the public problem information supplied as JSON data.',
  'Give only the requested depth. Do not write code or pseudocode. Return a JSON object with exactly one field called hint, containing plain text.',
].join(' ');
const dailyLimit = 3;
const ttl = 30 * dayMs;

function dayWindow(now: Date) {
  const day = localDay(now);
  const resetAt = new Date(Date.parse(day + 'T00:00:00+05:30') + dayMs).toISOString();
  return { day, resetAt };
}

async function getAllowance(db: Prisma.TransactionClient, userId: string, billingEnabled: boolean, now: Date) {
  if (!billingEnabled || await activeMembership(db, userId, now)) return { remaining: null, resetAt: null };
  const { day, resetAt } = dayWindow(now);
  const tally = await db.practiceHintAllowance.findUnique({ where: { userId_day: { userId, day } }, select: { used: true } });
  return { remaining: dailyLimit - (tally?.used ?? 0), resetAt };
}

const limitReached = () => new AppError(402, 'AI_HINT_DAILY_LIMIT', 'You’ve used your three AI hints for today.');
const pendingHint = () => new AppError(409, 'AI_HINT_GENERATING', 'This hint is being prepared. Try again shortly.');

async function deliver(db: PrismaClient, userId: string, billingEnabled: boolean) {
  if (!billingEnabled) return { remaining: null, resetAt: null };
  return db.$transaction(async (tx) => {
    await lockMembership(tx, userId);
    const now = new Date();
    const allowance = await getAllowance(tx, userId, true, now);
    if (allowance.remaining === null) return allowance;
    if (allowance.remaining < 1) throw limitReached();
    const day = localDay(now);
    await tx.practiceHintAllowance.upsert({
      where: { userId_day: { userId, day } }, create: { userId, day, used: 1 }, update: { used: { increment: 1 } },
    });
    return { ...allowance, remaining: allowance.remaining - 1 };
  });
}

async function solverHint(db: PrismaClient, item: Awaited<ReturnType<typeof getProblem>>, level: z.infer<typeof levelSchema>,
  connection: NonNullable<ReturnType<typeof coachingConnection>>) {
  const visible = {
    title: item.title.slice(0, 300), topic: item.topic.slice(0, 100), difficulty: item.difficulty,
    description: item.description.slice(0, 8000), constraints: (item.constraints ?? '').slice(0, 2400),
  };
  const contextKey = createHash('sha256').update(JSON.stringify([item.contract.contentVersion, connection.model, system, levels[level], visible])).digest('hex');
  const key = { problemId: item.id, contextKey, level };
  const lookup = { problemId_contextKey_level: key };
  const now = new Date();
  const token = randomUUID();
  const claim = await db.$transaction(async (tx) => {
    await tx.practiceHintCache.createMany({ data: [key], skipDuplicates: true });
    const { count } = await tx.practiceHintCache.updateMany({
      where: { ...key, AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { lte: now } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      ] },
      data: { leaseToken: token, leaseUntil: new Date(+now + 60_000) },
    });
    if (count) return { reserved: true, cached: null };
    const row = await tx.practiceHintCache.findUnique({ where: lookup, select: { hint: true, expiresAt: true } });
    return { reserved: false, cached: row?.hint && row.expiresAt && row.expiresAt > now ? row.hint : null };
  });
  if (claim.cached) return { hint: claim.cached, cached: true };
  if (!claim.reserved) throw pendingHint();
  const owner = { ...key, leaseToken: token };
  let hint: string;
  try {
    const output = await structuredCompletion(connection, { instructions: system + ' ' + levels[level], data: JSON.stringify(visible), tokens: 500 });
    hint = hintOutput.parse(parseCompletionJson(output)).hint;
  } catch {
    await db.practiceHintCache.updateMany({ where: owner, data: { leaseToken: null, leaseUntil: new Date(Date.now() + 10_000) } });
    throw new AppError(502, 'AI_HINT_FAILED', 'Could not generate a hint. Try again shortly.');
  }
  const saved = await db.practiceHintCache.updateMany({
    where: owner, data: { hint, expiresAt: new Date(Date.now() + ttl), leaseToken: null, leaseUntil: null },
  });
  if (!saved.count) throw pendingHint();
  return { hint, cached: false };
}

type Options = Omit<PracticeOptions, 'execute'> & { billingEnabled?: boolean };
export const solverHintRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, billingEnabled = false }) => {
  const target = z.object({ slug: z.string().min(1).max(200) });
  app.get('/problems/:slug/hints', async (request, reply): Promise<SolverHintStatus> => {
    const { id } = await authenticate(request);
    const { slug } = target.parse(request.params);
    await getProblem(db, slug, id, false, 'solver');
    reply.header('Cache-Control', 'private, no-store');
    return { enabled: Boolean(coachingConnection()), ...await getAllowance(db, id, billingEnabled, new Date()) };
  });

  app.post('/problems/:slug/hints', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply): Promise<SolverHint> => {
    const { id } = await authenticate(request);
    const { slug } = target.parse(request.params);
    const { level } = z.object({ level: levelSchema.default(1) }).parse(request.body ?? {});
    const item = await getProblem(db, slug, id, false, 'solver');
    const connection = coachingConnection();
    if (!connection) throw new AppError(503, 'AI_HINT_UNAVAILABLE', 'Solver hints need a configured coaching provider.');
    const allowance = await getAllowance(db, id, billingEnabled, new Date());
    if (allowance.remaining === 0) throw limitReached();
    reply.header('Cache-Control', 'private, no-store');
    const result = await solverHint(db, item, level, connection);
    return { ...result, level, enabled: true, ...await deliver(db, id, billingEnabled) };
  });
};
