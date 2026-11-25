import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { contained, digest, edit, includeSource, installPlan, normalize, pinnedTarget } from '../install-files.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const standalone = resolve(kit, '../..');
const pinned = JSON.parse(await readFile(join(kit, '../baseline.json'), 'utf8'));
const base = JSON.parse(await readFile(join(kit, 'baseline-files.json'), 'utf8'));
const schema = 'backend/prisma/schema.prisma';
const migrationDir = 'backend/prisma/migrations';
const featureRoot = 'backend/src/modules/practice-platform';
const firstPracticeMigration = '20261118000000_add_practice';

const visibilityImport = "import { legacyVisibleProblem } from '../modules/practice-platform/modules/practice/visibility.js';";
const legacyQuery = [
  "import { prisma } from '../config/database.js';",
  "import { prisma } from '../config/database.js';\n" + visibilityImport,
];

const changes = {
  'backend/src/app.ts': [
    ["import { prisma } from './config/database.js';",
      "import { prisma } from './config/database.js';\nimport { dsaPractice } from './modules/practice-platform/dsa-host.js';"],
    ['  await app.register(registerAllRoutes);',
      "  await app.register(registerAllRoutes);\n  await app.register(dsaPractice, { prefix: '/api/practice' });"],
  ],
  'backend/src/middleware/auth.middleware.ts': [
    ['requireAuth(request: FastifyRequest, _reply: FastifyReply)',
      'requireAuth(request: FastifyRequest, _reply?: FastifyReply)'],
  ],
  'backend/src/services/auth.service.ts': [
    ["import { prisma } from '../config/database.js';",
      "import { prisma } from '../config/database.js';\n" +
      "import { recordSignupReferral } from '../modules/practice-platform/modules/community/referrals.js';\n" +
      "import { practiceEnabled } from '../modules/practice-platform/rollout.js';"],
    ['    return newUser;\n  });',
      '    if (data.referral && practiceEnabled()) await recordSignupReferral(tx, newUser.id, data.referral);\n\n    return newUser;\n  });'],
  ],
  'backend/src/routes/teacherProblems.routes.ts': [
    legacyQuery,
    ['            where: {\n                OR: [', '            where: {\n                ...legacyVisibleProblem,\n                OR: ['],
    ...['const updateData', 'const updated', 'await prisma.problem.delete'].map((next) => {
      const owner = '            where: { id, createdByUserId: req.user!.userId },';
      const following = "\n        });\n        if (!existing) return reply.status(404).send({ message: 'Not found' });\n" +
        (next === 'const updateData' ? '\n' : '') + '        ' + next;
      return [owner + following, owner.replace('{ id,', '{ ...legacyVisibleProblem, id,') + following];
    }),
  ],
  'backend/src/routes/sessions.routes.ts': [
    legacyQuery,
    ['where: { title: problemTitle },', 'where: { ...legacyVisibleProblem, title: problemTitle },'],
  ],
  'backend/src/services/progress.service.ts': [
    legacyQuery,
    ['where: { id: input.problemId },', 'where: { id: input.problemId, ...legacyVisibleProblem },'],
  ],
  'backend/src/repositories/student.repository.ts': [
    legacyQuery,
    ['    prisma.problem.count(),', '    prisma.problem.count({ where: legacyVisibleProblem }),'],
  ],
  'backend/src/repositories/teacher.repository.ts': [
    legacyQuery,
    ['  const totalProblems = await prisma.problem.count();', '  const totalProblems = await prisma.problem.count({ where: legacyVisibleProblem });'],
  ],
  'backend/src/types/auth.types.ts': [
    ["import { z } from 'zod';",
      "import { z } from 'zod';\nimport { referralHandle } from '../modules/practice-platform/modules/community/referrals.js';"],
    ['    department: z.string().optional(),',
      '    department: z.string().optional(),\n    referral: referralHandle.optional().catch(undefined),'],
  ],
};

async function main() {
  const { values } = parseArgs({ options: { target: { type: 'string' }, apply: { type: 'boolean' } } });
  if (!values.target) throw new Error('Usage: node integration/backend/install.mjs --target <DSA backend checkout> [--apply]');
  const info = await pinnedTarget(values.target, standalone, pinned.backend);
  const { target } = info;

  const files = new Map();
  await includeSource(files, join(standalone, 'backend/src/modules'), featureRoot + '/modules');
  for (const file of ['platform.ts', 'execution.ts', 'errors.ts', 'database.ts', 'placement-reminders.ts', 'weekly-review.ts']) {
    files.set(featureRoot + '/' + file, await readFile(join(standalone, 'backend/src', file), 'utf8'));
  }
  for (const file of ['dsa-host.ts', 'rollout.ts']) {
    files.set(featureRoot + '/' + file, await readFile(join(kit, file), 'utf8'));
  }
  files.set('backend/.env.practice.example', await readFile(join(kit, 'practice.env.example'), 'utf8'));

  const extensionSchema = await readFile(join(standalone, schema), 'utf8');
  const migrations = await readdir(join(standalone, migrationDir), { withFileTypes: true });
  const extensions = migrations.filter((item) => item.name >= firstPracticeMigration && item.isDirectory());
  for (const { name } of extensions) {
    const path = migrationDir + '/' + name + '/migration.sql';
    files.set(path, await readFile(join(standalone, path), 'utf8'));
  }
  if (!extensions.length) throw new Error('The kit has no Practice migrations.');
  const targetMigrations = await readdir(join(target, migrationDir));
  const allowedMigrations = new Set([...Object.keys(base), ...files.keys()]
    .filter((path) => path.startsWith(migrationDir + '/')).map((path) => path.slice(migrationDir.length + 1).split('/')[0]));
  for (const name of targetMigrations) {
    if (!allowedMigrations.has(name)) throw new Error('Unexpected host migration ' + name);
  }

  const plan = installPlan(info);
  for (const [file, hash] of Object.entries(base)) {
    const path = await contained(target, file);
    const before = await readFile(path, 'utf8');
    const value = normalize(before);
    let expected = value;
    if (file === schema) {
      expected = normalize(extensionSchema);
      if (digest(value) !== hash && value !== expected) throw new Error('Unexpected host schema drift.');
      if (value !== expected) {
        const lines = value.trimEnd().split('\n');
        let index = 0;
        for (const line of expected.split('\n')) if (line === lines[index]) index++;
        if (index !== lines.length) throw new Error('The Practice schema alters existing host declarations.');
      }
    } else if (changes[file]) {
      if (digest(value) === hash) expected = edit(value, changes[file], file);
      else if (digest(edit(value, changes[file].map(([a, b]) => [b, a]), file)) !== hash) {
        throw new Error('Unexpected host changes in ' + file);
      }
    } else if (digest(value) !== hash) throw new Error('Unexpected host changes in ' + file);
    if (file.startsWith(migrationDir + '/') && digest(await readFile(join(standalone, file), 'utf8')) !== hash) {
      throw new Error('A DSA base migration changed in the standalone kit: ' + file);
    }
    plan.recordExisting(file, path, before, expected);
  }
  await plan.addFiles(files);
  await plan.report(values.apply);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
