import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from '../backend/src/database.js';
import { readManifest, scanCatalogue } from '../backend/src/modules/practice/catalogue-source.js';
import { persistCatalogue } from '../backend/src/modules/practice/catalogue-store.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/practice_catalogue') throw new Error('Use only the disposable loopback practice_catalogue database.');
const root = resolve(import.meta.dirname, '..');
const storage = join(root, '.local/catalogue/candidate');
const review = await readManifest(join(storage, 'reviewed.json'));
const scan = await scanCatalogue(join(storage, 'problems'), review);
const db = createDatabase(url.href);
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  // A synthetic historical solve makes retention checks meaningful even when the demo is empty.
  const learner = await db.user.findUnique({ where: { email: 'student@practice.test' }, select: { id: true } });
  const originalProblem = await db.problem.findFirst({ where: { practiceContract: { enabled: true } }, select: { id: true }, orderBy: { slug: 'asc' } });
  if (!learner || !originalProblem) throw new Error('Restored demo must contain its learner and original practice exercises.');
  const solveId = randomUUID();
  await db.$executeRaw`INSERT INTO practice_submissions
    (id,user_id,problem_id,problem_version,language,code,verdict,passed,total,visible_passed,hidden_passed,request_key,request_digest)
    VALUES (${solveId}::uuid,${learner.id}::uuid,${originalProblem.id}::uuid,1,'javascript','/* synthetic retention fixture */','ACCEPTED'::"PracticeVerdict",1,1,1,0,${randomUUID()}::uuid,'synthetic-retention-fixture')`;
  await db.practiceProgress.upsert({ where: { userId_problemId: { userId: learner.id, problemId: originalProblem.id } },
    create: { userId: learner.id, problemId: originalProblem.id, status: 'SOLVED', attemptCount: 1, acceptedCount: 1, firstSolvedAt: new Date(), lastAttemptAt: new Date() }, update: {} });
  const before = { problems: await db.problem.count(), progress: await db.practiceProgress.count(), submissions: await db.practiceSubmission.count() };
  const existingProblems = await db.problem.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } });
  const progress = await db.practiceProgress.findMany({ orderBy: [{userId:'asc'},{problemId:'asc'}] });
  const submissions = await db.practiceSubmission.findMany({ select: { id: true, userId: true, problemId: true, verdict: true, createdAt: true }, orderBy: {id:'asc'} });
  const compare = await persistCatalogue(db, review, scan, false);
  if (compare.length !== 250 || compare.some(row => row.status !== 'new')) throw new Error('Expected 250 new, collision-free entries in backed-up demo copy.');
  const applied = await persistCatalogue(db, review, scan, true);
  if (applied.some(row => row.status !== 'new' || !row.target?.id)) throw new Error('First import did not create all draft identities.');
  const secondCompare = await persistCatalogue(db, review, scan, false);
  const repeated = await persistCatalogue(db, review, scan, true);
  if ([...secondCompare,...repeated].some(row => row.status !== 'unchanged')) throw new Error('Import is not repeat-safe.');
  const ids = new Map(applied.map(row => [row.slug, row.target!.id]));
  if (repeated.some(row => ids.get(row.slug) !== row.target?.id)) throw new Error('Import changed target UUIDs.');
  const retainedProblems = await db.problem.findMany({ where: { id: { in: existingProblems.map(row => row.id) } }, select: { id: true, slug: true }, orderBy: {id:'asc'} });
  const retainedProgress = await db.practiceProgress.findMany({ orderBy: [{userId:'asc'},{problemId:'asc'}] });
  const retainedSubmissions = await db.practiceSubmission.findMany({ select: { id: true, userId: true, problemId: true, verdict: true, createdAt: true }, orderBy:{id:'asc'} });
  if (sha(existingProblems)!==sha(retainedProblems)||sha(progress)!==sha(retainedProgress)||sha(submissions)!==sha(retainedSubmissions)) throw new Error('Existing identities or progress changed.');
  const enabled = await db.practiceProblemContract.count({ where:{problemId:{in:[...ids.values()]},enabled:true} });
  if (enabled) throw new Error('Imported entries must remain drafts.');
  const report={candidate:review.version,database:'disposable practice_catalogue restored from demo backup',passed:true,
    retentionFixture: 'One synthetic historic accepted submission and Practice solve in the disposable copy only',
    before,after:{problems:await db.problem.count(),progress:await db.practiceProgress.count(),submissions:await db.practiceSubmission.count()},
    compare:{new:compare.length,collisions:0},firstImport:{drafts:applied.length},secondCompare:{unchanged:secondCompare.length},
    secondImport:{unchanged:repeated.length},stableUuids:true,existingDataPreserved:true,publishedImportedEntries:enabled,
    limitation:'Draft rehearsal only. No catalogue entries were imported into the live demo and no catalogue content was published.',
    entries:repeated.map(row=>({slug:row.slug,targetUuid:row.target?.id,contentVersion:row.contentVersion,contentDigest:row.contentDigest,status:row.status})),
  };
  await writeFile(join(root,'integration/catalogue/import-rehearsal-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,entries:undefined},null,2));
} finally { await db.$disconnect(); }
