import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { contestProblem, publishedPractice } from '../practice/visibility.js';
import { versionTransaction } from '../practice/version-transaction.js';
import type { PracticeOptions } from '../practice/routes.js';
import { registerBattleLobby } from './battle-lobby.js';
import { competitionPhase, lockCompetition, openCompetitions } from './lifecycle.js';

const ids = z.object({ id: z.uuid() });
const organizer = { emailVerified: true, role: { in: ['TEACHER', 'ADMIN', 'SUPER_ADMIN'] } } satisfies Prisma.UserWhereInput;
const code = z.string().trim().toUpperCase().regex(/^(?:[0-9A-F]{6}|[0-9A-F]{12})$/);
const problemSlugs = z.array(z.string().trim().min(1).max(200)).min(1);
const input = z.union([
  z.object({
    title: z.string().trim().min(1).max(100), description: z.string().trim().max(300).default(''),
    kind: z.literal('BATTLE'), durationMinutes: z.number().int().min(1).max(10080),
    maxTeamSize: z.number().int().min(2).max(6).default(4), problemSlugs: problemSlugs.max(250),
  }),
  z.object({
    title: z.string().trim().min(3).max(100), description: z.string().trim().max(1000).default(''),
    kind: z.enum(['CONTEST', 'BATTLE']), isPrivate: z.boolean(),
    startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), problemSlugs: problemSlugs.max(10),
  }),
]);

const fields = {
  id: true, title: true, description: true, kind: true, isPrivate: true, startsAt: true, endsAt: true,
  battleDurationMinutes: true, battleMaxTeamSize: true,
} as const;

