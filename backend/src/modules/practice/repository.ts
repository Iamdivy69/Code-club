import { lockPracticeProgress } from '../admin/progress-reset.js';
import { Prisma, type PrismaClient, type PracticeSubmission } from '@prisma/client';
import { AppError } from '../../errors.js';
import type { Submission } from './contracts.js';
import { verdictLabel } from './evaluation.js';
import { languageKey } from './languages.js';
import { importedDisplay } from './problem-spec.js';
import { awardAssessmentSolve } from '../placement/assessment.js';
import { qualifyReferral } from '../community/credits.js';
import { contestSolverProblem, publishedPractice } from './visibility.js';

const problemFields = { id: true, slug: true, title: true, topic: true, difficulty: true } as const;
const displayFields = { ...problemFields, description: true, starterCode: true, constraints: true, hints: true } as const;

export function listProblems(db: PrismaClient, userId: string) {
  return db.problem.findMany({
    where: publishedPractice,
    orderBy: [{ difficulty: 'asc' }, { title: 'asc' }],
    take: 500,
    select: { ...problemFields, starterCode: true, practiceContract: { select: { catalogue: { select: { display: true } } } }, practiceStudyItems: { where: { userId }, select: { saved: true } }, progress: { where: { studentId: userId }, select: { status: true } }, practiceProgress: { where: { userId }, select: { status: true } } },
  });
}

export async function getProblem(db: Prisma.TransactionClient, slug: string, userId: string, withHidden: boolean, scope: 'practice' | 'solver' = 'practice') {
  const item = await db.problem.findFirst({
    where: { slug, OR: scope === 'solver' ? [publishedPractice, contestSolverProblem(userId)] : [publishedPractice] },
    select: {
      ...displayFields,
      practiceStudyItems: { where: { userId }, select: { saved: true, note: true } },
      practiceProgress: { where: { userId }, select: { status: true } },
      progress: { where: { studentId: userId }, select: { status: true } },
      practiceContract: { include: {
        catalogue: { select: { display: true, visualizerPath: true } },
        cases: {
          where: withHidden ? undefined : { hidden: false },
          orderBy: [{ hidden: 'asc' }, { position: 'asc' }],
        },
      } },
    },
  });
  if (!item?.practiceContract) throw new AppError(404, 'NOT_FOUND', 'Practice problem not found.');
  const imported = importedDisplay.safeParse(item.practiceContract.catalogue?.display).data;
  return {
    ...item,
    ...(imported && { description: imported.description, hints: imported.hints, constraints: imported.constraints.join('\n'), starterCode: imported.starters }),
    contract: item.practiceContract,
  };
}

export async function existingSubmission(db: PrismaClient, userId: string, requestKey: string, requestDigest: string) {
  const record = await db.practiceSubmission.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
  if (record && record.requestDigest !== requestDigest) {
    throw new AppError(409, 'SUBMISSION_CONFLICT', 'That submission reference was already used for different code.');
  }
  return record;
}

