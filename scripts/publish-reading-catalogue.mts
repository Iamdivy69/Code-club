import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { createDatabase } from '../backend/src/database.js';
import { readManifest, scanCatalogue } from '../backend/src/modules/practice/catalogue-source.js';
import { persistCatalogue } from '../backend/src/modules/practice/catalogue-store.js';
import { versionTransaction } from '../backend/src/modules/practice/version-transaction.js';
import { requirePracticeAdmin } from '../backend/src/modules/admin/access.js';
import { recordPracticeAudit } from '../backend/src/modules/admin/audit.js';
const root = resolve(import.meta.dirname, '..');
const db = createDatabase('postgresql://practice:local_practice@127.0.0.1:35432/practice?schema=public');
const reviews = await readManifest(resolve(root, '.local/catalogue/candidate/reviewed.json'));
assert.equal(reviews.source, 'code-club');
const scan = await scanCatalogue(resolve(root, '.local/catalogue/candidate/problems'), reviews);
assert.equal(scan.candidates.size, 250); assert.equal(scan.reports.length, 250);
const apply = process.argv.includes('--apply');
try {
  const preview = await persistCatalogue(db, reviews, scan);
  assert.ok(preview.every(row => row.status === 'new' || row.status === 'unchanged'));
  if (!apply) { console.log(JSON.stringify({ mode: 'preview', entries: preview.length, publication: 'read-edit-only', classifications: Object.fromEntries([...new Set(preview.map(row => row.status))].map(status => [status, preview.filter(row => row.status === status).length])) })); }
  else {
    const env = parse(await readFile(resolve(root, '.local/rehearsal/clean.env')));
    const origin = 'http://127.0.0.1:34121';
    const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@practice.test', password: env.PRACTICE_STAFF_PASSWORD }) });
    assert.equal(login.status, 200); const actor = (await login.json()).user;
    const existing = await db.problem.findMany({ where: { practiceContract: { catalogue: { is: null } } }, select: { id: true, slug: true, isPublished: true }, orderBy: { id: 'asc' } });
    const imported = await persistCatalogue(db, reviews, scan, true);
    assert.equal(imported.length, 250); assert.ok(imported.every(row => row.status === 'new' || row.status === 'unchanged'));
    const published = await versionTransaction(db, async tx => {
      await requirePracticeAdmin(tx, actor.id);
      const rows = await tx.practiceCatalogueEntry.findMany({ where: { source: reviews.source, sourceVersion: reviews.version }, select: { problemId: true, sourceSlug: true, contentDigest: true, sourceDigest: true, contract: { select: { contestOnly: true, enabled: true, problem: { select: { slug: true, isPublished: true } } } } }, orderBy: { sourceSlug: 'asc' } });
      assert.equal(rows.length, 250); assert.ok(rows.every(row => !row.contract.contestOnly));
      for (const row of rows) {
        assert.equal(row.contentDigest, scan.candidates.get(row.sourceSlug)!.contentDigest);
        if (!row.contract.enabled || !row.contract.problem.isPublished) {
          await tx.problem.update({ where: { id: row.problemId }, data: { isPublished: true, practiceContract: { update: { enabled: true } } } });
          await recordPracticeAudit(tx, actor.id, 'practice_problem_published', { id: row.problemId, type: 'problem', label: row.contract.problem.slug, state: 'read-edit-only' });
        }
      }
      return rows.map(row => ({ id: row.problemId, slug: row.contract.problem.slug, sourceDigest: row.sourceDigest, contentDigest: row.contentDigest }));
    }, 30_000);
    assert.deepEqual(await db.problem.findMany({ where: { id: { in: existing.map(row => row.id) } }, select: { id: true, slug: true, isPublished: true }, orderBy: { id: 'asc' } }), existing);
    const compare = await persistCatalogue(db, reviews, scan); assert.ok(compare.every(row => row.status === 'unchanged'));
    const counts = { total: await db.problem.count(), published: await db.problem.count({ where: { isPublished: true, practiceContract: { enabled: true, contestOnly: false } } }), readingOnly: published.length, originalExecutable: existing.length };
    const report = { mode: 'read-edit-publication', publishedOn: '2026-11-25', source: reviews.source, version: reviews.version, backup: '.local/backups/before-publication-20261125.dump', counts, existingProblemIdsAndPublicationPreserved: true, repeatCompareUnchanged: compare.length, execution: 'Imported catalogue Run, custom Run and Submit rejected before judge calls; full runtime verification remains open', problems: published };
    await writeFile(resolve(root, 'integration/catalogue/publication-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ verdict: 'PASS', ...counts, repeatCompareUnchanged: compare.length }));
  }
} finally { await db.$disconnect(); }
