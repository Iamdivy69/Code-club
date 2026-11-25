import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { additionalFixtures } from './catalogue-fixtures.mts';
import { createHash } from 'node:crypto';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { readManifest, scanCatalogue } from '../backend/src/modules/practice/catalogue-source.js';
import { buildDriver } from '../backend/src/modules/practice/drivers.js';
import { testCases } from '../backend/src/modules/practice/problem-spec.js';
import { solutionManifest } from '../backend/src/modules/practice/catalogue-verification.js';

// Never executes code or calls an execution service. Hidden fixtures stay in .local.
const { values } = parseArgs({ options: { source: { type: 'string' }, storage: { type: 'string' } } });
if (!values.source) throw new Error('Pass --source <exact pinned backend/problems>.');
const project = resolve(import.meta.dirname, '..');
const controlled = resolve(project, '.local');
const storage = resolve(values.storage ?? join(controlled, 'catalogue/candidate'));
const child = relative(controlled, storage);
if (!child || isAbsolute(child) || child.startsWith('..')) throw new Error('Storage must be inside CodeClub/.local.');
const reviewPath = join(project, 'integration/catalogue/reviewed-code-club.json');
const original = await readManifest(reviewPath);
const pinned = await scanCatalogue(resolve(values.source), original);
if (pinned.reports.length !== 250 || pinned.reports.some(row => row.status !== 'ready')) {
  throw new Error('Source must match all 250 approved folder digests.');
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
await mkdir(storage, { recursive: true });
const source = join(storage, 'problems');
await cp(resolve(values.source), source, { recursive: true });
const hiddenPath = join(source, 'two-sum/hidden-testcases.json');
const hidden = JSON.parse(await readFile(hiddenPath, 'utf8'));
// Original, unambiguous replacement for the defective first hidden case.
hidden[0] = { input: { nums: [17, 4, 21, 9], target: 13 }, expectedOutput: [1, 3] };
await writeFile(hiddenPath, JSON.stringify(hidden, null, 2) + '\n');
for (const name of ['testcases.json', 'hidden-testcases.json']) {
  const cases = JSON.parse(await readFile(join(source, 'two-sum', name), 'utf8'));
  for (const test of cases) {
    const pairs = [];
    const { nums, target } = test.input;
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) pairs.push([i, j]);
    }
    if (pairs.length !== 1 || JSON.stringify(pairs[0]) !== JSON.stringify(test.expectedOutput)) {
      throw new Error('Two Sum suite still has a nonunique or invalid expected result.');
    }
  }
}
const minStackPath = join(source, 'min-stack/hidden-testcases.json');
const minStackHidden = JSON.parse(await readFile(minStackPath, 'utf8'));
const minStackRepairs: number[] = [];
for (const [index, test] of pinned.candidates.get('min-stack')!.spec.hidden.entries()) {
  const input = test.input as { operations: string[]; arguments: number[][] };
  const stack: number[] = [];
  const expected: number[] = [];
  for (let i = 1; i < input.operations.length; i++) {
    switch (input.operations[i]) {
      case 'push': stack.push(input.arguments[i][0]); break;
      case 'pop': stack.pop(); break;
      case 'top': expected.push(stack[stack.length - 1]); break;
      case 'getMin': expected.push(Math.min(...stack)); break;
      default: throw new Error('Unknown Min Stack operation.');
    }
  }
  if (JSON.stringify(expected) !== JSON.stringify(test.expected)) {
    minStackHidden[index].expectedOutput = expected;
    minStackRepairs.push(index + 1);
  }
}
if (minStackRepairs.length !== 1) throw new Error('Expected exactly one pinned Min Stack hidden fixture repair.');
await writeFile(minStackPath, JSON.stringify(minStackHidden, null, 2) + '\n');
const starterNames: Record<string, string> = { javascript: 'javascript.js', typescript: 'typescript.ts', python: 'python.py', java: 'java.java', cpp: 'cpp.cpp', c: 'c.c' };
for (const [language, starter] of Object.entries(pinned.candidates.get('min-stack')!.spec.starters)) {
  await writeFile(join(source, 'min-stack/starter', starterNames[language]), starter);
}
const unreviewed = await scanCatalogue(source);
const repaired = unreviewed.reports.find(row => row.slug === 'two-sum')!;
const review = structuredClone(original);
review.version += '-standalone-fixture-r1';
review.entries['two-sum'] = { ...review.entries['two-sum'], sourceDigest: repaired.sourceDigest!,
  reviewer: 'CodeClub standalone fixture repair; authorized completion plan Gate A.2' };
