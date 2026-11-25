import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { requirePracticeAdmin } from './access.js';

const areas = ['catalogue', 'community', 'placement', 'membership', 'accounts'] as const;
type Area = typeof areas[number];
const actions = {
  practice_publication_removed: ['community', 'Reported content removed'],
  practice_report_reviewed: ['community', 'Content report reviewed'],
  practice_settings_updated: ['accounts', 'Operational settings updated'],
  practice_progress_reset: ['accounts', 'Practice progress reset'],
  practice_problem_created: ['catalogue', 'Problem draft created'],
  practice_problem_published: ['catalogue', 'Problem published'],
  practice_problem_unpublished: ['catalogue', 'Problem unpublished'],
  practice_ambassador_claimed: ['community', 'Ambassador milestone claimed'],
  practice_ambassador_activated: ['membership', 'Ambassador access activated'],
  practice_publication_reviewed: ['community', 'Community submission reviewed'],
  practice_opportunity_imported: ['community', 'Opportunity imported'],
  practice_opportunity_verified: ['community', 'Opportunity source verified'],
  practice_opportunity_created: ['community', 'Opportunity created'],
  practice_opportunity_published: ['community', 'Opportunity published'],
  practice_opportunity_unpublished: ['community', 'Opportunity unpublished'],
  practice_reward_created: ['community', 'Reward added'],
  practice_redemption_fulfilled: ['community', 'Reward redemption fulfilled'],
  practice_recruiter_reviewed: ['placement', 'Recruiter application reviewed'],
  practice_officer_application_approved: ['placement', 'Officer application approved'],
  practice_officer_application_rejected: ['placement', 'Officer application rejected'],
  practice_institution_approved: ['placement', 'Institution domain approved'],
  practice_institution_rejected: ['placement', 'Institution application rejected'],
  practice_institution_revoked: ['placement', 'Institution domain revoked'],
  practice_placement_team_designate: ['placement', 'Placement lead designated'],
  practice_placement_team_invite: ['placement', 'Placement member added'],
  practice_placement_team_transfer: ['placement', 'Placement leadership transferred'],
  practice_placement_team_remove: ['placement', 'Placement member removed'],
  practice_membership_granted: ['membership', 'Membership granted'],
  practice_membership_revoked: ['membership', 'Membership revoked'],
  practice_account_suspended: ['accounts', 'Practice access suspended'],
  practice_account_restored: ['accounts', 'Practice access restored'],
} satisfies Record<string, [Area, string]>;

type Action = keyof typeof actions;
type Target = { id: string; type: string; label?: string; state?: string; reason?: string };
const metadata = z.object({ label: z.string().optional(), state: z.string().optional(), reason: z.string().optional() });

export async function recordPracticeAudit(tx: Prisma.TransactionClient, actorId: string, eventType: Action, target: Target) {
  const details = { ...(target.label && { label: target.label }), ...(target.state && { state: target.state }), ...(target.reason && { reason: target.reason }) };
  await tx.auditLog.create({ data: {
    userId: actorId, eventType, resourceType: target.type, resourceId: target.id, metadata: details,
  } });
}

export const practiceAuditRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.get('/audit', async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    const { area, before, limit } = z.object({
      area: z.enum(areas).optional(), before: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(25),
    }).parse(request.query);
    reply.header('Cache-Control', 'private, no-store');
    const eventType = { in: Object.entries(actions).filter(([, [group]]) => !area || area === group).map(([name]) => name) };
    const anchor = before && await db.auditLog.findFirst({ where: { id: before, eventType }, select: { id: true, createdAt: true } });
    if (before && !anchor) throw new AppError(400, 'INVALID_AUDIT_CURSOR', 'Refresh the audit log to start a new page.');
    const rows = await db.auditLog.findMany({
      where: { eventType, ...(anchor && { OR: [
        { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ] }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      select: { id: true, eventType: true, resourceType: true, resourceId: true, metadata: true,
        createdAt: true, user: { select: { name: true, email: true } } },
    });
    const entries = rows.slice(0, limit).map((row) => {
      const [group, action] = actions[row.eventType as Action];
      const details = metadata.safeParse(row.metadata);
      return {
        id: row.id, area: group, action, createdAt: row.createdAt, actor: row.user,
        target: { type: row.resourceType, id: row.resourceId, label: details.data?.label ?? null, state: details.data?.state ?? null, reason: details.data?.reason ?? null },
      };
    });
    return { entries, next: rows.length > limit ? entries[entries.length - 1]?.id ?? null : null };
  });
};
