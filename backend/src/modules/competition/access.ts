import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import { competitionPhase } from './lifecycle.js';

export async function requireCompetitionAttempt(
  db: PrismaClient, competitionId: string, userId: string, problemId: string, version: number,
) {
  const [player, item] = await Promise.all([
    db.practiceCompetitionPlayer.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { team: true, competition: { select: { startsAt: true, endsAt: true, battleDurationMinutes: true } } },
    }),
    db.practiceCompetitionProblem.findUnique({ where: { competitionId_problemId: { competitionId, problemId } }, select: { version: true } }),
  ]);
  if (!player || !item) throw new AppError(404, 'NOT_FOUND', 'Competition problem not found.');
  if (competitionPhase(player.competition) !== 'Active') {
    throw new AppError(409, 'COMPETITION_CLOSED', 'This competition is outside its scoring window.');
  }
  if (player.competition.battleDurationMinutes !== null && player.team === null) {
    throw new AppError(403, 'TEAM_REQUIRED', 'Only assigned team members can compete in this battle.');
  }
  if (item.version !== version) throw new AppError(409, 'PROBLEM_CHANGED', 'The competition problem changed and is temporarily unavailable.');
}
