import type { FastifyPluginAsync } from 'fastify';
import { z, ZodError } from 'zod';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { AppError } from './errors.js';
import { attachPracticeExecutor, judgeSettings, validJudgeEndpoint } from './execution.js';
import { practicePlatform } from './platform.js';
import { practiceEnabled } from './rollout.js';
import { billingSettings } from './modules/billing/policy.js';

const configSchema = z.object({
  ...judgeSettings,
  ...billingSettings,
  PRACTICE_PROFILE_SIGN_SECRET: z.preprocess((value) => value || undefined, z.string().min(32).optional()),
}).superRefine(({ JUDGE0_API_URL }, ctx) => {
  if (JUDGE0_API_URL && !validJudgeEndpoint(JUDGE0_API_URL, env.NODE_ENV)) {
    ctx.addIssue({ code: 'custom', path: ['JUDGE0_API_URL'], message: 'Use HTTPS or a local HTTP Judge0 endpoint.' });
  }
});

export const dsaPractice: FastifyPluginAsync = async (app) => {
  if (!practiceEnabled()) {
    app.get('/availability', async () => ({ enabled: false }));
    return;
  }

  const config = configSchema.parse(process.env);
  const executor = attachPracticeExecutor(app, {
    ...config,
    REDIS_URL: env.REDIS_URL,
    JUDGE0_QUEUE_MODE: 'redis',
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Check the submitted fields.' });
    }
    throw error;
  });

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { database: 'ready', ...executor.status() };
  });

  await app.register(practicePlatform, {
    db: prisma,
    execute: executor.execute,
    billingEnabled: config.PRACTICE_BILLING_ENABLED,
    proofSecret: config.PRACTICE_PROFILE_SIGN_SECRET ?? env.JWT_PRIVATE_KEY ?? env.JWT_SECRET,
    async authenticate(request) {
      await requireAuth(request);
      const userId = request.user?.userId;
      const principal = userId && await prisma.user.findFirst({
        where: { id: userId, isActive: true, deletedAt: null, approvalStatus: 'APPROVED' },
        select: { id: true },
      });
      if (!principal) throw new AppError(401, 'AUTHENTICATION_ERROR', 'Sign in to continue.');
      return principal;
    },
  });
};
