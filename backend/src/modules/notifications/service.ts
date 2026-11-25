import type { Prisma, PrismaClient } from '@prisma/client';

type Notice = { title: string; message: string; link: `/practice/${string}` };

export async function notify(db: Prisma.TransactionClient, recipients: string[], notice: Notice) {
  if (recipients.length === 0) return 0;
  const created = await db.practiceNotification.createMany({ data: recipients.map((userId) => ({ userId, ...notice })) });
  return created.count;
}

const fields = { id: true, title: true, message: true, link: true, createdAt: true, readAt: true } as const;

export function notificationInbox(db: PrismaClient) {
  return {
    async list(userId: string, input: { limit: number; unread: boolean; before?: string }) {
      const cursor = input.before && await db.practiceNotification.findFirst({
        where: { id: input.before, userId }, select: { id: true, createdAt: true },
      });
      if (input.before && !cursor) return { notifications: [], next: null };
      const notifications = await db.practiceNotification.findMany({
        where: { userId, ...(input.unread && { readAt: null }), ...(cursor && { OR: [
          { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ] }) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1, select: fields,
      });
      return { notifications: notifications.slice(0, input.limit), next: notifications.length > input.limit
        ? notifications[input.limit - 1]!.id : null };
    },
    async count(userId: string) {
      return { count: await db.practiceNotification.count({ where: { userId, readAt: null } }) };
    },
    async read(userId: string, id?: string) {
      await db.practiceNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
      return { ok: true };
    },
  };
}
