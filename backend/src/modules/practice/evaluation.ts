import type { PracticeVerdict } from '@prisma/client';
import { AppError } from '../../errors.js';
import type { Execute, Execution } from './judge.js';
import type { PracticeLanguage } from './contracts.js';
import { buildDriver, type Suite } from './drivers.js';
import { checkWeightedOutput, weightedPlan } from './weighted-sampling.js';

export type TestCase = { position: number; hidden: boolean; inputJson: string; expectedOutputJson: string };


const normalize = (output: string) => output.trim().replace(/\r\n/g, '\n');

export function outputsMatch(expected: string, actual: string, mode: Suite['comparisonMode']) {
  try {
    const left: unknown = JSON.parse(expected);
    const right: unknown = JSON.parse(actual);
    if (mode === 'UNORDERED' && Array.isArray(left) && Array.isArray(right)) {
      const key = (values: unknown[]) => JSON.stringify(values.map((value) => JSON.stringify(value)).sort());
      return key(left) === key(right);
    }
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return normalize(expected) === normalize(actual);
  }
}

export type CaseEvaluation = { verdict: PracticeVerdict; execution: Execution; publicOutput?: string };
export function executionVerdict(execution: Execution): PracticeVerdict {
  if (execution.status === 13 || execution.status < 3 || execution.status > 14) {
    throw new AppError(503, 'JUDGE_UNAVAILABLE', 'The runner did not return a verdict. Try again shortly.');
  }
  return execution.status === 6 ? 'COMPILATION_ERROR'
    : execution.status === 5 ? 'TIME_LIMIT_EXCEEDED'
    : execution.status !== 3 ? 'RUNTIME_ERROR' : 'ACCEPTED';
}

export async function evaluateSource(execute: Execute, suite: Suite, test: TestCase, source: string, language: PracticeLanguage): Promise<CaseEvaluation> {
  const execution = await execute(source, language);
  let verdict = executionVerdict(execution);
  if (verdict === 'ACCEPTED') {
    if (execution.stderr) return { verdict: 'RUNTIME_ERROR', execution };
    const sample = weightedPlan(suite.designContract, test.inputJson, test.expectedOutputJson);
    if (sample) {
      const { passed, output } = checkWeightedOutput(execution.stdout, sample);
      return { verdict: passed ? 'ACCEPTED' : 'WRONG_ANSWER', execution, publicOutput: output };
    }
    if (!outputsMatch(test.expectedOutputJson, execution.stdout, suite.comparisonMode)) verdict = 'WRONG_ANSWER';
  }
  return { verdict, execution };
}

export function evaluate(execute: Execute, suite: Suite, test: TestCase, code: string, language: PracticeLanguage = 'javascript') {
  return evaluateSource(execute, suite, test, buildDriver(language, suite, test.inputJson, code, test.expectedOutputJson), language);
}

export const verdictLabel = {
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  COMPILATION_ERROR: 'Compilation Error',
  RUNTIME_ERROR: 'Runtime Error',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
} as const satisfies Record<PracticeVerdict, string>;

export function publicDiagnostic(item: CaseEvaluation) {
  if (item.verdict === 'ACCEPTED' || item.verdict === 'WRONG_ANSWER') return null;
  return (item.execution.compileOutput || item.execution.stderr || verdictLabel[item.verdict]).slice(0, 2000);
}
