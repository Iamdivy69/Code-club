import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';

function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return false;
  const cause = error.cause;
  return typeof cause === 'object' && cause !== null && 'kind' in cause && cause.kind === 'TransactionWriteConflict';
}

export async function versionTransaction<Result>(
  db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<Result>, timeout = 5_000,
): Promise<Result> {
  // A schedule pins the version it reads, and an import checks those pins before updating it.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout });
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
    }
  }
  throw new AppError(409, 'CATALOGUE_CHANGED', 'A practice problem changed while saving. Try again.');
}
