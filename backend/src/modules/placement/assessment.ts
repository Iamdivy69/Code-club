import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../errors.js';

export function assessmentDeadline(test: { startedAt: Date | null; durationMinutes: number }) {
  return test.startedAt ? new Date(+test.startedAt + test.durationMinutes * 60_000) : null;
}

export async function requireAssessmentProblem(db: PrismaClient, testId: string, candidateId: string, problemId: string, version: number) {
  const test = await db.practiceAssessment.findFirst({
    where: { id: testId, candidateId }, select: {
      durationMinutes: true, startedAt: true, finishedAt: true,
      problems: { where: { problemId }, select: { version: true } },
    },
  });
  if (!test || !test.problems.length) throw new AppError(404, 'NOT_FOUND', 'Assessment problem not found.');
  const deadline = assessmentDeadline(test);
  if (test.finishedAt || !deadline || +deadline <= Date.now()) throw new AppError(409, 'ASSESSMENT_CLOSED', 'Start the assessment before submitting, and submit before it ends.');
  if (test.problems[0]!.version !== version) throw new AppError(409, 'PROBLEM_CHANGED', 'The assessment problem changed and is temporarily unavailable.');
}

export async function awardAssessmentSolve(tx: Prisma.TransactionClient, testId: string, candidateId: string, problemId: string, submissionId: string) {
  const locked = await tx.$queryRaw<Array<{ started_at: Date | null; finished_at: Date | null; duration_minutes: number }>>`
    SELECT started_at, finished_at, duration_minutes
    FROM practice_assessments WHERE id = ${testId}::uuid AND candidate_id = ${candidateId}::uuid FOR UPDATE
  `;
  const test = locked[0];
  if (!test?.started_at || test.finished_at || +test.started_at + test.duration_minutes * 60_000 <= Date.now()) return false;
  await tx.practiceAssessmentSolve.createMany({
    data: [{ assessmentId: testId, problemId, submissionId }], skipDuplicates: true,
  });
  return true;
}
