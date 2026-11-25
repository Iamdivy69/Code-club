import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [phase, target, record] = process.argv.slice(2);
if (!['baseline', 'enabled', 'disabled', 'restored'].includes(phase) || !target || !record) {
  throw new Error('Usage: node integration/backend/verify.mjs <baseline|enabled|disabled|restored> <host root> <fixture record>');
}

const dbURL = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(dbURL.hostname) || !/^\/practice_merge_[a-z0-9]+$/.test(dbURL.pathname)) {
  throw new Error('Use an isolated local PostgreSQL database named practice_merge_<id>.');
}
const redisURL = new URL(process.env.REDIS_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(redisURL.hostname)) throw new Error('Use an isolated loopback Redis service.');
assert.equal(process.env.NODE_ENV, 'test');
const password = process.env.PRACTICE_REHEARSAL_PASSWORD;
assert.ok(password && password.length >= 12, 'Set a disposable fixture password.');

const backend = resolve(target, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const bcrypt = require('bcrypt');
let calls = 0;
let fixtureFailures = 0;
const submission = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.match(req.url, /^\/submissions\?/);
    assert.equal(payload.language_id, 63);
    const source = Buffer.from(payload.source_code, 'base64').toString('utf8');
    assert.match(source, /return values\.filter/);
    const value = source.includes('countAbove([-11') ? '4' : source.includes('countAbove([1,6,3,8]') ? '2' : '0';
    calls++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from(value).toString('base64'), time: '0.012', memory: 1024 }));
  } catch {
    fixtureFailures++;
    res.statusCode = 422;
    res.end();
  }
});
submission.listen(Number(process.env.PRACTICE_REHEARSAL_JUDGE_PORT || 0), '127.0.0.1');
await once(submission, 'listening');

process.env.PRACTICE_ENABLED = ['enabled', 'restored'].includes(phase) ? 'true' : 'false';
process.env.JUDGE0_API_URL = 'http://127.0.0.1:' + submission.address().port + '/submissions';
process.env.JUDGE0_SEMAPHORE_KEY = 'dsa:merge-rehearsal:' + dbURL.pathname.slice(1);

