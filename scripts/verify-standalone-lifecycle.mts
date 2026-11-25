import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'dotenv';
import bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from '../backend/src/database.js';
const root = new URL('../', import.meta.url);
const original = parse(await readFile(new URL('.env', root)));
const candidate = parse(await readFile(new URL('.local/rehearsal/clean.env', root)));
const old = createDatabase('postgresql://practice:local_practice@127.0.0.1:15432/practice?schema=public');
const restored = createDatabase('postgresql://practice:local_practice@127.0.0.1:35432/practice_upgrade?schema=public');
const fresh = createDatabase('postgresql://practice:local_practice@127.0.0.1:35433/practice?schema=public');
const released = createDatabase('postgresql://practice:local_practice@127.0.0.1:35432/practice?schema=public');
async function snapshot(db: ReturnType<typeof createDatabase>) {
  return { problems: await db.problem.count(), users: await db.user.count(), submissions: await db.practiceSubmission.count(), progress: await db.practiceProgress.count(), certificates: await db.practiceCertificate.count() };
}
async function login(origin: string, email: string, password: string) {
  const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, 'Preserved sign-in must work'); return response.json();
}
try {
  const before = await snapshot(old), after = await snapshot(restored); assert.deepEqual(after, before);
  const identity = { id: true, slug: true } as const;
  assert.deepEqual(await restored.problem.findMany({ select: identity, orderBy: { id: 'asc' } }), await old.problem.findMany({ select: identity, orderBy: { id: 'asc' } }));
  const beforeUser = await old.user.findUniqueOrThrow({ where: { email: 'student@practice.test' }, select: { id: true, passwordHash: true } });
  assert.deepEqual(await restored.user.findUniqueOrThrow({ where: { email: 'student@practice.test' }, select: { id: true, passwordHash: true } }), beforeUser);
  const originalEnvMatches = await bcrypt.compare(original.PRACTICE_SEED_PASSWORD ?? '', beforeUser.passwordHash);
  // Verify auth only on the disposable restored copy when its historical password is unavailable.
  if (!originalEnvMatches) await restored.user.update({ where: { id: beforeUser.id }, data: { passwordHash: await bcrypt.hash(candidate.PRACTICE_SEED_PASSWORD!, 4) } });
  try { await login('http://127.0.0.1:35011', 'student@practice.test', originalEnvMatches ? original.PRACTICE_SEED_PASSWORD! : candidate.PRACTICE_SEED_PASSWORD!); }
  finally { if (!originalEnvMatches) await restored.user.update({ where: { id: beforeUser.id }, data: { passwordHash: beforeUser.passwordHash } }); }
  const migrations = await restored.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.equal(Number(migrations[0]!.count), 50);
  const freshMigrations = await fresh.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.equal(Number(freshMigrations[0]!.count), 50);
  await login('http://127.0.0.1:34122', 'student@practice.test', candidate.PRACTICE_SEED_PASSWORD!);
  assert.equal((await fetch('http://127.0.0.1:34122/api/practice/health')).status, 200);
  const auth = await login('http://127.0.0.1:34121', 'student@practice.test', candidate.PRACTICE_SEED_PASSWORD!);
  const headers = { Authorization: 'Bearer ' + auth.accessToken, 'Content-Type': 'application/json' };
  assert.equal(await released.practiceCatalogueEntry.count(), 0, 'Public Judge0 candidate must contain original synthetic exercises only');
  const program = { problemSlug: 'count-above', language: 'javascript', code: 'function countAbove(values, threshold) { return values.filter(value => value > threshold).length; }' };
  const run = await fetch('http://127.0.0.1:34121/api/practice/judge/run', { method: 'POST', headers, body: JSON.stringify(program) });
  assert.equal(run.status, 200); const sample = await run.json(); assert.equal(sample.compileFailed, false); assert.ok(sample.results.length > 0 && sample.results.every((r: { passed: boolean }) => r.passed));
  const submit = await fetch('http://127.0.0.1:34121/api/practice/judge/submit', { method: 'POST', headers, body: JSON.stringify({ ...program, requestKey: randomUUID() }) });
  assert.equal(submit.status, 200); const graded = await submit.json(); assert.equal(graded.submission.verdict, 'Accepted'); assert.equal(graded.solved, true);
  const rows = await released.problem.findMany({ where: { isPublished: true, practiceContract: { enabled: true, contestOnly: false } }, orderBy: { slug: 'asc' }, select: { id: true, slug: true, title: true, starterCode: true, description: true, practiceContract: { include: { cases: { orderBy: [{ hidden: 'asc' }, { position: 'asc' }] } } } } });
  const problems = rows.map(({ practiceContract: contract, starterCode, description, ...problem }) => ({ ...problem, contentVersion: contract!.contentVersion, languages: Object.keys(starterCode as object).sort(), gradingDigest: createHash('sha256').update(JSON.stringify({ description, starterCode, functionName: contract!.functionName, parameterOrder: contract!.parameterOrder, nativeSignature: contract!.nativeSignature, designContract: contract!.designContract, comparisonMode: contract!.comparisonMode, cases: contract!.cases.map(({ position, hidden, inputJson, expectedOutputJson }) => ({ position, hidden, inputJson, expectedOutputJson })) })).digest('hex') }));
  const directory = new URL('integration/standalone/', root); await mkdir(directory, { recursive: true });
  await writeFile(new URL('published-content.json', directory), JSON.stringify({ candidate: '0.2.0-rc.1', scope: '17 existing original synthetic development exercises; approved reference catalogue is not published', problems }, null, 2) + '\n');
  await writeFile(new URL('docker-lifecycle.json', directory), JSON.stringify({ verdict: 'PASS', restoredBackup: '.local/backups/before-standalone-20261121.dump', original: before, restored: after, problemIdentitiesPreserved: true, learnerIdentityAndPasswordPreservedBeforeDisposableAuthFixture: true, originalEnvPasswordMatches: originalEnvMatches, upgradedAuth: originalEnvMatches ? 'original credential' : 'temporary password on disposable copy after preserved-hash assertion; original demo untouched', upgradeMigrations: 50, freshMigrations: 50, freshHealthAndSignIn: true, liveSyntheticRun: { passed: sample.results.length }, liveSyntheticSubmit: { verdict: graded.submission.verdict, passed: graded.submission.passed, total: graded.submission.total }, publishedProblems: problems.length, approvedCatalogueImported: false }, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: 'PASS', freshMigrations: 50, upgradeMigrations: 50, originalIdentityPreserved: true, run: 'PASS', submit: graded.submission.verdict, published: problems.length }));
} finally { await Promise.all([old, restored, fresh, released].map(db => db.$disconnect())); }
