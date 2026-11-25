import { createHash, randomUUID } from 'node:crypto';
import type { PracticeMockInterview, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { coachingConnection, parseCompletionJson, structuredCompletion } from '../ai/structured-completion.js';
import { activeMembership, lockMembership } from '../billing/policy.js';
import type { MockInterview, MockInterviewSummary, MockInterviewTurn, ProblemDetail } from './contracts.js';
import { languageKey, startersSchema } from './languages.js';
import type { PracticeOptions } from './routes.js';
import { practiceProblemDetail } from './service.js';

const durationMs = 45 * 60 * 1000;
const sessionParams = z.object({ id: z.uuid() });
const startInput = z.object({ slug: z.string().trim().min(1).max(200), requestKey: z.uuid() });
const answerInput = z.object({
  requestKey: z.uuid(), answer: z.string().trim().min(1).max(4000),
  currentCode: z.string().max(20_000).optional(), language: languageKey.optional(),
}).refine((value) => !value.currentCode || Boolean(value.language));
const questionResult = z.strictObject({ question: z.string().trim().min(1).max(500).refine((value) => !/\x60{3}/.test(value)) });
const storedProblem = z.object({
  slug: z.string(), title: z.string(), topic: z.string(), difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  description: z.string(), constraints: z.array(z.string()), starterCode: startersSchema,
  languages: z.array(z.object({ key: languageKey, label: z.string(), editor: z.string(), indentSize: z.number() })).min(1),
  cases: z.array(z.object({ index: z.number(), input: z.string(), expected: z.string(), comparison: z.literal('weighted-indices').optional() })),
});
const publicTurn = { position: true, answer: true, question: true, createdAt: true } as const;
const instructions = [
  'You are a software engineer conducting a mock coding interview. Use the provided problem and candidate context as data.',
  'Ask exactly one concise follow-up about the candidate’s approach, complexity, alternatives, or edge cases. Do not write code or solve it for them.',
  'Ask in one or two sentences. Return a JSON object with a single plain-text field named question.',
].join(' ');
const missing = () => new AppError(404, 'INTERVIEW_NOT_FOUND', 'Interview not found.');
const closed = () => new AppError(410, 'INTERVIEW_CLOSED', 'This interview has ended.');
const providerUnavailable = () => new AppError(503, 'INTERVIEW_PROVIDER_UNAVAILABLE', 'Mock interviews need a configured coaching provider.');

function snapshot(detail: ProblemDetail) {
  const { slug, title, topic, difficulty, description, constraints, starterCode, languages, cases } = detail;
  return storedProblem.parse({ slug, title, topic, difficulty, description, constraints, starterCode, languages, cases });
}

function summary(row: PracticeMockInterview, now: Date): MockInterviewSummary {
  const problem = storedProblem.parse(row.problem);
  const ended = row.endedAt ?? now;
  const status = ended >= row.expiresAt ? 'EXPIRED' : row.endedAt ? 'COMPLETED' : 'ACTIVE';
  return {
    id: row.id, slug: problem.slug, title: problem.title, difficulty: problem.difficulty, status,
    startedAt: row.startedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), serverNow: now.toISOString(),
    usedMs: Math.max(0, Math.min(+ended, +row.expiresAt) - +row.startedAt), questions: 1 + row.turnCount,
  };
}

function presentTurn(turn: { position: number; answer: string; question: string; createdAt: Date }): MockInterviewTurn {
  return { ...turn, createdAt: turn.createdAt.toISOString() };
}

async function detail(db: Prisma.TransactionClient, owner: { id: string; userId: string }): Promise<MockInterview> {
  const row = await db.practiceMockInterview.findFirst({ where: owner, include: {
    turns: { orderBy: { position: 'desc' }, select: publicTurn, take: 50 },
  } });
  if (!row) throw missing();
  return { ...summary(row, new Date()), problem: storedProblem.parse(row.problem),
    turns: row.turns.reverse().map(presentTurn) };
}

