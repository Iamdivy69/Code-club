import { z } from 'zod';
import { AppError } from '../../errors.js';
import { weightedExpectation } from './contracts.js';

export const weightedExpectationJson = JSON.stringify(weightedExpectation);
export const weightedSampleCount = 8192;

export const weightedSampling = z.object({
  method: z.string().regex(/^[A-Za-z_$][\w$]*$/).max(100),
  weightArgument: z.number().int().nonnegative().max(15),
});

export type WeightedPlan = { method: string; weights: number[] };

const inputs = z.object({
  operations: z.array(z.string()).min(2),
  arguments: z.array(z.array(z.unknown())),
});
const positiveWeights = z.array(z.number().int().min(1).max(100_000)).min(1).max(10_000);

export function isWeightedTest(design: unknown, expectedOutputJson?: string): design is { weightedSampling: unknown } {
  return expectedOutputJson === weightedExpectationJson && typeof design === 'object' && design !== null && 'weightedSampling' in design;
}

export function weightedPlan(design: unknown, inputJson: string, expectedOutputJson?: string): WeightedPlan | null {
  if (!isWeightedTest(design, expectedOutputJson)) return null;
  const sampling = weightedSampling.safeParse(design.weightedSampling);
  const input = inputs.safeParse(JSON.parse(inputJson));
  if (sampling.success && input.success) {
    const { method, weightArgument } = sampling.data;
    const { operations, arguments: args } = input.data;
    const weights = positiveWeights.safeParse(args[0]?.[weightArgument]);
    if (weights.success && operations.length === args.length && operations.slice(1).every((name) => name === method) &&
        args.slice(1).every((parameters) => parameters.length === 0)) {
      return { method, weights: weights.data };
    }
  }
  throw new AppError(503, 'SUITE_INVALID', 'The weighted test requires positive weights and calls to its draw method.');
}

export function checkWeightedOutput(actual: string, { weights }: WeightedPlan): { passed: boolean; output: string } {
  let samples: unknown;
  try { samples = JSON.parse(actual); } catch { /* Rejected below. */ }
  if (!Array.isArray(samples) || samples.length !== weightedSampleCount) {
    return { passed: false, output: 'Expected ' + weightedSampleCount + ' integer draws.' };
  }
  const counts = Array.from(weights, () => 0);
  for (const index of samples) {
    if (!Number.isInteger(index) || index < 0 || index >= counts.length) {
      return { passed: false, output: 'A draw returned an invalid index.' };
    }
    counts[index]!++;
  }
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  // Two-sided Bernstein bound per index, adjusted across all indices.
  const log = Math.log(2 * weights.length / 1e-9);
  const passed = counts.every((count, i) => {
    const probability = weights[i]! / weightTotal;
    const margin = Math.sqrt(2 * weightedSampleCount * probability * (1 - probability) * log) + 2 * log / 3;
    return Math.abs(count - weightedSampleCount * probability) <= margin;
  });
  return { passed, output: JSON.stringify({ draws: weightedSampleCount, counts }) };
}
