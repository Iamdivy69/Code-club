import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Redis } from 'ioredis';
import { AppError } from '../../errors.js';

export type Schedule = <Result>(job: (signal: AbortSignal) => Promise<Result>) => Promise<Result>;
type RedisClient = Pick<Redis, 'eval' | 'zrem'>;
type LeaseOptions = { key: string; concurrency?: number; leaseMs?: number; acquireTimeoutMs?: number };

const waitForCapacity = 20_000;

function busy() {
  return new AppError(503, 'JUDGE_BUSY', 'The runner is busy. Try again shortly.');
}

export function unavailableCoordination() {
  return new AppError(503, 'JUDGE_COORDINATION_UNAVAILABLE', 'Code execution coordination is unavailable. Try again shortly.');
}

export function boundedExecutionQueue(schedule?: Schedule, capacity = 8): Schedule {
  let active = 0;
  const waiting = new Set<() => void>();
  const localSignal = new AbortController().signal;

  function acquire() {
    if (active < capacity) { active++; return; }
    if (waiting.size >= 32) throw busy();
    return new Promise<void>((resolve, reject) => {
      const grant = () => { clearTimeout(timeout); resolve(); };
      const timeout = setTimeout(() => {
        waiting.delete(grant);
        reject(busy());
      }, waitForCapacity);
      waiting.add(grant);
    });
  }

  return async (job) => {
    await acquire();
    try {
      return await (schedule ? schedule(job) : job(localSignal));
    } finally {
      const next = waiting.values().next().value;
      if (next) {
        waiting.delete(next);
        next();
      } else active--;
    }
  };
}

const serverClock = `
local time = redis.call('TIME')
local now = time[1] * 1000 + math.floor(time[2] / 1000)
`;

const claimLease = serverClock + `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

const extendLease = serverClock + `
local expires = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not expires or tonumber(expires) <= now then return 0 end
redis.call('ZADD', KEYS[1], 'XX', now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

export function redisExecutionQueue(redis: RedisClient, { key, concurrency = 8, leaseMs = 30_000, acquireTimeoutMs = waitForCapacity }: LeaseOptions): Schedule {
  async function acquire(token: string) {
    const deadline = performance.now() + acquireTimeoutMs;
    do {
      try {
        if (await redis.eval(claimLease, 1, key, token, leaseMs, concurrency) === 1) return;
      } catch { throw unavailableCoordination(); }
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw busy();
      await delay(Math.min(150, remaining));
    } while (performance.now() < deadline);
    throw busy();
  }

  return async (job) => {
    const token = randomUUID();
    await acquire(token);
    const controller = new AbortController();
    let pending: Promise<void> | undefined;

    async function renew() {
      try {
        if (await redis.eval(extendLease, 1, key, token, leaseMs) === 1) return;
      } catch { /* Abort the request when its lease cannot be confirmed. */ }
      controller.abort(unavailableCoordination());
    }

    const heartbeat = setInterval(() => {
      if (pending || controller.signal.aborted) return;
      pending = renew().finally(() => { pending = undefined; });
    }, Math.max(1, Math.floor(leaseMs / 3)));
    heartbeat.unref();
    try {
      const result = await job(controller.signal);
      clearInterval(heartbeat);
      await pending;
      controller.signal.throwIfAborted();
      return result;
    } finally {
      clearInterval(heartbeat);
      await pending;
      if (!controller.signal.aborted) await redis.zrem(key, token).catch(() => { /* The slot will expire. */ });
    }
  };
}