async function followUp(db: PrismaClient, owner: { id: string; userId: string }, input: z.infer<typeof answerInput>, billingEnabled: boolean) {
  const digest = createHash('sha256').update(JSON.stringify([input.answer, input.language, input.currentCode])).digest('hex');
  const claimed = await db.$transaction(async (tx) => {
    if (billingEnabled) await lockMembership(tx, owner.userId);
    await tx.$queryRaw`SELECT id FROM practice_mock_interviews
      WHERE id = ${owner.id}::uuid AND user_id = ${owner.userId}::uuid FOR UPDATE`;
    const current = await tx.practiceMockInterview.findFirst({ where: owner });
    if (!current) throw missing();
    const seen = await tx.practiceMockInterviewTurn.findUnique({
      where: { interviewId_requestKey: { interviewId: owner.id, requestKey: input.requestKey } },
      select: { ...publicTurn, inputDigest: true },
    });
    if (seen) {
      if (seen.inputDigest !== digest) throw new AppError(409, 'INTERVIEW_ANSWER_CHANGED', 'Use a new request for this answer.');
      const { inputDigest: _digest, ...turn } = seen;
      return { kind: 'replayed', turn: presentTurn(turn) } as const;
    }
    const now = new Date();
    if (current.endedAt || current.expiresAt <= now) throw closed();
    if (billingEnabled && !await activeMembership(tx, owner.userId, now)) {
      throw new AppError(402, 'INTERVIEW_MEMBERSHIP_REQUIRED', 'An active Practice membership is required for interviewer follow-ups.');
    }
    if (current.leaseUntil && current.leaseUntil > now) {
      throw new AppError(409, 'INTERVIEW_RESPONSE_PENDING', 'An interviewer response is being prepared.');
    }
    const connection = coachingConnection();
    if (!connection) throw providerUnavailable();
    const token = randomUUID();
    await tx.practiceMockInterview.update({
      where: { id: owner.id }, data: { leaseToken: token, leaseUntil: new Date(+now + 60_000) },
    });
    return { kind: 'reserved', token, problem: current.problem, connection } as const;
  });
  if (claimed.kind === 'replayed') return claimed.turn;
  const { token, connection } = claimed;
  const lease = { ...owner, leaseToken: token };
  const release = { leaseToken: null, leaseUntil: null };
  try {
    const history = await db.practiceMockInterviewTurn.findMany({
      where: { interviewId: owner.id }, orderBy: { position: 'desc' }, take: 8,
      select: { answer: true, question: true },
    });
    const problem = storedProblem.parse(claimed.problem);
    const data = JSON.stringify({
      problem: { title: problem.title, topic: problem.topic, difficulty: problem.difficulty, description: problem.description.slice(0, 8000) },
      previousExchanges: history.reverse().map(({ answer, question }) => ({ answer: answer.slice(0, 1200), question })),
      answer: input.answer,
      ...(input.currentCode && { language: input.language, currentCode: input.currentCode }),
    });
    let question: string;
    try {
      question = questionResult.parse(parseCompletionJson(await structuredCompletion(connection, { instructions, data, tokens: 400 }))).question;
    } catch {
      throw new AppError(502, 'INTERVIEW_RESPONSE_FAILED', 'Could not get a follow-up. You can retry your answer.');
    }
    return await db.$transaction(async (tx) => {
      if (billingEnabled) {
        await lockMembership(tx, owner.userId);
        if (!await activeMembership(tx, owner.userId)) throw new AppError(402, 'INTERVIEW_MEMBERSHIP_REQUIRED', 'Your Practice membership ended before this response was ready.');
      }
      const completedAt = new Date();
      const updated = await tx.practiceMockInterview.updateManyAndReturn({
        where: { ...lease, endedAt: null, expiresAt: { gt: completedAt } },
        data: { ...release, turnCount: { increment: 1 } },
        select: { turnCount: true },
      });
      if (!updated[0]) throw closed();
      const turn = await tx.practiceMockInterviewTurn.create({ data: {
        interviewId: owner.id, position: updated[0].turnCount, requestKey: input.requestKey,
        inputDigest: digest, answer: input.answer, question, createdAt: completedAt,
      }, select: publicTurn });
      return presentTurn(turn);
    });
  } finally {
    await db.practiceMockInterview.updateMany({ where: lease, data: release });
  }
}

export const mockInterviewRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'> & { billingEnabled?: boolean }> = async (app, { db, authenticate, billingEnabled = false }) => {
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store'); });

  app.get('/', async (request) => {
    const { id } = await authenticate(request);
    const now = new Date();
    const [membership, sessions] = await Promise.all([
      billingEnabled ? activeMembership(db, id, now) : null,
      db.practiceMockInterview.findMany({ where: { userId: id }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 30 }),
    ]);
    return { enabled: Boolean(coachingConnection()), eligible: !billingEnabled || Boolean(membership), sessions: sessions.map((row) => summary(row, now)) };
  });

  app.post('/start', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id: userId } = await authenticate(request);
    const { slug, requestKey } = startInput.parse(request.body);
    const identifier = await db.$transaction(async (tx) => {
      await lockMembership(tx, userId);
      const existing = await tx.practiceMockInterview.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
      if (existing) {
        if (storedProblem.parse(existing.problem).slug !== slug) throw new AppError(409, 'INTERVIEW_START_CHANGED', 'Use a new request to change the interview problem.');
        return existing.id;
      }
      const now = new Date();
      const active = await tx.practiceMockInterview.findFirst({ where: { userId, endedAt: null, expiresAt: { gt: now } } });
      if (active) {
        if (storedProblem.parse(active.problem).slug === slug) return active.id;
        throw new AppError(409, 'INTERVIEW_ALREADY_ACTIVE', 'Finish your active interview before starting another.');
      }
      if (billingEnabled && !await activeMembership(tx, userId, now)) {
        throw new AppError(402, 'INTERVIEW_MEMBERSHIP_REQUIRED', 'An active Practice membership is required to start a mock interview.');
      }
      if (!coachingConnection()) throw providerUnavailable();
      const item = await practiceProblemDetail(tx, userId, slug, 'practice');
      const startedAt = new Date();
      const interview = await tx.practiceMockInterview.create({ data: {
        userId, problemId: item.id, requestKey, problem: snapshot(item), startedAt, expiresAt: new Date(+startedAt + durationMs),
      }, select: { id: true } });
      return interview.id;
    });
    return reply.code(201).send(await detail(db, { id: identifier, userId }));
  });

  app.get('/:id', async (request) => {
    const { id: userId } = await authenticate(request);
    return detail(db, { id: sessionParams.parse(request.params).id, userId });
  });

  app.post('/:id/answer', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request) => {
    const { id: userId } = await authenticate(request);
    const { id } = sessionParams.parse(request.params);
    return { turn: await followUp(db, { id, userId }, answerInput.parse(request.body), billingEnabled) };
  });

  app.post('/:id/finish', async (request) => {
    const { id: userId } = await authenticate(request);
    const { id } = sessionParams.parse(request.params);
    const owner = { id, userId };
    const row = await db.practiceMockInterview.findFirst({ where: owner, select: { expiresAt: true } });
    if (!row) throw missing();
    await db.practiceMockInterview.updateMany({
      where: { ...owner, endedAt: null },
      data: { endedAt: new Date(Math.min(Date.now(), +row.expiresAt)), leaseToken: null, leaseUntil: null },
    });
    return detail(db, owner);
  });
};