review.entries['min-stack'] = { ...review.entries['min-stack'],
  execution: { designContract: pinned.candidates.get('min-stack')!.spec.designContract },
  sourceDigest: unreviewed.reports.find(row => row.slug === 'min-stack')!.sourceDigest!,
  reviewer: 'CodeClub standalone fixture repair; authorized completion plan Gate A.2' };
await writeFile(join(storage, 'reviewed.json'), JSON.stringify(review, null, 2) + '\n');
const scan = await scanCatalogue(source, review);
if (scan.reports.some(row => row.status !== 'ready')) throw new Error('Candidate conversion failed.');

const fixtures: Record<string, Record<string, [string, string]>> = {
  'contains-duplicate': {
    javascript: ['function containsDuplicate(nums) { return new Set(nums).size !== nums.length; }', 'function containsDuplicate(nums) { return false; }'],
    typescript: ['function containsDuplicate(nums: number[]): boolean { return new Set(nums).size !== nums.length; }', 'function containsDuplicate(nums: number[]): boolean { return false; }'],
    python: ['class Solution:\n    def containsDuplicate(self, nums):\n        return len(set(nums)) != len(nums)\n', 'class Solution:\n    def containsDuplicate(self, nums):\n        return False\n'],
    java: ['class Solution { public boolean containsDuplicate(int[] nums) { java.util.HashSet<Integer> seen = new java.util.HashSet<>(); for (int n : nums) if (!seen.add(n)) return true; return false; } }', 'class Solution { public boolean containsDuplicate(int[] nums) { return false; } }'],
    cpp: ['class Solution { public: bool containsDuplicate(vector<int>& nums) { std::set<int> seen; for (int n : nums) if (!seen.insert(n).second) return true; return false; } };', 'class Solution { public: bool containsDuplicate(vector<int>& nums) { return false; } };'],
    c: ['bool containsDuplicate(int* nums, int numsSize) { for (int i=0;i<numsSize;i++) for (int j=i+1;j<numsSize;j++) if (nums[i]==nums[j]) return true; return false; }', 'bool containsDuplicate(int* nums, int numsSize) { return false; }'],
  },
  'two-sum': {
    javascript: ['function twoSum(nums,target) { for(let i=0;i<nums.length;i++) for(let j=i+1;j<nums.length;j++) if(nums[i]+nums[j]===target) return [i,j]; return []; }', 'function twoSum(nums,target) { return []; }'],
    typescript: ['function twoSum(nums: number[],target: number): number[] { for(let i=0;i<nums.length;i++) for(let j=i+1;j<nums.length;j++) if(nums[i]+nums[j]===target) return [i,j]; return []; }', 'function twoSum(nums: number[],target: number): number[] { return []; }'],
    python: ['class Solution:\n    def twoSum(self, nums, target):\n        for i in range(len(nums)):\n            for j in range(i+1,len(nums)):\n                if nums[i]+nums[j] == target:\n                    return [i,j]\n        return []\n', 'class Solution:\n    def twoSum(self, nums, target):\n        return []\n'],
    java: ['class Solution { public int[] twoSum(int[] nums,int target) { for(int i=0;i<nums.length;i++) for(int j=i+1;j<nums.length;j++) if(nums[i]+nums[j]==target) return new int[]{i,j}; return new int[]{}; } }', 'class Solution { public int[] twoSum(int[] nums,int target) { return new int[]{}; } }'],
    cpp: ['class Solution { public: vector<int> twoSum(vector<int>& nums,int target) { for(int i=0;i<(int)nums.size();i++) for(int j=i+1;j<(int)nums.size();j++) if(nums[i]+nums[j]==target) return {i,j}; return {}; } };', 'class Solution { public: vector<int> twoSum(vector<int>& nums,int target) { return {}; } };'],
    c: ['int* twoSum(int* nums,int numsSize,int target,int* returnSize) { for(int i=0;i<numsSize;i++) for(int j=i+1;j<numsSize;j++) if(nums[i]+nums[j]==target) { int* out=(int*)malloc(2*sizeof(int)); out[0]=i;out[1]=j;*returnSize=2;return out;} *returnSize=0;return NULL; }', 'int* twoSum(int* nums,int numsSize,int target,int* returnSize) { *returnSize=0;return NULL; }'],
  },
};
Object.assign(fixtures, additionalFixtures);
const extensions: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', java: 'java', cpp: 'cpp', c: 'c' };
const solutions: { entries: Record<string, { contentDigest: string; languages: Record<string, { accepted: string; wrong: string }> }> } = { entries: {} };
let preparedPairs = 0;
for (const [slug, candidate] of scan.candidates) {
  const languages: Record<string, { accepted: string; wrong: string }> = {};
  for (const [language, [accepted, wrong]] of Object.entries(fixtures[slug] ?? {})) {
    if (!candidate.spec.starters[language as keyof typeof candidate.spec.starters]) continue;
    const directory = join(storage, 'solutions', slug);
    await mkdir(directory, { recursive: true });
    const paths = { accepted: `solutions/${slug}/accepted.${extensions[language]}`, wrong: `solutions/${slug}/wrong.${extensions[language]}` };
    await writeFile(join(storage, paths.accepted), accepted + '\n');
    await writeFile(join(storage, paths.wrong), wrong + '\n');
    for (const test of testCases(candidate.spec)) {
      buildDriver(language as any, candidate.spec, test.inputJson, accepted, test.expectedOutputJson);
      buildDriver(language as any, candidate.spec, test.inputJson, wrong, test.expectedOutputJson);
    }
    languages[language] = paths;
    preparedPairs++;
  }
  solutions.entries[slug] = { contentDigest: candidate.contentDigest, languages };
}
solutionManifest.parse(solutions);
await writeFile(join(storage, 'solutions.json'), JSON.stringify(solutions, null, 2) + '\n');
const pairs = scan.reports.reduce((sum, row) => sum + row.languages!.length, 0);
const report = {
  candidate: review.version, sourceRevision: original.version,
  approvedManifestSha256: sha(await readFile(reviewPath, 'utf8')),
  candidateManifestSha256: sha(await readFile(join(storage, 'reviewed.json'), 'utf8')),
  pinnedDigestMatches: pinned.reports.length, convertedEntries: scan.reports.length,
  structuralLanguagePairs: pairs, fixturePreparedPairs: preparedPairs, fixtureMissingPairs: pairs - preparedPairs,
  releaseRuntimeVerifiedPairs: 0, releaseGate: 'OPEN: controlled Judge0 verification and remaining solution fixtures required',
  repair: { slug: 'two-sum', location: 'hidden case 1', reason: 'Invalid expected indices and multiple valid pairs despite unique-solution statement.',
    correction: 'Replaced with an original unique-solution case; all stored Two Sum cases have exactly one valid expected pair.',
    originalSourceDigest: original.entries['two-sum'].sourceDigest, candidateSourceDigest: repaired.sourceDigest,
    disposition: 'draft-only until controlled runtime verification',
  },
  additionalRepair: { slug: 'min-stack', hiddenCases: minStackRepairs,
    reason: 'Final top() expectation did not match the stack operations; independently replayed all hidden operations.',
    originalSourceDigest: original.entries['min-stack'].sourceDigest,
    candidateSourceDigest: review.entries['min-stack'].sourceDigest,
    disposition: 'draft-only until controlled runtime verification' },
  sourceImplementationAudit: { folders: 250, solutionDirectories: 0, implementationFilesOutsideStarter: 0,
    editorialsWithCodeFences: 2, implementationCodeFences: 0, note: 'Both code fences contain text pseudocode or diagrams.' },
  entries: scan.reports.map(row => ({ slug: row.slug, sourceDigest: row.sourceDigest, contentDigest: row.contentDigest,
    languages: row.languages, targetUuid: row.target?.id ?? null, proposedVersion: 1, disposition: 'draft-only',
    fixtureLanguages: Object.keys(solutions.entries[row.slug].languages),
    fixtureDigests: Object.entries(fixtures[row.slug] ?? {}).map(([language, [accepted, wrong]]) => ({ language, acceptedDigest: sha(accepted + '\n'), wrongDigest: sha(wrong + '\n') })), runtimeVerifiedLanguages: [],
  })),
};
await writeFile(join(project, 'integration/catalogue/preparation-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pinnedDigestMatches: 250, convertedEntries: report.convertedEntries, structuralLanguagePairs: pairs,
  fixturePreparedPairs: preparedPairs, fixtureMissingPairs: pairs-preparedPairs, releaseRuntimeVerifiedPairs: 0,
  report: 'integration/catalogue/preparation-report.json', controlledStorage: relative(project, storage), verdict: 'PASS: preparation only; release gate OPEN' }, null, 2));
