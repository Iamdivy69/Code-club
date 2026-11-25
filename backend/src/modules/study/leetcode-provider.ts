import { z } from 'zod';
import { AppError } from '../../errors.js';

export const leetcodeUsername = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,50}$/);
const count = z.number().int().min(0).max(5000);
export const leetcodeCounts = z.object({ easy: count, medium: count, hard: count });
const providerResult = leetcodeCounts.extend({ username: leetcodeUsername });

export function leetcodeProvider(env: NodeJS.ProcessEnv) {
  if (!env.PRACTICE_LEETCODE_STATS_URL) return;
  const endpoint = URL.parse(env.PRACTICE_LEETCODE_STATS_URL);
  const local = env.NODE_ENV !== 'production' && endpoint?.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  if (!endpoint || (endpoint.protocol !== 'https:' && !local) || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash) return;

  return async (username: string) => {
    const url = new URL(endpoint);
    url.searchParams.set('username', username);
    const token = env.PRACTICE_LEETCODE_STATS_TOKEN;
    try {
      const response = await fetch(url, {
        redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) throw new AppError(404, 'LEETCODE_NOT_FOUND', 'No public solve counts were found for that username.');
        throw new Error('Stats provider rejected the request.');
      }
      if (!response.body) throw new Error('Stats provider returned no counts.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new Error('Stats provider response was too large.');
        }
        chunks.push(value);
      }
      const stats = providerResult.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (stats.username !== username) throw new Error('Stats provider returned a different username.');
      return stats;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'LEETCODE_UNAVAILABLE', 'LeetCode sync is unavailable. You can enter your counts manually.');
    }
  };
}
