import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { buildDriver } from '../src/modules/practice/drivers.js';
import { catalogueManifest, scanCatalogue, type Manifest } from '../src/modules/practice/catalogue-source.js';
import { persistCatalogue } from '../src/modules/practice/catalogue-store.js';
import { loadCatalogueSolutions, solutionManifest, verifyCatalogue } from '../src/modules/practice/catalogue-verification.js';
import { getProblem, listProblems } from '../src/modules/practice/repository.js';
import { practiceService } from '../src/modules/practice/service.js';

const temporary: string[] = [];
const scalar = { title: 'Batch total', topic: 'Arrays', difficulty: 'Easy', functionName: 'total', comparisonMode: 'exact' };
const starters = {
  'javascript.js': 'function total(values) { return 0; }',
  'python.py': 'class Solution:\n    def total(self, values):\n        return 0\n',
  'typescript.ts': 'function total(values: number[]): number { return 0; }',
  'java.java': 'class Solution {\n  public int total(int[] input) { return 0; }\n}',
  'cpp.cpp': 'class Solution {\npublic:\n  int total(const vector<int>& values) { return 0; }\n};',
  'c.c': 'int total(int* values, int count) { return 0; }',
};

async function fixture(slug: string, design?: 'all' | 'returningOnly') {
  const root = await mkdtemp(join(tmpdir(), 'practice-catalogue-'));
  temporary.push(root);
  const path = join(root, slug);
  await mkdir(join(path, 'starter'), { recursive: true });
  const meta = design ? {
    ...scalar, title: 'Level changes', functionName: 'Level', operationSequence: { enabled: true, resultMode: design },
  } : scalar;
  const visible = design ? {
    input: { initial: 5, operations: [['add', 3], ['value']] }, expectedOutput: design === 'all' ? [null, 8] : [8],
  } : { input: { values: [2, 8] }, expectedOutput: 10 };
  const hidden = design ? {
    input: { initial: 8, ops: ['add', 'value'], vals: [[-6], []] }, expectedOutput: design === 'all' ? [null, 2] : [2],
  } : { input: { values: [90210] }, expectedOutput: 90210 };
  const sources = design ? {
    'javascript.js': 'class Level { constructor(initial) {} add(x) {} value() { return 0; } }',
    'cpp.cpp': 'class Level {\npublic:\n  Level(int initial) {}\n  void add(int x) {}\n  int value() { return 0; }\n};',
  } : starters;
  const files = {
    'meta.json': JSON.stringify({ ...meta, id: 58, slug }),
    'description.md': 'Read each entry in the input and return the requested result.',
    'hints.json': JSON.stringify([{ level: 2, text: 'Add each entry.' }, { level: 1, text: 'Start at zero.' }]),
    'examples.json': JSON.stringify([{ input: 'fixture', output: 'fixture' }]),
    'constraints.json': JSON.stringify(['At most 1,000 entries.']),
    'testcases.json': JSON.stringify([visible]),
    'hidden-testcases.json': JSON.stringify([hidden]),
    'editorial.md': 'A direct iteration is sufficient.',
    ...Object.fromEntries(Object.entries(sources).map(([name, code]) => ['starter/' + name, code])),
  };
  await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(path, name), body)));
  return { root, path, slug };
}

