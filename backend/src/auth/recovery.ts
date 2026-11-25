import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors.js';
import type { MailDelivery } from '../modules/notifications/smtp.js';
import { enabledAccount, lockAccount, newPassword } from './account-state.js';

const lifetime = { verification: 24 * 3_600_000, reset: 60 * 60_000 };
const resendMs = 60_000;
const sha = (token: string) => createHash('sha256').update(token).digest('hex');
type Kind = keyof typeof lifetime;
type Database = PrismaClient | Prisma.TransactionClient;
type TokenFilter = { userId?: string; token?: string; createdAt?: { gt: Date }; expiresAt?: { gt: Date } };
type AccountTokenStore = {
  findFirst(args: { where: TokenFilter; select: { id: true } }): PromiseLike<{ id: string } | null>;
  findUnique(args: { where: { token: string }; select: { userId: true; expiresAt: true } }): PromiseLike<{ userId: string; expiresAt: Date } | null>;
  deleteMany(args: { where: TokenFilter }): PromiseLike<{ count: number }>;
  create(args: { data: { userId: string; token: string; expiresAt: Date } }): PromiseLike<unknown>;
};
const token = z.string().regex(/^[a-f0-9]{64}$/);
export const verifyEmailInput = z.strictObject({ token });
export const resetPasswordInput = z.strictObject({ token, newPassword });

const invalid = () => new AppError(400, 'INVALID_ACCOUNT_LINK', 'This link is invalid or expired. Request a new email.');

function tokens(db: Database, kind: Kind): AccountTokenStore {
  if (kind === 'verification') return db.emailVerificationToken;
  return db.passwordResetToken;
}

export function accountRecovery(db: PrismaClient, delivery?: MailDelivery) {
  async function sendLink(kind: Kind, email: string) {
    if (!delivery) return;
    const identifier = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!identifier) return;
    const raw = randomBytes(32).toString('hex');
    const digest = sha(raw);
    const address = await db.$transaction(async (tx) => {
      await lockAccount(tx, identifier.id);
      const user = await tx.user.findFirst({
        where: { id: identifier.id, email, ...enabledAccount, ...(kind === 'verification' && { emailVerified: false }) },
        select: { email: true },
      });
      if (!user) return null;
      const table = tokens(tx, kind);
      const now = new Date();
      const pending = await table.findFirst({ where: {
        userId: identifier.id, createdAt: { gt: new Date(+now - resendMs) }, expiresAt: { gt: now },
      }, select: { id: true } });
      if (pending) return null;
      await table.deleteMany({ where: { userId: identifier.id } });
      await table.create({ data: { userId: identifier.id, token: digest, expiresAt: new Date(+now + lifetime[kind]) } });
      return user.email;
    });
    if (!address) return;
    const verifying = kind === 'verification';
    const url = new URL(verifying ? '/verify-email' : '/reset-password', delivery.site);
    url.hash = new URLSearchParams({ token: raw }).toString();
    await delivery.send({
      to: address,
      subject: verifying ? 'Verify your CodeClub email' : 'Reset your CodeClub password',
      text: [
        verifying ? 'Open this link to verify your CodeClub email address.' : 'Open this link to choose a new CodeClub password.',
        url.href,
        verifying ? 'This link expires in 24 hours.' : 'This link expires in one hour.',
      ].join('\n\n'),
    });
  }

  async function consume(kind: Kind, raw: string, password?: string) {
    const digest = sha(raw);
    const record = await tokens(db, kind).findUnique({ where: { token: digest }, select: { userId: true, expiresAt: true } });
    if (!record || record.expiresAt <= new Date()) throw invalid();
    const passwordHash = password === undefined ? undefined : await bcrypt.hash(password, 12);
    await db.$transaction(async (tx) => {
      await lockAccount(tx, record.userId);
      const user = await tx.user.findFirst({ where: { id: record.userId, ...enabledAccount }, select: { id: true } });
      if (!user) throw invalid();
      const table = tokens(tx, kind);
      const now = new Date();
      const claimed = await table.deleteMany({ where: { token: digest, userId: user.id, expiresAt: { gt: now } } });
      if (!claimed.count) throw invalid();
      await table.deleteMany({ where: { userId: user.id } });
      if (passwordHash) {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustResetPassword: false } });
        await tx.session.deleteMany({ where: { userId: user.id } });
      } else {
        await tx.user.update({ where: { id: user.id }, data: { emailVerified: true, emailVerifiedAt: now } });
      }
    });
  }

  return { sendLink, verifyEmail: (value: string) => consume('verification', value),
    resetPassword: (value: string, password: string) => consume('reset', value, password) };
}
