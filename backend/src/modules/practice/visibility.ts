import type { Prisma } from '@prisma/client';

export const legacyVisibleProblem = {
  NOT: { practiceContract: { is: { contestOnly: true } } },
} satisfies Prisma.ProblemWhereInput;

export const publishedPractice = {
  practiceContract: { enabled: true, contestOnly: false },
  OR: [{ isPublished: true }, { practiceContract: { catalogue: { mappedLegacy: true } } }],
} satisfies Prisma.ProblemWhereInput;

export const contestProblem = {
  practiceContract: { enabled: true, contestOnly: true },
} satisfies Prisma.ProblemWhereInput;

export function contestSolverProblem(userId: string, now = new Date()): Prisma.ProblemWhereInput {
  return {
    ...contestProblem,
    practiceContestProblems: {
      some: {
        competition: {
          kind: 'CONTEST',
          OR: [
            { hostId: userId },
            { endsAt: { lte: now } },
            { startsAt: { lte: now }, endsAt: { gt: now }, players: { some: { userId } } },
          ],
        },
      },
    },
  };
}

// Reading publication must not place unverified imports in graded events or assignments.
export const executablePractice = {
  ...publishedPractice,
  practiceContract: { ...publishedPractice.practiceContract, catalogue: { is: null } },
} satisfies Prisma.ProblemWhereInput;
