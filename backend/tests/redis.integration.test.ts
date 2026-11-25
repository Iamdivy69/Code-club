import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redisExecutionQueue } from '../src/modules/practice/execution-queue.js';

const connection = process.env.PRACTICE_TEST_REDIS_URL;

describe.skipIf(!connection)('Judge0 coordination with Redis', () => {
  let replicaA: Redis;
  let replicaB: Redis;
  const key = 'practice-test:leases:' + randomUUID();

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.protocol !== 'redis:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '16379') {
      throw new Error('Use the disposable Redis server on port 16379.');
    }
    const options = { lazyConnect: true, retryStrategy: () => null, connectTimeout: 2_000, commandTimeout: 2_000 } as const;
    replicaA = new Redis(connection!, options);
    replicaB = new Redis(connection!, options);
    await Promise.all([replicaA.connect(), replicaB.connect()]);
  });

  afterAll(async () => {
    try { if (replicaA?.status === 'ready') await replicaA.unlink(key); }
    finally {
      replicaA?.disconnect();
      replicaB?.disconnect();
    }
  });

  it('shares a cap, renews active leases, and releases a completed lease', async () => {
    const options = { key, concurrency: 1, leaseMs: 600, acquireTimeoutMs: 230 };
    const queueA = redisExecutionQueue(replicaA, options);
    const queueB = redisExecutionQueue(replicaB, options);
    const start = Promise.withResolvers<void>();
    const end = Promise.withResolvers<void>();
    const current = queueA(async () => {
      start.resolve();
      await end.promise;
      return 'completed';
    });
    try {
      await Promise.race([start.promise, current]);
      await delay(700);
      await expect(queueB(async () => 'over capacity')).rejects.toMatchObject({ code: 'JUDGE_BUSY' });
      expect(await replicaB.zcard(key)).toBe(1);
    } finally {
      end.resolve();
      await expect(current).resolves.toBe('completed');
    }
    await expect(queueB(async () => 'new lease')).resolves.toBe('new lease');
    expect(await replicaB.zcard(key)).toBe(0);
  });

  it('recovers expired leases and aborts work after a live lease disappears', async () => {
    await replicaA.zadd(key, 1, 'expired-worker');
    const schedule = redisExecutionQueue(replicaA, { key, concurrency: 1, leaseMs: 600 });
    await expect(schedule(async (signal) => {
      expect(await replicaB.zscore(key, 'expired-worker')).toBeNull();
      await replicaB.unlink(key);
      await delay(1_500, undefined, { signal }).catch(() => signal.throwIfAborted());
    })).rejects.toMatchObject({ code: 'JUDGE_COORDINATION_UNAVAILABLE' });
    expect(await replicaB.zcard(key)).toBe(0);
  });
});
