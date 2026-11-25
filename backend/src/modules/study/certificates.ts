import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeOptions } from '../practice/routes.js';
import { versionTransaction } from '../practice/version-transaction.js';
import { executablePractice } from '../practice/visibility.js';

const prefix = 'certification:';
const tracks = [
  { id: 'arrays', title: 'Arrays Master', topic: 'Arrays', topics: ['Arrays'], required: 10 },
  { id: 'dynamic-programming', title: 'DP Specialist', topic: 'Dynamic Programming', topics: ['Dynamic Programming'], required: 15 },
  { id: 'graphs', title: 'Graph Explorer', topic: 'Graphs', topics: ['Graphs', 'Graph'], required: 10 },
  { id: 'trees', title: 'Tree Climber', topic: 'Trees', topics: ['Trees', 'Tree'], required: 8 },
  { id: 'binary-search', title: 'Binary Search Pro', topic: 'Binary Search', topics: ['Binary Search'], required: 6 },
  { id: 'stacks', title: 'Stack Architect', topic: 'Stacks', topics: ['Stacks', 'Stack'], required: 8 },
  { id: 'two-pointers', title: 'Two Pointer Tactician', topic: 'Two Pointers', topics: ['Two Pointers'], required: 6 },
  { id: 'backtracking', title: 'Backtracking Expert', topic: 'Backtracking', topics: ['Backtracking'], required: 6 },
  { id: 'linked-list', title: 'Linked List Engineer', topic: 'Linked Lists', topics: ['Linked List', 'Linked Lists'], required: 6 },
  { id: 'heap', title: 'Heap Master', topic: 'Heap', topics: ['Heap', 'Heaps', 'Heap / Priority Queue', 'Heap (Priority Queue)'], required: 6 },
];

const certificateId = z.object({ id: z.uuid() });
const summary = { id: true, track: true, createdAt: true } as const;
const document = { ...summary, issuerName: true } as const;
type Certificate = Prisma.PracticeCertificateGetPayload<{ select: typeof document }>;
type Options = Pick<PracticeOptions, 'db' | 'authenticate'>;

function metadata(key: string) {
  const track = tracks.find((item) => prefix + item.id === key);
  return { title: track?.title ?? key, kind: track ? 'certification' as const : 'practice-path' as const };
}

function describe(cert: Certificate) {
  return { ...cert, ...metadata(cert.track) };
}

export function certificateTitle(track: string) { return metadata(track).title; }

export const certificateRoutes: FastifyPluginAsync<Options> = async (app, { db, authenticate }) => {
  async function findCertificate(id: string) {
    const cert = await db.practiceCertificate.findUnique({ where: { id }, select: document });
    if (!cert) throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
    return describe(cert);
  }

  function storeCertificate(userId: string, track: string, eligible: (tx: Prisma.TransactionClient) => Promise<void>) {
    return versionTransaction(db, async (tx) => {
      const where = { userId_track: { userId, track } };
      const existing = await tx.practiceCertificate.findUnique({ where, select: document });
      if (existing) return describe(existing);
      await eligible(tx);
      const { name } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
      const cert = await tx.practiceCertificate.upsert({
        where, create: { userId, track, issuerName: name }, update: {}, select: document,
      });
      return describe(cert);
    });
  }

  app.get('/certificate-tracks', async (request) => {
    const { id } = await authenticate(request);
    const [solved, issued] = await Promise.all([
      db.problem.findMany({
        where: {
          ...executablePractice, topic: { in: [...new Set(tracks.flatMap(({ topics }) => topics))] },
          practiceProgress: { some: { userId: id, status: 'SOLVED' } },
        },
        select: { topic: true },
      }),
      db.practiceCertificate.findMany({ where: { userId: id }, select: { id: true, track: true } }),
    ]);
    const counts = new Map<string, number>();
    for (const { topic } of solved) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    const earned = new Map(issued.map((cert) => [cert.track, cert.id]));
    return {
      tracks: tracks.map(({ id: key, title, topic, topics, required }) => ({
        id: key, title, topic, required,
        solved: topics.reduce((total, name) => total + (counts.get(name) ?? 0), 0),
        certificateId: earned.get(prefix + key) ?? null,
      })),
    };
  });

  app.post('/certificate-tracks/:trackId/claim', async (request) => {
    const { id } = await authenticate(request);
    const { trackId } = z.object({ trackId: z.string().max(50) }).parse(request.params);
    const track = tracks.find((item) => item.id === trackId);
    if (!track) throw new AppError(404, 'NOT_FOUND', 'Certification track not found.');
    return storeCertificate(id, prefix + track.id, async (tx) => {
      const solved = await tx.problem.count({
        where: {
          ...executablePractice, topic: { in: track.topics }, practiceProgress: { some: { userId: id, status: 'SOLVED' } },
        },
      });
      if (solved < track.required) {
        throw new AppError(409, 'TRACK_INCOMPLETE', 'Solve ' + track.required + ' ' + track.topic + ' problems to earn this certification.');
      }
    });
  });

  app.get('/certificates', async (request) => {
    const { id } = await authenticate(request);
    const certificates = await db.practiceCertificate.findMany({ where: { userId: id }, select: summary });
    return { certificates: certificates.map((cert) => ({ ...cert, ...metadata(cert.track) })) };
  });

  app.post('/certificates', async (request) => {
    const { id } = await authenticate(request);
    const { track } = z.object({ track: z.string().min(1).max(50).refine((name) => !name.startsWith(prefix)) }).parse(request.body);
    const cert = await storeCertificate(id, track, async (tx) => {
      const items = await tx.problem.findMany({
        where: { ...executablePractice, topic: track },
        select: { practiceProgress: { where: { userId: id, status: 'SOLVED' }, select: { userId: true } } },
      });
      if (items.length < 2 || !items.every((item) => item.practiceProgress.length)) {
        throw new AppError(409, 'TRACK_INCOMPLETE', 'Complete every problem in a path of at least two problems to claim its certificate.');
      }
    });
    return { id: cert.id, track: cert.track, createdAt: cert.createdAt };
  });

  app.get('/certificates/:id/document', async (request, reply) => {
    await authenticate(request);
    reply.header('Cache-Control', 'no-store');
    return findCertificate(certificateId.parse(request.params).id);
  });

  app.get('/verify/:id', async (request) => findCertificate(certificateId.parse(request.params).id));
};
