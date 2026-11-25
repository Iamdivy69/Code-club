import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { institutionReadiness } from './readiness.js';

const filter = z.object({ universityId: z.uuid().optional(), from: z.iso.date().optional(), to: z.iso.date().optional() });

export const reportRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/reports/overview', { config: { rateLimit: { max: 45, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return institutionReadiness(db, id, filter.parse(request.query));
  });
};
