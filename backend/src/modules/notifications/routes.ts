import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PracticeOptions } from '../practice/routes.js';
import { notificationInbox } from './service.js';

const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'), before: z.uuid().optional() });

export const notificationRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  const inbox = notificationInbox(db);
  app.get('/notifications', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return inbox.list(id, query.parse(request.query));
  });
  app.get('/notifications/unread-count', async (request, reply) => {
    const { id } = await authenticate(request);
    reply.header('Cache-Control', 'private, no-store');
    return inbox.count(id);
  });
  app.post('/notifications/:id/read', async (request) => {
    const { id } = await authenticate(request);
    return inbox.read(id, z.object({ id: z.uuid() }).parse(request.params).id);
  });
  app.post('/notifications/read-all', async (request) => {
    const { id } = await authenticate(request);
    return inbox.read(id);
  });
};
