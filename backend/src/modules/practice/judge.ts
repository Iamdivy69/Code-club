import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../../errors.js';
import type { PracticeLanguage } from './contracts.js';
import { boundedExecutionQueue, type Schedule } from './execution-queue.js';
import { languages } from './languages.js';

const responseSchema = z.object({
  status: z.object({ id: z.number().int().min(1) }),
  stdout: z.string().nullish(),
  stderr: z.string().nullish(),
  compile_output: z.string().nullish(),
  time: z.union([z.number(), z.string()]).nullish(),
  memory: z.number().int().nonnegative().nullish(),
});
const ticketSchema = z.object({ token: z.uuid() });
const errorSchema = z.object({ error: z.string() });
const pollFields = 'status,stdout,stderr,compile_output,time,memory';

export type Execution = {
  status: number; stdout: string; stderr: string; compileOutput: string;
  time: number | null; memory: number | null;
};
export type Execute = (source: string, language?: PracticeLanguage, stdin?: string) => Promise<Execution>;

function unavailable() {
  return new AppError(503, 'JUDGE_UNAVAILABLE', 'The code runner is unavailable. Your draft is still in the editor.');
}

function decoded(data: z.infer<typeof responseSchema>): Execution {
  const time = data.time == null ? NaN : Number(data.time);
  const text = (value?: string | null) => Buffer.from(value ?? '', 'base64').toString('utf8');
  return {
    status: data.status.id,
    stdout: text(data.stdout),
    stderr: text(data.stderr),
    compileOutput: text(data.compile_output),
    time: Number.isFinite(time) && time >= 0 && time < 3600 ? time : null,
    memory: data.memory != null && data.memory <= 2_147_483_647 ? data.memory : null,
  };
}

export function judge0(endpoint?: string, key?: string, options: { schedule?: Schedule; rapidApiKey?: string } = {}): Execute {
  if (!endpoint) return async () => { throw unavailable(); };
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/submissions';
  url.searchParams.set('base64_encoded', 'true');
  if (url.searchParams.get('wait') !== 'false') url.searchParams.set('wait', 'true');
  const headers: Record<string, string> = key ? { 'X-Auth-Token': key } : {};
  if (options.rapidApiKey) {
    headers['X-RapidAPI-Key'] = options.rapidApiKey;
    headers['X-RapidAPI-Host'] = url.hostname;
  }
  const schedule = options.schedule ?? boundedExecutionQueue();

  return (source, language = 'javascript', stdin = '') => schedule(async (lease) => {
    const signal = AbortSignal.any([lease, AbortSignal.timeout(20_000)]);
    const body = JSON.stringify({
      source_code: Buffer.from(source, 'utf8').toString('base64'),
      language_id: languages[language].judgeId,
      stdin: Buffer.from(stdin, 'utf8').toString('base64'),
      cpu_time_limit: 2,
      wall_time_limit: 5,
      memory_limit: 256_000,
      max_processes_and_or_threads: 60,
      max_file_size: 1024,
    });
    async function submit(target: URL) {
      const response = await fetch(target, {
        method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json', ...headers }, body,
      });
      const data: unknown = await response.json().catch(() => null);
      return { status: response.status, ok: response.ok, data };
    }
    try {
      let submitted = await submit(url);
      const providerError = errorSchema.safeParse(submitted.data);
      if (url.searchParams.get('wait') === 'true' && submitted.status === 400 &&
        providerError.success && providerError.data.error.trim().toLowerCase() === 'wait not allowed') {
        const asyncUrl = new URL(url);
        asyncUrl.searchParams.set('wait', 'false');
        submitted = await submit(asyncUrl);
      }
      if (!submitted.ok) throw unavailable();
      const synchronous = responseSchema.safeParse(submitted.data);
      if (synchronous.success && synchronous.data.status.id >= 3) return decoded(synchronous.data);

      const ticket = ticketSchema.safeParse(submitted.data);
      if (!ticket.success) throw unavailable();
      const resultUrl = new URL(url);
      resultUrl.pathname += '/' + ticket.data.token;
      resultUrl.searchParams.delete('wait');
      resultUrl.searchParams.set('fields', pollFields);

      let interval = 250;
      while (!signal.aborted) {
        await delay(interval, undefined, { signal });
        interval = Math.min(interval + 150, 1000);
        const response = await fetch(resultUrl, { headers, redirect: 'error', signal });
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw unavailable();
        }
        const result = responseSchema.safeParse(await response.json());
        if (!result.success) throw unavailable();
        if (result.data.status.id >= 3) return decoded(result.data);
      }
    } catch {
      lease.throwIfAborted();
      throw unavailable();
    }
    lease.throwIfAborted();
    throw unavailable();
  });
}
