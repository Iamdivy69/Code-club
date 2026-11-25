import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { verifyEnabledReferral, verifyDisabledReferral } from './verify-referrals.mjs';
import { verifyInstitutionOnboarding } from './verify-institutions.mjs';

const [frontendRoot, backendRoot, fixtureFile, artifactDir] = process.argv.slice(2);
if (!frontendRoot || !backendRoot || !fixtureFile || !artifactDir) {
  throw new Error('Usage: node integration/frontend/verify-browser.mjs <frontend root> <backend root> <fixture record> <artifact directory>');
}
const database = new URL(process.env.DATABASE_URL ?? '');
const redis = new URL(process.env.REDIS_URL ?? '');
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname) && /^\/practice_merge_[a-z0-9]+$/.test(database.pathname));
assert.ok(['127.0.0.1', 'localhost'].includes(redis.hostname));
const password = process.env.PRACTICE_REHEARSAL_PASSWORD;
assert.ok(password && password.length >= 12);
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
assert.equal(fixture.database, database.pathname.slice(1));
const playwright = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright';
const { chromium } = await import(playwright);
await mkdir(artifactDir, { recursive: true });

const pids = new Set();
let browser;
let api;
let db;
let calls = 0;
let coachingCalls = 0;
let hintCalls = 0;
let interviewCalls = 0;
const runner = createServer(async (req, res) => {
  try {
    const input = [];
    for await (const chunk of req) input.push(chunk);
    const payload = JSON.parse(Buffer.concat(input).toString());
    if (req.url === '/coaching') {
      assert.equal(payload.model, 'merge-coaching-fixture');
      if (payload.max_completion_tokens === 400) {
        const submission = JSON.parse(payload.messages[1].content);
        assert.equal(submission.answer, 'I will count matches in one pass.');
        assert.equal(submission.currentCode, undefined);
        interviewCalls++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: 'What is the space complexity?' }) } }] }));
        return;
      }
      if (payload.max_completion_tokens === 500) {
        assert.ok(JSON.parse(payload.messages[1].content).description.length > 0);
        hintCalls++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ hint: 'Scan the values once and count those above the threshold.' }) } }] }));
        return;
      }
      assert.ok(JSON.parse(payload.messages[1].content).recent.attempts >= 1);
      coachingCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        strongestArea: 'Your array solution earned an Accepted verdict.', weakestArea: 'Your sample has limited graph practice.',
        nextStep: 'Practice breadth-first search on one graph.', encouragement: 'Review the complexity of the accepted solution.',
      }) } }] }));
      return;
    }
    assert.match(req.url, /^\/submissions\?/);
    assert.equal(payload.language_id, 63);
    const source = Buffer.from(payload.source_code, 'base64').toString('utf8');
    assert.match(source, /return values\.filter/);
    const output = source.includes('countAbove([-11') ? '4' : source.includes('countAbove([1,6,3,8]') ? '2' : '0';
    calls++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from(output).toString('base64'), time: '0.012', memory: 1024 }));
  } catch {
    res.statusCode = 422;
    res.end();
  }
});
runner.listen(0, '127.0.0.1');
await once(runner, 'listening');

function start(module, cwd, overrides) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', module], {
    cwd, env: { ...process.env, ...overrides }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    log.push(String(chunk));
    if (log.length > 24) log.shift();
  });
  const instance = { child, log };
  pids.add(instance);
  return instance;
}

async function stop(instance) {
  if (!instance) return;
  const { child } = instance;
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  pids.delete(instance);
}

async function ready(instance, url, expected) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (instance.child.exitCode !== null) break;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (!expected || expected(await response.json()))) return;
    } catch {
      // Wait for the new process to bind.
    }
    await delay(250);
  }
  throw new Error('Rehearsal process did not start at ' + url + '\n' + instance.log.join(''));
}

const frontendPort = Number(process.env.PRACTICE_REHEARSAL_WEB_PORT || 3012);
const apiPort = Number(process.env.PRACTICE_REHEARSAL_API_PORT || 5012);
const site = 'http://127.0.0.1:' + frontendPort;
const directApi = 'http://127.0.0.1:' + apiPort;

