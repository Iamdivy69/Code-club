import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { recordPracticeAudit } from '../admin/audit.js';
import { openCompetitions } from '../competition/lifecycle.js';
import { problemSlug, problemSpec, testCases, validateDrivers } from './problem-spec.js';
import type { PracticeOptions } from './routes.js';
import { versionTransaction } from './version-transaction.js';

export const authoringRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  async function administrator(id: string) {
    if (!(await db.user.findFirst({ where: { id, role: 'SUPER_ADMIN' }, select: { id: true } }))) {
      throw new AppError(403, 'FORBIDDEN', 'Practice administration is required.');
    }
  }
  app.get('/', async (request) => {
    const { id } = await authenticate(request);
    await administrator(id);
    const problems = await db.problem.findMany({ where: { practiceContract: { isNot: null } },
      select: { title: true, slug: true, topic: true, difficulty: true, isPublished: true,
        practiceContract: { select: { contentVersion: true, enabled: true, contestOnly: true, catalogue: { select: { mappedLegacy: true } } } } },
      orderBy: { title: 'asc' }, take: 500,
    });
    return { problems: problems.map(({ practiceContract, ...problem }) => ({
      ...problem,
      isPublished: Boolean(practiceContract?.enabled && (problem.isPublished || practiceContract.contestOnly || practiceContract.catalogue?.mappedLegacy)),
      contestOnly: practiceContract?.contestOnly ?? false,
      practiceContract: practiceContract && { contentVersion: practiceContract.contentVersion },
    })) };
  });
  app.post('/', { bodyLimit: 400_000 }, async (request, reply) => {
    const { id } = await authenticate(request);
    await administrator(id);
    const spec = problemSpec.parse(request.body);
    validateDrivers(spec);
    try {
      const problem = await db.$transaction(async (tx) => {
        const draft = await tx.problem.create({
          data: {
            slug: spec.slug, title: spec.title, topic: spec.topic, difficulty: spec.difficulty, description: spec.description,
            constraints: spec.constraints.join('\n'), hints: spec.hints, starterCode: spec.starters,
            createdByUserId: id, isPublished: false,
            practiceContract: { create: { functionName: spec.functionName, parameterOrder: spec.parameterOrder,
              nativeSignature: spec.nativeSignature, designContract: spec.designContract,
              comparisonMode: spec.comparisonMode, editorial: spec.editorial, contestOnly: spec.contestOnly ?? false, enabled: false,
              cases: { create: testCases(spec) },
            } },
          },
          select: { id: true, slug: true, isPublished: true },
        });
        await recordPracticeAudit(tx, id, 'practice_problem_created', { type: 'problem', id: draft.id, label: draft.slug });
        return draft;
      });
      return reply.code(201).send(problem);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'SLUG_USED', 'That problem slug already exists.');
      throw error;
    }
  });
  app.put('/:slug/publish', async (request) => {
    const { id } = await authenticate(request);
    await administrator(id);
    const { slug } = z.object({ slug: problemSlug }).parse(request.params);
    const { published } = z.object({ published: z.boolean() }).parse(request.body);
    return versionTransaction(db, async (tx) => {
      const problem = await tx.problem.findFirst({ where: { slug, practiceContract: { isNot: null } },
        select: { id: true, isPublished: true, practiceContract: { select: { enabled: true, contestOnly: true, catalogue: { select: { mappedLegacy: true } } } } },
      });
      if (!problem) throw new AppError(404, 'NOT_FOUND', 'Practice problem not found.');
      if (!published) {
        const contest = await tx.practiceCompetitionProblem.findFirst({ where: {
          problemId: problem.id, competition: openCompetitions(),
        }, select: { problemId: true } });
        if (contest) throw new AppError(409, 'PROBLEM_IN_USE', 'This problem is used by an open competition.');
      }
      const contract = problem.practiceContract!;
      const isLegacy = !contract.contestOnly && Boolean(contract.catalogue?.mappedLegacy);
      // Contest-only contracts stay hidden in the native DSA Problem table.
      const nativePublished = !contract.contestOnly && published;
      if (contract.enabled !== published || (!isLegacy && problem.isPublished !== nativePublished)) {
        if (isLegacy) {
          await tx.practiceProblemContract.update({ where: { problemId: problem.id }, data: { enabled: published } });
        } else {
          await tx.problem.update({ where: { id: problem.id }, data: {
            isPublished: nativePublished, practiceContract: { update: { enabled: published } },
          } });
        }
        await recordPracticeAudit(tx, id, published ? 'practice_problem_published' : 'practice_problem_unpublished',
          { id: problem.id, type: 'problem', label: slug });
      }
      return { slug, isPublished: published };
    });
  });
};
