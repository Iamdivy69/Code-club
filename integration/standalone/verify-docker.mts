import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
const env = parse(await readFile(resolve(process.env.CODECLUB_VERIFY_ENV ?? '.local/rehearsal/clean.env')));
const origin = 'http://127.0.0.1:' + (env.PRACTICE_WEB_PORT ?? '34121');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE!).href);
const output = resolve('integration/standalone/docker-evidence'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE });
const results: string[] = [], errors: string[] = [];
assert.notEqual(env.PRACTICE_WEB_PORT, '34120', 'Use a disposable Docker project for mutation checks.');
const adminLogin = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@practice.test', password: env.PRACTICE_STAFF_PASSWORD }) });
assert.equal(adminLogin.status, 200);
const adminToken = (await adminLogin.json()).accessToken;
async function recoverSettings() {
  const headers = { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' };
  const response = await fetch(origin + '/api/practice/admin/settings', { headers }); assert.equal(response.status, 200);
  const { id: _id, ...settings } = await response.json();
  const saved = await fetch(origin + '/api/practice/admin/settings', { method: 'PUT', headers, body: JSON.stringify({ ...settings, maintenance: false, announcement: '' }) }); assert.equal(saved.status, 200);
}
await recoverSettings();
const learner = await browser.newContext({ viewport: { width: 1440, height: 960 } });
let lastPage: any;
const student = await learner.newPage(); lastPage = student; student.on('pageerror', error => errors.push(error.message));
async function login(page: any, email: string, password: string) {
  await page.goto(origin + '/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('heading', { name: 'Practice Problems', exact: true }).waitFor();
}
try {
  const health = await fetch(origin + '/api/practice/health'); assert.equal(health.status, 200);
  const auth = await (await fetch(origin + '/api/auth/options')).json(); assert.equal(auth.googleEnabled, false); assert.equal(auth.accountEmailEnabled, false);
  results.push('Docker health and disabled Google/account mail options');
  await login(student, 'student@practice.test', env.PRACTICE_SEED_PASSWORD!);
  await student.getByLabel('Language', { exact: true }).selectOption('javascript');
  await student.getByLabel('Topic', { exact: true }).selectOption('Arrays'); assert.ok(await student.locator('.problem-row').count() > 0);
  results.push('Existing learner sign-in and catalogue topic/language filters');
  await student.goto(origin + '/practice/dashboard'); await student.getByRole('heading', { name: 'Daily quiz', exact: true }).waitFor();
  const skip = student.getByRole('button', { name: /Skip/ }); if (await skip.count()) await skip.click();
  await student.getByText(/Skipped/).first().waitFor(); await student.reload(); await student.getByText(/Skipped/).first().waitFor();
  results.push('Daily quiz skip persists after reload');
  await student.goto(origin + '/practice/editions'); await student.getByRole('heading', { name: 'CodeClub Editions', exact: true }).waitFor();
  await student.getByText('Upcoming', { exact: true }).first().waitFor(); assert.equal(await student.getByText('Upcoming', { exact: true }).count(), 3); assert.equal(await student.getByRole('link', { name: 'Open mission' }).count(), 1);
  await student.screenshot({ path: resolve(output, 'editions-desktop.png'), fullPage: true });
  await student.setViewportSize({ width: 390, height: 844 }); assert.ok(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await student.screenshot({ path: resolve(output, 'editions-mobile.png'), fullPage: true });
  await student.getByRole('button', { name: 'Switch to light theme' }).click(); assert.equal(await student.locator('html').getAttribute('data-theme'), 'light');
  assert.ok(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await student.screenshot({ path: resolve(output, 'editions-mobile-light.png'), fullPage: true });
  await student.getByRole('button', { name: 'Switch to dark theme' }).click(); results.push('Edition sequential gates, three upcoming chapters, desktop/mobile fit and both themes');
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage(); lastPage = admin; admin.on('pageerror', error => errors.push(error.message));
  await login(admin, 'admin@practice.test', env.PRACTICE_STAFF_PASSWORD!); await admin.goto(origin + '/practice/community?view=settings'); await admin.getByRole('heading', { name: 'Operational settings' }).waitFor();
  await admin.getByLabel('Public announcement', { exact: true }).fill('Standalone candidate verification'); await Promise.all([admin.waitForResponse(response => response.url().endsWith('/api/practice/admin/settings') && response.request().method() === 'PUT' && response.status() === 200), admin.getByRole('button', { name: 'Save settings', exact: true }).click()]); await admin.getByText('Settings saved.', { exact: true }).waitFor();
  await student.reload(); await student.getByText('Standalone candidate verification', { exact: true }).waitFor();
  await admin.getByLabel('Maintenance mode', { exact: true }).check(); await Promise.all([admin.waitForResponse(response => response.url().endsWith('/api/practice/admin/settings') && response.request().method() === 'PUT' && response.status() === 200), admin.getByRole('button', { name: 'Save settings', exact: true }).click()]);
  await admin.getByLabel('Maintenance mode', { exact: true }).uncheck(); await admin.getByLabel('Public announcement', { exact: true }).fill(''); await Promise.all([admin.waitForResponse(response => response.url().endsWith('/api/practice/admin/settings') && response.request().method() === 'PUT' && response.status() === 200), admin.getByRole('button', { name: 'Save settings', exact: true }).click()]);
  results.push('Admin announcement, maintenance controls and recovery');
  await adminContext.close();
  for (const email of ['teacher@practice.test', 'officer@practice.test', 'recruiter@practice.test']) {
    const context = await browser.newContext(); const page = await context.newPage(); await login(page, email, env.PRACTICE_STAFF_PASSWORD!); await page.goto(origin + '/practice/placement'); await page.getByRole('heading', { name: /Placement/ }).first().waitFor(); await context.close();
  }
  results.push('Teacher, placement officer and recruiter fixture sign-ins');
  const restricted = await browser.newContext(); const restrictedPage = await restricted.newPage();
  await restrictedPage.addInitScript(() => { CacheStorage.prototype.keys = async () => { throw new Error('Storage disabled fixture'); }; });
  await login(restrictedPage, 'student@practice.test', env.PRACTICE_SEED_PASSWORD!); await restricted.close();
  results.push('Sign-in remains available when CacheStorage rejects access');
  const publicContext = await browser.newContext(); const reader = await publicContext.newPage(); reader.on('pageerror', error => errors.push(error.message));
  await reader.goto(origin + '/practice-reading/?slug=count-above'); await reader.locator('#problem h1').waitFor(); await reader.locator('#browse option[value="count-above"]').waitFor({ state: 'attached' });
  await publicContext.setOffline(true); await reader.locator('#saved').selectOption('count-above'); await reader.getByText(/Offline · Reading/).waitFor();
  results.push('Signed-out published discovery and real Docker offline reading'); await publicContext.close();
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'report.json'), JSON.stringify({ origin, verdict: 'PASS', scenarios: results, pageErrors: errors }, null, 2) + '\n'); console.log(JSON.stringify({ verdict: 'PASS', scenarios: results.length }));
} catch (error) { await lastPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }); console.error(JSON.stringify({ scenarios: results, errors, url: lastPage.url(), body: (await lastPage.locator('body').innerText()).slice(0, 5000) })); throw error; } finally { await recoverSettings(); await browser.close(); }
