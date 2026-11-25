import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';

export async function seedStaff(db: PrismaClient, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const universityId = '8a0b19b7-1cf5-4d9b-a6f9-436bdfefc63a';
  await db.user.upsert({
    where: { email: 'teacher@practice.test' }, update: { passwordHash },
    create: {
      email: 'teacher@practice.test', name: 'Practice Teacher', role: 'TEACHER', emailVerified: true,
      passwordHash, teacher: { create: { universityId } },
    },
  });
  await db.user.upsert({
    where: { email: 'admin@practice.test' }, update: { passwordHash },
    create: { email: 'admin@practice.test', name: 'Practice Admin', role: 'SUPER_ADMIN', emailVerified: true, passwordHash },
  });
  await db.user.upsert({
    where: { email: 'recruiter@practice.test' }, update: { passwordHash },
    create: { email: 'recruiter@practice.test', name: 'Practice Recruiter', role: 'STUDENT', emailVerified: true, passwordHash },
  });
  const officer = await db.user.upsert({
    where: { email: 'officer@practice.test' }, update: {},
    create: { email: 'officer@practice.test', name: 'Practice Placement Officer', role: 'TEACHER', emailVerified: true,
      passwordHash, teacher: { create: { universityId } } },
  });
  await db.practicePlacementMember.upsert({ where: { userId: officer.id }, update: {}, create: { userId: officer.id, universityId, isPrimary: true } });

}
