import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { importedDisplay, problemSlug } from './problem-spec.js';

// Deliberately stricter than publishedPractice: mapped legacy drafts are not public reading material.
export const publicReadingProblem = {
  isPublished: true,
  practiceContract: { enabled: true, contestOnly: false },
} satisfies Prisma.ProblemWhereInput;

export const readingRoutes: FastifyPluginAsync<{ db: PrismaClient; billingEnabled?: boolean }> = async (app, { db, billingEnabled = false }) => {
  app.get('/reading-index', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const problems = await db.problem.findMany({ where: publicReadingProblem, orderBy: [{ difficulty: 'asc' }, { title: 'asc' }], take: 500,
      select: { slug: true, title: true, topic: true, difficulty: true } });
    return { problems };
  });
  app.get('/reading/:slug', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Vary', 'Origin');
    const { slug } = z.object({ slug: problemSlug }).parse(request.params);
    const item = await db.problem.findFirst({
      where: { ...publicReadingProblem, slug },
      select: {
        id: true, slug: true, title: true, topic: true, difficulty: true,
        description: true, constraints: true, hints: true,
        practiceContract: { select: {
          contentVersion: true, editorial: true,
          catalogue: { select: { display: true } },
          cases: { where: { hidden: false }, orderBy: { position: 'asc' },
            select: { position: true, inputJson: true, expectedOutputJson: true } },
        } },
      },
    });
    if (!item?.practiceContract) throw new AppError(404, 'NOT_FOUND', 'Public reading material is unavailable.');
    const contract = item.practiceContract;
    const display = importedDisplay.safeParse(contract.catalogue?.display).data;
    // Build a fresh whitelist; never spread a database record into the public projection.
    reply.header('X-CodeClub-Public-Reading', '1');
    return { problem: {
      id: item.id, slug: item.slug, title: item.title, topic: item.topic, difficulty: item.difficulty,
      contentVersion: contract.contentVersion,
      ...(contract.catalogue && { executionPending: true }),
      description: display?.description ?? item.description,
      constraints: display?.constraints ?? item.constraints?.split('\n').filter(Boolean) ?? [],
      hints: display?.hints ?? z.array(z.string()).safeParse(item.hints).data ?? [],
      editorial: billingEnabled ? null : contract.editorial,
      examples: contract.cases.map((test) => ({ index: test.position, input: test.inputJson, output: test.expectedOutputJson })),
    } };
  });
};
