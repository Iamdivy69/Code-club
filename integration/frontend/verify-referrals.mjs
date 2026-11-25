import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

function signupFixture(universityId, password, referral) {
  const suffix = randomUUID();
  return {
    name: 'Referred DSA student', email: 'referral-' + suffix + '@merge.test',
    password: password + '!A', role: 'STUDENT', universityId,
    registerNumber: suffix, degree: 'Computer Science', batch: 'Rehearsal', referral,
  };
}

function authRequest(site, method, path, data, token) {
  return fetch(site + '/api' + path, {
    method,
    headers: {
      'User-Agent': 'DSA referral rehearsal',
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: JSON.stringify(data),
  });
}

export async function verifyEnabledReferral({ site, page, browser, db, referrerId, password }) {
  const { universityId } = await db.student.findUniqueOrThrow({ where: { userId: referrerId } });
  const handle = 'mentor-' + randomUUID().slice(0, 8);
  await db.practiceProfile.upsert({
    where: { userId: referrerId }, update: { handle }, create: { userId: referrerId, handle },
  });

  await page.goto(site + '/practice/community?view=credits', { waitUntil: 'domcontentloaded' });
  const link = page.getByLabel('Referral link');
  await link.waitFor();
  const referralURL = await link.inputValue();
  assert.equal(referralURL, site + '/signup?ref=' + handle);

  const input = signupFixture(universityId, password, handle);
  const guest = await browser.newPage();
  let created;
  try {
    await guest.goto(referralURL, { waitUntil: 'domcontentloaded' });
    await guest.getByPlaceholder('John Doe').fill(input.name);
    await guest.getByPlaceholder('name@university.edu').fill(input.email);
    await guest.locator('input[type=password]').fill(input.password);
    await guest.locator('form select').selectOption(universityId);
    await guest.getByPlaceholder('21BCE1042').fill(input.registerNumber);
    await guest.getByPlaceholder('B.Tech CSE').fill(input.degree);
    await guest.getByPlaceholder('2022-2026').fill(input.batch);
    const submitted = guest.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/signup' && response.request().method() === 'POST');
    await guest.getByRole('button', { name: 'Create Account', exact: true }).click();
    const signup = await submitted;
    assert.equal(signup.request().postDataJSON().referral, handle);
    assert.equal(signup.status(), 201, await signup.text());
    created = await signup.json();
    await guest.getByText('Pending Admin Approval', { exact: true }).waitFor();
  } finally {
    await guest.close();
  }

  const referredId = created.user.id;
  assert.equal(created.requiresApproval, true);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: referredId } })).approvalStatus, 'PENDING');
  const association = await db.practiceReferral.findUniqueOrThrow({ where: { referredId } });
  assert.equal(association.referrerId, referrerId);
  assert.equal(association.qualifiedAt, null);
  const credentials = { email: input.email, password: input.password };
  assert.equal((await authRequest(site, 'POST', '/auth/login', credentials)).status, 403);

  await db.user.update({ where: { id: referredId }, data: { approvalStatus: 'APPROVED', isActive: true, emailVerified: true } });
  const signedIn = await authRequest(site, 'POST', '/auth/login', credentials);
  assert.equal(signedIn.status, 200);
  const { accessToken } = await signedIn.json();
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await authRequest(site, 'POST', '/practice/judge/submit', {
      problemSlug: 'count-above', language: 'javascript', requestKey: randomUUID(),
      code: 'function countAbove(values, threshold) { return values.filter(value => value > threshold).length; }',
    }, accessToken);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).submission.verdict, 'Accepted');
  }
  assert.ok((await db.practiceReferral.findUniqueOrThrow({ where: { referredId } })).qualifiedAt instanceof Date);
  const credits = await db.practiceCredit.findMany({
    where: { eventKey: { in: ['referrer:' + referredId, 'referred:' + referredId] } }, orderBy: { amount: 'asc' },
  });
  assert.deepEqual(credits.map(({ userId, amount }) => ({ userId, amount })), [
    { userId: referredId, amount: 20 }, { userId: referrerId, amount: 40 },
  ]);

  const invalid = await authRequest(site, 'POST', '/auth/signup', signupFixture(universityId, password, { unexpected: true }));
  assert.equal(invalid.status, 201);
  assert.equal(await db.practiceReferral.findUnique({ where: { referredId: (await invalid.json()).user.id } }), null);
  return { handle, universityId };
}

export async function verifyDisabledReferral({ site, db, password }, { handle, universityId }) {
  const signup = await authRequest(site, 'POST', '/auth/signup', signupFixture(universityId, password, handle));
  assert.equal(signup.status, 201);
  const { user, requiresApproval } = await signup.json();
  assert.equal(requiresApproval, true);
  assert.equal(await db.practiceReferral.findUnique({ where: { referredId: user.id } }), null);
}
