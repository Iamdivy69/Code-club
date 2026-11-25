import 'dotenv/config';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDatabase } from './database.js';
import { validJudgeEndpoint } from './execution.js';
import { readManifest, scanCatalogue } from './modules/practice/catalogue-source.js';
import { persistCatalogue } from './modules/practice/catalogue-store.js';
import { loadCatalogueSolutions, verifyCatalogue } from './modules/practice/catalogue-verification.js';
import { judge0 } from './modules/practice/judge.js';
import { languages } from './modules/practice/languages.js';

const usage = 'Usage: npm run catalogue:import -- --source <problem-folder> [--manifest <reviews.json>] [--compare | --apply | --solutions <solutions.json> --judge <controlled-endpoint>]';

async function main() {
  const { values } = parseArgs({ options: {
    source: { type: 'string' }, manifest: { type: 'string' }, compare: { type: 'boolean' },
    solutions: { type: 'string' }, judge: { type: 'string' },
    apply: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(usage); return; }
  if (!values.source) throw new Error(usage);
  const databaseMode = values.compare || values.apply;
  if ((values.compare && values.apply) || (databaseMode && (values.solutions || values.judge)) ||
      Boolean(values.solutions) !== Boolean(values.judge)) throw new Error(usage);
  if (databaseMode && !values.manifest) throw new Error('Database preview and apply require a reviewed manifest.');
  if (values.solutions && !values.manifest) throw new Error('Runtime verification requires a reviewed manifest.');
  const manifest = values.manifest ? await readManifest(resolve(values.manifest)) : undefined;
  const scan = await scanCatalogue(resolve(values.source), manifest);
  if (values.solutions && values.judge && manifest) {
    const url = URL.parse(values.judge);
    if (!url || !validJudgeEndpoint(url.href, 'development') || url.hash || url.hostname === 'ce.judge0.com') {
      throw new Error('Use a controlled Judge0 endpoint for reviewed private catalogue fixtures.');
    }
    const { manifest: solutions, readSolution } = await loadCatalogueSolutions(resolve(values.solutions));
    const execute = judge0(url.href, process.env.CATALOGUE_JUDGE_API_KEY, { rapidApiKey: process.env.CATALOGUE_JUDGE_RAPIDAPI_KEY });
    const verdict = await verifyCatalogue(scan, manifest, solutions, readSolution, execute);
    const runtimeIds = Object.fromEntries(Object.entries(languages).map(([language, { judgeId }]) => [language, judgeId]));
    console.log(JSON.stringify({ mode: 'runtime-verification', source: manifest.source, version: manifest.version,
      verifiedAt: new Date().toISOString(), runtimeIds, ...verdict }, null, 2));
    if (!verdict.passed) process.exitCode = 2;
    return;
  }
  let entries = scan.reports;
  if (databaseMode && manifest) {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for catalogue comparison or apply.');
    const db = createDatabase(process.env.DATABASE_URL);
    try { entries = await persistCatalogue(db, manifest, scan, values.apply); }
    finally { await db.$disconnect(); }
  }
  const counts: Record<string, number> = {};
  for (const { status } of entries) counts[status] = (counts[status] ?? 0) + 1;
  console.log(JSON.stringify({ mode: values.apply ? 'apply' : values.compare ? 'database-preview' : 'offline-preview', counts, entries }, null, 2));
  if (values.apply && entries.some(({ status }) => ['invalid', 'conflicting', 'unsupported'].includes(status))) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const isDatabaseFailure = typeof error === 'object' && error !== null && 'clientVersion' in error;
  console.error(isDatabaseFailure ? 'Catalogue database operation failed. Verify the connection, migrations, and concurrent changes.'
    : error instanceof Error ? error.message : 'Catalogue import failed.');
  process.exitCode = 1;
});
