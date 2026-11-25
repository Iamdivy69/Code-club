import { catalogueExecutionPending, requireProblemExecution } from './execution-policy.js';
import { importedDisplay } from './problem-spec.js';
import { createHash } from 'node:crypto';
import type { PracticeReflectionRating, Prisma, PrismaClient, ProgressStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { editorialAccess } from '../billing/policy.js';
import type { PracticeLanguage, ProblemDetail, RunResult, SubmitResult } from './contracts.js';
import { evaluate, evaluateSource, publicDiagnostic, type CaseEvaluation, type TestCase } from './evaluation.js';
import { buildDriver } from './drivers.js';
import { isWeightedTest } from './weighted-sampling.js';
import type { Execute } from './judge.js';
import { languageKey, languages, startersSchema } from './languages.js';
import { requireAssessmentProblem } from '../placement/assessment.js';
import { requireCompetitionAttempt } from '../competition/access.js';
import { existingSubmission, getProblem, listProblems, saveSubmission, toSubmission } from './repository.js';

const sourceInput = z.object({ problemSlug: z.string().min(1).max(200), language: languageKey, code: z.string().max(50_000).refine((value) => value.trim().length > 0) });
export const runInput = sourceInput.extend({
  testcases: z.array(z.object({ input: z.record(z.string(), z.json()), expectedOutput: z.json() })).min(1).max(10).optional(),
});
export const submitInput = sourceInput.extend({ requestKey: z.uuid(), competitionId: z.uuid().optional(), assessmentId: z.uuid().optional() }).refine((value) => !(value.competitionId && value.assessmentId));
export const slugInput = z.object({ slug: z.string().min(1).max(200) });
const stringList = z.array(z.string());

function status(...progress: Array<ProgressStatus | undefined>) {
  if (progress.includes('SOLVED')) return 'SOLVED';
  return progress.some((value) => value && value !== 'NOT_STARTED') ? 'ATTEMPTED' : 'NOT_STARTED';
}

async function submissionStatus(db: Prisma.TransactionClient, userId: string, problemId: string): Promise<ProgressStatus | undefined> {
  // Accepted sorts first in PracticeVerdict. A later failed attempt cannot remove a solve.
  const best = await db.practiceSubmission.findFirst({
    where: { userId, problemId }, orderBy: { verdict: 'asc' }, select: { verdict: true },
  });
  return best ? (best.verdict === 'ACCEPTED' ? 'SOLVED' : 'ATTEMPTED') : undefined;
}

function publicCase(test: TestCase, design: unknown) {
  return {
    index: test.position, input: test.inputJson, expected: test.expectedOutputJson,
    ...(isWeightedTest(design, test.expectedOutputJson) && { comparison: 'weighted-indices' as const }),
  };
}

function available(value: unknown, language: PracticeLanguage) {
  if (!startersSchema.safeParse(value).data?.[language]) {
    throw new AppError(400, 'LANGUAGE_UNAVAILABLE', 'This problem does not support that language.');
  }
}

export async function practiceProblemDetail(db: Prisma.TransactionClient, userId: string, slug: string,
  scope: 'practice' | 'solver' = 'solver', billingEnabled = false): Promise<ProblemDetail> {
  const item = await getProblem(db, slug, userId, false, scope);
  const starter = startersSchema.parse(item.starterCode);
  const exclusiveStatus = item.contract.contestOnly ? await submissionStatus(db, userId, item.id) : undefined;
  const editorialLocked = Boolean(item.contract.editorial && billingEnabled && !await editorialAccess(db, userId, item.id));
  return {
    id: item.id, slug: item.slug, title: item.title, topic: item.topic, difficulty: item.difficulty,
    status: status(exclusiveStatus, item.practiceProgress[0]?.status, item.progress[0]?.status), starterCode: starter,
    ...(item.contract.contestOnly && { contestOnly: true as const }),
    languages: Object.values(languages).filter(({ key }) => starter[key]).map(({ key, label, editor, indentSize }) => ({ key, label, editor, indentSize })),
    ...(catalogueExecutionPending(item.contract.catalogue) && { executionPending: true }),
    saved: item.practiceStudyItems[0]?.saved ?? false, note: item.practiceStudyItems[0]?.note ?? '', editorial: editorialLocked ? null : item.contract.editorial,
    ...(editorialLocked && { editorialLocked: true }),
    ...(item.contract.catalogue?.visualizerPath && { visualizerPath: item.contract.catalogue.visualizerPath }),
    description: item.description, constraints: item.constraints?.split('\n').filter(Boolean) ?? [],
    hints: stringList.safeParse(item.hints).data ?? [], cases: item.contract.cases.map((test) => publicCase(test, item.contract.designContract)),
  };
}

export function practiceService(db: PrismaClient, execute: Execute, billingEnabled = false) {
  return {
    async list(userId: string) {
      return (await listProblems(db, userId)).map(({ practiceProgress, practiceStudyItems, progress, starterCode, practiceContract, ...problem }) => ({
        ...problem, ...(catalogueExecutionPending(practiceContract?.catalogue) && { executionPending: true }), languages: Object.keys(startersSchema.parse(importedDisplay.safeParse(practiceContract?.catalogue?.display).data?.starters ?? starterCode)), status: status(practiceProgress[0]?.status, progress[0]?.status), saved: practiceStudyItems[0]?.saved ?? false,
      }));
    },
    detail: (userId: string, slug: string) => practiceProblemDetail(db, userId, slug, 'solver', billingEnabled),
    async run(userId: string, input: z.infer<typeof runInput>): Promise<RunResult> {
      const { contract, starterCode } = await getProblem(db, input.problemSlug, userId, false, 'solver');
      requireProblemExecution(contract.catalogue);
      available(starterCode, input.language);
      const cases = input.testcases?.map(({ input: args, expectedOutput }, position) => ({
        position, hidden: false, inputJson: JSON.stringify(args), expectedOutputJson: JSON.stringify(expectedOutput),
      })) ?? contract.cases;
      if (cases.length === 0 || cases.length > 10) {
        throw new AppError(503, 'SUITE_UNAVAILABLE', 'Visible tests are temporarily unavailable for this problem.');
      }
      const prepared = cases.map((test) => {
        try { return { test, source: buildDriver(input.language, contract, test.inputJson, input.code, test.expectedOutputJson) }; }
        catch (error) {
          if (input.testcases && error instanceof AppError && error.code === 'SUITE_INVALID') {
            throw new AppError(400, 'INVALID_TEST_CASE', 'Custom test ' + (test.position + 1) + ' does not match this problem’s input format.');
          }
          throw error;
        }
      });
      const results: RunResult['results'] = [];
      for (const { test, source } of prepared) {
        const item = await evaluateSource(execute, contract, test, source, input.language);
        if (item.verdict === 'COMPILATION_ERROR') return { results, compileFailed: true, error: publicDiagnostic(item) };
        results.push({
          ...publicCase(test, contract.designContract), actual: (item.publicOutput ?? item.execution.stdout).trim().slice(0, 2000), passed: item.verdict === 'ACCEPTED',
          error: publicDiagnostic(item), time: item.execution.time, memory: item.execution.memory,
        });
        if (item.verdict === 'RUNTIME_ERROR' || item.verdict === 'TIME_LIMIT_EXCEEDED') break;
      }
      return { results, compileFailed: false, error: null };
    },
    async submit(userId: string, input: z.infer<typeof submitInput>): Promise<SubmitResult> {
      const resetGeneration = (await db.practiceProgressEpoch.findUnique({ where: { userId }, select: { resetId: true } }))?.resetId ?? null;
      const digest = createHash('sha256').update(JSON.stringify([input.problemSlug, input.language, input.code, input.competitionId ?? null, input.assessmentId ?? null])).digest('hex');
      const replay = await existingSubmission(db, userId, input.requestKey, digest);
      if (replay) {
        const [progress, previous] = await Promise.all([
          db.practiceProgress.findUnique({ where: { userId_problemId: { userId, problemId: replay.problemId } }, select: { status: true } }),
          db.studentProgress.findUnique({ where: { studentId_problemId: { studentId: userId, problemId: replay.problemId } }, select: { status: true } }),
        ]);
        const saved = progress || previous ? undefined : await submissionStatus(db, userId, replay.problemId);
        return { submission: toSubmission(replay), solved: status(progress?.status, previous?.status, saved) === 'SOLVED' };
      }

      const { id, contract, starterCode, progress: previous } = await getProblem(db, input.problemSlug, userId, true, 'solver');
      requireProblemExecution(contract.catalogue);
      available(starterCode, input.language);
      if (input.competitionId) await requireCompetitionAttempt(db, input.competitionId, userId, id, contract.contentVersion);
      if (input.assessmentId && contract.contestOnly) throw new AppError(404, 'NOT_FOUND', 'Assessment problem not found.');
      if (input.assessmentId) await requireAssessmentProblem(db, input.assessmentId, userId, id, contract.contentVersion);
      const [first, ...rest] = contract.cases;
      if (!first || !contract.hiddenSetEnabled || !contract.cases.some((item) => item.hidden)) {
        throw new AppError(503, 'SUITE_UNAVAILABLE', 'Official grading is temporarily unavailable for this problem.');
      }
      if (contract.cases.length > 25) throw new AppError(503, 'SUITE_INVALID', 'This problem is temporarily unavailable.');
      const firstResult = await evaluate(execute, contract, first, input.code, input.language);
      const graded = [firstResult];
      if (firstResult.verdict === 'ACCEPTED') {
        graded.push(...await Promise.all(rest.map((test) => evaluate(execute, contract, test, input.code, input.language))));
      }

      let visiblePassed = 0;
      let hiddenPassed = 0;
      let failure: CaseEvaluation | undefined;
      let failedOnHidden = false;
      let runtimeMs: number | null = null;
      let memoryKb: number | null = null;
      for (const [index, item] of graded.entries()) {
        const hidden = contract.cases[index]?.hidden ?? true;
        const { time, memory } = item.execution;
        if (time !== null) runtimeMs = Math.max(runtimeMs ?? 0, Math.round(time * 1000));
        if (memory !== null) memoryKb = Math.max(memoryKb ?? 0, memory);
        if (item.verdict !== 'ACCEPTED') {
          failure = item;
          failedOnHidden = hidden;
          break;
        }
        if (hidden) hiddenPassed++;
        else visiblePassed++;
      }
      const submission = await saveSubmission(db, {
        userId, problemId: id, language: input.language, code: input.code,
        requestKey: input.requestKey, requestDigest: digest, problemVersion: contract.contentVersion,
        verdict: failure?.verdict ?? 'ACCEPTED', passed: visiblePassed + hiddenPassed, total: contract.cases.length,
        visiblePassed, hiddenPassed, runtimeMs, memoryKb,
        diagnostic: failure && !failedOnHidden ? publicDiagnostic(failure) : null,
      }, { competitionId: input.competitionId, assessmentId: input.assessmentId, contestOnly: contract.contestOnly, resetGeneration });
      const progress = contract.contestOnly
        ? await submissionStatus(db, userId, id)
        : (await db.practiceProgress.findUnique({ where: { userId_problemId: { userId, problemId: id } } }))?.status;
      return { submission: toSubmission(submission), solved: status(progress, previous[0]?.status) === 'SOLVED' };
    },
    async history(userId: string, slug: string) {
      const { id } = await getProblem(db, slug, userId, false, 'solver');
      const records = await db.practiceSubmission.findMany({
        where: { userId, problemId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30,
      });
      return records.map(toSubmission);
    },
    async saveReflection(userId: string, id: string, rating: PracticeReflectionRating) {
      return db.$transaction(async (tx) => {
        const owner = { id, userId };
        const updated = await tx.practiceSubmission.updateMany({
          where: { ...owner, verdict: 'ACCEPTED', reflectionRating: null },
          data: { reflectionRating: rating, reflectedAt: new Date() },
        });
        if (updated.count === 1) return rating;
        const record = await tx.practiceSubmission.findFirst({
          where: owner, select: { reflectionRating: true },
        });
        if (!record) throw new AppError(404, 'NOT_FOUND', 'Submission not found.');
        if (record.reflectionRating === null) {
          throw new AppError(400, 'REFLECTION_REQUIRES_ACCEPTED', 'Only Accepted submissions can be rated.');
        }
        return record.reflectionRating;
      });
    },
    async submission(userId: string, id: string) {
      const record = await db.practiceSubmission.findFirst({ where: { id, userId } });
      if (!record) throw new AppError(404, 'NOT_FOUND', 'Submission not found.');
      return { ...toSubmission(record), code: record.code };
    },
  };
}
