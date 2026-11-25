import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { rosterAddress } from './cohort-roster.js';
import { placementTeam } from './team.js';

const institution = z.object({ universityId: z.uuid().optional() });
const member = z.object({ userId: z.uuid() });

export const teamRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  const team = placementTeam(db);

  app.get('/team/universities', async (request) => {
    const { id } = await authenticate(request);
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(request.query);
    return { universities: await team.universities(id, q) };
  });
  app.get('/team', async (request) => {
    const { id } = await authenticate(request);
    return team.read(id, institution.parse(request.query).universityId);
  });
  app.post('/team/primary', async (request, reply) => {
    const { id } = await authenticate(request);
    const { email, expectedPrimary } = z.object({ email: rosterAddress, expectedPrimary: z.uuid().nullable() }).parse(request.body);
    const result = await team.change(id, institution.parse(request.query).universityId, { type: 'designate', email, expectedPrimary });
    return reply.code(201).send(result);
  });
  app.post('/team/invite', async (request, reply) => {
    const { id } = await authenticate(request);
    const { email } = z.object({ email: rosterAddress }).parse(request.body);
    const result = await team.change(id, institution.parse(request.query).universityId, { type: 'invite', email });
    return reply.code(201).send(result);
  });
  app.post('/team/:userId/make-primary', async (request) => {
    const { id } = await authenticate(request);
    const { userId } = member.parse(request.params);
    const { expectedPrimary } = z.object({ expectedPrimary: z.uuid() }).parse(request.body);
    return team.change(id, institution.parse(request.query).universityId, { type: 'transfer', userId, expectedPrimary });
  });
  app.delete('/team/:userId', async (request, reply) => {
    const { id } = await authenticate(request);
    const { userId } = member.parse(request.params);
    await team.change(id, institution.parse(request.query).universityId, { type: 'remove', userId });
    return reply.code(204).send();
  });
};
