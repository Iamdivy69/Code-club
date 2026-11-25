import { z } from 'zod';
import { AppError } from '../../errors.js';
import { buildDriver, designContract, nativeSignature } from './drivers.js';
import { languageKey, startersSchema } from './languages.js';

export const problemSlug = z.string().min(3).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const identifier = z.string().regex(/^[A-Za-z_$][\w$]*$/);
const testcase = z.object({ input: z.record(z.string(), z.json()), expected: z.json() });
export const problemSpec = z.object({
  slug: problemSlug, title: z.string().trim().min(3).max(120), topic: z.string().trim().min(2).max(50),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']), description: z.string().trim().min(10).max(10000),
  constraints: z.array(z.string().min(1).max(250)).max(20).default([]),
  hints: z.array(z.string().min(1).max(1000)).max(8).default([]),
  editorial: z.string().trim().max(12000).optional(),
  functionName: identifier, parameterOrder: z.array(identifier).max(16),
  nativeSignature: nativeSignature.optional(), designContract: designContract.optional(),
  comparisonMode: z.enum(['EXACT', 'UNORDERED']).default('EXACT'),
  contestOnly: z.boolean().optional(),
  starters: startersSchema.refine((value) => Object.keys(value).length > 0),
  visible: z.array(testcase).min(1).max(10), hidden: z.array(testcase).min(1).max(15),
});
export type ProblemSpec = z.infer<typeof problemSpec>;

export const importedDisplay = problemSpec.pick({ description: true, constraints: true, hints: true, starters: true });

export function testCases(spec: ProblemSpec) {
  return [
    ...spec.visible.map((test, position) => ({ ...test, position, hidden: false })),
    ...spec.hidden.map((test, position) => ({ ...test, position, hidden: true })),
  ].map(({ input, expected, ...test }) => ({
    ...test, inputJson: JSON.stringify(input), expectedOutputJson: JSON.stringify(expected),
  }));
}

export function validateDrivers(spec: ProblemSpec) {
  if (new Set(spec.parameterOrder).size !== spec.parameterOrder.length) {
    throw new AppError(400, 'PARAMETERS', 'Parameter names must be unique.');
  }
  const cases = testCases(spec);
  for (const [key, starter] of Object.entries(spec.starters)) {
    const language = languageKey.parse(key);
    for (const test of cases) {
      try { buildDriver(language, spec, test.inputJson, starter, test.expectedOutputJson); }
      catch { throw new AppError(400, 'INVALID_DRIVER', 'The ' + language + ' contract is incompatible with a test case.'); }
    }
  }
}
