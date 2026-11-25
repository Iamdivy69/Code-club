import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const files = [];
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.local', 'coverage', 'test-results', 'playwright-report', '.git'].includes(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || entry.name.endsWith('.log') || entry.name.endsWith('.tsbuildinfo')) continue;
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (entry.isFile()) files.push({ path: relative(root, full).replaceAll('\\', '/'), sha256: sha(await readFile(full)) });
  }
}
for (const folder of ['backend', 'frontend', 'shared', 'scripts', 'docker']) await scan(resolve(root, folder));
for (const name of ['package.json', 'package-lock.json', 'Dockerfile', 'compose.yml', '.env.example', '.dockerignore']) files.push({ path: name, sha256: sha(await readFile(resolve(root, name))) });
files.sort((a, b) => a.path.localeCompare(b.path));
const sourceRevision = sha(files.map(file => file.path + '\0' + file.sha256 + '\n').join(''));
const manifest = { candidate: 'codeclub-standalone-0.2.0-rc.1', sourceRevision, files };
const destination = resolve(root, 'integration/standalone/source-manifest.json');
await mkdir(resolve(root, 'integration/standalone'), { recursive: true });
await writeFile(destination, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ candidate: manifest.candidate, sourceRevision, files: files.length }));
