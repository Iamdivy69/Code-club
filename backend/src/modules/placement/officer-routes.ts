import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { officerApplications } from './officer.js';

const proof = z.object({
  kind: z.enum(['invitation', 'staff_id', 'document', 'manual_note']),
  label: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});
const requestId = z.object({ id: z.uuid() });
const review = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  version: z.number().int().min(1),
  reason: z.string().trim().max(1000).optional(),
}).refine((input) => input.status !== 'REJECTED' || Boolean(input.reason), { message: 'Enter a reason for rejecting this application.', path: ['reason'] });
const mutation = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

export const officerRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  const officers = officerApplications(db);

  app.get('/officer/application', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return officers.status(id);
  });
  app.post('/officer/application', mutation, async (request, reply) => {
    const { id } = await authenticate(request);
    const { evidence } = z.object({ evidence: z.array(proof).max(10).default([]) }).parse(request.body);
    return reply.code(201).send(await officers.submit(id, evidence));
  });
  app.post('/officer/application/:id/evidence', mutation, async (request) => {
    const { id } = await authenticate(request);
    const input = z.object({ evidence: z.array(proof).min(1).max(10) }).parse(request.body);
    return officers.append(id, requestId.parse(request.params).id, input.evidence);
  });
  app.get('/officer/reviews', async (request, reply) => {
    const { id } = await authenticate(request);
    const { status, page } = z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).parse(request.query);
    reply.header('Cache-Control', 'private, no-store');
    return officers.queue(id, status, page);
  });
  app.post('/officer/reviews/:id/decision', mutation, async (request) => {
    const { id } = await authenticate(request);
    return officers.decide(id, requestId.parse(request.params).id, review.parse(request.body));
  });
};
