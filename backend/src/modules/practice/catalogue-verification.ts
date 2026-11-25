import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Candidate, Manifest, Scan } from './catalogue-source.js';
import type { PracticeLanguage } from './contracts.js';
import { evaluate } from './evaluation.js';
import type { Execute } from './judge.js';
import { languageKey } from './languages.js';
import { problemSlug, testCases } from './problem-spec.js';

const solutionPath = z.string().max(250).regex(/^[\w.-]+(?:\/[\w.-]+)*$/)
  .refine((path) => path.split('/').every((part) => part !== '.' && part !== '..'));
const fixtures = z.strictObject({ accepted: solutionPath, wrong: solutionPath });
const entry = z.strictObject({
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  languages: z.partialRecord(languageKey, fixtures),
});
export const solutionManifest = z.strictObject({ entries: z.record(problemSlug, entry) });
type Solutions = z.infer<typeof solutionManifest>;
type Fixture = z.infer<typeof fixtures>;
type ReadSolution = (path: string) => Promise<string>;

export async function loadCatalogueSolutions(path: string) {
  const root = await realpath(dirname(path));
  const raw: unknown = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  return {
    manifest: solutionManifest.parse(raw),
    async readSolution(solution: string) {
      const file = await realpath(resolve(root, solution));
      const child = relative(root, file);
      if (!child || isAbsolute(child) || child.split(/[\\/]/u)[0] === '..') throw new Error('Solution path is outside the fixture directory.');
      const info = await stat(file);
      if (!info.isFile() || info.size > 200_000) throw new Error('Expected a regular solution file.');
      const source = await readFile(file, 'utf8');
      if (!source.trim() || source.length > 50_000) throw new Error('Solution exceeds the solver limits.');
      return source;
    },
  };
}

const sha = (source: string) => createHash('sha256').update(source).digest('hex');

async function verifyLanguage(candidate: Candidate, language: PracticeLanguage, fixture: Fixture, read: ReadSolution, execute: Execute) {
  let programs: [string, string];
  try {
    programs = await Promise.all([read(fixture.accepted), read(fixture.wrong)]);
  } catch {
    return { status: 'invalid-fixture' } as const;
  }
  const [accepted, wrong] = programs;
  const acceptedDigest = sha(accepted);
  const wrongDigest = sha(wrong);
  if (acceptedDigest === wrongDigest) return { status: 'identical-fixtures' } as const;
  const cases = testCases(candidate.spec);
  try {
    let acceptedCases = 0;
    for (const test of cases) {
      const { verdict } = await evaluate(execute, candidate.spec, test, accepted, language);
      if (verdict !== 'ACCEPTED') return { status: 'accepted-fixture-failed', verdict, acceptedCases, totalCases: cases.length } as const;
      acceptedCases++;
    }
    let rejectedCases = 0;
    for (const test of cases) {
      const { verdict } = await evaluate(execute, candidate.spec, test, wrong, language);
      if (verdict === 'WRONG_ANSWER') rejectedCases++;
      else if (verdict !== 'ACCEPTED') return { status: 'wrong-fixture-invalid', verdict, acceptedCases, totalCases: cases.length } as const;
    }
    return { status: rejectedCases ? 'passed' : 'wrong-fixture-passed',
      acceptedCases, rejectedCases, totalCases: cases.length, acceptedDigest, wrongDigest } as const;
  } catch {
    return { status: 'execution-unavailable' } as const;
  }
}

export async function verifyCatalogue(scan: Scan, review: Manifest, solutions: Solutions, read: ReadSolution, execute: Execute) {
  const reports = [];
  const approved = Object.entries(review.entries).flatMap(([slug, record]) => record.approved ? [slug] : []);
  const slugs = new Set([...approved, ...Object.keys(solutions.entries)]);
  for (const slug of [...slugs].sort()) {
    const candidate = scan.candidates.get(slug);
    const record = solutions.entries[slug];
    if (!candidate) {
      reports.push({ slug, status: 'unapproved-content' as const });
      continue;
    }
    if (record?.contentDigest !== candidate.contentDigest) {
      reports.push({ slug, contentDigest: candidate.contentDigest, status: record ? 'stale-fixtures' as const : 'missing-fixtures' as const });
      continue;
    }
    const languages = [];
    for (const key of Object.keys(candidate.spec.starters)) {
      const language = languageKey.parse(key);
      const fixture = record.languages[language];
      const result = fixture ? await verifyLanguage(candidate, language, fixture, read, execute) : { status: 'missing-fixture' as const };
      languages.push({ language, ...result });
    }
    reports.push({ slug, sourceDigest: candidate.sourceDigest, contentDigest: candidate.contentDigest,
      status: languages.every(({ status }) => status === 'passed') ? 'passed' as const : 'failed' as const, languages });
  }
  return { passed: reports.length > 0 && reports.every(({ status }) => status === 'passed'), reports };
}
