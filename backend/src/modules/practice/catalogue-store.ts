import { Prisma, type PrismaClient } from '@prisma/client';
import { openCompetitions } from '../competition/lifecycle.js';
import type { Candidate, EntryReport, Manifest, Scan } from './catalogue-source.js';
import { importedDisplay, testCases, type ProblemSpec } from './problem-spec.js';
import { versionTransaction } from './version-transaction.js';

type Database = Prisma.TransactionClient | PrismaClient;
type Plan = Pick<EntryReport, 'status' | 'reason' | 'target' | 'contentVersion'>;

const conflict = (reason: string): Plan => ({ status: 'conflicting', reason });

async function pinned(db: Database, problemId: string) {
  const now = new Date();
  const competition = await db.practiceCompetitionProblem.findFirst({
    where: { problemId, competition: openCompetitions(now) }, select: { problemId: true },
  });
  if (competition) return true;
  const pending = await db.practiceAssessmentProblem.findMany({
    where: { problemId, assessment: { finishedAt: null } },
    select: { assessment: { select: { startedAt: true, durationMinutes: true } } },
  });
  return pending.some(({ assessment }) =>
    !assessment.startedAt || +assessment.startedAt + assessment.durationMinutes * 60_000 > +now);
}

async function classify(db: Database, manifest: Manifest, candidate: Candidate): Promise<Plan> {
  const { spec, review, sourceId, sourceDigest, contentDigest } = candidate;
  if (spec.contestOnly && review.target) return conflict('Contest-only content requires a dedicated problem record.');
  const found = await db.practiceCatalogueEntry.findUnique({
    where: { source_sourceId: { source: manifest.source, sourceId } },
    include: { contract: { select: { contentVersion: true, contestOnly: true, problem: { select: { id: true, slug: true } } } } },
  });
  if (found) {
    const target = found.contract.problem;
    if (found.contract.contestOnly !== Boolean(spec.contestOnly)) return conflict('Use a new problem record when changing catalogue visibility.');
    if (found.sourceSlug !== spec.slug || found.mappedLegacy !== Boolean(review.target) ||
        (review.target && (target.id !== review.target.id || target.slug !== review.target.slug))) {
      return conflict('Source identity or explicit DSA target changed.');
    }
    if (found.sourceVersion === manifest.version && found.sourceDigest === sourceDigest && found.contentDigest === contentDigest) {
      return { status: 'unchanged', target, contentVersion: found.contract.contentVersion };
    }
    if (found.sourceVersion === manifest.version) return conflict('Changed content requires a new source version.');
    if (review.expectedContentVersion !== found.contract.contentVersion) return conflict('The reviewed content version does not match the database.');
    if (await pinned(db, target.id)) return conflict('An open competition or assessment uses this version.');
    return { status: 'updated', target, contentVersion: found.contract.contentVersion + 1 };
  }
  if (review.expectedContentVersion !== undefined) return conflict('No previous version exists for this source ID.');
  if (review.target) {
    const target = await db.problem.findUnique({
      where: { id: review.target.id },
      select: { id: true, slug: true, practiceContract: { select: { problemId: true } } },
    });
    if (!target || target.slug !== review.target.slug) return conflict('The reviewed DSA UUID and slug do not match.');
    if (target.practiceContract) return conflict('The DSA problem already has a practice contract.');
    return { status: 'new', target: review.target, contentVersion: 1 };
  }
  const occupant = await db.problem.findUnique({ where: { slug: spec.slug }, select: { id: true } });
  if (occupant) return conflict('The target slug is already used. Review a mapping to preserve its ID.');
  return { status: 'new', contentVersion: 1 };
}

function description(spec: ProblemSpec) {
  return {
    title: spec.title, topic: spec.topic, difficulty: spec.difficulty, description: spec.description,
    constraints: spec.constraints.join('\n'), hints: spec.hints, starterCode: spec.starters,
  };
}

async function store(tx: Prisma.TransactionClient, manifest: Manifest, candidate: Candidate, plan: Plan) {
  const { spec, review } = candidate;
  const provenance = {
    source: manifest.source, sourceId: candidate.sourceId, sourceSlug: spec.slug, sourceVersion: manifest.version,
    sourceDigest: candidate.sourceDigest, contentDigest: candidate.contentDigest, mappedLegacy: Boolean(review.target),
    visualizerPath: review.visualizerPath ?? null, review: { reviewer: review.reviewer, rights: review.rights },
    display: importedDisplay.parse(spec),
  };
  const contract = {
    functionName: spec.functionName, parameterOrder: spec.parameterOrder, nativeSignature: spec.nativeSignature ?? Prisma.DbNull,
    designContract: spec.designContract ?? Prisma.DbNull, comparisonMode: spec.comparisonMode, editorial: spec.editorial ?? null,
    contestOnly: spec.contestOnly ?? false,
  };
  const cases = testCases(spec);
  if (plan.status === 'new') {
    const create = {
      ...contract, enabled: false, catalogue: { create: provenance }, cases: { create: cases },
    };
    if (review.target) {
      await tx.practiceProblemContract.create({ data: { ...create, problemId: review.target.id } });
      return review.target;
    }
    return tx.problem.create({ data: { ...description(spec), slug: spec.slug, isPublished: false, practiceContract: { create } },
      select: { id: true, slug: true },
    });
  }
  const target = plan.target!;
  if (!review.target) await tx.problem.update({ where: { id: target.id }, data: description(spec) });
  await tx.practiceTestCase.deleteMany({ where: { problemId: target.id } });
  await tx.practiceProblemContract.update({ where: { problemId: target.id }, data: {
    ...contract, contentVersion: plan.contentVersion!, catalogue: { update: provenance }, cases: { create: cases },
  } });
  return target;
}

export function persistCatalogue(db: PrismaClient, manifest: Manifest, scan: Scan, apply = false) {
  const targetCounts = new Map<string, number>();
  for (const candidate of scan.candidates.values()) {
    const key = candidate.review.target?.slug ?? candidate.spec.slug;
    targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
  }
  async function plan(database: Database, writes?: Prisma.TransactionClient) {
    const reports: EntryReport[] = [];
    for (const row of scan.reports) {
      const candidate = scan.candidates.get(row.slug);
      if (!candidate) { reports.push(row); continue; }
      const target = candidate.review.target?.slug ?? candidate.spec.slug;
      const state = targetCounts.get(target)! > 1
        ? conflict('Multiple reviewed entries select the same target slug.')
        : await classify(database, manifest, candidate);
      if (writes && (state.status === 'new' || state.status === 'updated')) state.target = await store(writes, manifest, candidate, state);
      reports.push({ ...row, ...state });
    }
    return reports;
  }
  // Keep preview free of writes. The apply transaction recomputes classifications from its own snapshot.
  return apply
    ? versionTransaction(db, (tx) => plan(tx, tx), 30_000)
    : plan(db);
}
