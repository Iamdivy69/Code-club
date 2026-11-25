import { readingRoutes } from './modules/practice/reading.js';
import { progressResetRoutes } from './modules/admin/progress-reset.js';
import { operationalRoutes, operationalSettings } from './modules/admin/settings.js';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import { communityRoutes } from './modules/community/routes.js';
import { competitionRoutes } from './modules/competition/routes.js';
import { placementRoutes } from './modules/placement/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { authoringRoutes } from './modules/practice/authoring.js';
import { mockInterviewRoutes } from './modules/practice/mock-interviews.js';
import { solverHintRoutes } from './modules/practice/ai-hints.js';
import { practiceRoutes, type PracticeOptions } from './modules/practice/routes.js';
import { studyRoutes } from './modules/study/routes.js';
import { billingRoutes } from './modules/billing/routes.js';
import { practiceAuditRoutes } from './modules/admin/audit.js';
import { practiceAccountRoutes } from './modules/admin/accounts.js';
import { practiceAnalyticsRoutes } from './modules/admin/analytics.js';

export const practicePlatform: FastifyPluginAsync<PracticeOptions & { proofSecret?: string; billingEnabled?: boolean }> = async (app, { db, execute, authenticate: identify, proofSecret, billingEnabled }) => {
  async function authenticate(request: FastifyRequest) {
    const user = await identify(request);
    if (await db.practiceAccountRestriction.findUnique({ where: { userId: user.id }, select: { userId: true } })) {
      throw new AppError(403, 'PRACTICE_ACCESS_SUSPENDED', 'Your Practice access is suspended. Contact an administrator.');
    }
    return user;
  }

  app.addHook('preHandler', async (request) => {
    const path = request.url.split('?')[0]!;
    const base = app.prefix;
    if (path === base + '/availability' || path === base + '/settings/public') return;
    if (!(await operationalSettings(db)).maintenance) return;
    try { const user = await authenticate(request);
      if (await db.user.findFirst({ where: { id: user.id, role: 'SUPER_ADMIN' }, select: { id: true } })) return; } catch { /* Public maintenance response. */ }
    throw new AppError(503, 'MAINTENANCE', 'Practice is temporarily under maintenance. Please try again later.');
  });
  await app.register(readingRoutes, { db, billingEnabled });
  await app.register(operationalRoutes, { db, authenticate });
  await app.register(progressResetRoutes, { db, authenticate });
  app.get('/availability' , async () => ({ enabled: true }));
  await app.register(practiceRoutes, { db, execute, authenticate, billingEnabled });
  await app.register(solverHintRoutes, { db, authenticate, billingEnabled });
  await app.register(mockInterviewRoutes, { prefix: '/interviews', db, authenticate, billingEnabled });
  await app.register(studyRoutes, { prefix: '/study', db, authenticate, proofSecret, billingEnabled });
  await app.register(billingRoutes, { prefix: '/billing', db, authenticate, billingEnabled });
  await app.register(competitionRoutes, { prefix: '/competitions', db, authenticate });
  await app.register(placementRoutes, { prefix: '/placement', db, authenticate });
  await app.register(notificationRoutes, { db, authenticate });
  await app.register(communityRoutes, { prefix: '/community', db, authenticate, billingEnabled });
  await app.register(authoringRoutes, { prefix: '/admin/problems', db, authenticate });
  await app.register(practiceAuditRoutes, { prefix: '/admin', db, authenticate });
  await app.register(practiceAnalyticsRoutes, { prefix: '/admin', db, authenticate });
  await app.register(practiceAccountRoutes, { prefix: '/admin', db, authenticate });
};
