import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import type { SessionUser } from '../modules/practice/contracts.js';
import { lockAccount } from './account-state.js';

const issuer = 'dsa-visualizer';
const accessHours = 1;
export const sessionDays = 7;
const account = { id: true, name: true, email: true, role: true, isActive: true, deletedAt: true, approvalStatus: true,
  emailVerified: true, mustResetPassword: true, mfaEnabled: true } satisfies Prisma.UserSelect;
type Account = Prisma.UserGetPayload<{ select: typeof account }>;

function principal(user: Account | null, verificationRequired: boolean): SessionUser {
  if (!user || !user.isActive || user.deletedAt || user.approvalStatus !== 'APPROVED' ||
      user.mustResetPassword || user.mfaEnabled) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in with an eligible practice account.');
  }
  if (verificationRequired && !user.emailVerified) {
    throw new AppError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email before signing in.');
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const payload = z.object({ userId: z.uuid(), tokenType: z.enum(['access', 'refresh']), sessionId: z.uuid().optional() });

export function makeSessions(db: PrismaClient, config: Config, verificationRequired = false) {
  const privateKey = config.JWT_PRIVATE_KEY ? Buffer.from(config.JWT_PRIVATE_KEY, 'base64').toString() : undefined;
  const publicKey = config.JWT_PUBLIC_KEY ? Buffer.from(config.JWT_PUBLIC_KEY, 'base64').toString() : undefined;
  const secret = config.JWT_SECRET;
  const signKey = privateKey ?? secret;
  const verifyKey = publicKey ?? secret;
  const pepper = secret ?? publicKey;
  if (!signKey || !verifyKey || !pepper) throw new Error('JWT signing is not configured.');
  const algorithm = privateKey ? 'RS256' : 'HS256';
  const hash = (token: string) => createHash('sha256').update(token + ':' + pepper).digest('hex');

  function token(user: SessionUser, tokenType: 'access' | 'refresh', sessionId: string) {
    return jwt.sign({ userId: user.id, email: user.email, role: user.role, jti: randomUUID(), tokenType, sessionId }, signKey!, {
      issuer, algorithm, expiresIn: tokenType === 'access' ? accessHours * 3600 : sessionDays * 86_400,
    });
  }

  function identify(value: string | undefined, want: 'access' | 'refresh') {
    try {
      if (!value) throw new Error();
      const data = payload.parse(jwt.verify(value, verifyKey!, { issuer, algorithms: [algorithm] }));
      if (data.tokenType !== want) throw new Error();
      return data;
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
  }

  function bundle(user: SessionUser, sessionId: string) {
    return { user, accessToken: token(user, 'access', sessionId), refreshToken: token(user, 'refresh', sessionId) };
  }

  async function issue(tx: Prisma.TransactionClient, user: SessionUser, request: FastifyRequest) {
    const sessionId = randomUUID();
    const session = bundle(user, sessionId);
    await tx.session.create({ data: {
      id: sessionId, userId: user.id, refreshTokenHash: hash(session.refreshToken),
      ipAddress: request.ip, userAgent: request.headers['user-agent']?.slice(0, 512) ?? 'Unknown',
      expiresAt: new Date(Date.now() + sessionDays * 86_400_000),
    } });
    return session;
  }

  function accessClaims(request: FastifyRequest) {
    const raw = request.headers.authorization;
    return identify(raw?.startsWith('Bearer ') ? raw.slice(7) : undefined, 'access');
  }

  async function verifiedBrowserUser(tx: Prisma.TransactionClient, sessionId: string, refreshValue?: string, lock = false) {
    const refresh = identify(refreshValue, 'refresh');
    if (refresh.sessionId && refresh.sessionId !== sessionId) return principal(null, true);
    if (lock) {
      await lockAccount(tx, refresh.userId);
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    }
    const row = await tx.session.findUnique({
      where: { id: sessionId, userId: refresh.userId, refreshTokenHash: hash(refreshValue!), expiresAt: { gt: new Date() } },
      select: { user: { select: account } },
    });
    return principal(row?.user ?? null, true);
  }

  return {
    async authenticate(request: FastifyRequest) {
      const { userId, sessionId } = accessClaims(request);
      const session = sessionId ? await db.session.findUnique({
        where: { id: sessionId, userId, expiresAt: { gt: new Date() } }, select: { user: { select: account } },
      }) : null;
      return principal(session?.user ?? null, verificationRequired);
    },
    async login(email: string, password: string, request: FastifyRequest) {
      const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
      const timingHash = '$2b$12$CwTycUXWue0Thq9StjUM0uoyt6W0jOHKmxY9NZ55nFSqV9ZZf6HfW';
      const valid = await bcrypt.compare(password, user?.passwordHash ?? timingHash);
      if (!valid || !user) throw new AppError(401, 'UNAUTHORIZED', 'Email or password is incorrect.');
      return db.$transaction(async (tx) => {
        await lockAccount(tx, user.id);
        const current = await tx.user.findUnique({ where: { id: user.id, email, passwordHash: user.passwordHash }, select: account });
        return issue(tx, principal(current, verificationRequired), request);
      });
    },
    async startProviderLink(request: FastifyRequest, refreshValue?: string) {
      const { userId, sessionId } = accessClaims(request);
      if (!sessionId || (await verifiedBrowserUser(db, sessionId, refreshValue)).id !== userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sign in again before connecting Google.');
      }
      return sessionId;
    },
    async providerLinkUser(tx: Prisma.TransactionClient, sessionId: string, refreshValue?: string) {
      return verifiedBrowserUser(tx, sessionId, refreshValue, true);
    },
    async issueProviderSession(tx: Prisma.TransactionClient, userId: string, request: FastifyRequest) {
      await lockAccount(tx, userId);
      const current = await tx.user.findUnique({ where: { id: userId }, select: account });
      return issue(tx, principal(current, true), request);
    },
    async refresh(value?: string) {
      const { userId, sessionId } = identify(value, 'refresh');
      const now = new Date();
      const where = { userId, ...(sessionId && { id: sessionId }), refreshTokenHash: hash(value!), expiresAt: { gt: now } };
      const session = await db.session.findUnique({ where, select: { id: true, user: { select: account } } });
      if (!session) throw new AppError(401, 'UNAUTHORIZED', 'Your session expired. Sign in to continue.');
      const fresh = bundle(principal(session.user, verificationRequired), session.id);
      const updated = await db.session.updateMany({
        where,
        data: { refreshTokenHash: hash(fresh.refreshToken), expiresAt: new Date(+now + sessionDays * 86_400_000), lastActivityAt: now },
      });
      if (!updated.count) throw new AppError(401, 'UNAUTHORIZED', 'Your session expired. Sign in to continue.');
      return fresh;
    },
    async revoke(value?: string) {
      if (value) await db.session.deleteMany({ where: { refreshTokenHash: hash(value) } });
    },
  };
}
