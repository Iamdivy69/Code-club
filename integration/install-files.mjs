import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export const normalize = (value) => value.replace(/\r\n/g, '\n');
export const digest = (value) => createHash('sha256').update(normalize(value)).digest('hex');

async function optionalRead(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function statIfPresent(path) {
  try { return await lstat(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function pinnedTarget(directory, standalone, revision) {
  const target = await realpath(resolve(directory));
  if (target === standalone) throw new Error('Choose a separate DSA checkout or archive.');
  const revisionChecked = Boolean(await statIfPresent(join(target, '.git')));
  if (revisionChecked) {
    const observed = spawnSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (observed.status !== 0 || observed.stdout.trim() !== revision) {
      throw new Error('The checkout must be at the pinned revision ' + revision);
    }
  }
  return { target, expectedRevision: revision, revisionChecked };
}

export async function contained(root, path) {
  const location = join(root, path);
  let parent = location;
  while (!(await statIfPresent(parent))) parent = dirname(parent);
  const actual = await realpath(parent);
  if (resolve(actual, relative(parent, location)) !== location) {
    throw new Error('Resolve links in the installation destination before applying: ' + path);
  }
  return location;
}

export function edit(value, edits, file) {
  for (const [before, after] of edits) {
    if (value.split(before).length !== 2) throw new Error('Expected a unique edit in ' + file);
    value = value.replace(before, after);
  }
  return value;
}

export async function includeSource(files, root, destination) {
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    const target = destination + '/' + item.name;
    if (item.isDirectory()) await includeSource(files, path, target);
    if (item.isFile() && /\.tsx?$/.test(item.name)) files.set(target, await readFile(path, 'utf8'));
  }
}

export function installPlan(info) {
  const files = [];
  const pending = [];
  return {
    recordExisting(file, path, before, expected) {
      const changed = normalize(before) !== expected;
      if (changed) pending.push({ path, file, before, content: before.includes('\r\n') ? expected.replace(/\n/g, '\r\n') : expected });
      files.push({ file, action: changed ? 'update' : 'verify', sha256: digest(expected) });
    },
    async addFiles(source) {
      for (const [file, content] of [...source.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const path = await contained(info.target, file);
        const before = await optionalRead(path);
        if (before === null) pending.push({ path, file, before, content });
        else if (digest(before) !== digest(content)) throw new Error('Conflicting file already exists: ' + file);
        files.push({ file, action: before === null ? 'create' : 'verify', sha256: digest(content) });
      }
    },
    async report(apply) {
      if (apply) {
        for (const { path, file, before, content } of pending) {
          if (await optionalRead(path) !== before) throw new Error('Destination changed after preflight: ' + file);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content, { flag: before === null ? 'wx' : 'w' });
        }
      }
      console.log(JSON.stringify({ ...info, mode: apply ? 'apply' : 'preflight', changes: pending.length, files }, null, 2));
    },
  };
}
