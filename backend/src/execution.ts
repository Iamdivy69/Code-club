import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { boundedExecutionQueue, redisExecutionQueue } from './modules/practice/execution-queue.js';
import { judge0, type Execute } from './modules/practice/judge.js';

export const judgeSettings = {
  JUDGE0_API_URL: z.preprocess((value) => value || undefined, z.url().optional()),
  JUDGE0_API_KEY: z.preprocess((value) => value || undefined, z.string().optional()),
  JUDGE0_RAPIDAPI_KEY: z.preprocess((value) => value || undefined, z.string().optional()),
  JUDGE0_MAX_CONCURRENCY: z.preprocess((value) => value || undefined, z.coerce.number().int().min(1).max(64).optional()),
  JUDGE0_SEMAPHORE_KEY: z.preprocess((value) => value || undefined, z.string().max(120).regex(/^[A-Za-z0-9:_.-]+$/).optional()),
};

export function validJudgeEndpoint(value: string, environment: string) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    (environment === 'development' && url.hostname === 'host.docker.internal');
  return (local || url.protocol === 'https:') && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}

type ExecutionConfig = z.infer<z.ZodObject<typeof judgeSettings>> & {
  REDIS_URL?: string;
  JUDGE0_QUEUE_MODE?: 'local' | 'redis';
};

export function attachPracticeExecutor(app: FastifyInstance, config: ExecutionConfig, overrideExecute?: Execute) {
  const redis = !overrideExecute && config.JUDGE0_API_URL && config.REDIS_URL && config.JUDGE0_QUEUE_MODE !== 'local'
    ? new Redis(config.REDIS_URL, {
      lazyConnect: true, enableOfflineQueue: false, connectTimeout: 2_000, commandTimeout: 2_000,
      maxRetriesPerRequest: 0, retryStrategy: (attempt) => Math.min(250 * attempt, 2_000),
    })
    : undefined;
  if (redis) {
    redis.on('error', (error) => app.log.warn({ kind: error.name }, 'Practice Redis is unavailable'));
    app.addHook('onReady', async () => { await redis.connect().catch(() => undefined); });
    app.addHook('onClose', async () => { redis.disconnect(); });
  }

  const sharedQueue = redis && redisExecutionQueue(redis, {
    key: config.JUDGE0_SEMAPHORE_KEY ?? 'dsa:practice:judge0:leases',
    concurrency: config.JUDGE0_MAX_CONCURRENCY,
  });
  const execute = overrideExecute ?? judge0(config.JUDGE0_API_URL, config.JUDGE0_API_KEY, {
    schedule: boundedExecutionQueue(sharedQueue, config.JUDGE0_MAX_CONCURRENCY),
    rapidApiKey: config.JUDGE0_RAPIDAPI_KEY,
  });
  return {
    execute,
    status: () => ({
      judge0: config.JUDGE0_API_URL ? 'configured' : 'unconfigured',
      coordination: redis ? redis.status === 'ready' ? 'redis-ready' : 'redis-unavailable'
        : overrideExecute ? 'injected' : config.JUDGE0_API_URL ? 'local' : 'unconfigured',
    }),
  };
}
