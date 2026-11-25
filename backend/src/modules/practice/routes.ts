import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { PracticeReflectionRating, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { practiceService, runInput, slugInput, submitInput } from './service.js';
import type { Execute } from './judge.js';
import { languageKey, languages } from './languages.js';
import { executionVerdict, verdictLabel } from './evaluation.js';
import type { CompilerResult } from './contracts.js';

const submissionParams = z.object({ id: z.uuid() });
const reflectionInput = z.object({ rating: z.enum(PracticeReflectionRating) });
const compilerInput = z.object({
  language: languageKey,
  code: z.string().max(50_000).refine((value) => value.trim().length > 0),
  stdin: z.string().max(20_000).default(''),
});

export type PracticeOptions = {
  db: PrismaClient;
  execute: Execute;
  authenticate: (request: FastifyRequest) => Promise<{ id: string }>;
};

export const practiceRoutes: FastifyPluginAsync<PracticeOptions & { billingEnabled?: boolean }> = async (app, options) => {
  const practice = practiceService(options.db, options.execute, options.billingEnabled);
  app.get('/problems', async (request) => {
    const { id } = await options.authenticate(request);
    return { problems: await practice.list(id) };
  });
  app.get('/problems/:slug', async (request) => {
    const { id } = await options.authenticate(request);
    return { problem: await practice.detail(id, slugInput.parse(request.params).slug) };
  });
  app.get('/languages', async (request) => {
    await options.authenticate(request);
    return { languages: Object.values(languages).map(({ key, label, editor, indentSize }) => ({ key, label, editor, indentSize })) };
  });
  app.post('/compiler/run', { bodyLimit: 400_000, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request): Promise<CompilerResult> => {
    await options.authenticate(request);
    const { language, code, stdin } = compilerInput.parse(request.body);
    const result = await options.execute(code, language, stdin);
    const verdict = executionVerdict(result);
    return {
      status: verdict === 'ACCEPTED' ? 'Finished' : verdictLabel[verdict],
      stdout: result.stdout.slice(0, 24_000), stderr: result.stderr.slice(0, 8_000),
      compileOutput: result.compileOutput.slice(0, 8_000), time: result.time, memory: result.memory,
      truncated: result.stdout.length > 24_000 || result.stderr.length > 8_000 || result.compileOutput.length > 8_000,
    };
  });
  app.post('/judge/run', { bodyLimit: 400_000, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const { id } = await options.authenticate(request);
    return practice.run(id, runInput.parse(request.body));
  });
  app.post('/judge/submit', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const { id } = await options.authenticate(request);
    return practice.submit(id, submitInput.parse(request.body));
  });
  app.get('/submissions', async (request) => {
    const { id } = await options.authenticate(request);
    return { submissions: await practice.history(id, slugInput.parse(request.query).slug) };
  });
  app.get('/submissions/:id', async (request) => {
    const { id } = await options.authenticate(request);
    const params = submissionParams.parse(request.params);
    return { submission: await practice.submission(id, params.id) };
  });
  app.post('/submissions/:id/reflection', async (request, reply) => {
    const { id } = await options.authenticate(request);
    const params = submissionParams.parse(request.params);
    const { rating } = reflectionInput.parse(request.body);
    const saved = await practice.saveReflection(id, params.id, rating);
    return reply.code(201).send({ rating: saved });
  });
};
