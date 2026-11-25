import { createHmac, randomUUID } from 'node:crypto';
import type { PracticeExternalStats, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { leetcodeCounts, leetcodeProvider, leetcodeUsername } from './leetcode-provider.js';

const issuer = 'dsa-practice-leetcode-preview';
const revisionInput = z.object({ revision: z.uuid().nullable() });
const usernameInput = z.strictObject({ username: leetcodeUsername });
const manualInput = leetcodeCounts.extend({ username: leetcodeUsername, revision: revisionInput.shape.revision }).strict();
const previewInput = z.strictObject({ token: z.string().min(1).max(2048) });
const previewClaims = manualInput.extend({ sub: z.uuid(), recordedAt: z.iso.datetime(), exp: z.number(), iss: z.literal(issuer), iat: z.number() });

export const externalStatsFields = {
  username: true, source: true, easy: true, medium: true, hard: true, recordedAt: true,
} satisfies Prisma.PracticeExternalStatsSelect;
type Values = Omit<PracticeExternalStats, 'userId' | 'revision'>;
type StoredStats = Omit<Values, 'recordedAt'> & { recordedAt: Date | string | null };

export function externalStatsSnapshot(stats: StoredStats | null) {
  if (!stats?.username || !stats.source || !stats.recordedAt) return null;
  const { username, source, easy, medium, hard } = stats;
  const recordedAt = new Date(stats.recordedAt);
  return {
    username, source, easy, medium, hard, total: easy + medium + hard, recordedAt: recordedAt.toISOString(),
    stale: source === 'fetched' && Date.now() - +recordedAt >= 7 * 86_400_000,
  };
}

async function store(db: PrismaClient, userId: string, expected: string | null, values: Values) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const current = await tx.practiceExternalStats.findUnique({ where: { userId }, select: { revision: true } });
    if ((current?.revision ?? null) !== expected) {
      throw new AppError(409, 'EXTERNAL_STATS_CHANGED', 'Your LeetCode stats changed in another window. Reload them and try again.');
    }
    const data = { revision: randomUUID(), ...values };
    const row = await tx.practiceExternalStats.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { revision: row.revision, stats: externalStatsSnapshot(row) };
  });
}

function verifyPreview(token: string, key: Buffer, userId: string) {
  try {
    const data = previewClaims.parse(jwt.verify(token, key, { issuer, subject: userId, algorithms: ['HS256'] }));
    return { username: data.username, easy: data.easy, medium: data.medium, hard: data.hard,
      revision: data.revision, recordedAt: new Date(data.recordedAt) };
  } catch {
    throw new AppError(400, 'INVALID_LEETCODE_PREVIEW', 'This preview expired or is invalid. Fetch the counts again.');
  }
}

type Options = Omit<PracticeOptions, 'execute'> & { proofSecret?: string };

export const externalStatsRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate, proofSecret }) => {
  const provider = leetcodeProvider(process.env);
  const key = proofSecret && createHmac('sha256', proofSecret).update('dsa-v2/practice/leetcode-preview/v1').digest();
  const syncEnabled = Boolean(provider && key);
  const disabled = () => new AppError(503, 'LEETCODE_UNAVAILABLE', 'LeetCode sync is unavailable. You can enter your counts manually.');
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });

  app.get('/', async (request) => {
    const { id } = await authenticate(request);
    const row = await db.practiceExternalStats.findUnique({ where: { userId: id } });
    return { stats: externalStatsSnapshot(row), revision: row?.revision ?? null, syncEnabled };
  });
  app.put('/', async (request) => {
    const { id } = await authenticate(request);
    const { revision, ...stats } = manualInput.parse(request.body);
    return store(db, id, revision, { ...stats, source: 'manual', recordedAt: new Date() });
  });
  app.delete('/', async (request) => {
    const { id } = await authenticate(request);
    const { revision } = revisionInput.strict().parse(request.body);
    return store(db, id, revision, { username: null, source: null, easy: 0, medium: 0, hard: 0, recordedAt: null });
  });
  app.post('/preview', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request) => {
    const { id } = await authenticate(request);
    const { username } = usernameInput.parse(request.body);
    if (!provider || !key) throw disabled();
    const row = await db.practiceExternalStats.findUnique({ where: { userId: id }, select: { revision: true } });
    const stats = { ...await provider(username), source: 'fetched' as const, recordedAt: new Date().toISOString() };
    const { source, ...signed } = stats;
    const token = jwt.sign({ ...signed, revision: row?.revision ?? null }, key,
      { issuer, subject: id, expiresIn: '10m', algorithm: 'HS256' });
    return { token, stats: externalStatsSnapshot({ ...signed, source }) };
  });
  app.post('/confirm', async (request) => {
    const { id } = await authenticate(request);
    const { token } = previewInput.parse(request.body);
    if (!syncEnabled || !key) throw disabled();
    const { revision, ...stats } = verifyPreview(token, key, id);
    return store(db, id, revision, { ...stats, source: 'fetched' });
  });
};
