import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { weightedExpectation, type PracticeLanguage } from './contracts.js';
import { buildDriver } from './drivers.js';
import { languageKey } from './languages.js';
import { inferDesign, inferSignature, matchingStarter } from './catalogue-signatures.js';
import { identifier, problemSlug, problemSpec, type ProblemSpec } from './problem-spec.js';
import { referenceDesign } from './reference-designs.js';
import { weightedExpectationJson } from './weighted-sampling.js';

const fileLimit = 2_000_000;
const text = z.string().trim().min(1);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const visibleCase = z.object({ input: z.record(z.string(), z.json()), expectedOutput: z.json() });
const cases = z.array(visibleCase).min(1).max(15);
const metaSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  slug: problemSlug, title: text, topic: text,
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  functionName: identifier,
  comparisonMode: z.enum(['exact', 'unordered']).default('exact'),
  visibility: z.enum(['public', 'contest']).default('public'),
  returnType: z.record(z.string(), z.string()).default({}),
  operationSequence: z.object({ enabled: z.boolean(), resultMode: z.enum(['all', 'returningOnly']) }).optional(),
});
const starterFiles = {
  javascript: 'javascript.js', typescript: 'typescript.ts', python: 'python.py',
  java: 'java.java', cpp: 'cpp.cpp', c: 'c.c',
} as const;

const overrides = problemSpec.pick({ parameterOrder: true, nativeSignature: true, designContract: true }).partial();
const reviewSchema = z.strictObject({
  approved: z.boolean(), reviewer: text.max(200), rights: text.max(1_000), sourceDigest: digest,
  expectedContentVersion: z.number().int().positive().optional(),
  languages: z.array(languageKey).min(1).max(6).optional(),
  execution: overrides.optional(),
  target: z.strictObject({ id: z.uuid(), slug: problemSlug }).optional(),
  visualizerPath: z.string().max(250).regex(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/).optional(),
});
export const catalogueManifest = z.strictObject({
  source: text.max(100).regex(/^[a-z0-9][a-z0-9_.-]*$/),
  version: text.max(120),
  entries: z.record(problemSlug, reviewSchema),
});
type Review = z.infer<typeof reviewSchema>;
export type Manifest = z.infer<typeof catalogueManifest>;
type Json = z.infer<ReturnType<typeof z.json>>;
type EntryCase = { input: Record<string, Json>; expected: Json };
export type Candidate = { spec: ProblemSpec; review: Review; sourceId: string; sourceDigest: string; contentDigest: string };
export type ImportStatus = 'ready' | 'blocked' | 'invalid' | 'unsupported' | 'conflicting' | 'new' | 'unchanged' | 'updated';
export type EntryReport = {
  slug: string; status: ImportStatus; reason?: string; sourceId?: string; sourceDigest?: string;
  contentDigest?: string; topic?: string; difficulty?: ProblemSpec['difficulty']; visibility?: 'public' | 'contest';
  languages?: string[]; excludedLanguages?: string[]; target?: { id: string; slug: string };
  visualizerPath?: string; contentVersion?: number;
};
export type Scan = { reports: EntryReport[]; candidates: Map<string, Candidate> };

class FolderError extends Error {
  constructor(message: string, readonly status: 'invalid' | 'unsupported' = 'invalid') { super(message); }
}

async function readText(path: string, label: string, optional = false) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > fileLimit) throw new FolderError(label + ' must be a regular file under 2 MB.');
    return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
    if (error instanceof FolderError) throw error;
    throw new FolderError(label + ' could not be read.');
  }
}

function parse<T>(source: string, label: string, schema: z.ZodType<T>) {
  let raw: unknown;
  try { raw = JSON.parse(source); } catch { throw new FolderError(label + ' contains invalid JSON.'); }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const paths = result.error.issues.slice(0, 4).map((issue) => issue.path.join('.') || 'document');
    throw new FolderError(label + ' failed validation at ' + paths.join(', ') + '.');
  }
  return result.data;
}

export async function readManifest(path: string) {
  return parse((await readText(path, 'Review manifest'))!, 'Review manifest', catalogueManifest);
}

async function readFolder(folder: string) {
  const filenames = ['meta.json', 'description.md', 'constraints.json', 'examples.json', 'hints.json',
    'editorial.md', 'testcases.json', 'hidden-testcases.json'] as const;
  const starterDir = await lstat(join(folder, 'starter')).catch(() => null);
  if (!starterDir?.isDirectory()) throw new FolderError('Missing starter directory.');
  const files = await Promise.all(filenames.map(async (name) => [name, (await readText(join(folder, name), name))!] as const));
  const starters: ProblemSpec['starters'] = {};
  const starterEntries: Array<[string, string]> = [];
  for (const language of Object.keys(starterFiles) as PracticeLanguage[]) {
    const name = starterFiles[language];
    const code = await readText(join(folder, 'starter', name), 'starter/' + name, true);
    if (code !== undefined) {
      starterEntries.push(['starter/' + name, code]);
      if (code.trim()) starters[language] = code;
    }
  }
  const document = Object.fromEntries(files) as Record<typeof filenames[number], string>;
  const sourceDigest = createHash('sha256').update(JSON.stringify([...files, ...starterEntries])).digest('hex');
  return { document, sourceDigest, starters };
}

