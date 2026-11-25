import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';

export const slug = 'count-above';
export const email = 'student@practice.test';

export async function seedPractice(db: PrismaClient, password: string) {
  const university = await db.university.upsert({
    where: { id: '8a0b19b7-1cf5-4d9b-a6f9-436bdfefc63a' },
    update: {},
    create: { id: '8a0b19b7-1cf5-4d9b-a6f9-436bdfefc63a', name: 'Practice University', emailDomains: ['practice.test'] },
  });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.upsert({
    where: { email }, update: {},
    create: {
      email, name: 'Practice Student', role: 'STUDENT', passwordHash, emailVerified: true,
      student: { create: { universityId: university.id, registerNumber: 'PRACTICE-1', degree: 'Computer Science', batch: 'Practice' } },
    },
  });
  const problem = await db.problem.upsert({
    where: { slug }, update: {}, create: {
      slug, title: 'Count Above a Threshold', topic: 'Arrays', difficulty: 'EASY', isPublished: true,
      description: 'Given an array of integers and a threshold, return how many values are strictly greater than the threshold. Include repeated values in the count.',
      constraints: '0 ≤ values.length ≤ 10,000\n−10⁹ ≤ values[i], threshold ≤ 10⁹',
      hints: ['Scan the array once. Increase a counter only when a value is strictly greater.'],
      starterCode: { javascript: 'function countAbove(values, threshold) {\n  // Return the number of values above threshold.\n}\n' },
      practiceContract: { create: {
        functionName: 'countAbove', parameterOrder: ['values', 'threshold'], enabled: true,
        cases: { create: [
          { position: 0, hidden: false, inputJson: JSON.stringify({ values: [1, 6, 3, 8], threshold: 4 }), expectedOutputJson: '2' },
          { position: 1, hidden: false, inputJson: JSON.stringify({ values: [3, 3, 1], threshold: 3 }), expectedOutputJson: '0' },
          { position: 0, hidden: true, inputJson: JSON.stringify({ values: [], threshold: 7 }), expectedOutputJson: '0' },
          { position: 1, hidden: true, inputJson: JSON.stringify({ values: [-11, -3, -3, 17, 0], threshold: -4 }), expectedOutputJson: '4' },
        ] },
      } },
    },
  });
  const chapter = await db.roadmapChapter.upsert({
    where: { id: 'bece6049-ec2f-41f1-a7f6-d94c4a44afcf' }, update: {},
    create: { id: 'bece6049-ec2f-41f1-a7f6-d94c4a44afcf', title: 'Array Traversal', order: 1, totalProblems: 1 },
  });
  const roadmap = await db.roadmapProblem.upsert({
    where: { id: 'd1111039-dc21-4fd6-895a-edc2748aad20' }, update: {},
    create: {
      id: 'd1111039-dc21-4fd6-895a-edc2748aad20', chapterId: chapter.id, problemId: problem.id,
      title: problem.title, difficulty: problem.difficulty, topic: problem.topic, order: 1,
    },
  });
  return { user, problem, roadmap };
}
