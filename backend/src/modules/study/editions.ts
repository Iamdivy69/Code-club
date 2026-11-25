import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PracticeOptions } from '../practice/routes.js';

export type EditionChapter = { id: string; title: string; description: string; missions: Array<{ id: string; slug: string; objective: string }> };
/** Original learning sequence over the existing original, graded Practice library. */
export const editionChapters: readonly EditionChapter[] = [
  { id: 'observe', title: 'Observe a sequence', description: 'Build reliable scans before combining them into a moving window.', missions: [
    { id: 'original-v1-count', slug: 'count-above', objective: 'Count values that satisfy a strict condition.' },
    { id: 'original-v1-decrease', slug: 'first-decrease', objective: 'Find the first adjacent change that breaks an ordering.' },
    { id: 'original-v1-runs', slug: 'longest-level-run', objective: 'Track a current run and a best run independently.' },
    { id: 'original-v1-window', slug: 'strongest-window', objective: 'Maintain a fixed-width window without rescanning it.' },
  ] },
  { id: 'connections', title: 'Follow the connections', description: 'Move from neighboring characters to linked nodes and tree branches.', missions: [
    { id: 'original-v1-transitions', slug: 'letter-transitions', objective: 'Count transitions between neighboring characters.' },
    { id: 'original-v1-prefix', slug: 'shared-prefix-length', objective: 'Compare two sequences while respecting both boundaries.' },
    { id: 'original-v1-links', slug: 'drop-matching-links', objective: 'Remove matching nodes while preserving the remaining links.' },
    { id: 'original-v1-leaves', slug: 'clip-tree-leaves', objective: 'Distinguish original leaves from nodes that become leaves.' },
  ] },
  { id: 'frontiers', title: 'Explore frontiers', description: 'An upcoming chapter on systematic exploration.', missions: [] },
  { id: 'choices', title: 'Compare choices', description: 'An upcoming chapter on state and decisions.', missions: [] },
  { id: 'systems', title: 'Combine your tools', description: 'An upcoming chapter bringing several techniques together.', missions: [] },
];

type Binding = { id: string; problem: { id: string; slug: string; title: string; isPublished: boolean;
  practiceContract: { enabled: boolean; contestOnly: boolean } | null } };

export function editionProgress(chapters: readonly EditionChapter[], bindings: readonly Binding[], solved: ReadonlySet<string>) {
  const byMission = new Map(bindings.map((row) => [row.id, row.problem]));
  let prerequisite = true;
  return chapters.map((chapter) => {
    const chapterOpen = prerequisite;
    const missions = chapter.missions.map((mission) => {
      const problem = byMission.get(mission.id);
      const complete = Boolean(problem && solved.has(problem.id));
      const published = Boolean(problem?.isPublished && problem.practiceContract?.enabled && !problem.practiceContract.contestOnly);
      const status = !prerequisite ? 'locked' : complete ? 'completed' : published ? 'available' : 'unavailable';
      prerequisite = prerequisite && complete;
      return { id: mission.id, objective: mission.objective, title: published || complete ? problem?.title ?? 'Mission unavailable' : 'Mission unavailable',
        problemId: problem?.id ?? null, slug: published && status !== 'locked' ? problem?.slug ?? null : null, status };
    });
    const status = !missions.length ? 'upcoming' : missions.every((mission) => mission.status === 'completed') ? 'completed' : chapterOpen ? 'available' : 'locked';
    if (!missions.length) prerequisite = false;
    return { id: chapter.id, title: chapter.title, description: chapter.description, status, missions,
      completed: missions.filter((mission) => mission.status === 'completed').length, total: missions.length };
  });
}

export async function editionOverview(db: PrismaClient, userId: string, chapters: readonly EditionChapter[] = editionChapters) {
  const missions = chapters.flatMap((chapter) => chapter.missions);
  // Bind the original published exercise once; a later rename must never retarget progress.
  const existing = new Set((await db.practiceEditionMission.findMany({ where: { id: { in: missions.map((mission) => mission.id) } }, select: { id: true } })).map((row) => row.id));
  const missing = missions.filter((mission) => !existing.has(mission.id));
  if (missing.length) {
    const candidates = await db.problem.findMany({ where: { slug: { in: missing.map((mission) => mission.slug) }, isPublished: true,
      practiceContract: { enabled: true, contestOnly: false } }, select: { id: true, slug: true } });
    const bySlug = new Map(candidates.map((row) => [row.slug, row.id]));
    const data = missing.flatMap((mission) => { const problemId = bySlug.get(mission.slug); return problemId ? [{ id: mission.id, problemId }] : []; });
    if (data.length) await db.practiceEditionMission.createMany({ data, skipDuplicates: true });
  }
  const bindings = await db.practiceEditionMission.findMany({ where: { id: { in: missions.map((mission) => mission.id) } }, select: {
    id: true, problem: { select: { id: true, slug: true, title: true, isPublished: true, practiceContract: { select: { enabled: true, contestOnly: true } } } },
  } });
  const reset = await db.practiceProgressEpoch.findUnique({ where: { userId }, select: { resetId: true } });
  const accepted = await db.practiceSubmission.findMany({ where: { userId, problemId: { in: bindings.map((row) => row.problem.id) },
    verdict: 'ACCEPTED', progressEligible: true, progressEpoch: reset?.resetId ?? null }, select: { problemId: true }, distinct: ['problemId'] });
  return { chapters: editionProgress(chapters, bindings, new Set(accepted.map((row) => row.problemId))) };
}

export const editionRoutes: FastifyPluginAsync<Pick<PracticeOptions, 'db' | 'authenticate'>> = async (app, { db, authenticate }) => {
  app.get('/editions', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return editionOverview(db, id);
  });
};