function sequence(input: Record<string, Json>, className: string) {
  const opKey = Object.hasOwn(input, 'ops') ? 'ops' : 'operations';
  const opList = input[opKey];
  if (!Array.isArray(opList)) throw new FolderError('Operation list is missing.');
  if (opList[0] === className && Array.isArray(input.arguments)) return {
    operations: opList as string[], arguments: input.arguments as Json[][],
  };
  const argKey = opList.every((operation) => typeof operation === 'string') ? 'vals' : undefined;
  const values = argKey ? input[argKey] : undefined;
  const ctor = Object.entries(input).filter(([key]) => key !== opKey && key !== argKey).map(([, item]) => item);
  if (argKey) {
    const args = values === undefined ? opList.map(() => []) : values;
    if (!Array.isArray(args) || args.length !== opList.length || args.some((item) => !Array.isArray(item))) {
      throw new FolderError('Operation names and arguments must have the same length.');
    }
    return { operations: [className, ...opList as string[]], arguments: [ctor, ...args as Json[][]] };
  }
  if (!opList.every((item) => Array.isArray(item) && typeof item[0] === 'string')) throw new FolderError('Invalid operation tuple.');
  const tuples = opList as [string, ...Json[]][];
  return { operations: [className, ...tuples.map(([name]) => name)], arguments: [ctor, ...tuples.map((tuple) => tuple.slice(1))] };
}

function chooseSpec(slug: string, meta: z.infer<typeof metaSchema>, folder: Awaited<ReturnType<typeof readFolder>>, review?: Review) {
  const { document: doc } = folder;
  const publicCases = parse(doc['testcases.json'], 'testcases.json', cases);
  const privateCases = parse(doc['hidden-testcases.json'], 'hidden-testcases.json', cases);
  const constraints = parse(doc['constraints.json'], 'constraints.json', z.array(text));
  parse(doc['examples.json'], 'examples.json', z.array(z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })));
  const hints = parse(doc['hints.json'], 'hints.json', z.array(z.union([text, z.object({ level: z.number().int().positive(), text })])))
    .map((hint, index) => typeof hint === 'string' ? { level: index + 1, text: hint } : hint)
    .sort((left, right) => left.level - right.level).map((hint) => hint.text);
  const normalize = ({ input, expectedOutput }: z.infer<typeof visibleCase>): EntryCase => ({ input, expected: expectedOutput });
  let visible = publicCases.map(normalize);
  let hidden = privateCases.map(normalize);
  const allCases = [...visible, ...hidden];
  let order = review?.execution?.parameterOrder ?? Object.keys(visible[0]!.input);
  let nativeSignature = review?.execution?.nativeSignature;
  const reference = review?.execution?.designContract ? undefined : referenceDesign(slug, folder.sourceDigest);
  const starters = reference?.starters ?? folder.starters;
  let design = review?.execution?.designContract ?? reference?.design;
  if (meta.operationSequence?.enabled || design) {
    const className = design?.className ?? meta.functionName;
    const normalized = allCases.map(({ input, expected }) => ({
      input: sequence(input, className),
      expected: reference?.design.weightedSampling && typeof expected === 'string' ? weightedExpectation : expected,
    }));
    visible = normalized.slice(0, publicCases.length);
    hidden = normalized.slice(publicCases.length);
    order = [];
    if (!design) {
      const methods = [...new Set(normalized.flatMap((item) => item.input.operations.slice(1)))];
      design = inferDesign(className, meta.operationSequence?.resultMode ?? 'all', starters,
        methods, normalized[0]!.input.arguments[0]?.length ?? 0);
      if (!design.signatures) throw new FolderError('Design signatures require a reviewed override.', 'unsupported');
    }
    if (design.includeConstructor === undefined) design = { ...design, includeConstructor: false };
    const { signatures, resultMode, includeConstructor, weightedSampling } = design;
    if (normalized.some(({ input, expected }) => {
      if (weightedSampling && JSON.stringify(expected) === weightedExpectationJson) return false;
      if (!Array.isArray(expected)) return true;
      if (resultMode === 'all') {
        return expected.length !== input.operations.length - (includeConstructor ? 0 : 1) ||
          (includeConstructor && expected[0] !== null);
      }
      return signatures && expected.length !== input.operations.slice(1).filter((op) => signatures.methods[op]?.returns !== 'void').length;
    })) throw new FolderError('Operation results do not match the configured result mode.', 'unsupported');
  } else {
    if (order.length !== new Set(order).size || allCases.some((test) => Object.keys(test.input).length !== order.length ||
      order.some((key) => !Object.hasOwn(test.input, key)))) throw new FolderError('Test case parameter sets do not match the contract.');
    nativeSignature ??= inferSignature(meta.functionName, starters, order, allCases, meta.returnType);
    if (!nativeSignature) throw new FolderError('Starter types require a reviewed execution override.', 'unsupported');
  }

  const compatible: ProblemSpec['starters'] = {};
  const excluded = new Set<string>();
  const suite = { functionName: meta.functionName, parameterOrder: order, comparisonMode: meta.comparisonMode === 'unordered' ? 'UNORDERED' as const : 'EXACT' as const,
    nativeSignature, designContract: design };
  for (const [key, code] of Object.entries(starters) as Array<[PracticeLanguage, string]>) {
    if (review?.languages && !review.languages.includes(key)) { excluded.add(key); continue; }
    if (!matchingStarter(key, code, suite.functionName, nativeSignature, design, meta.returnType)) {
      excluded.add(key);
      continue;
    }
    try {
      for (const test of [...visible, ...hidden]) buildDriver(key, suite, JSON.stringify(test.input), code, JSON.stringify(test.expected));
      compatible[key] = code;
    } catch { excluded.add(key); }
  }
  if (!Object.keys(compatible).length || review?.languages?.some((key) => !compatible[key])) {
    throw new FolderError('One or more selected languages need compatible starters and contracts.', 'unsupported');
  }
  const checked = problemSpec.safeParse({
    ...suite, slug, title: meta.title, topic: meta.topic, difficulty: meta.difficulty.toUpperCase(),
    ...(meta.visibility === 'contest' && { contestOnly: true }),
    description: doc['description.md'], editorial: doc['editorial.md'], hints, constraints,
    starters: compatible, visible, hidden,
  });
  if (!checked.success) {
    const paths = checked.error.issues.slice(0, 4).map((issue) => issue.path.join('.') || 'entry');
    throw new FolderError('Converted problem failed validation at ' + paths.join(', ') + '.');
  }
  return { spec: checked.data, excludedLanguages: [...excluded] };
}

