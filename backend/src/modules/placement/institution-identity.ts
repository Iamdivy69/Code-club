import { domainToASCII } from 'node:url';
import type { Prisma } from '@prisma/client';

export const independentPracticeId = '169d2577-43ae-493a-b6fb-5a94d4956359';
export const independentPracticeName = 'Independent Practice';
export const independentPracticeBatch = 'Practice';

export function standaloneLearner(student: {
  universityId: string; degree: string; batch: string; registerNumber: string; _count: { enrollments: number };
} | null, universityId: string) {
  return Boolean(student && student.degree === independentPracticeName && student.batch === independentPracticeBatch &&
    student.registerNumber.startsWith('P-') && student._count.enrollments === 0 &&
    (student.universityId === independentPracticeId || student.universityId === universityId));
}

const personalDomains = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.in',
  'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com',
]);
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function institutionDomain(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = domainToASCII(email.slice(at + 1).toLowerCase());
  const labels = domain.split('.');
  return domain.length <= 253 && labels.length > 1 && labels.every((label) => dnsLabel.test(label)) &&
    !personalDomains.has(domain) ? domain : null;
}

export function institutionalEmailMatches(email: string, domains: string[]) {
  const domain = institutionDomain(email);
  return domain !== null && domains.some((item) => item.toLowerCase().trim() === domain);
}

export async function lockInstitutionDomain(tx: Prisma.TransactionClient, domain: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'practice-institution:' + domain}, 0))`;
}

export function universitiesForDomain(db: Prisma.TransactionClient, domain: string) {
  return db.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
    SELECT id, name, is_active AS "isActive"
    FROM universities
    WHERE EXISTS (SELECT 1 FROM unnest(email_domains) AS entry WHERE lower(trim(entry)) = ${domain})
    LIMIT 2`;
}

export async function recognizedInstitution(db: Prisma.TransactionClient, domain: string) {
  const [owners, latest] = await Promise.all([
    universitiesForDomain(db, domain),
    db.practiceInstitutionApplication.findFirst({
      where: { domain, status: { in: ['APPROVED', 'REVOKED'] } },
      orderBy: [{ status: 'asc' }, { reviewedAt: 'desc' }, { id: 'desc' }],
      select: { status: true, universityId: true },
    }),
  ]);
  const [owner] = owners;
  if (owners.length !== 1 || !owner?.isActive || (latest && (latest.status === 'REVOKED' || owner.id !== latest.universityId))) return null;
  return { id: owner.id, name: owner.name };
}