let app;
let prisma;
try {
  ({ prisma } = await import(pathToFileURL(resolve(backend, 'dist/config/database.js')).href));
  const { buildApp } = await import(pathToFileURL(resolve(backend, 'dist/app.js')).href);

  let fixture;
  if (phase === 'baseline') {
    const suffix = randomUUID();
    const university = await prisma.university.create({ data: { name: 'Disposable merge test', emailDomains: ['merge.test'] } });
    const passwordHash = await bcrypt.hash(password, 12);
    const student = await prisma.user.create({ data: {
      name: 'Merge Student', email: 'student-' + suffix + '@merge.test', passwordHash, role: 'STUDENT', emailVerified: true,
      student: { create: { universityId: university.id, registerNumber: suffix, degree: 'Computer Science', batch: 'Rehearsal' } },
    } });
    const teacher = await prisma.user.create({ data: {
      name: 'Merge Teacher', email: 'teacher-' + suffix + '@merge.test', passwordHash, role: 'TEACHER', emailVerified: true,
      teacher: { create: { universityId: university.id } },
    } });
    const officer = await prisma.user.create({ data: {
      name: 'Merge Placement Officer', email: 'placement-' + suffix + '@merge.test', passwordHash, role: 'TEACHER', emailVerified: true,
      teacher: { create: { universityId: university.id } },
    } });
    const superAdmin = await prisma.user.create({ data: {
      name: 'Merge Super Admin', email: 'admin-' + suffix + '@merge.test', passwordHash, role: 'SUPER_ADMIN', emailVerified: true,
    } });
    const recruiter = await prisma.user.create({ data: {
      name: 'Merge Recruiter', email: 'recruiter-' + suffix + '@merge.test', passwordHash, role: 'STUDENT', emailVerified: true,
    } });
    const problem = await prisma.problem.create({ data: {
      slug: 'legacy-' + suffix, title: 'Legacy teacher exercise', description: 'Original description before installation.',
      topic: 'Arrays', difficulty: 'EASY', isPublished: true, createdByUserId: teacher.id,
    } });
    const progress = await prisma.studentProgress.create({ data: {
      studentId: student.id, problemId: problem.id, status: 'SOLVED', attempts: 3, solvedAt: new Date('2025-01-02T10:00:00Z'),
    } });
    const interview = await prisma.interviewSession.create({ data: {
      roomId: suffix, hostId: teacher.id, candidateId: student.id, status: 'completed',
    } });
    const classroom = await prisma.class.create({ data: {
      name: 'Existing DSA class', code: 'host-' + suffix, degree: 'Computer Science', batch: 'Rehearsal',
      universityId: university.id, primaryTeacherId: teacher.id, enrollments: { create: { studentId: student.id } },
    } });
    fixture = { classId: classroom.id, database: dbURL.pathname.slice(1), student: { id: student.id, email: student.email }, teacher: { id: teacher.id, email: teacher.email },
      universityId: university.id, recruiter: { id: recruiter.id, email: recruiter.email }, officer: { id: officer.id, email: officer.email }, superAdmin: { id: superAdmin.id, email: superAdmin.email },
      problem: { id: problem.id, slug: problem.slug }, progressId: progress.id, interviewId: interview.id };
  } else {
    fixture = JSON.parse(await readFile(record, 'utf8'));
    assert.equal(fixture.database, dbURL.pathname.slice(1));
    if (phase === 'enabled') {
      const suffix = randomUUID();
      const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: fixture.student.id }, select: { passwordHash: true } });
      const ambassador = await prisma.user.create({ data: {
        name: 'Rehearsal Ambassador', email: 'ambassador-' + suffix + '@merge.test', passwordHash, role: 'STUDENT', emailVerified: true,
        student: { create: { universityId: fixture.universityId, registerNumber: suffix, degree: 'Computer Science', batch: 'Rehearsal' } },
      }, select: { id: true, email: true } });
      const referrals = await prisma.user.createManyAndReturn({
        data: Array.from({ length: 5 }, (_, index) => ({
          name: 'Ambassador referral ' + index, email: 'ambassador-' + suffix + '-' + index + '@merge.test', passwordHash, role: 'STUDENT',
        })), select: { id: true },
      });
      await prisma.practiceReferral.createMany({ data: referrals.map(({ id }) => ({ referredId: id, referrerId: ambassador.id })) });
      fixture.ambassador = ambassador;
      const { id, slug } = await prisma.problem.create({ data: {
        slug: 'sealed-' + randomUUID(), title: 'Unreleased contest exercise', topic: 'Arrays', difficulty: 'EASY',
        isPublished: false, description: 'Contest visibility fixture.',
        practiceContract: { create: { functionName: 'total', parameterOrder: ['items'], contestOnly: true, enabled: true } },
      } });
      fixture.exclusive = { id, slug };
    }
  }

  app = await buildApp();
  const agent = 'DSA practice integration test';
  async function login(email) {
    const result = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'user-agent': agent }, payload: { email, password } });
    assert.equal(result.statusCode, 200, result.body);
    return { response: result, headers: { authorization: 'Bearer ' + result.json().accessToken, 'user-agent': agent } };
  }
  const student = await login(fixture.student.email);
  const teacher = await login(fixture.teacher.email);
  const get = (url, headers = student.headers) => app.inject({ url, headers });
  for (const prefix of ['', '/api']) {
    const oldList = await get(prefix + '/student/problems');
    assert.equal(oldList.statusCode, 200, oldList.body);
    assert.ok(oldList.json().problems.some(({ id }) => id === fixture.problem.id));
    const oldProblem = await get(prefix + '/student/problems/' + fixture.problem.slug);
    assert.equal(oldProblem.json().problem.createdByUserId, fixture.teacher.id);
    assert.equal(oldProblem.json().problem.description, 'Original description before installation.');
  }
  const nativeClasses = await get('/api/teacher/classes', teacher.headers);
  assert.equal(nativeClasses.statusCode, 200, nativeClasses.body);
  assert.ok(nativeClasses.json().classes.some(({ id }) => id === fixture.classId));
  const teacherBank = await get('/api/teacher/problems', teacher.headers);
  assert.ok(teacherBank.json().problems.some(({ id }) => id === fixture.problem.id));
  if (fixture.exclusive) {
    assert.ok(teacherBank.json().problems.every(({ id }) => id !== fixture.exclusive.id));
    assert.equal((await get('/api/student/problems/' + fixture.exclusive.slug)).statusCode, 404);
  }
  const interviews = await get('/api/sessions/my-recent');
  assert.ok(interviews.json().sessions.some(({ id }) => id === fixture.interviewId));
  const oldProgress = await prisma.studentProgress.findUniqueOrThrow({ where: { id: fixture.progressId } });
  assert.equal(oldProgress.status, 'SOLVED');
  assert.equal(oldProgress.attempts, 3);
  assert.equal(oldProgress.solvedAt.toISOString(), '2025-01-02T10:00:00.000Z');

  const prefix = '/api/practice';
  const availability = await get(prefix + '/availability');
  if (phase === 'baseline' && process.env.PRACTICE_REHEARSAL_SEED_INSTALLED !== 'true') assert.equal(availability.statusCode, 404);
  else assert.deepEqual(availability.json(), { enabled: phase === 'enabled' || phase === 'restored' });

  const catalogue = await get(prefix + '/problems');
  const rankingsUrl = prefix + '/study/leaderboard';
  if (phase === 'baseline' || phase === 'disabled') {
    assert.equal(catalogue.statusCode, 404);
    assert.equal((await app.inject(rankingsUrl + '/global')).statusCode, 404);
    if (phase === 'disabled') {
      const saved = await prisma.practiceSubmission.findUniqueOrThrow({ where: { id: fixture.submissionId } });
      assert.equal(saved.verdict, 'ACCEPTED');
      assert.equal((await app.inject(prefix + '/study/profile/verify/' + fixture.proofId)).statusCode, 404);
    }
  } else {
    assert.equal(catalogue.statusCode, 200, catalogue.body);
    const countAbove = catalogue.json().problems.find(({ slug }) => slug === 'count-above');
    assert.ok(countAbove, 'Missing the original practice exercise.');
    const health = await get(prefix + '/health');
    assert.deepEqual(health.json(), { database: 'ready', judge0: 'configured', coordination: 'redis-ready' });
    assert.equal((await app.inject(prefix + '/problems')).statusCode, 401);
    const details = await get(prefix + '/problems/count-above');
    assert.equal(details.json().problem.cases.length, 2);
    assert.doesNotMatch(details.body, /\[-11,-3,-3,17,0\]/);

    if (phase === 'enabled') {
      const refresh = await app.inject({
        method: 'POST', url: '/api/auth/refresh', headers: { 'user-agent': agent },
        cookies: Object.fromEntries(student.response.cookies.map(({ name, value }) => [name, value])),
      });
      assert.equal(refresh.statusCode, 200, refresh.body);
      student.headers.authorization = 'Bearer ' + refresh.json().accessToken;
      const payload = { problemSlug: 'count-above', language: 'javascript',
        code: 'function countAbove(values, threshold) { return values.filter(value => value > threshold).length; }' };
      const visible = await app.inject({ method: 'POST', url: prefix + '/judge/run', headers: student.headers, payload });
      assert.equal(visible.statusCode, 200, visible.body + ' (fixture responses: ' + calls + ', fixture rejections: ' + fixtureFailures + ')');
      assert.equal(visible.json().results.filter(({ passed }) => passed).length, 2);
      assert.equal(calls, 2);
      const graded = await app.inject({ method: 'POST', url: prefix + '/judge/submit', headers: student.headers,
        payload: { ...payload, requestKey: randomUUID() } });
      assert.equal(graded.statusCode, 200, graded.body);
      const { submission } = graded.json();
      assert.equal(submission.verdict, 'Accepted');
      assert.equal(submission.hiddenPassed, 2);
      assert.equal(calls, 6);
      const reflection = await app.inject({ method: 'POST', url: prefix + '/submissions/' + submission.id + '/reflection',
        headers: student.headers, payload: { rating: 'manageable' } });
      assert.equal(reflection.statusCode, 201, reflection.body);
      assert.equal(reflection.json().rating, 'manageable');
      const learner = await get(prefix + '/study/analytics');
      assert.equal(learner.statusCode, 200, learner.body);
      assert.equal(learner.json().submissions.accepted, 1);
      assert.ok(learner.json().recent.some((record) => record.id === submission.id && record.slug === 'count-above'));
      fixture.submissionId = submission.id;
      const profile = await app.inject({ method: 'PUT', url: prefix + '/study/profile', headers: student.headers,
        payload: { handle: 'merge-rehearsal-solver', bio: '', isPublic: true, sharePlacement: true, hiringOpen: true, availableForWork: true, preferredRole: 'Backend', expectedGraduation: 2027 } });
      assert.equal(profile.statusCode, 200, profile.body);
    }
    const global = await app.inject(rankingsUrl + '/global');
    assert.equal(global.statusCode, 200, global.body);
    assert.ok(global.json().rows.some(({ handle, xp, solved }) => handle === 'merge-rehearsal-solver' && xp === 10 && solved === 1));
    assert.equal((await app.inject(rankingsUrl + '/college')).statusCode, 401);
    const college = await get(rankingsUrl + '/college');
    assert.equal(college.statusCode, 200, college.body);
    assert.equal(college.json().college, 'Disposable merge test');
    assert.equal(college.json().rows[0]?.handle, 'merge-rehearsal-solver');
    assert.equal((await get(rankingsUrl + '/college', teacher.headers)).statusCode, 403);
    const cohort = prefix + '/placement/cohorts/' + fixture.classId;
    const team = prefix + '/placement/team';
    const officer = await login(fixture.officer.email);
    const recruiter = await login(fixture.recruiter.email);
    if (phase === 'enabled') {
      const superAdmin = await login(fixture.superAdmin.email);
      const registration = await app.inject({ method: 'POST', url: prefix + '/placement/recruiters',
        headers: recruiter.headers, payload: { company: 'Merge Recruiting' } });
      assert.equal(registration.statusCode, 201, registration.body);
      const approved = await app.inject({ method: 'PATCH', url: prefix + '/placement/admin/recruiters/' + fixture.recruiter.id,
        headers: superAdmin.headers, payload: { status: 'APPROVED' } });
      assert.equal(approved.statusCode, 200, approved.body);
      const initial = await app.inject({ method: 'POST', url: team + '/primary?universityId=' + fixture.universityId,
        headers: superAdmin.headers, payload: { email: fixture.teacher.email, expectedPrimary: null } });
      assert.equal(initial.statusCode, 201, initial.body);
      const officerPath = prefix + '/placement/officer';
      const application = await app.inject({ method: 'POST', url: officerPath + '/application', headers: officer.headers, payload: {} });
      assert.equal(application.statusCode, 201, application.body);
      const applicationId = application.json().id;
      const evidence = await app.inject({ method: 'POST', url: officerPath + '/application/' + applicationId + '/evidence',
        headers: officer.headers, payload: { evidence: [{ kind: 'manual_note', label: 'DSA staff verification' }] } });
      assert.equal(evidence.statusCode, 200, evidence.body);
      const decision = await app.inject({ method: 'POST', url: officerPath + '/reviews/' + applicationId + '/decision',
        headers: superAdmin.headers, payload: { status: 'APPROVED', version: 2, reason: 'Approved in the DSA rehearsal.' } });
      assert.equal(decision.statusCode, 200, decision.body);
      const transfer = await app.inject({ method: 'POST', url: team + '/' + fixture.officer.id + '/make-primary',
        headers: teacher.headers, payload: { expectedPrimary: fixture.teacher.id } });
      assert.equal(transfer.statusCode, 200, transfer.body);
      const assigned = await app.inject({ method: 'POST', url: cohort + '/assignments', headers: teacher.headers,
        payload: { title: 'Existing cohort exercise', dueAt: new Date(Date.now() + 3_600_000).toISOString(), problemSlugs: ['count-above'] } });
      assert.equal(assigned.statusCode, 201, assigned.body);
      fixture.assignmentId = assigned.json().id;
      const archiveAssignment = await app.inject({ method: 'POST', url: cohort + '/assignments/' + fixture.assignmentId + '/archive', headers: teacher.headers });
      assert.equal(archiveAssignment.statusCode, 200, archiveAssignment.body);
      const archive = await app.inject({ method: 'POST', url: cohort + '/archive', headers: teacher.headers });
      assert.equal(archive.statusCode, 200, archive.body);
      assert.equal(archive.json().alreadyArchived, false);
    }
    const teamInfo = await get(team, officer.headers);
    assert.equal(teamInfo.statusCode, 200, teamInfo.body);
    assert.equal(teamInfo.json().primaryId, fixture.officer.id);
    assert.equal(teamInfo.json().members.length, 2);
    const request = await get(prefix + '/placement/officer/application', officer.headers);
    assert.equal(request.statusCode, 200, request.body);
    assert.equal(request.json().history[0]?.status, 'APPROVED');
    assert.equal(request.json().history[0]?.evidence[0]?.label, 'DSA staff verification');
    const notifications = await get(prefix + '/notifications', officer.headers);
    assert.equal(notifications.statusCode, 200, notifications.body);
    assert.ok(notifications.json().notifications.some(({ title }) => title === 'Placement officer application approved'));
    assert.ok(notifications.json().notifications.some(({ title }) => title === 'You are the placement team lead'));
    assert.deepEqual((await get(prefix + '/notifications')).json().notifications.map(({ title }) => title), ['New class assignment']);
    const candidates = await get(prefix + '/placement/candidates?university=' + fixture.universityId
      + '&preferredRole=Backend&expectedGraduation=2027&availableForWork=true', recruiter.headers);
    assert.equal(candidates.statusCode, 200, candidates.body);
    assert.equal(candidates.json().candidates[0]?.handle, 'merge-rehearsal-solver');
    assert.equal(candidates.json().candidates[0]?.xp, 10);
    assert.ok(!candidates.body.includes(fixture.student.email));
    if (phase === 'enabled') {
      const signature = await app.inject({ method: 'POST', url: prefix + '/study/profile/sign', headers: student.headers });
      assert.equal(signature.statusCode, 200, signature.body);
      fixture.proofId = signature.json().id;
    }
    const proof = await app.inject(prefix + '/study/profile/verify/' + fixture.proofId);
    assert.equal(proof.statusCode, 200, proof.body);
    assert.equal(proof.json().status, 'verified');
    assert.equal(proof.json().snapshot.handle, 'merge-rehearsal-solver');
    assert.equal(proof.json().snapshot.solved, 1);
    const auditAdmin = await login(fixture.superAdmin.email);
    const audit = await get(prefix + '/admin/audit?area=placement', auditAdmin.headers);
    assert.equal(audit.statusCode, 200, audit.body);
    assert.ok(audit.json().entries.some(({ action, target }) => action === 'Recruiter application reviewed' && target.id === fixture.recruiter.id));
    assert.ok(audit.json().entries.some(({ action }) => action === 'Officer application approved'));
    assert.equal((await get(prefix + '/admin/audit', recruiter.headers)).statusCode, 403);
    const accounts = prefix + '/admin/accounts';
    const found = await get(accounts + '?q=' + encodeURIComponent(fixture.student.email) + '&role=STUDENT', auditAdmin.headers);
    assert.equal(found.statusCode, 200, found.body);
    assert.deepEqual(found.json().accounts.map(({ id }) => id), [fixture.student.id]);
    if (phase === 'enabled') {
      const change = (access, reason) => app.inject({ method: 'PATCH', url: accounts + '/' + fixture.student.id + '/access',
        headers: auditAdmin.headers, payload: { access, reason } });
      const suspended = await change('suspended', 'Merge rehearsal restriction');
      assert.equal(suspended.statusCode, 200, suspended.body);
      try {
        const blocked = await get(prefix + '/problems');
        assert.equal(blocked.statusCode, 403, blocked.body);
        assert.equal(blocked.json().error, 'PRACTICE_ACCESS_SUSPENDED');
        const native = await get('/api/student/dashboard');
        assert.equal(native.statusCode, 200, native.body);
      } finally {
        const restored = await change('active', 'Merge rehearsal access restored');
        assert.equal(restored.statusCode, 200, restored.body);
      }
      assert.equal((await get(prefix + '/problems')).statusCode, 200);
    }
    if (phase === 'enabled') {
      const options = { headers: auditAdmin.headers };
      const importPath = prefix + '/community/admin/opportunities';
      const title = 'Rehearsal import ' + randomUUID().slice(0, 8);
      const extract = await app.inject({ ...options, method: 'POST', url: importPath + '/import/extract',
        payload: { researchText: JSON.stringify([{ title, company: 'Rehearsal club', category: 'Program',
          summary: 'A synthetic opportunity for release verification.', applyUrl: 'https://example.org/apply', sourceUrl: 'https://example.org/source' }]) } });
      assert.equal(extract.statusCode, 200, extract.body);
      const saved = await app.inject({ ...options, method: 'POST', url: importPath + '/import/bulk', payload: extract.json() });
      assert.equal(saved.statusCode, 201, saved.body);
      const id = saved.json().imported[0].id;
      const publish = () => app.inject({ ...options, method: 'PATCH', url: importPath + '/' + id, payload: { published: true } });
      assert.equal((await publish()).statusCode, 409);
      const verified = await app.inject({ ...options, method: 'PATCH', url: importPath + '/' + id + '/verify', payload: { confirmed: true } });
      assert.equal(verified.statusCode, 200, verified.body);
      assert.equal((await publish()).statusCode, 200);
      const published = await app.inject(prefix + '/community/opportunities?q=' + encodeURIComponent(title));
      assert.deepEqual(published.json().opportunities.map((row) => row.id), [id]);
    }
    const analytics = await get(prefix + '/admin/analytics', auditAdmin.headers);
    assert.equal(analytics.statusCode, 200, analytics.body);
    assert.ok(analytics.json().practice.accepted >= 1);
    assert.ok(analytics.json().engagement.active7Days >= 1);
    const trend = await get(prefix + '/admin/analytics/trend?bucket=weekly', auditAdmin.headers);
    assert.equal(trend.statusCode, 200, trend.body);
    assert.equal(trend.json().periods.length, 12);
    assert.ok(trend.json().periods.some(({ accepted }) => accepted >= 1));
    assert.equal((await get(prefix + '/admin/analytics', recruiter.headers)).statusCode, 403);
    const report = await get(prefix + '/placement/reports/overview', officer.headers);
    assert.equal(report.statusCode, 200, report.body);
    assert.equal(report.json().totals.students, 1);
    assert.equal(report.json().rankings[0]?.name, 'Merge Student');
    assert.ok(report.json().cohorts.some(({ id, students }) => id === fixture.classId && students === 1));
    const archivedCohort = await get(cohort, officer.headers);
    assert.equal(archivedCohort.statusCode, 200, archivedCohort.body);
    assert.ok(archivedCohort.json().cohort.archivedAt);
    assert.equal(archivedCohort.json().roster[0]?.id, fixture.student.id);
    const completion = await get(cohort + '/assignments/' + fixture.assignmentId + '/completion', officer.headers);
    assert.equal(completion.statusCode, 200, completion.body);
    assert.equal(completion.json().archived, true);
    assert.equal(completion.json().students[0]?.id, fixture.student.id);
    assert.equal(completion.json().students[0]?.missing.length, 1);
    const oldClass = await get('/api/teacher/classes/' + fixture.classId, teacher.headers);
    assert.equal(oldClass.statusCode, 200, oldClass.body);
    assert.equal((await prisma.class.findUniqueOrThrow({ where: { id: fixture.classId } })).isActive, true);
    const history = await get(prefix + '/submissions?slug=count-above');
    assert.ok(history.json().submissions.some(({ id, reflectionRating }) => id === fixture.submissionId && reflectionRating === 'manageable'));
    const progress = await prisma.studentProgress.findUniqueOrThrow({
      where: { studentId_problemId: { studentId: fixture.student.id, problemId: countAbove.id } },
    });
    assert.equal(progress.status, 'SOLVED');
    const roadmap = await prisma.roadmapProblem.findFirstOrThrow({ where: { problemId: countAbove.id } });
    assert.equal((await prisma.roadmapProgress.findUniqueOrThrow({
      where: { studentId_roadmapProblemId: { studentId: fixture.student.id, roadmapProblemId: roadmap.id } },
    })).status, 'SOLVED');
  }

  if (phase === 'baseline' || phase === 'enabled') await writeFile(record, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ phase, legacyStudentRoutes: true, teacherBank: true, interviewHistory: true, preservedProgress: true,
    practice: availability.statusCode === 200 ? availability.json().enabled : null, judgeRequests: calls }));
  console.log('VERDICT: PASS');
} finally {
  await app?.close();
  await prisma?.$disconnect();
  submission.closeAllConnections();
  await new Promise((done) => submission.close(done));
}
