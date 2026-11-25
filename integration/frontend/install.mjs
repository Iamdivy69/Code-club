import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { contained, digest, edit, includeSource, installPlan, normalize, pinnedTarget } from '../install-files.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const standalone = resolve(kit, '../..');
const pinned = JSON.parse(await readFile(join(kit, '../baseline.json'), 'utf8'));
const base = JSON.parse(await readFile(join(kit, 'baseline-files.json'), 'utf8'));
const certificateDependencies = JSON.parse(await readFile(join(kit, 'certificate-dependencies.json'), 'utf8'));
const entry = 'frontend/src/app/App.tsx';

const oldRoutes = `          <Route path="/practice"
            element={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
          />
          <Route path="/student/practice"
            element={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
          />
          <Route path="/student/problems"
            element={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
          />
          <Route path="/solve/:slug"
            element={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemSolvePage /></RoleRoute>}
          />`;

const newRoutes = `          <Route path="/practice/*" element={<PracticeMount
            protect={(page) => <ProtectedRoute>{page}</ProtectedRoute>}
            legacy={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
            notFound={<PlaceholderPage title="404 - Page Not Found" />}
          />} />
          <Route path="/student/practice" element={<PracticeCatalogueAlias
            legacy={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
          />} />
          <Route path="/student/problems" element={<PracticeCatalogueAlias
            legacy={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemsPage /></RoleRoute>}
          />} />
          <Route path="/solve/:slug" element={<PracticeSolverAlias
            protect={(page) => <ProtectedRoute>{page}</ProtectedRoute>}
            legacy={<RoleRoute roles={['STUDENT', 'TEACHER']}><ProblemSolvePage /></RoleRoute>}
          />} />`;

const afterImport = 'const ProblemSolvePage = lazyWithRetry(() => import("@/pages/problems/ProblemSolvePage"));';
const patch = [
  [afterImport, afterImport + '\n' +
    'const PracticeMount = lazyWithRetry(() => import("./PracticeMount").then(m => ({ default: m.PracticeMount })));\n' +
    'const PracticeCatalogueAlias = lazyWithRetry(() => import("./PracticeMount").then(m => ({ default: m.PracticeCatalogueAlias })));\n' +
    'const PracticeSolverAlias = lazyWithRetry(() => import("./PracticeMount").then(m => ({ default: m.PracticeSolverAlias })));'],
  [oldRoutes, newRoutes],
];

const patches = {
  ...certificateDependencies,
  [entry]: patch,
  'frontend/src/features/auth/Signup.tsx': [
    ['import { Link } from "react-router-dom";', 'import { Link, useSearchParams } from "react-router-dom";'],
    ['  const { signup } = useAuth();', '  const { signup } = useAuth();\n  const [query] = useSearchParams();\n  const referral = query.get("ref");'],
    ['        universityId,\n        ...(role === "STUDENT"',
      '        universityId,\n        ...(referral && { referral }),\n        ...(role === "STUDENT"'],
    ['      // AuthContext updates → App.tsx ProtectedRoute redirects', '      setIsSubmitted(true);'],
  ],
  'frontend/src/features/auth/AuthContext.tsx': [
    ['    const result = await authService.signup(payload);\n    localStorage.',
      '    const result = await authService.signup(payload);\n    if (result.requiresApproval) return;\n    localStorage.'],
  ],
  'frontend/src/types/auth.ts': [
    ['  // Student-specific (required when role=STUDENT)', '  referral?: string;\n  // Student-specific (required when role=STUDENT)'],
  ],
};

async function scopedStyles() {
  const require = createRequire(join(standalone, 'frontend/package.json'));
  let postcss;
  try { postcss = require('postcss'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('Run npm ci in CodeClub before generating the frontend installation plan.');
  }
  const original = await readFile(join(standalone, 'frontend/src/styles/index.css'), 'utf8');
  const css = postcss.parse(original);
  const standaloneOnly = /^(?::root\b|\[data-theme\b|html\b|body\b|\.app-shell\b|\.rail\b|\.rail-end\b|\.rail-link\b|\.shell-content\b|\.shell-message\b|\.brand\b|\.login-[\w-]+\b)/;
  css.walkAtRules(/^(import|tailwind)$/, (rule) => { rule.remove(); });
  css.walkRules((rule) => {
    const selectors = rule.selectors.filter((selector) => !standaloneOnly.test(selector));
    if (!selectors.length) rule.remove();
    else rule.selectors = selectors.map((selector) => ':where(.dsa-practice-content) ' + selector);
  });
  css.walkAtRules('media', (rule) => { if (!rule.nodes?.length) rule.remove(); });
  return '/* Practice view styles scoped to the DSA workspace. */\n' + normalize(css.toString()).trim() + '\n\n' +
    await readFile(join(kit, 'host.css'), 'utf8');
}

async function main() {
  const { values } = parseArgs({ options: { target: { type: 'string' }, apply: { type: 'boolean' } } });
  if (!values.target) throw new Error('Usage: node integration/frontend/install.mjs --target <DSA frontend checkout> [--apply]');
  const info = await pinnedTarget(values.target, standalone, pinned.frontend);
  const source = new Map();
  for (const folder of ['frontend/src/features/practice', 'frontend/src/features/platform']) {
    await includeSource(source, join(standalone, folder), folder);
  }
  for (const file of ['frontend/src/app/api-errors.ts', 'shared/src/types/practice.ts']) {
    source.set(file, await readFile(join(standalone, file), 'utf8'));
  }
  for (const file of ['PracticeMount.tsx', 'api.ts', 'session.tsx', 'theme.tsx']) {
    source.set('frontend/src/app/' + file, await readFile(join(kit, file), 'utf8'));
  }
  source.set('frontend/src/app/practice-host.css', await scopedStyles());

  const plan = installPlan(info);
  for (const [file, hash] of Object.entries(base)) {
    const path = await contained(info.target, file);
    const before = await readFile(path, 'utf8');
    const value = normalize(before);
    let expected = value;
    const edits = patches[file];
    if (edits && digest(value) === hash) expected = edit(value, edits, file);
    else if (digest(value) !== hash && (!edits || digest(edit(value, edits.map(([a, b]) => [b, a]), file)) !== hash)) {
      throw new Error('Unexpected host changes in ' + file);
    }
    plan.recordExisting(file, path, before, expected);
  }
  await plan.addFiles(source);
  await plan.report(values.apply);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
