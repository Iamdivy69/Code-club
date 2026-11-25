import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { institutionOnboarding } from './institution.js';

const mutation = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
const request = z.strictObject({
  name: z.string().trim().min(3).max(150).refine((value) => !value.includes('@')),
  evidence: z.string().trim().min(10).max(1000),
});
const status = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']);
const reviewList = z.object({ status: status.default('PENDING'), page: z.coerce.number().int().min(1).max(1000).default(1) });
const identifier = z.object({ id: z.uuid() });
const version = z.number().int().min(1);
const reason = z.string().trim().min(1).max(1000);
const decision = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('APPROVED'), version, universityId: z.uuid().optional(), reason: reason.optional() }),
  z.strictObject({ status: z.literal('REJECTED'), version, reason }),
  z.strictObject({ status: z.literal('REVOKED'), version, reason }),
]);

export const institutionRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  const service = institutionOnboarding(db);
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store'); });

  app.get('/', async (req) => service.status((await authenticate(req)).id));

  app.post('/application', mutation, async (req, reply) => {
    const { id } = await authenticate(req);
    const application = await service.submit(id, request.parse(req.body));
    return reply.code(application.created ? 201 : 200).send({ id: application.id });
  });

  app.post('/join', mutation, async (req) => service.join((await authenticate(req)).id));

  app.get('/reviews', async (req) => {
    const { id } = await authenticate(req);
    const query = reviewList.parse(req.query);
    return service.queue(id, query.status, query.page);
  });

  app.post('/reviews/:id/decision', mutation, async (req) => {
    const { id } = await authenticate(req);
    return service.decide(id, identifier.parse(req.params).id, decision.parse(req.body));
  });
};
