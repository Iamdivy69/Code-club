import { z } from 'zod';

const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });

export function completionConnection(endpoint: string | undefined, key: string | undefined, model: string | undefined, allowLoopback: boolean) {
  const url = endpoint && URL.parse(endpoint);
  const local = url && allowLoopback && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!url || (!local && url.protocol !== 'https:') || url.username || url.password || url.hash || !key || !model) return null;
  return { url, key, model };
}

type Connection = NonNullable<ReturnType<typeof completionConnection>>;

export function coachingConnection() {
  const { PRACTICE_COACHING_AI_URL: url, PRACTICE_COACHING_AI_KEY: key, PRACTICE_COACHING_AI_MODEL: model, NODE_ENV } = process.env;
  return completionConnection(url, key, model, NODE_ENV === 'test' || NODE_ENV === 'development');
}

export function parseCompletionJson(raw: string): unknown {
  return JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''));
}

export async function structuredCompletion(connection: Connection, input: { instructions: string; data: string; tokens: number }) {
  const response = await fetch(connection.url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40_000),
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + connection.key },
    body: JSON.stringify({
      model: connection.model, max_completion_tokens: input.tokens, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: input.instructions }, { role: 'user', content: input.data }],
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('Completion provider response failed');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 200_000) {
      await reader.cancel();
      throw new Error('Completion provider response is too large');
    }
    chunks.push(value);
  }
  const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return envelope.parse(payload).choices[0]!.message.content;
}
