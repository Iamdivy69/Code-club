import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { readingRoutes } from '../../backend/src/modules/practice/reading.js';
import { AppError } from '../../backend/src/errors.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = process.env.PLAYWRIGHT_MODULE;
assert.ok(runtime, 'Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs file.');
const { chromium } = await import(pathToFileURL(resolve(runtime)).href);
const output = join(root, 'integration/standalone/reading-evidence');
await mkdir(output, { recursive: true });
let published = true;
let version = 1;
const calls: string[] = [];
const server = Fastify();
server.setErrorHandler((error, _request, reply) => reply.code(error instanceof AppError ? error.statusCode : 500).send({ message: error.message }));
await server.register(readingRoutes, { prefix: '/api/practice', db: { problem: { async findMany() { return published ? [{ slug: 'reader-example', title: 'Reader example', topic: 'Arrays', difficulty: 'EASY' }] : []; }, async findFirst(query: any) {
  assert.deepEqual(query.where, { slug: 'reader-example', isPublished: true, practiceContract: { enabled: true, contestOnly: false } });
  if (!published) return null;
  return { id: 'reader-fixture', slug: 'reader-example', title: 'Reader example <img src=x onerror=alert(1)>',
    topic: 'Arrays', difficulty: 'EASY', description: 'Original public browser fixture. Version ' + version,
    constraints: 'At most twelve entries.', hints: ['Inspect each entry.'],
    practiceContract: { contentVersion: version, editorial: 'Read values in order.', catalogue: null,
      cases: [{ position: 0, inputJson: '{"values":[2,3]}', expectedOutputJson: '5' }] } };
} } } as unknown as PrismaClient });
server.get('/api/auth/me', (_request, reply) => reply.header('Cache-Control', 'no-store').send({ private: 'NEVER CACHE ACCOUNT STATE' }));
server.get('/peer', (_request, reply) => reply.type('text/html').send('<!doctype html><title>Account switch fixture</title>'));
server.get('/practice-reading/', async (_request, reply) => reply.type('text/html').send(await readFile(join(root, 'frontend/public/practice-reading/index.html'))));
for (const [name, type] of [['sw.js', 'application/javascript'], ['reader.js', 'application/javascript'], ['style.css', 'text/css']]) {
  server.get('/practice-reading/' + name, async (_request, reply) => reply.type(type!).header('Cache-Control', 'no-store').send(await readFile(join(root, 'frontend/public/practice-reading', name!))));
}
server.addHook('onRequest', async request => { calls.push(request.url); });
await server.listen({ host: '127.0.0.1', port: 0 });
const address = server.server.address();
assert.ok(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
const checks: string[] = [];
try {
  const page = await context.newPage();
  await page.goto(origin + '/practice-reading/?slug=reader-example');
  await page.getByRole('status').filter({ hasText: 'Saved on this device' }).waitFor();
  assert.equal(await page.locator('article img').count(), 0);
  assert.equal(await page.locator('article h1').textContent(), 'Reader example <img src=x onerror=alert(1)>');
  checks.push('Online reader saves only the whitelisted public API projection and renders text without executing markup.');
  await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
  await page.evaluate(async () => { await fetch('/api/auth/me'); });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)));
    return entries.flat();
  });
  assert.deepEqual(cached, [origin + '/api/practice/reading/reader-example']);
  checks.push('CacheStorage contains no HTML, authentication payloads, private APIs or credentials.');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Refresh saved material', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Offline · Reading the saved public version.' }).waitFor();
  assert.match(await page.locator('article').textContent() ?? '', /Original public browser fixture/);
  checks.push('Previously loaded public statement, examples and editorial remain readable with browser networking disabled.');
  const fresh = await context.newPage();
  let navigationFailed = false;
  try { await fresh.goto(origin + '/practice-reading/'); } catch { navigationFailed = true; }
  assert.equal(navigationFailed, true);
  await fresh.close();
  checks.push('Fresh HTML navigation requires the network.');
  published = false;
  await context.setOffline(false);
  await page.getByRole('status').filter({ hasText: 'Removed 1 unavailable saved problem' }).waitFor();
  assert.equal(await page.locator('article').isHidden(), true);
  assert.equal(await page.locator('#saved option').count(), 1);
  checks.push('Reconnect removes withdrawn material from both rendered content and the saved API cache.');
  published = true;
  version = 2;
  await page.goto(origin + '/practice-reading/?slug=reader-example');
  await page.getByRole('status').filter({ hasText: 'Public version 2.' }).waitFor();
  checks.push('Reconnected public content refreshes to the current published version.');
  await page.evaluate(async () => { await caches.open('unrelated-app-cache'); });
  const peer = await context.newPage();
  await peer.goto(origin + '/peer');
  await peer.evaluate(() => { const channel = new BroadcastChannel('practice-reading'); channel.postMessage({ type: 'CLEAR' }); channel.close(); });
  await page.getByRole('status').filter({ hasText: 'Saved reading material cleared.' }).waitFor();
  assert.equal(await page.locator('article').isHidden(), true);
  assert.equal(await page.locator('#saved option').count(), 1);
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('unrelated-app-cache')), true);
  checks.push('Cross-tab account-switch cleanup removes reader content while retaining unrelated application storage.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/practice-reading/?slug=reader-example');
  await page.getByRole('status').filter({ hasText: 'Saved on this device' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
  checks.push('Mobile public reading fits a 390px viewport.');
  const assets = {} as Record<string, string>;
  for (const name of ['index.html', 'reader.js', 'sw.js', 'style.css']) {
    assets[name] = createHash('sha256').update(await readFile(join(root, 'frontend/public/practice-reading', name))).digest('hex');
  }
  const report = { kind: 'CodeClub public offline reading browser verification', date: new Date().toISOString(),
    scope: 'Real Chromium and production reading route using an original in-memory content fixture; no demo database mutation.',
    playwright: createRequire(import.meta.url)(resolve(runtime, '../package.json')).version,
    browser: browser.version(), checks, assets, apiRequests: calls.filter(path => path.startsWith('/api/')), verdict: 'PASS' };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, report: join(output, 'report.json'), verdict: 'PASS' }));
} finally { await context.close(); await browser.close(); await server.close(); }