export const competitionRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, options) => {
  const { db, authenticate } = options;
  registerBattleLobby(app, options);

  app.get('/problem-options', async (request) => {
    const { id } = await authenticate(request);
    const { kind } = z.object({ kind: z.enum(['CONTEST', 'BATTLE']).default('CONTEST') }).parse(request.query);
    const canUseExclusive = kind === 'CONTEST' && Boolean(await db.user.findFirst({ where: { id, ...organizer }, select: { id: true } }));
    const problems = await db.problem.findMany({
      where: {
        practiceContract: { hiddenSetEnabled: true, catalogue: { is: null } },
        OR: canUseExclusive ? [publishedPractice, contestProblem] : [publishedPractice],
      },
      select: { slug: true, title: true, practiceContract: { select: { contestOnly: true } } },
      orderBy: { title: 'asc' }, take: 500,
    });
    return { problems: problems.map(({ slug, title, practiceContract }) => ({ slug, title, contestOnly: practiceContract?.contestOnly ?? false })) };
  });
  app.get('/', async (request) => {
    const { id } = await authenticate(request);
    const events = await db.practiceCompetition.findMany({
      where: { OR: [{ isPrivate: false }, { hostId: id }, { players: { some: { userId: id } } }] },
      orderBy: [{ startsAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }], take: 100,
      select: { ...fields, hostId: true, players: { where: { userId: id }, select: { userId: true } }, _count: { select: { players: true } } },
    });
    return { events: events.map(({ hostId, _count, players, ...item }) => ({ ...item, joined: players.length > 0, host: hostId === id,
      status: competitionPhase(item), players: _count.players,
    })) };
  });
  app.post('/', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    const data = input.parse(request.body);
    const host = await db.user.findUniqueOrThrow({ where: { id }, select: { role: true, emailVerified: true } });
    const studentLobby = 'durationMinutes' in data && host.role === 'STUDENT';
    if (studentLobby && (data.durationMinutes < 30 || data.durationMinutes > 240 || data.problemSlugs.length > 8)) {
      throw new AppError(400, 'BATTLE_LIMIT', 'Student battle rooms allow up to eight problems and a match length of 30 minutes to four hours.');
    }
    const settings = 'durationMinutes' in data
      ? { isPrivate: true, startsAt: null, endsAt: null, battleDurationMinutes: data.durationMinutes, battleMaxTeamSize: data.maxTeamSize }
      : { isPrivate: data.isPrivate, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), battleDurationMinutes: null, battleMaxTeamSize: null };
    const isOrganizer = host.emailVerified && organizer.role.in.some((role) => role === host.role);
    if (!settings.isPrivate && !isOrganizer) {
      throw new AppError(403, 'FORBIDDEN', 'Only verified organizers can create public competitions.');
    }
    if (settings.startsAt && settings.endsAt) {
      const start = +settings.startsAt, end = +settings.endsAt, now = Date.now();
      if (end <= now || end <= start || end - start > 7 * 86_400_000 || start < now - 120_000) {
        throw new AppError(400, 'COMPETITION_TIME', 'Choose a current or future start and a duration of up to seven days.');
      }
    }
    const create = (joinCode: string | null) => versionTransaction(db, async (tx) => {
      if (studentLobby && await tx.practiceCompetition.findFirst({
        where: { hostId: id, battleDurationMinutes: { not: null }, ...openCompetitions() }, select: { id: true },
      })) {
        throw new AppError(409, 'BATTLE_ALREADY_OPEN', 'Finish or cancel your current battle before opening another.');
      }
      const problems = await tx.problem.findMany({
        where: {
          slug: { in: data.problemSlugs }, practiceContract: { hiddenSetEnabled: true, catalogue: { is: null } },
          OR: data.kind === 'CONTEST' && isOrganizer ? [publishedPractice, contestProblem] : [publishedPractice],
        },
        select: { id: true, slug: true, practiceContract: { select: { contentVersion: true } } },
      });
      if (problems.length !== data.problemSlugs.length) throw new AppError(400, 'COMPETITION_PROBLEM', 'Choose unique, judgeable problems.');
      const rows = new Map(problems.map((item) => [item.slug, item]));
      return tx.practiceCompetition.create({
        data: { title: data.title, description: data.description, kind: data.kind, hostId: id, joinCode, ...settings,
          problems: { create: data.problemSlugs.map((slug, position) => ({ problemId: rows.get(slug)!.id, position, version: rows.get(slug)!.practiceContract!.contentVersion })) },
        }, select: { id: true, joinCode: true },
      });
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      const joinCode = settings.isPrivate ? randomBytes(settings.battleDurationMinutes === null ? 6 : 3).toString('hex').toUpperCase() : null;
      try {
        return reply.code(201).send(await create(joinCode));
      } catch (error) {
        const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' ? error.meta?.target : undefined;
        if (!joinCode || !Array.isArray(target) || !target.includes('join_code')) throw error;
      }
    }
    throw new AppError(503, 'INVITE_UNAVAILABLE', 'Could not reserve an invite code. Try again.');
  });

  async function join(id: string, userId: string, invite?: string) {
    return db.$transaction(async (tx) => {
      await lockCompetition(tx, id);
      const item = await tx.practiceCompetition.findUnique({
        where: { id }, select: { hostId: true, isPrivate: true, joinCode: true, startsAt: true, endsAt: true, kind: true, battleMaxTeamSize: true },
      });
      const existing = await tx.practiceCompetitionPlayer.findUnique({ where: { competitionId_userId: { competitionId: id, userId } }, select: { team: true } });
      if (!item || (item.isPrivate && item.hostId !== userId && !existing && (!invite || invite !== item.joinCode))) {
        throw new AppError(404, 'NOT_FOUND', 'Competition not found.');
      }
      if (existing) return { id, team: existing.team };
      const status = competitionPhase(item);
      const teamSize = item.battleMaxTeamSize;
      if (teamSize !== null && status !== 'Lobby') throw new AppError(409, 'BATTLE_STARTED', 'The battle has already started.');
      if (status === 'Ended') throw new AppError(409, 'COMPETITION_CLOSED', 'This competition has ended.');
      const players = await tx.practiceCompetitionPlayer.findMany({ where: { competitionId: id }, select: { displayName: true } });
      const maxPlayers = teamSize !== null ? teamSize * 2 : item.kind === 'BATTLE' ? 40 : 500;
      if (players.length >= maxPlayers) throw new AppError(409, 'COMPETITION_FULL', 'This competition is full.');
      const profile = await tx.practiceProfile.findUnique({ where: { userId }, select: { handle: true, isPublic: true } });
      const names = new Set(players.map(({ displayName }) => displayName));
      let number = players.length + 1;
      while (names.has('Player ' + number)) number++;
      const member = await tx.practiceCompetitionPlayer.create({
        data: {
          competitionId: id, userId, displayName: profile?.isPublic ? profile.handle : 'Player ' + number,
          team: item.kind === 'BATTLE' && teamSize === null ? players.length % 2 : null,
        },
        select: { team: true },
      });
      return { id, team: member.team };
    });
  }

  app.post('/join-private', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const { id } = await authenticate(request);
    const { invite } = z.object({ invite: code }).parse(request.body);
    const match = await db.practiceCompetition.findUnique({ where: { joinCode: invite }, select: { id: true } });
    if (!match) throw new AppError(404, 'NOT_FOUND', 'Competition not found.');
    return join(match.id, id, invite);
  });
  app.post('/:id/join', async (request) => {
    const user = await authenticate(request);
    return join(ids.parse(request.params).id, user.id);
  });

  app.get('/:id', async (request) => {
    const user = await authenticate(request);
    const { id } = ids.parse(request.params);
    const item = await db.practiceCompetition.findFirst({
      where: { id, OR: [{ isPrivate: false }, { hostId: user.id }, { players: { some: { userId: user.id } } }] },
      select: { ...fields, joinCode: true, hostId: true, problems: { orderBy: { position: 'asc' }, select: { problem: { select: { id: true, slug: true, title: true, difficulty: true, practiceContract: { select: { contestOnly: true } } } } } },
        players: { orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }], select: { userId: true, displayName: true, joinedAt: true, team: true,
          solves: { orderBy: { solvedAt: 'asc' }, select: { problemId: true, solvedAt: true, points: true } },
        } },
      },
    });
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Competition not found.');
    const { players, hostId, joinCode, problems, ...event } = item;
    const host = hostId === user.id;
    const member = players.find((player) => player.userId === user.id);
    const status = competitionPhase(event);
    const managed = event.battleDurationMinutes !== null;
    const rows = [...players].map(({ userId, displayName, team, solves }) => ({
      displayName, team, own: userId === user.id, points: solves.reduce((total, solve) => total + solve.points, 0),
      solved: solves.length, last: solves.at(-1)?.solvedAt.getTime() ?? 0,
    })).sort((a, b) => b.points - a.points || a.last - b.last || a.displayName.localeCompare(b.displayName));
    const teamSolves = item.kind === 'BATTLE' ? [0, 1].map((team) => new Set(
      players.filter((player) => player.team === team).flatMap((player) => player.solves.map((score) => score.problemId)),
    )) : [];
    const teams = teamSolves.map((solves, team) => ({
      name: team === 0 ? 'Team Alpha' : 'Team Beta', points: solves.size * 100, solved: solves.size,
    }));
    const mine = new Set(member?.solves.map(({ problemId }) => problemId));
    const teammateSolves = member?.team != null ? teamSolves[member.team] : undefined;
    const visibleProblems = host || (member && status !== 'Upcoming' && status !== 'Lobby')
      ? problems.map(({ problem: { id: problemId, practiceContract, ...problem } }) => ({
        ...problem, ...(practiceContract?.contestOnly && { contestOnly: true }),
        ...(managed && { solved: mine.has(problemId), teamSolved: teammateSolves?.has(problemId) ?? false }),
      }))
      : [];
    return { ...event, status, joined: Boolean(member), host, joinCode: host ? joinCode : null,
      problems: visibleProblems,
      myTeam: member?.team ?? null,
      roster: managed ? players.map(({ userId, displayName, team }) => ({ displayName, team, own: userId === user.id, ...(host ? { userId } : {}) })) : [],
      rows, teams,
    };
  });
};