async function review(root: string, slug: string, fields: Record<string, unknown> = {}, version = 'r1'): Promise<Manifest> {
  const offline = await scanCatalogue(root);
  const entry = offline.reports.find((row) => row.slug === slug)!;
  expect(entry.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  return catalogueManifest.parse({
    source: 'test-' + slug, version, entries: {
      [slug]: { approved: true, reviewer: 'Fixture author', rights: 'Original test data', sourceDigest: entry.sourceDigest, ...fields },
    },
  });
}

afterEach(async () => {
  const paths = temporary.splice(0);
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
});

it('audits all six starter ABIs without a database, and binds approval to the source digest', async () => {
  const { root, path, slug } = await fixture('batch-total');
  const audit = await scanCatalogue(root);
  expect(audit.reports[0]).toMatchObject({ status: 'blocked', languages: ['javascript', 'typescript', 'python', 'java', 'cpp', 'c'] });
  expect(audit.candidates.size).toBe(0);
  const manifest = await review(root, slug);
  const scan = await scanCatalogue(root, manifest);
  expect(scan.reports[0]?.status).toBe('ready');
  expect(scan.candidates.get(slug)?.spec).toMatchObject({
    nativeSignature: { args: ['int[]'], returns: 'int', pythonClass: 'Solution' },
    hints: ['Start at zero.', 'Add each entry.'],
  });
  expect(JSON.stringify(scan.reports)).not.toContain('90210');
  await writeFile(join(path, 'editorial.md'), 'A different explanation was added.');
  expect((await scanCatalogue(root, manifest)).reports[0]).toMatchObject({ status: 'blocked', reason: 'Folder contents changed since review.' });
});

it('preserves contest-only visibility declared in reviewed source metadata', async () => {
  const { root, path, slug } = await fixture('sealed-total');
  await writeFile(join(path, 'meta.json'), JSON.stringify({ ...scalar, id: 58, slug, visibility: 'contest' }));
  const scan = await scanCatalogue(root, await review(root, slug));
  expect(scan.candidates.get(slug)?.spec.contestOnly).toBe(true);
});

it('normalizes both design operation formats without changing their result mode', async () => {
  const { root, slug } = await fixture('level-changes', 'returningOnly');
  const manifest = await review(root, slug);
  const scan = await scanCatalogue(root, manifest);
  const spec = scan.candidates.get(slug)?.spec;
  expect(spec?.designContract).toMatchObject({
    className: 'Level', resultMode: 'returningOnly', signatures: {
      constructorArgs: ['int'], methods: { add: { args: ['int'], returns: 'void' }, value: { args: [], returns: 'int' } },
    },
  });
  expect(spec?.visible[0]?.input).toEqual({ operations: ['Level', 'add', 'value'], arguments: [[5], [3], []] });
  expect(spec?.hidden[0]?.input).toEqual({ operations: ['Level', 'add', 'value'], arguments: [[8], [-6], []] });
});

it('preserves the Code Club result layout without a constructor slot', async () => {
  const { root, slug } = await fixture('full-level-changes', 'all');
  const scan = await scanCatalogue(root, await review(root, slug));
  const spec = scan.candidates.get(slug)?.spec;
  expect(spec?.designContract).toMatchObject({ resultMode: 'all', includeConstructor: false });
  const code = 'class Level { constructor(n) { this.n=n; } add(x) { this.n+=x; } value() { return this.n; } }';
  const compiled = buildDriver('javascript', spec!, JSON.stringify(spec!.visible[0]!.input), code);
  const stdout: string[] = [];
  runInNewContext(compiled, { console: { log: (line: string) => stdout.push(line) } }, { timeout: 1_000 });
  expect(JSON.parse(stdout[0]!)).toEqual(spec!.visible[0]!.expected);
});

it('uses authoritative grading for reviewed runtime evidence and binds it to the converted content', async () => {
  const { root, path, slug } = await fixture('runtime-total');
  const manifest = await review(root, slug, { languages: ['javascript'] });
  const scan = await scanCatalogue(root, manifest);
  const contentDigest = scan.reports[0]?.contentDigest;
  expect(contentDigest).toMatch(/^[a-f0-9]{64}$/);
  const filename = join(root, 'solutions.json');
  const accepted = 'function total(values) { return values.reduce((sum, value) => sum + value, 0); }';
  const wrong = 'function total(values) { return values.length === 2 ? 10 : 0; }';
  await writeFile(join(root, 'accepted.js'), accepted);
  await writeFile(join(root, 'wrong.js'), wrong);
  const record = { contentDigest, languages: { javascript: { accepted: 'accepted.js', wrong: 'wrong.js' } } };
  await writeFile(filename, JSON.stringify({ entries: { [slug]: record } }));
  const { manifest: solutions, readSolution } = await loadCatalogueSolutions(filename);
  let executions = 0;
  const execute = async (script: string) => {
    executions++;
    let stdout = '';
    runInNewContext(script, { console: { log: (line: string) => { stdout = line; } } }, { timeout: 1_000 });
    return { status: 3, stdout, stderr: '', compileOutput: '', time: 0.01, memory: 64 };
  };
  const result = await verifyCatalogue(scan, manifest, solutions, readSolution, execute);
  expect(result).toMatchObject({ passed: true, reports: [{
    slug, contentDigest, status: 'passed', languages: [{ language: 'javascript', totalCases: 2, acceptedCases: 2, rejectedCases: 1 }],
  }] });
  expect(executions).toBe(4);
  expect(JSON.stringify(result)).not.toContain('90210');
  expect(JSON.stringify(result)).not.toContain(accepted);
  expect(solutionManifest.safeParse({ entries: { [slug]: {
    ...record, languages: { javascript: { accepted: '../outside.js', wrong: 'wrong.js' } },
  } } }).success).toBe(false);

  const stale = solutionManifest.parse({ entries: { [slug]: { ...record, contentDigest: '0'.repeat(64) } } });
  expect(await verifyCatalogue(scan, manifest, stale, readSolution, execute)).toMatchObject({
    passed: false, reports: [{ slug, status: 'stale-fixtures' }],
  });
  await writeFile(join(path, 'editorial.md'), 'Changed after approval.');
  const changed = await scanCatalogue(root, manifest);
  expect(await verifyCatalogue(changed, manifest, solutions, readSolution, execute)).toMatchObject({
    passed: false, reports: [{ slug, status: 'unapproved-content' }],
  });
  expect(executions).toBe(4);
});

const connection = process.env.PRACTICE_TEST_DATABASE_URL;
describe.skipIf(!connection)('catalogue apply on PostgreSQL', () => {
  it('preserves legacy identity and fields, leaves imports in draft, and updates revisions idempotently', async () => {
    const url = new URL(connection!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/practice_test') throw new Error('Use the disposable practice_test database.');
    const db = createDatabase(connection!);
    const { root, slug, path } = await fixture('batch-' + randomUUID());
    const university = await db.university.create({ data: { name: 'Import fixture university', emailDomains: [randomUUID() + '.test'] } });
    const author = await db.user.create({ data: {
      name: 'Legacy fixture author', email: randomUUID() + '@practice.test', role: 'STUDENT', emailVerified: true, passwordHash: 'test only',
      student: { create: { universityId: university.id, degree: 'Test', batch: 'Test', registerNumber: 'A-1' } },
    } });
    const oldCode = { javascript: 'legacy adapter' };
    const oldProblem = await db.problem.create({ data: {
      title: 'Legacy independent record', slug: 'legacy-' + randomUUID(), difficulty: 'MEDIUM',
      topic: 'Arrays', description: 'Legacy statement', starterCode: oldCode, expectedOutput: 44, isPublished: true, createdByUserId: author.id,
    } });
    try {
      const oldProgress = await db.studentProgress.create({ data: { studentId: author.id,
        problemId: oldProblem.id, status: 'SOLVED', attempts: 4, codeSubmission: 'legacy source', solvedAt: new Date(),
      } });
      const target = { id: oldProblem.id, slug: oldProblem.slug };
      const mapped = await review(root, slug, { target, visualizerPath: '/dsa/arrays' });
      const scan = await scanCatalogue(root, mapped);
      expect(await persistCatalogue(db, mapped, scan)).toEqual([expect.objectContaining({ status: 'new', target, contentVersion: 1 })]);
      expect(await db.practiceProblemContract.findUnique({ where: { problemId: target.id } })).toBeNull();
      expect(await persistCatalogue(db, mapped, scan, true)).toEqual([expect.objectContaining({ status: 'new', target })]);
      expect(await persistCatalogue(db, mapped, scan, true)).toEqual([expect.objectContaining({ status: 'unchanged', target, contentVersion: 1 })]);
      expect(await db.problem.findUnique({ where: { id: target.id } })).toEqual(oldProblem);
      const actor = author.id;
      await expect(getProblem(db, target.slug, actor, false)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await db.practiceProblemContract.update({ where: { problemId: target.id }, data: { enabled: true } });
      expect(await listProblems(db, actor)).toContainEqual(expect.objectContaining(target));
      const published = await getProblem(db, target.slug, actor, false);
      expect(published.starterCode).toMatchObject({ javascript: starters['javascript.js'] });
      expect(published.contract.cases).toHaveLength(1);
      expect(published.contract.catalogue?.visualizerPath).toBe('/dsa/arrays');
      let executionCalls = 0;
      const service = practiceService(db, async () => { executionCalls++; throw new Error('Must not send imported cases to the judge'); });
      expect(await service.detail(actor, target.slug)).toMatchObject({ status: 'SOLVED', visualizerPath: '/dsa/arrays', executionPending: true });
      const input = { problemSlug: target.slug, language: 'javascript' as const, code: 'function total(values) { return 0; }' };
      await expect(service.run(actor, input)).rejects.toMatchObject({ code: 'CATALOGUE_EXECUTION_PENDING', statusCode: 409 });
      await expect(service.submit(actor, { ...input, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'CATALOGUE_EXECUTION_PENDING', statusCode: 409 });
      expect(executionCalls).toBe(0);
      expect(await service.list(actor)).toContainEqual(expect.objectContaining({ ...target, status: 'SOLVED' }));

      await writeFile(join(path, 'testcases.json'), JSON.stringify([{ input: { values: [4] }, expectedOutput: 4 }]));
      const stale = await review(root, slug, { target, expectedContentVersion: 2 }, 'r2');
      expect(await persistCatalogue(db, stale, await scanCatalogue(root, stale))).toEqual([
        expect.objectContaining({ status: 'conflicting', reason: 'The reviewed content version does not match the database.' }),
      ]);
      const scheduled = await db.practiceCompetition.create({ data: {
        hostId: author.id, title: 'Pinned version fixture',
        startsAt: new Date(Date.now() + 60_000), endsAt: new Date(Date.now() + 120_000),
        problems: { create: { problemId: target.id, position: 0, version: 1 } },
      } });
      const updated = await review(root, slug, { target, expectedContentVersion: 1 }, 'r2');
      const next = await scanCatalogue(root, updated);
      expect(await persistCatalogue(db, updated, next, true)).toEqual([
        expect.objectContaining({ status: 'conflicting', reason: 'An open competition or assessment uses this version.' }),
      ]);
      await db.practiceCompetition.delete({ where: { id: scheduled.id } });
      const lobby = await db.practiceCompetition.create({ data: {
        hostId: author.id, title: 'Pinned lobby fixture', kind: 'BATTLE', isPrivate: true,
        joinCode: randomUUID(), battleDurationMinutes: 30, battleMaxTeamSize: 2,
        problems: { create: { problemId: target.id, position: 0, version: 1 } },
      } });
      expect(await persistCatalogue(db, updated, next, true)).toEqual([
        expect.objectContaining({ status: 'conflicting', reason: 'An open competition or assessment uses this version.' }),
      ]);
      await db.practiceCompetition.delete({ where: { id: lobby.id } });
      expect(await persistCatalogue(db, updated, next, true)).toEqual([expect.objectContaining({ status: 'updated', target, contentVersion: 2 })]);
      expect(await persistCatalogue(db, updated, next, true)).toEqual([expect.objectContaining({ status: 'unchanged', target, contentVersion: 2 })]);
      expect(await db.problem.findUnique({ where: { id: target.id } })).toEqual(oldProblem);
      expect(await db.studentProgress.findUnique({ where: { id: oldProgress.id } })).toEqual(oldProgress);
      expect((await getProblem(db, target.slug, actor, true)).contract.cases.map(({ expectedOutputJson }) => expectedOutputJson)).toEqual(['4', '90210']);
    } finally {
      await db.problem.delete({ where: { id: oldProblem.id } });
      await db.user.delete({ where: { id: author.id } });
      await db.university.delete({ where: { id: university.id } });
      await db.$disconnect();
    }
  }, 15_000);

  it('creates a fresh draft and reports an unmapped collision with the old catalogue', async () => {
    const db = createDatabase(connection!);
    const { root, slug } = await fixture('batch-' + randomUUID());
    const manifest = await review(root, slug);
    const scan = await scanCatalogue(root, manifest);
    const oldProblem = await db.problem.create({ data: {
      title: 'Legacy old data', slug, difficulty: 'EASY', topic: 'Arrays', description: 'Legacy described problem.',
    } });
    let created: string | undefined;
    try {
      expect(await persistCatalogue(db, manifest, scan, true)).toEqual([expect.objectContaining({ status: 'conflicting' })]);
      expect(await db.practiceProblemContract.findUnique({ where: { problemId: oldProblem.id } })).toBeNull();
      await db.problem.delete({ where: { id: oldProblem.id } });
      const [result] = await persistCatalogue(db, manifest, scan, true);
      expect(result).toMatchObject({ status: 'new', contentVersion: 1 });
      created = result?.target?.id;
      expect(created).toBeDefined();
      expect(await db.problem.findUnique({ where: { slug } })).toMatchObject({ id: created, isPublished: false });
      expect(await db.practiceProblemContract.findUnique({ where: { problemId: created! } })).toMatchObject({ enabled: false, contentVersion: 1 });
    } finally {
      await db.problem.deleteMany({ where: { id: { in: [oldProblem.id, ...(created ? [created] : [])] } } });
      await db.$disconnect();
    }
  }, 15_000);
});
