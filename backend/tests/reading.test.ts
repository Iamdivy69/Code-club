import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors.js';
import { readingRoutes } from '../src/modules/practice/reading.js';

function publicRecord() {
  return {
    id: 'public-id', slug: 'batch-total', title: 'Batch total', topic: 'Arrays', difficulty: 'EASY',
    description: 'Read each entry and return the sum.', constraints: 'At most 12 entries.', hints: ['Start at zero.'],
    practiceContract: { contentVersion: 3, editorial: 'Iterate and accumulate.', catalogue: null,
      cases: [{ position: 0, inputJson: '{"values":[2,3]}', expectedOutputJson: '5' }] },
    starterCode: 'PRIVATE STARTER', practiceStudyItems: [{ note: 'PRIVATE NOTE' }],
    practiceSubmissions: [{ code: 'PRIVATE SOURCE' }], hiddenTestCases: ['PRIVATE CASE'],
  };
}

it('projects only explicitly published public material with visible examples, without authentication or private state', async () => {
  const findFirst = vi.fn().mockResolvedValue(publicRecord());
  const app = Fastify();
  await app.register(readingRoutes, { prefix: '/api/practice', db: { problem: { findFirst } } as unknown as PrismaClient });
  try {
    const response = await app.inject('/api/practice/reading/batch-total');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-codeclub-public-reading']).toBe('1');
    expect(response.json().problem).toEqual({
      id: 'public-id', slug: 'batch-total', title: 'Batch total', topic: 'Arrays', difficulty: 'EASY',
      description: 'Read each entry and return the sum.', constraints: ['At most 12 entries.'], hints: ['Start at zero.'],
      contentVersion: 3, editorial: 'Iterate and accumulate.', examples: [{ index: 0, input: '{"values":[2,3]}', output: '5' }],
    });
    const query = findFirst.mock.calls[0]![0];
    expect(query.where).toEqual({ slug: 'batch-total', isPublished: true, practiceContract: { enabled: true, contestOnly: false } });
    expect(query.select.practiceContract.select.cases.where).toEqual({ hidden: false });
    expect(JSON.stringify(query)).not.toMatch(/mappedLegacy|Study|Submission|starterCode/);
    expect(response.body).not.toContain('PRIVATE');
  } finally { await app.close(); }
});

it('uses reviewed display text for imported public material without projecting imported starters', async () => {
  const record = publicRecord();
  const display = { description: 'Reviewed imported description.', constraints: ['Reviewed constraint.'], hints: ['Reviewed hint.'], starters: { javascript: 'PRIVATE STARTER' } };
  (record.practiceContract as unknown as { catalogue: unknown }).catalogue = { display };
  const app = Fastify();
  await app.register(readingRoutes, { db: { problem: { findFirst: async () => record } } as unknown as PrismaClient });
  try {
    const response = await app.inject('/reading/batch-total');
    expect(response.json().problem).toMatchObject({ description: display.description, constraints: display.constraints, hints: display.hints });
    expect(response.body).not.toContain('PRIVATE');
  } finally { await app.close(); }
});

it('omits the membership-gated editorial from account-independent public reading', async () => {
  const app = Fastify();
  await app.register(readingRoutes, { billingEnabled: true, db: { problem: { findFirst: async () => publicRecord() } } as unknown as PrismaClient });
  try {
    const response = await app.inject('/reading/batch-total');
    expect(response.statusCode).toBe(200);
    expect(response.json().problem.editorial).toBeNull();
    expect(response.body).not.toContain('Iterate and accumulate.');
  } finally { await app.close(); }
});

it('withdraws unavailable content with a noncacheable 404 and no public marker', async () => {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AppError ? error.statusCode : 400).send({ message: error.message }));
  await app.register(readingRoutes, { db: { problem: { findFirst: async () => null } } as unknown as PrismaClient });
  try {
    const response = await app.inject('/reading/withdrawn-problem');
    expect(response.statusCode).toBe(404);
    expect(response.headers['x-codeclub-public-reading']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  } finally { await app.close(); }
});