export async function scanCatalogue(root: string, manifest?: Manifest): Promise<Scan> {
  const folders = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (folders.length > 1000) throw new Error('Import at most 1,000 problem folders at a time.');
  const reports: EntryReport[] = [];
  const candidates = new Map<string, Candidate>();
  for (const { name } of folders.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!problemSlug.safeParse(name).success) {
      reports.push({ slug: name, status: 'invalid', reason: 'Invalid folder slug.' });
      continue;
    }
    let sourceDigest: string | undefined;
    let sourceId: string | undefined;
    try {
      const folder = await readFolder(join(root, name));
      sourceDigest = folder.sourceDigest;
      const meta = parse(folder.document['meta.json'], 'meta.json', metaSchema);
      sourceId = String(meta.id);
      if (name !== meta.slug) throw new FolderError('Folder slug and metadata slug differ.');
      const review = manifest?.entries[name];
      const { spec, excludedLanguages } = chooseSpec(name, meta, folder, review);
      const approved = review?.approved && review.sourceDigest === sourceDigest;
      const contentDigest = approved
        ? createHash('sha256').update(JSON.stringify({ spec, visualizerPath: review.visualizerPath })).digest('hex')
        : undefined;
      reports.push({
        slug: name, sourceId, sourceDigest, contentDigest, status: approved ? 'ready' : 'blocked',
        topic: spec.topic, difficulty: spec.difficulty, visibility: meta.visibility,
        reason: approved ? undefined : review?.approved ? 'Folder contents changed since review.' : 'No approved source review.',
        languages: Object.keys(spec.starters), excludedLanguages, target: review?.target, visualizerPath: review?.visualizerPath,
      });
      if (approved && contentDigest) {
        candidates.set(name, { spec, review, sourceId, sourceDigest, contentDigest });
      }
    } catch (error) {
      if (!(error instanceof FolderError)) throw error;
      reports.push({ slug: name, sourceId, sourceDigest, status: error.status, reason: error.message });
    }
  }
  for (const slug of Object.keys(manifest?.entries ?? {})) {
    if (!reports.some((row) => row.slug === slug)) reports.push({ slug, status: 'invalid', reason: 'Reviewed folder was not found.' });
  }
  const duplicates = new Set(reports.flatMap(({ sourceId }, i) =>
    sourceId && reports.findIndex((other) => other.sourceId === sourceId) !== i ? [sourceId] : []));
  for (const row of reports) {
    if (row.sourceId && duplicates.has(row.sourceId)) {
      row.status = 'conflicting';
      row.reason = 'Duplicate source ID in the supplied catalogue.';
      candidates.delete(row.slug);
    }
  }
  return { reports, candidates };
}
