import { z } from 'zod';
import { judgeSettings, validJudgeEndpoint } from './execution.js';
import { billingSettings } from './modules/billing/policy.js';

const runtime = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5010),
  PRACTICE_API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).optional(),
  PRACTICE_ACCOUNT_EMAIL_ENABLED: z.enum(['true', 'false']).optional(),
  PRACTICE_PUBLIC_SIGNUP_ENABLED: z.enum(['true', 'false']).optional(),
  PRACTICE_GOOGLE_CLIENT_ID: z.string().optional(),
  PRACTICE_GOOGLE_CLIENT_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.preprocess((value) => value || undefined, z.string().min(32).optional()),
  JWT_PRIVATE_KEY: z.string().min(1).optional(),
  JWT_PUBLIC_KEY: z.string().min(1).optional(),
  PRACTICE_PROFILE_SIGN_SECRET: z.preprocess((value) => value || undefined, z.string().min(32).optional()),
  ...judgeSettings,
  ...billingSettings,
  REDIS_URL: z.preprocess((value) => value || undefined, z.url().refine((url) => /^rediss?:\/\//i.test(url)).optional()),
  JUDGE0_QUEUE_MODE: z.preprocess((value) => value || undefined, z.enum(['local', 'redis']).optional()),
}).superRefine((value, ctx) => {
  const keys = value.JWT_PRIVATE_KEY && value.JWT_PUBLIC_KEY;
  if (!keys && (!value.JWT_SECRET || value.NODE_ENV === 'production')) {
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Configure a local JWT secret or an RSA key pair. Production requires RSA keys.' });
  }
  if (Boolean(value.JWT_PRIVATE_KEY) !== Boolean(value.JWT_PUBLIC_KEY)) {
    ctx.addIssue({ code: 'custom', path: ['JWT_PUBLIC_KEY'], message: 'Configure both RSA keys together.' });
  }
  const needsRedis = value.JUDGE0_QUEUE_MODE === 'redis' ||
    (value.NODE_ENV === 'production' && value.JUDGE0_API_URL && value.JUDGE0_QUEUE_MODE !== 'local');
  if (needsRedis && !value.REDIS_URL) {
    ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'Configure shared Redis execution capacity.' });
  }
  if (value.JUDGE0_API_URL && !validJudgeEndpoint(value.JUDGE0_API_URL, value.NODE_ENV)) {
    ctx.addIssue({ code: 'custom', path: ['JUDGE0_API_URL'], message: 'Use HTTPS or a local HTTP Judge0 endpoint.' });
  }
});
export type Config = z.infer<typeof runtime>;
export function readConfig() {
  return runtime.parse(process.env);
}
