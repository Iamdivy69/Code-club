import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { requirePracticeAdmin } from './access.js';
import { recordPracticeAudit } from './audit.js';

const targetId = z.object({ id: z.uuid() });
const role = z.enum(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN']);
const search = z.object({
  q: z.string().trim().max(120).optional(),
  role: role.optional(),
  access: z.enum(['active', 'suspended']).optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const changeAccess = z.object({ access: z.enum(['active', 'suspended']), reason: z.string().trim().min(3).max(240) });
const accountSelect = {
  id: true, name: true, email: true, role: true, isActive: true, approvalStatus: true, createdAt: true,
  practiceAccountRestriction: { select: { suspendedAt: true } },
} satisfies Prisma.UserSelect;

function presentAccount(row: Prisma.UserGetPayload<{ select: typeof accountSelect }>) {
  const { practiceAccountRestriction, ...account } = row;
  return { ...account, suspendedAt: practiceAccountRestriction?.suspendedAt ?? null };
}

export const practiceAccountRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/accounts', async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    const filters = search.parse(request.query);
    const anchor = filters.before && await db.user.findUnique({
      where: { id: filters.before }, select: { id: true, createdAt: true },
    });
    if (filters.before && !anchor) throw new AppError(400, 'INVALID_ACCOUNT_CURSOR', 'Start a new account search.');
    const comparisons: Prisma.UserWhereInput[] = [];
    if (filters.q) comparisons.push({ OR: [
      { name: { contains: filters.q, mode: 'insensitive' } }, { email: { contains: filters.q, mode: 'insensitive' } },
    ] });
    if (anchor) comparisons.push({ OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] });

    const rows = await db.user.findMany({
      where: { deletedAt: null, role: filters.role, AND: comparisons, ...(filters.access && {
        practiceAccountRestriction: filters.access === 'active' ? { is: null } : { isNot: null },
      }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: filters.limit + 1, select: accountSelect,
    });
    reply.header('Cache-Control', 'private, no-store');
    const accounts = rows.slice(0, filters.limit).map(presentAccount);
    return { accounts, next: rows.length > filters.limit ? accounts.at(-1)?.id ?? null : null };
  });

  app.patch('/accounts/:id/access', async (request, reply) => {
    const { id: actorId } = await authenticate(request);
    await requirePracticeAdmin(db, actorId);
    const { id } = targetId.parse(request.params);
    const { access, reason } = changeAccess.parse(request.body);
    const account = await db.$transaction(async (tx) => {
      await requirePracticeAdmin(tx, actorId);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.user.findFirst({ where: { id, deletedAt: null }, select: accountSelect });
      if (!target) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
        throw new AppError(403, 'PROTECTED_ACCOUNT', 'Administrator accounts are protected.');
      }

      const suspend = access === 'suspended';
      if (suspend === Boolean(target.practiceAccountRestriction)) return presentAccount(target);
      const restriction = suspend
        ? await tx.practiceAccountRestriction.create({ data: { userId: id }, select: { suspendedAt: true } })
        : null;
      if (!suspend) await tx.practiceAccountRestriction.delete({ where: { userId: id } });
      await recordPracticeAudit(tx, actorId, suspend ? 'practice_account_suspended' : 'practice_account_restored', {
        id, type: 'User', label: target.name, state: access, reason,
      });
      return presentAccount({ ...target, practiceAccountRestriction: restriction });
    });
    reply.header('Cache-Control', 'private, no-store');
    return { account };
  });
};
