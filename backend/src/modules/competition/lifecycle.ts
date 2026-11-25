import { Prisma } from '@prisma/client';

type Window = { startsAt: Date | null; endsAt: Date | null };

export function competitionPhase({ startsAt, endsAt }: Window, now = new Date()) {
  if (!startsAt || !endsAt) return 'Lobby';
  if (startsAt > now) return 'Upcoming';
  return endsAt <= now ? 'Ended' : 'Active';
}

export function openCompetitions(at = new Date()): Prisma.PracticeCompetitionWhereInput {
  return { OR: [{ endsAt: { gt: at } }, { startsAt: null, battleDurationMinutes: { not: null } }] };
}

export async function lockCompetition(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM practice_competitions WHERE id = ${id}::uuid FOR UPDATE`);
}
