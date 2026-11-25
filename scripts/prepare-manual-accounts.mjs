import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'dotenv';
const root = new URL('../', import.meta.url);
const settings = parse(await readFile(new URL('.local/rehearsal/clean.env', root)));
assert.equal(settings.PRACTICE_WEB_PORT, '34121', 'Prepare only the disposable manual candidate');
const origin = 'http://127.0.0.1:34121';
async function login(email) { const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: settings.PRACTICE_STAFF_PASSWORD }) }); assert.equal(response.status, 200); return response.json(); }
const admin = await login('admin@practice.test'), recruiter = await login('recruiter@practice.test');
const recruiterHeaders = { Authorization: 'Bearer ' + recruiter.accessToken, 'Content-Type': 'application/json' };
let state = await (await fetch(origin + '/api/practice/placement/me', { headers: recruiterHeaders })).json();
if (state.recruiter?.status !== 'APPROVED') {
  const submitted = await fetch(origin + '/api/practice/placement/recruiters', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ company: 'CodeClub Test Recruiter' }) }); assert.equal(submitted.status, 201);
  const approved = await fetch(origin + '/api/practice/placement/admin/recruiters/' + recruiter.user.id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + admin.accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) }); assert.equal(approved.status, 200);
}
const directory = new URL('.local/release/', root); await mkdir(directory, { recursive: true });
await writeFile(new URL('TEST-ACCOUNTS.txt', directory), [
  'CodeClub standalone 0.2.0-rc.1 — local manual candidate', 'URL: ' + origin, '',
  'Learner: student@practice.test', 'Password: ' + settings.PRACTICE_SEED_PASSWORD, '',
  'Teacher: teacher@practice.test', 'Placement officer: officer@practice.test',
  'Approved recruiter: recruiter@practice.test', 'Super admin: admin@practice.test',
  'Staff password: ' + settings.PRACTICE_STAFF_PASSWORD, '',
  'The learner has an Accepted Count Above submission from execution verification.',
  'Profile publication and recruiter discovery start private; enable consent to test discovery.',
  'These credentials apply only to the isolated candidate. The original demo credentials were preserved.',
  'This file is ignored by Git and excluded from the source archive.', ''
].join('\n'));
console.log(JSON.stringify({ candidate: origin, credentials: '.local/release/TEST-ACCOUNTS.txt', recruiter: 'APPROVED' }));