export async function saveSubmission(db: PrismaClient, data: Prisma.PracticeSubmissionUncheckedCreateInput, options: {
  competitionId?: string; assessmentId?: string; contestOnly: boolean; resetGeneration?: string | null;
}) {
  const { competitionId, assessmentId, contestOnly } = options;
  try {
    return await db.$transaction(async (tx) => {
      await lockPracticeProgress(tx, data.userId);
      const reset = await tx.practiceProgressEpoch.findUnique({ where: { userId: data.userId }, select: { resetId: true } });
      const beforeReset = options.resetGeneration !== undefined && options.resetGeneration !== (reset?.resetId ?? null);
      const record = await tx.practiceSubmission.create({ data: { ...data, progressEligible: !beforeReset, progressEpoch: beforeReset ? null : reset?.resetId ?? null } });
      const { userId, problemId, createdAt } = record;
      const accepted = record.verdict === 'ACCEPTED';
      if (!contestOnly) {
        const status = accepted ? 'SOLVED' : 'ATTEMPTED';
        if (!beforeReset) {
        await tx.practiceProgress.upsert({
          where: { userId_problemId: { userId, problemId } },
          create: {
            userId, problemId, status, lastAttemptAt: createdAt, attemptCount: 1,
            acceptedCount: accepted ? 1 : 0, firstSolvedAt: accepted ? createdAt : null,
          },
          update: {
            lastAttemptAt: createdAt, attemptCount: { increment: 1 },
            ...(accepted ? { status: 'SOLVED', acceptedCount: { increment: 1 } } : {}),
          },
        });
        if (accepted) await tx.practiceProgress.updateMany({
          where: { userId, problemId, firstSolvedAt: null },
          data: { firstSolvedAt: createdAt },
        });

        }
        const student = await tx.student.findUnique({ where: { userId }, select: { userId: true } });
        if (student) {
          await tx.studentProgress.upsert({
            where: { studentId_problemId: { studentId: userId, problemId } },
            create: {
              studentId: userId, problemId, status, attempts: 1, lastAttemptedAt: createdAt,
              solvedAt: accepted ? createdAt : null, codeSubmission: record.code,
              bestTimeMs: accepted ? record.runtimeMs : null,
            },
            update: {
              attempts: { increment: 1 }, lastAttemptedAt: createdAt, codeSubmission: record.code,
              ...(accepted ? { status: 'SOLVED' } : {}),
            },
          });
          if (accepted) {
            await tx.studentProgress.updateMany({
              where: { studentId: userId, problemId, solvedAt: null }, data: { solvedAt: createdAt },
            });
            if (record.runtimeMs !== null) await tx.studentProgress.updateMany({
              where: { studentId: userId, problemId, OR: [{ bestTimeMs: null }, { bestTimeMs: { gt: record.runtimeMs } }] },
              data: { bestTimeMs: record.runtimeMs },
            });
            const links = await tx.roadmapProblem.findMany({ where: { problemId }, select: { id: true }, orderBy: { id: 'asc' } });
            for (const { id } of links) {
              await tx.roadmapProgress.upsert({
                where: { studentId_roadmapProblemId: { studentId: userId, roadmapProblemId: id } },
                create: { studentId: userId, roadmapProblemId: id, status: 'SOLVED', solvedAt: createdAt },
                update: { status: 'SOLVED' },
              });
              await tx.roadmapProgress.updateMany({
                where: { studentId: userId, roadmapProblemId: id, solvedAt: null },
                data: { solvedAt: createdAt },
              });
            }
          }
        }
      }
      const scoringOpen = competitionId && accepted ? await tx.practiceCompetition.findFirst({
        where: {
          id: competitionId, startsAt: { lte: createdAt }, endsAt: { gt: createdAt },
          players: { some: { userId } },
          OR: [{ battleDurationMinutes: null }, { players: { some: { userId, team: { not: null } } } }],
        }, select: { id: true },
      }) : null;
      if (scoringOpen && competitionId) {
        await tx.practiceCompetitionSolve.createMany({
          data: [{ competitionId, userId, problemId, submissionId: record.id, points: 100, solvedAt: createdAt }],
          skipDuplicates: true,
        });
      }
      if (accepted && !contestOnly && !competitionId && !assessmentId) await qualifyReferral(tx, userId, createdAt);
      if (assessmentId && accepted) await awardAssessmentSolve(tx, assessmentId, userId, problemId, record.id);
      return record;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const record = await existingSubmission(db, data.userId, data.requestKey, data.requestDigest);
      if (record) return record;
    }
    throw error;
  }
}

export function toSubmission(record: PracticeSubmission): Submission {
  return {
    id: record.id,
    verdict: verdictLabel[record.verdict],
    language: languageKey.parse(record.language),
    passed: record.passed,
    total: record.total,
    visiblePassed: record.visiblePassed,
    hiddenPassed: record.hiddenPassed,
    createdAt: record.createdAt.toISOString(),
    runtimeMs: record.runtimeMs,
    memoryKb: record.memoryKb,
    diagnostic: record.diagnostic,
    reflectionRating: record.reflectionRating,
  };
}
