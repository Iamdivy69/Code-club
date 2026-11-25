import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { lockCompetition } from './lifecycle.js';

const params = z.object({ id: z.uuid() });
const assignmentInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('random') }),
  z.object({ mode: z.literal('manual'), assignments: z.array(z.object({
    userId: z.uuid(), team: z.union([z.literal(0), z.literal(1), z.null()]),
  })).min(1).max(12) }),
]);

async function loadLobby(tx: Prisma.TransactionClient, id: string, userId: string, hostOnly: boolean) {
  await lockCompetition(tx, id);
  const room = await tx.practiceCompetition.findUnique({
    where: { id },
    select: {
      hostId: true, startsAt: true, battleDurationMinutes: true, battleMaxTeamSize: true,
      players: { orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }], select: { userId: true, team: true } },
    },
  });
  if (!room || room.battleDurationMinutes === null || room.battleMaxTeamSize === null
    || (room.hostId !== userId && !room.players.some((player) => player.userId === userId))) {
    throw new AppError(404, 'NOT_FOUND', 'Battle room not found.');
  }
  const host = room.hostId === userId;
  if (hostOnly && !host) throw new AppError(403, 'FORBIDDEN', 'Only the host can manage teams and start or cancel the battle.');
  if (room.startsAt) throw new AppError(409, 'BATTLE_STARTED', 'The battle has already started.');
  return { ...room, host, duration: room.battleDurationMinutes, teamSize: room.battleMaxTeamSize };
}

function assignRandomly(userIds: string[]) {
  for (let index = userIds.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [userIds[index], userIds[other]] = [userIds[other]!, userIds[index]!];
  }
  return userIds.map((userId, index) => ({ userId, team: index % 2 }));
}

export function registerBattleLobby(app: FastifyInstance, { db, authenticate }: Omit<PracticeOptions, 'execute'>) {
  app.post('/:id/assign-teams', async (request) => {
    const user = await authenticate(request);
    const { id } = params.parse(request.params);
    const input = assignmentInput.parse(request.body);

    return db.$transaction(async (tx) => {
      const room = await loadLobby(tx, id, user.id, true);
      const proposed = new Map(room.players.map(({ userId, team }) => [userId, team]));
      const assignments = input.mode === 'random' ? assignRandomly([...proposed.keys()]) : input.assignments;
      const edited = new Set<string>();
      for (const { userId, team } of assignments) {
        if (!proposed.has(userId) || edited.has(userId)) {
          throw new AppError(400, 'BATTLE_ASSIGNMENT', 'Each assignment must identify a different room participant.');
        }
        edited.add(userId);
        proposed.set(userId, team);
      }

      const teams = [...proposed.values()];
      if ([0, 1].some((team) => teams.filter((value) => value === team).length > room.teamSize)) {
        throw new AppError(400, 'BATTLE_TEAM_FULL', 'A team would exceed the room’s team size.');
      }
      for (const { userId, team } of assignments) {
        await tx.practiceCompetitionPlayer.update({
          where: { competitionId_userId: { competitionId: id, userId } }, data: { team },
        });
      }
      return { id };
    });
  });

  app.post('/:id/start', async (request) => {
    const user = await authenticate(request);
    const { id } = params.parse(request.params);
    return db.$transaction(async (tx) => {
      const room = await loadLobby(tx, id, user.id, true);
      if (![0, 1].every((team) => room.players.some((player) => player.team === team))) {
        throw new AppError(409, 'BATTLE_TEAMS_REQUIRED', 'Assign at least one participant to each team before starting.');
      }
      const startsAt = new Date();
      const endsAt = new Date(+startsAt + room.duration * 60_000);
      return tx.practiceCompetition.update({ where: { id }, data: { startsAt, endsAt }, select: { id: true, startsAt: true, endsAt: true } });
    });
  });

  app.post('/:id/leave', async (request) => {
    const user = await authenticate(request);
    const { id } = params.parse(request.params);
    return db.$transaction(async (tx) => {
      const room = await loadLobby(tx, id, user.id, false);
      if (room.host) throw new AppError(409, 'BATTLE_HOST', 'Hosts can cancel a lobby from the room controls.');
      await tx.practiceCompetitionPlayer.delete({ where: { competitionId_userId: { competitionId: id, userId: user.id } } });
      return { id };
    });
  });

  app.delete('/:id', async (request, reply) => {
    const user = await authenticate(request);
    const { id } = params.parse(request.params);
    await db.$transaction(async (tx) => {
      await loadLobby(tx, id, user.id, true);
      await tx.practiceCompetition.delete({ where: { id } });
    });
    return reply.code(204).send();
  });
}
