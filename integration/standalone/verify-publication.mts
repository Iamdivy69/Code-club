import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
const origin = 'http://127.0.0.1:34121';
const env = parse(await readFile('.local/rehearsal/clean.env'));
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@practice.test', password: env.PRACTICE_SEED_PASSWORD }) });
assert.equal(login.status, 200); const auth = await login.json(); const headers = { Authorization: 'Bearer ' + auth.accessToken, 'Content-Type': 'application/json' };
const get = async (path: string) => { const response = await fetch(origin + '/api' + path, { headers }); assert.equal(response.status, 200, path); return response.json(); };
const { problems } = await get('/practice/problems'); assert.equal(problems.length, 267); assert.equal(problems.filter((p: any) => p.executionPending).length, 250);
const pending = problems.filter((p: any) => p.executionPending); let checked = 0;
for (let offset = 0; offset < pending.length; offset += 8) await Promise.all(pending.slice(offset, offset + 8).map(async (p: any) => {
  const { problem } = await get('/practice/problems/' + p.slug); assert.equal(problem.executionPending, true); assert.ok(problem.description && problem.languages.length && Object.keys(problem.starterCode).length); checked++;
}));
for (const slug of ['two-sum', 'min-stack']) for (const action of ['run', 'submit']) {
  const response = await fetch(origin + '/api/practice/judge/' + action, { method: 'POST', headers, body: JSON.stringify({ problemSlug: slug, language: 'javascript', code: '/* execution must remain blocked */', ...(action === 'submit' && { requestKey: randomUUID() }) }) });
  assert.equal(response.status, 409); assert.equal((await response.json()).error, 'CATALOGUE_EXECUTION_PENDING');
}
assert.equal((await get('/practice/problems/count-above')).problem.executionPending, undefined);
const options = (await get('/practice/competitions/problem-options')).problems; assert.equal(options.length, 17); assert.ok(options.every((p: any) => !pending.some((q: any) => p.slug === q.slug)));
const publicIndex = await (await fetch(origin + '/api/practice/reading-index')).json(); assert.equal(publicIndex.problems.length, 267);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE!).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE });
const output = resolve('integration/standalone/publication-evidence'); await mkdir(output, { recursive: true }); const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login'); await page.getByLabel('Email', { exact: true }).fill('student@practice.test'); await page.getByLabel('Password', { exact: true }).fill(env.PRACTICE_SEED_PASSWORD!); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Practice Problems', exact: true }).waitFor();
  await page.goto(origin + '/practice/solve/two-sum'); await page.getByText('Read & edit · Code execution is not available for this problem yet.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Run', exact: true }).isDisabled(), true); assert.equal(await page.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), true);
  await page.locator('.monaco-editor').first().waitFor(); await page.locator('.monaco-editor').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('//publication-edit-check'); assert.match(await page.locator('.monaco-editor .view-lines').first().innerText(), /publication-edit-check/);
  await page.screenshot({ path: resolve(output, 'two-sum-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.mobile-tabs').waitFor(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: resolve(output, 'two-sum-mobile.png'), fullPage: true });
  const reader = await context.newPage(); await reader.goto(origin + '/practice-reading/?slug=two-sum'); await reader.locator('#problem h1').waitFor(); await reader.getByText('Read & edit · Code execution is not available for this problem yet.', { exact: true }).waitFor(); assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ verdict: 'PASS', published: 267, importedReadEditOnly: checked, originalsExecutable: 17, blockedExecutionChecks: 4, gradedEventOptions: options.length, publicDiscovery: publicIndex.problems.length, desktopMobileEditorAndReader: 'PASS', pageErrors: errors }, null, 2) + '\n'); console.log(JSON.stringify({ verdict: 'PASS', published: 267, checkedImports: checked, browser: 'PASS' }));
} finally { await browser.close(); }
