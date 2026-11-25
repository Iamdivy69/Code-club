import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { requirePracticeAdmin } from './access.js';
import { recordPracticeAudit } from './audit.js';

export const settingsDefaults = { id: 'global', version: 1, maintenance: false, recruiterRegistration: true, officerRegistration: true, announcement: '' };
export async function operationalSettings(db: Prisma.TransactionClient) {
  return await db.practiceOperationalSettings.findUnique({ where: { id: 'global' } }) ?? settingsDefaults;
}
export async function registrationOpen(tx: Prisma.TransactionClient, kind: 'recruiter' | 'officer') {
  await tx.practiceOperationalSettings.upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} });
  await tx.$queryRaw`SELECT id FROM practice_operational_settings WHERE id = 'global' FOR SHARE`;
  const value = await operationalSettings(tx);
  if (!(kind === 'recruiter' ? value.recruiterRegistration : value.officerRegistration)) {
    throw new AppError(403, 'REGISTRATION_CLOSED', 'New ' + kind + ' applications are currently closed.');
  }
}
export const operationalRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/settings/public', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { maintenance, announcement, recruiterRegistration, officerRegistration } = await operationalSettings(db);
    return { maintenance, announcement, recruiterRegistration, officerRegistration };
  });
  app.get('/admin/settings', async (request, reply) => {
    await requirePracticeAdmin(db, (await authenticate(request)).id);
    reply.header('Cache-Control', 'private, no-store');
    return operationalSettings(db);
  });
  app.put('/admin/settings', async (request) => {
    const { id } = await authenticate(request);
    const input = z.strictObject({ version: z.number().int().min(1), maintenance: z.boolean(), recruiterRegistration: z.boolean(), officerRegistration: z.boolean(), announcement: z.string().trim().max(1000) }).parse(request.body);
    return db.$transaction(async (tx) => {
      await requirePracticeAdmin(tx, id);
      await tx.practiceOperationalSettings.upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} });
      const { version, ...values } = input;
      const changed = await tx.practiceOperationalSettings.updateMany({ where: { id: 'global', version }, data: { ...values, version: { increment: 1 } } });
      if (!changed.count) throw new AppError(409, 'SETTINGS_CHANGED', 'Settings changed. Reload before saving.');
      await recordPracticeAudit(tx, id, 'practice_settings_updated', { id: '00000000-0000-4000-8000-000000000001', type: 'settings', state: values.maintenance ? 'maintenance' : 'available' });
      return operationalSettings(tx);
    });
  });
};