async function worker() {
  const listeners = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: string | Request) => typeof request === 'string' ? request : request.url;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async match(request: string | Request) { return entries.get(key(request))?.clone(); },
        async put(request: string | Request, response: Response) { entries.set(key(request), response.clone()); },
        async delete(request: string | Request) { return entries.delete(key(request)); },
      };
    },
  };
  const network = vi.fn(async (_request: Request) => new Response('{"problem":{"title":"Public example"}}', {
    headers: { 'Content-Type': 'application/json', 'X-CodeClub-Public-Reading': '1' },
  }));
  const source = await readFile(new URL('../../frontend/public/practice-reading/sw.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    self: { location: { origin: 'https://practice.test' }, addEventListener: (name: string, handler: any) => listeners.set(name, handler),
      skipWaiting() {}, clients: { claim() {} } },
    caches, fetch: network, URL, Request, Response, Headers, Promise,
  });
  async function request(path = '/api/practice/reading/batch-total', method = 'GET') {
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({ request: new Request('https://practice.test' + path, { method }), respondWith(value: Promise<Response>) { response = value; } });
    return response;
  }
  async function clear() {
    let work: Promise<unknown> | undefined;
    listeners.get('message')!({ data: { type: 'CLEAR' }, waitUntil(value: Promise<unknown>) { work = value; } });
    await work;
  }
  return { request, clear, network, caches };
}

describe('public reader service worker', () => {
  it('never intercepts HTML, account APIs, authenticated workspaces, query variants or mutation requests', async () => {
    const browser = await worker();
    for (const path of ['/practice-reading/', '/practice/solve/batch-total', '/api/auth/me', '/api/practice/problems/batch-total', '/api/practice/reading/batch-total?token=secret']) {
      expect(await browser.request(path)).toBeUndefined();
    }
    expect(await browser.request('/api/practice/reading/batch-total', 'POST')).toBeUndefined();
    expect(browser.network).not.toHaveBeenCalled();
  });
  it('saves only public payloads, omits credentials, and serves the last public version during a network outage', async () => {
    const browser = await worker();
    expect((await browser.request())?.status).toBe(200);
    expect(browser.network.mock.calls[0]![0].credentials).toBe('omit');
    browser.network.mockRejectedValue(new Error('offline'));
    const response = await browser.request();
    expect(response?.headers.get('X-CodeClub-Offline')).toBe('1');
    expect(await response?.json()).toMatchObject({ problem: { title: 'Public example' } });
    expect((await browser.request('/api/practice/reading/never-loaded'))?.status).toBe(503);
  });
  it('removes a withdrawn saved item when the server reconnects', async () => {
    const browser = await worker();
    await browser.request();
    browser.network.mockResolvedValue(new Response('{}', { status: 404 }));
    expect((await browser.request())?.status).toBe(404);
    browser.network.mockRejectedValue(new Error('offline'));
    expect((await browser.request())?.status).toBe(503);
  });
  it('does not save an unmarked successful response or an error response', async () => {
    const browser = await worker();
    browser.network.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    await browser.request();
    browser.network.mockRejectedValue(new Error('offline'));
    expect((await browser.request())?.status).toBe(503);
  });
  it('clears only Practice reading caches on an account switch', async () => {
    const browser = await worker();
    await browser.caches.open('other-app-cache');
    await browser.request();
    await browser.clear();
    expect(await browser.caches.keys()).toEqual(['other-app-cache']);
    browser.network.mockRejectedValue(new Error('offline'));
    expect((await browser.request())?.status).toBe(503);
  });
  it('does not restore cleared material when an earlier in-flight network fetch completes', async () => {
    const browser = await worker();
    let resolve!: (value: Response) => void;
    browser.network.mockImplementation(() => new Promise<Response>(complete => { resolve = complete; }));
    const pending = browser.request();
    await browser.clear();
    resolve(new Response('{"problem":{}}', { headers: { 'Content-Type': 'application/json', 'X-CodeClub-Public-Reading': '1' } }));
    await pending;
    browser.network.mockRejectedValue(new Error('offline'));
    expect((await browser.request())?.status).toBe(503);
  });
});