async function startApi(enabled) {
  await stop(api);
  api = start(
    "import {buildApp} from './dist/app.js'; const app=await buildApp(); await app.listen({host:'127.0.0.1',port:Number(process.env.PORT)});",
    resolve(backendRoot, 'backend'), {
      PORT: String(apiPort),
      NODE_ENV: 'test',
      EMAIL_ENABLED: 'false',
      PRACTICE_ENABLED: String(enabled),
      JUDGE0_API_URL: 'http://127.0.0.1:' + runner.address().port + '/submissions',
      JUDGE0_SEMAPHORE_KEY: 'dsa:merge-browser:' + database.pathname.slice(1),
      PRACTICE_COACHING_AI_URL: 'http://127.0.0.1:' + runner.address().port + '/coaching',
      PRACTICE_COACHING_AI_KEY: 'disposable-merge-coaching-key', PRACTICE_COACHING_AI_MODEL: 'merge-coaching-fixture',
      FRONTEND_URL: site,
      REWARD_AMOUNT_REFERRAL_QUALIFIED_REFERRER: '40',
      REWARD_AMOUNT_REFERRAL_QUALIFIED_REFERRED: '20',
    },
  );
  await ready(api, directApi + '/api/practice/availability', (body) => body.enabled === enabled);
}

try {
  const hostRequire = createRequire(resolve(backendRoot, 'backend/package.json'));
  const { PrismaClient } = hostRequire('@prisma/client');
  const { PrismaPg } = hostRequire('@prisma/adapter-pg');
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.href }) });
  await db.practiceCoachingInsight.deleteMany({ where: { userId: fixture.student.id } });
  await db.practiceHintAllowance.deleteMany({ where: { userId: fixture.student.id } });
  const hintProblem = await db.problem.findUniqueOrThrow({ where: { slug: 'count-above' }, select: { id: true } });
  await db.practiceHintCache.deleteMany({ where: { problemId: hintProblem.id } });
  await startApi(true);
  const web = start(
    "import {preview} from 'vite'; await preview({preview:{host:'127.0.0.1',port:Number(process.env.PRACTICE_WEB_PORT),strictPort:true,proxy:{'/api':{target:process.env.PRACTICE_HOST_API,changeOrigin:true}}}});",
    resolve(frontendRoot, 'frontend'), { PRACTICE_WEB_PORT: String(frontendPort), PRACTICE_HOST_API: directApi },
  );
  await ready(web, site + '/api/practice/availability', (body) => body.enabled);

  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
    headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const open = (path) => page.goto(site + path, { waitUntil: 'domcontentloaded' });
  const tools = page.getByRole('navigation', { name: 'Practice tools' });
  const problemName = 'Count Above a Threshold';
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  const responseFor = (path, method = 'POST') => page.waitForResponse((response) =>
    new URL(response.url()).pathname === path && response.request().method() === method);

  await open('/login');
  await page.locator('input[type=email]').fill(fixture.student.email);
  await page.locator('input[type=password]').fill(password);
  const login = responseFor('/api/auth/login');
  await page.locator('button[type=submit]').click();
  assert.equal((await login).status(), 200);
  await page.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  const refresh = responseFor('/api/auth/refresh');
  await open('/student/practice');
  assert.equal((await refresh).status(), 200);
  await tools.waitFor();
  assert.equal(new URL(page.url()).pathname, '/practice');
  await heading('Practice Problems').waitFor();
  await open('/student/problems?q=Count');
  await page.waitForURL(site + '/practice?q=Count');
  await heading('Practice Problems').waitFor();
  const problemLink = page.getByRole('link', { name: new RegExp(problemName) });
  await problemLink.waitFor();
  assert.equal(await page.locator('[data-dsa-sidebar]').count(), 1);
  await page.screenshot({ path: resolve(artifactDir, 'embedded-practice-desktop.png') });

  await page.getByRole('button', { name: 'Switch to Light Mode' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await problemLink.click();
  await heading(problemName).waitFor();
  assert.match(page.url(), /\/practice\/solve\/count-above$/);
  await open('/solve/count-above');
  await heading(problemName).waitFor();
  await page.locator('.monaco-editor .view-lines').click({ position: { x: 30, y: 10 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('function countAbove(values, threshold) { return values.filter(value => value > threshold).length; }');
  const run = responseFor('/api/practice/judge/run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const visible = await run;
  assert.equal(visible.status(), 200);
  assert.equal((await visible.json()).results.filter(({ passed }) => passed).length, 2);
  const submit = responseFor('/api/practice/judge/submit');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const saved = await submit;
  assert.equal(saved.status(), 200);
  const { submission } = await saved.json();
  assert.equal(submission.hiddenPassed, 2);
  await page.getByText('4 / 4 tests passed.', { exact: true }).waitFor();
  assert.equal(calls, 6);
  const rating = responseFor('/api/practice/submissions/' + submission.id + '/reflection');
  await page.getByRole('group', { name: 'How difficult did this problem feel?' }).getByRole('button', { name: 'Challenging', exact: true }).click();
  assert.equal((await rating).status(), 201);
  await page.getByText('You rated this challenging.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: 'Workspace panes' }).waitFor();
  const mobileRating = page.getByRole('group', { name: 'How difficult did this problem feel?' });
  await mobileRating.getByText('You rated this challenging.', { exact: true }).waitFor();
  assert.ok(await mobileRating.evaluate((node) => node.scrollWidth <= node.clientWidth));
  await page.screenshot({ path: resolve(artifactDir, 'submission-reflection-mobile.png') });
  await page.getByRole('navigation', { name: 'Workspace panes' }).getByRole('button', { name: 'Problem', exact: true }).click();
  const hints = page.locator('.solver-ai-hints');
  await hints.getByText('AI hints', { exact: true }).click();
  await hints.getByRole('button', { name: 'Approach', exact: true }).click();
  await hints.getByText('Scan the values once and count those above the threshold.', { exact: true }).waitFor();
  await hints.getByText('2 hints available today. Resets at midnight IST.', { exact: true }).waitFor();
  assert.equal(hintCalls, 1);
  assert.ok(await hints.evaluate((node) => node.scrollWidth <= node.clientWidth));
  await hints.screenshot({ path: resolve(artifactDir, 'solver-hints-mobile.png') });
  await open('/practice/dashboard?tab=analytics');
  await page.getByRole('heading', { name: 'Learner analytics', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Topic coverage', exact: true }).waitFor();
  const coaching = page.locator('.feature-card').filter({ has: page.getByRole('heading', { name: 'AI coaching', exact: true }) });
  assert.equal(coachingCalls, 0);
  await coaching.getByRole('button', { name: 'Generate coaching', exact: true }).click();
  await coaching.getByText('Practice breadth-first search on one graph.', { exact: true }).waitFor();
  assert.equal(coachingCalls, 1);
  await coaching.screenshot({ path: resolve(artifactDir, 'learner-coaching-mobile.png') });
  const weeklySolves = page.locator('.feature-card').filter({ has: page.getByRole('heading', { name: 'Weekly solves' }) });
  assert.ok(await weeklySolves.locator('.analytics-bars span').evaluateAll((bars) => bars.some((bar) => bar.clientHeight > 0)));
  await weeklySolves.getByText('View weekly totals', { exact: true }).click();
  assert.equal(await weeklySolves.locator('tbody tr').count(), 8);
  const recent = page.locator('.feature-card').filter({ has: page.getByRole('heading', { name: 'Recent submissions' }) });
  await recent.getByRole('link', { name: problemName }).first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: resolve(artifactDir, 'learner-analytics-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await open('/practice/solve/weighted-ticket-draw');
  await heading('Weighted Ticket Draw').waitFor();
  await page.getByText('Draw frequencies proportional to the weights', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Editor language').locator('option').count(), 6);
  await open('/practice/solve/minimum-stack-checkpoints');
  await heading('Minimum Stack Checkpoints').waitFor();
  assert.equal(await page.getByLabel('Editor language').locator('option').count(), 6);

  await open('/solve/' + fixture.problem.slug);
  await heading('Legacy teacher exercise').waitFor();
  await open('/practice/dashboard?tab=profile');
  const weeklyReviewToggle = (checked) => page.getByRole('checkbox', { name: 'Email me a weekly practice review', checked });
  await weeklyReviewToggle(false).click();
  await weeklyReviewToggle(true).waitFor();
  await page.reload();
  await weeklyReviewToggle(true).click();
  await weeklyReviewToggle(false).waitFor();
  await page.getByLabel('Public handle').fill('merge-rehearsal-solver');
  await page.getByLabel('Make my practice profile public').check();
  const updatedProfile = responseFor('/api/practice/study/profile', 'PUT');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  assert.equal((await updatedProfile).status(), 200);
  await page.setViewportSize({ width: 390, height: 844 });
  const external = page.getByRole('region', { name: 'LeetCode solve history' });
  await external.getByText('LeetCode sync is unavailable.', { exact: false }).waitFor();
  await external.getByLabel('LeetCode username').fill('merge_fixture');
  await external.getByLabel('Easy solves').fill('14');
  await external.getByLabel('Medium solves').fill('5');
  await external.getByRole('button', { name: 'Save manual counts' }).click();
  await external.getByRole('status').filter({ hasText: 'Self-reported counts saved.' }).waitFor();
  await page.getByRole('link', { name: 'View public profile' }).click();
  await page.getByText('19 LeetCode solves', { exact: true }).waitFor();
  await page.goBack();
  await external.getByRole('link', { name: 'LeetCode @merge_fixture' }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.equal(await external.locator('form').evaluate((form) => getComputedStyle(form).rowGap), '12px');
  await external.screenshot({ path: resolve(artifactDir, 'external-practice-mobile.png') });
  await external.getByRole('button', { name: 'Disconnect LeetCode' }).click();
  await external.getByRole('status').filter({ hasText: 'LeetCode disconnected.' }).waitFor();
  await page.getByRole('link', { name: 'View public profile' }).click();
  await heading('merge-rehearsal-solver').waitFor();
  assert.equal(await page.getByText('19 LeetCode solves', { exact: true }).count(), 0);
  console.log('Verified embedded mobile manual LeetCode stats, public projection, and disconnect.');
  await open('/practice');
  await tools.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await tools.getByRole('link', { name: 'Competitions', exact: true }).click();
  await heading('Competitions').waitFor();
  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: resolve(artifactDir, 'embedded-practice-mobile.png') });
  await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
  await heading('Leaderboard').waitFor();
  await page.getByRole('table', { name: 'Global rankings' }).getByRole('link', { name: 'merge-rehearsal-solver' }).waitFor();
  await page.getByRole('button', { name: 'My college' }).click();
  await heading('Disposable merge test').waitFor();
  await page.getByRole('table', { name: 'College rankings' }).locator('.leaderboard-self').getByRole('link', { name: 'merge-rehearsal-solver' }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: resolve(artifactDir, 'embedded-leaderboard-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await tools.getByRole('link', { name: 'Certifications', exact: true }).click();
  await heading('Certifications').waitFor();
  await heading('Arrays Master').waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 10);

  await tools.getByRole('link', { name: '3D Problem Arena' }).click();
  await page.waitForURL(site + '/problems');
  await open('/arrays');
  await page.locator('canvas').first().waitFor();

  const referral = await verifyEnabledReferral({ site, page, browser, db, referrerId: fixture.student.id, password });

  const collegeTeacher = await browser.newPage({ viewport: { width: 390, height: 844 } });
  collegeTeacher.on('pageerror', (error) => errors.push(error.message));
  await collegeTeacher.goto(site + '/login');
  await collegeTeacher.locator('input[type=email]').fill(fixture.teacher.email);
  await collegeTeacher.locator('input[type=password]').fill(password);
  await collegeTeacher.locator('button[type=submit]').click();
  await collegeTeacher.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  await collegeTeacher.goto(site + '/practice/placement?view=college');
  const cohortFilter = collegeTeacher.getByRole('navigation', { name: 'Cohort status' });
  await cohortFilter.getByRole('button', { name: 'Archived', exact: true }).click();
  await collegeTeacher.getByRole('button', { name: /Existing DSA class/ }).click();
  await collegeTeacher.getByRole('heading', { name: 'Existing DSA class', exact: true }).waitFor();
  assert.equal(await collegeTeacher.getByRole('button', { name: 'Import roster', exact: true }).count(), 0);
  const assignmentHistory = collegeTeacher.getByRole('navigation', { name: 'Assignment status' });
  await assignmentHistory.getByRole('button', { name: 'Archived', exact: true }).click();
  const historyItem = collegeTeacher.locator('article.assignment-item').filter({ hasText: 'Existing cohort exercise' });
  await historyItem.getByRole('button', { name: 'View completion', exact: true }).click();
  await historyItem.getByRole('region', { name: 'Student completion' }).getByText('Merge Student', { exact: true }).waitFor();
  await historyItem.getByRole('list', { name: 'Remaining problems' }).getByRole('link', { name: 'Count Above a Threshold', exact: true }).waitFor();
  assert.equal(await historyItem.getByRole('button', { name: 'Send reminder', exact: true }).count(), 0);
  await collegeTeacher.getByRole('button', { name: 'Placement team', exact: true }).click();
  await collegeTeacher.getByText('Merge Placement Officer', { exact: true }).waitFor();
  const teamLead = collegeTeacher.locator('.feature-row').filter({ hasText: 'Merge Placement Officer' });
  await teamLead.getByText('Team lead', { exact: true }).waitFor();
  assert.equal(await collegeTeacher.getByRole('button', { name: 'Add team member', exact: true }).count(), 0);
  await collegeTeacher.getByRole('button', { name: 'Readiness reports', exact: true }).click();
  await collegeTeacher.getByRole('heading', { name: 'Disposable merge test', exact: true }).waitFor();
  await collegeTeacher.getByText('Merge Student', { exact: true }).waitFor();
  assert.equal(await collegeTeacher.getByRole('button', { name: 'Download report PDF', exact: true }).count(), 1);
  await collegeTeacher.close();
  await db.practiceNotification.updateMany({ where: { userId: fixture.officer.id }, data: { readAt: null } });
  const placementOfficer = await browser.newPage({ viewport: { width: 390, height: 844 } });
  placementOfficer.on('pageerror', (error) => errors.push(error.message));
  await placementOfficer.goto(site + '/login');
  await placementOfficer.locator('input[type=email]').fill(fixture.officer.email);
  await placementOfficer.locator('input[type=password]').fill(password);
  await placementOfficer.locator('button[type=submit]').click();
  await placementOfficer.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  await placementOfficer.goto(site + '/practice/placement?view=verification');
  await placementOfficer.getByText('Approved', { exact: true }).waitFor();
  await placementOfficer.getByText('Evidence and decision', { exact: true }).click();
  await placementOfficer.getByText('DSA staff verification', { exact: true }).waitFor();
  await placementOfficer.getByRole('link', { name: 'Open placement team', exact: true }).waitFor();
  await placementOfficer.getByRole('link', { name: 'Notifications', exact: true }).click();
  await placementOfficer.getByRole('heading', { name: 'Placement officer application approved', exact: true }).waitFor();
  await placementOfficer.getByRole('heading', { name: 'You are the placement team lead', exact: true }).waitFor();
  let releaseRead;
  const deferredRead = new Promise((done) => { releaseRead = done; });
  await placementOfficer.route('**/api/practice/notifications/read-all', async (route) => {
    await deferredRead;
    await route.continue();
  });
  try {
    await placementOfficer.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await placementOfficer.getByRole('button', { name: 'Unread', exact: true }).click();
    await placementOfficer.getByRole('heading', { name: 'Placement officer application approved', exact: true }).waitFor();
  } finally {
    releaseRead();
  }
  await placementOfficer.getByText('You’re all caught up.', { exact: true }).waitFor();
  await placementOfficer.close();
  const auditPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  auditPage.on('pageerror', (error) => errors.push(error.message));
  await auditPage.goto(site + '/login');
  await auditPage.locator('input[type=email]').fill(fixture.superAdmin.email);
  await auditPage.locator('input[type=password]').fill(password);
  await auditPage.locator('button[type=submit]').click();
  await auditPage.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  await auditPage.goto(site + '/practice/community?view=audit');
  await auditPage.getByRole('heading', { name: 'Practice audit log', exact: true }).waitFor();
  const auditFilter = auditPage.locator('section.feature-card').filter({ has: auditPage.getByRole('heading', { name: 'Practice audit log', exact: true }) }).getByRole('combobox');
  await auditFilter.selectOption('placement');
  await auditPage.getByRole('heading', { name: 'Recruiter application reviewed', exact: true }).waitFor();
  await auditPage.getByRole('heading', { name: 'Officer application approved', exact: true }).waitFor();
  await auditPage.getByRole('button', { name: 'Analytics', exact: true }).click();
  await auditPage.getByRole('heading', { name: 'Practice overview', exact: true }).waitFor();
  await auditPage.getByRole('button', { name: 'Weekly', exact: true }).click();
  await auditPage.getByText('View trend data', { exact: true }).click();
  assert.equal(await auditPage.locator('details tbody tr').count(), 12);
  assert.ok(await auditPage.locator('.analytics-bars').evaluateAll((charts) => charts.every((chart) =>
    Array.from(chart.querySelectorAll('span')).some((bar) => bar.getBoundingClientRect().height > 0))));
  assert.ok(await auditPage.locator('details thead th').evaluateAll((columns) => columns.slice(1).every((column) => {
    const text = document.createRange();
    text.selectNodeContents(column);
    return text.getClientRects().length === 1;
  })));
  await auditPage.getByRole('heading', { name: 'Languages', exact: true }).waitFor();
  await auditPage.screenshot({ path: resolve(artifactDir, 'analytics-trend-mobile.png') });
  await auditPage.getByRole('button', { name: 'Accounts', exact: true }).click();
  await auditPage.getByLabel('Name or email').fill(fixture.student.email);
  await auditPage.getByRole('button', { name: 'Search accounts', exact: true }).click();
  const account = auditPage.locator('article').filter({ hasText: fixture.student.email });
  await account.getByRole('button', { name: 'Suspend Practice access', exact: true }).click();
  await account.getByLabel('Reason for suspending Practice access').fill('Embedded browser account verification');
  await account.getByRole('button', { name: 'Suspend Practice access', exact: true }).click();
  await account.getByText('Practice suspended', { exact: true }).waitFor();
  await account.getByRole('button', { name: 'Restore Practice access', exact: true }).click();
  await account.getByLabel('Reason for restoring Practice access').fill('Embedded browser account verification complete');
  await account.getByRole('button', { name: 'Restore Practice access', exact: true }).click();
  await account.getByText('Practice unrestricted', { exact: true }).waitFor();
  assert.ok(await auditPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await auditPage.screenshot({ path: resolve(artifactDir, 'practice-accounts-mobile.png') });
  await auditPage.getByRole('button', { name: 'Audit log', exact: true }).click();
  await auditFilter.selectOption('accounts');
  await auditPage.getByText('Embedded browser account verification complete', { exact: true }).first().waitFor();
  await auditPage.getByRole('button', { name: 'Administration', exact: true }).click();
  const imports = auditPage.locator('.opportunity-import');
  await imports.getByText('Import opportunities', { exact: true }).click();
  const title = 'DSA browser import ' + Date.now();
  await imports.getByLabel('Research text or JSON').fill(JSON.stringify({ opportunities: [{
    title, company: 'Rehearsal team', category: 'Internship', summary: 'A synthetic listing for the paired browser test.',
    applyUrl: 'https://example.org/apply', sourceUrl: 'https://example.org/source',
  }] }));
  await imports.getByRole('button', { name: 'Extract opportunities' }).click();
  const extracted = imports.getByRole('group', { name: title });
  await extracted.waitFor();
  assert.ok(await extracted.getByLabel('Include this listing').isChecked());
  assert.ok(await extracted.evaluate((node) => node.scrollWidth <= node.clientWidth));
  await extracted.screenshot({ path: resolve(artifactDir, 'opportunity-import-review-mobile.png') });
  await imports.getByRole('button', { name: 'Save selected listings' }).click();
  await imports.getByText('1 saved · 0 already imported · 0 need edits', { exact: true }).waitFor();
  const pending = auditPage.locator('.opportunity-admin-row').filter({ hasText: title });
  await pending.getByText(/Pending verification/).waitFor();
  assert.ok(await auditPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await pending.screenshot({ path: resolve(artifactDir, 'opportunity-import-mobile.png') });
  auditPage.once('dialog', (dialog) => dialog.accept());
  await pending.getByRole('button', { name: 'Verify source' }).click();
  await pending.getByRole('button', { name: 'Publish', exact: true }).click();
  await pending.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  const ambassadorPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  ambassadorPage.on('pageerror', (error) => errors.push(error.message));
  await ambassadorPage.goto(site + '/login');
  await ambassadorPage.locator('input[type=email]').fill(fixture.ambassador.email);
  await ambassadorPage.locator('input[type=password]').fill(password);
  await ambassadorPage.locator('button[type=submit]').click();
  await ambassadorPage.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  await ambassadorPage.goto(site + '/practice/community?view=ambassador');
  await ambassadorPage.getByLabel('College name').fill('Rehearsal Ambassador College');
  await ambassadorPage.getByLabel('College domain').fill('merge.test');
  await ambassadorPage.getByRole('button', { name: 'Apply to become an ambassador' }).click();
  await ambassadorPage.getByText('Application pending review.', { exact: true }).waitFor();
  await auditPage.reload();
  const ambassadorReview = auditPage.locator('.feature-row').filter({ hasText: 'Rehearsal Ambassador College' });
  await ambassadorReview.getByRole('button', { name: 'Approve', exact: true }).click();
  await ambassadorReview.waitFor({ state: 'detached' });
  await ambassadorPage.reload();
  await ambassadorPage.getByRole('button', { name: 'Claim 14 days', exact: true }).click();
  await ambassadorPage.getByRole('button', { name: 'Activate earned days', exact: true }).click();
  await ambassadorPage.getByText('14 days added to your Practice access.', { exact: true }).waitFor();
  assert.match(await ambassadorPage.getByLabel('Ambassador referral link').inputValue(), /\/signup\?ref=amb-/);
  assert.ok(await ambassadorPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await ambassadorPage.screenshot({ path: resolve(artifactDir, 'ambassador-mobile.png') });
  await ambassadorPage.goto(site + '/practice/plans');
  await ambassadorPage.getByRole('heading', { name: 'Ambassador reward', exact: true }).waitFor();
  await ambassadorPage.goto(site + '/practice/solve/count-above');
  await ambassadorPage.getByRole('link', { name: 'Mock interview', exact: true }).click();
  await ambassadorPage.getByRole('button', { name: 'Start 45-minute interview', exact: true }).click();
  await ambassadorPage.getByRole('heading', { name: 'AI interviewer', exact: true }).waitFor();
  await ambassadorPage.getByLabel('Your answer', { exact: true }).fill('I will count matches in one pass.');
  await ambassadorPage.getByRole('button', { name: 'Send answer', exact: true }).click();
  await ambassadorPage.getByText('What is the space complexity?', { exact: true }).waitFor();
  assert.equal(interviewCalls, 1);
  const interviewer = ambassadorPage.locator('section.feature-card').filter({ has: ambassadorPage.getByRole('heading', { name: 'AI interviewer', exact: true }) });
  assert.ok(await interviewer.evaluate((node) => node.scrollWidth <= node.clientWidth));
  await interviewer.screenshot({ path: resolve(artifactDir, 'mock-interview-mobile.png') });
  ambassadorPage.once('dialog', (dialog) => dialog.accept());
  await ambassadorPage.getByRole('button', { name: 'End interview', exact: true }).click();
  await ambassadorPage.getByRole('heading', { name: 'Interview complete', exact: true }).waitFor();
  await ambassadorPage.getByText(/2 questions/).waitFor();
  await ambassadorPage.close();
  await auditPage.close();

  const recruiterPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  recruiterPage.on('pageerror', (error) => errors.push(error.message));
  await recruiterPage.goto(site + '/login');
  await recruiterPage.locator('input[type=email]').fill(fixture.recruiter.email);
  await recruiterPage.locator('input[type=password]').fill(password);
  await recruiterPage.locator('button[type=submit]').click();
  await recruiterPage.waitForFunction(() => localStorage.getItem('dsa_has_session') === '1');
  await recruiterPage.goto(site + '/practice/placement?view=recruiter');
  await recruiterPage.getByLabel('University').selectOption({ label: 'Disposable merge test' });
  await recruiterPage.getByLabel('Preferred role').selectOption('Backend');
  await recruiterPage.getByLabel('Available for work').check();
  await recruiterPage.getByRole('button', { name: 'Search', exact: true }).click();
  const recruit = recruiterPage.locator('article.candidate-card').filter({ hasText: referral.handle });
  await recruit.getByText('Disposable merge test · Backend · Class of 2027', { exact: true }).waitFor();
  await recruit.getByText('10 XP', { exact: true }).waitFor();
  await recruit.getByRole('button', { name: 'Select', exact: true }).click();
  const connected = recruiterPage.locator('form').filter({ has: recruiterPage.getByRole('heading', { name: 'Contact ' + referral.handle, exact: true }) });
  const note = 'We would like to discuss a software engineering placement.';
  await connected.getByLabel('Message', { exact: true }).fill(note);
  await connected.getByRole('button', { name: 'Send in-app message', exact: true }).click();
  await connected.getByText('Saved.', { exact: true }).waitFor();
  const sentMessages = recruiterPage.locator('section').filter({ has: recruiterPage.getByRole('heading', { name: 'Sent messages', exact: true }) });
  await sentMessages.locator('article').filter({ hasText: note }).getByText('@' + referral.handle, { exact: true }).waitFor();
  const testForm = recruiterPage.locator('form').filter({ has: recruiterPage.getByRole('heading', { name: 'Assess ' + referral.handle, exact: true }) });
  const testTitle = 'Placement interview ' + randomUUID().slice(0, 8);
  await testForm.getByLabel('Title', { exact: true }).fill(testTitle);
  await testForm.getByLabel(problemName, { exact: true }).check();
  await testForm.getByRole('button', { name: 'Invite to skills test', exact: true }).click();
  await testForm.getByText('Saved.', { exact: true }).waitFor();
  await recruiterPage.close();

  await tools.getByRole('link', { name: 'Notifications', exact: true }).click();
  const contactNotice = page.locator('article.notification-entry').filter({ hasText: note });
  await contactNotice.getByRole('link', { name: 'Open', exact: true }).click();
  await page.locator('#recruiter-messages').getByText(note, { exact: true }).waitFor();
  assert.ok(new URL(page.url()).searchParams.get('message'));
  await tools.getByRole('link', { name: 'Notifications', exact: true }).click();
  const testNotice = page.locator('article.notification-entry').filter({ hasText: testTitle });
  await testNotice.getByRole('link', { name: 'Open', exact: true }).click();
  await page.locator('#skills-tests').getByText(testTitle, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start 45-minute test', exact: true }).waitFor();

  await tools.getByRole('link', { name: 'Your practice', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Sign profile', exact: true }).click();
  const verification = page.getByRole('link', { name: 'Open verification', exact: true });
  await verification.waitFor();
  const verificationUrl = site + await verification.getAttribute('href');
  const profileDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download profile PDF', exact: true }).click();
  const profile = await profileDownload;
  assert.equal(profile.suggestedFilename(), referral.handle + '-practice-profile.pdf');
  await profile.saveAs(resolve(artifactDir, 'signed-practice-profile.pdf'));
  const activityDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download activity report', exact: true }).click();
  const activity = await activityDownload;
  assert.equal(activity.suggestedFilename(), 'dsa-v2-practice-activity.pdf');
  await activity.saveAs(resolve(artifactDir, 'practice-activity-report.pdf'));
  await page.getByRole('button', { name: 'Download activity report', exact: true }).click();
  await page.getByText('Your free activity report has already been downloaded this month.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Practice plans', exact: true }).click();
  await page.getByText('You’ve used your free activity report this month.', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Pro Monthly', exact: true }).waitFor();
  const publicVerifier = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await publicVerifier.goto(verificationUrl);
  await publicVerifier.getByRole('heading', { name: 'Verified profile', exact: true }).waitFor();
  await publicVerifier.getByRole('link', { name: '@' + referral.handle, exact: true }).waitFor();
  assert.ok(await publicVerifier.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await publicVerifier.close();

  await verifyInstitutionOnboarding({ browser, db, site, password, adminEmail: fixture.superAdmin.email,
    fixtureEmail: fixture.student.email, screenshot: resolve(artifactDir, 'institution-onboarding-mobile.png') });

  await startApi(false);
  assert.equal((await page.request.get(site + '/api/practice/placement/interests/sent')).status(), 404);
  await verifyDisabledReferral({ site, db, password }, referral);
  await open('/practice');
  await page.getByText('Legacy teacher exercise', { exact: true }).waitFor();
  assert.equal(await tools.count(), 0);
  await open('/student/problems');
  await page.getByText('Legacy teacher exercise', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/student/problems');
  await open('/solve/' + fixture.problem.slug);
  await heading('Legacy teacher exercise').waitFor();

  await startApi(true);
  await open('/solve/count-above');
  await heading(problemName).waitFor();
  await page.getByRole('button', { name: 'Submissions', exact: true }).click();
  await page.getByRole('button', { name: /Accepted/ }).first().click();
  await page.locator('.history-list').getByText('You rated this challenging.', { exact: true }).waitFor();
  await open('/practice/placement?view=student');
  await page.locator('#recruiter-messages').getByText(note, { exact: true }).waitFor();
  await open('/practice/plans');
  await page.getByText('You’ve used your free activity report this month.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Verified DSA sign-in, refresh, aliases, legacy solver, theme, mobile layout, 3D canvas, Practice Run, Submit, AI hints, mock interviews, and persisted difficulty ratings, both new six-language design exercises, certification tracks, archived cohort and assignment history, placement team leadership, officer verification, readiness reporting, notifications, learner analytics and coaching, Practice audit log and admin analytics, ambassador application and activation, reviewed opportunity imports, recruiter filters, outreach and sent history, signed profile, activity PDFs and monthly allowance, global and college rankings, referral signup and credits, and rollback with restored history.');
  console.log('VERDICT: PASS');
} finally {
  await browser?.close();
  await db?.$disconnect();
  await Promise.all([...pids].map(stop));
  runner.closeAllConnections();
  await new Promise((done) => runner.close(done));
}
