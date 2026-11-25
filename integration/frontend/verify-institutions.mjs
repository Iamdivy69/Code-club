import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const independent = '169d2577-43ae-493a-b6fb-5a94d4956359';

export async function verifyInstitutionOnboarding({ browser, db, site, adminEmail, fixtureEmail, password, screenshot }) {
  const [database] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.match(database.name, /^practice_(browser|merge_[a-z0-9]+)$/);
  const stamp = randomUUID().slice(0, 8);
  const domain = 'browser-campus-' + stamp + '.ac.test';
  const name = 'Institution rehearsal ' + stamp;
  const accountName = 'Officer rehearsal ' + stamp;
  const email = 'placement@' + domain;
  const { passwordHash } = await db.user.findUniqueOrThrow({ where: { email: fixtureEmail }, select: { passwordHash: true } });
  await db.university.upsert({ where: { id: independent }, update: {},
    create: { id: independent, name: 'Independent Practice', emailDomains: [] } });
  const applicant = await db.user.create({ data: {
    email, name: accountName, role: 'STUDENT', emailVerified: true, passwordHash,
    student: { create: { universityId: independent, registerNumber: 'P-' + randomUUID(), degree: 'Independent Practice', batch: 'Practice' } },
  } });
  let universityId;
  const pages = [];
  const errors = [];
  const placement = '/practice/placement?view=';
  const open = (page, view) => page.goto(site + placement + view);

  async function signIn(email) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    pages.push(page);
    page.on('pageerror', (reason) => errors.push(reason.message));
    await page.goto(site + '/login');
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL((url) => url.pathname !== '/login');
    return page;
  }

  try {
    const learner = await signIn(email);
    const admin = await signIn(adminEmail);
    await open(learner, 'institution');
    await learner.getByLabel('Institution name', { exact: true }).fill(name);
    await learner.getByLabel('Domain evidence', { exact: true }).fill('Institutional registry entry for the rehearsal.');
    await learner.getByRole('button', { name: 'Request institution review', exact: true }).click();
    await learner.getByText('Awaiting review', { exact: true }).waitFor();
    assert.ok(await learner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (screenshot) await learner.screenshot({ path: screenshot, fullPage: true });

    const adminStatus = admin.waitForResponse((response) => new URL(response.url()).pathname === '/api/practice/placement/me');
    await open(admin, 'institution-reviews');
    const access = await adminStatus;
    assert.equal(access.status(), 200);
    assert.equal((await access.json()).admin, true);
    await admin.getByRole('heading', { name: 'Institution reviews', exact: true }).waitFor();
    const domainCard = admin.locator('article.feature-card').filter({ has: admin.getByRole('heading', { name, exact: true }) });
    await domainCard.waitFor();
    const decision = domainCard.getByRole('combobox');
    assert.equal(await decision.count(), 1, await domainCard.innerText());
    await decision.selectOption('APPROVED');
    await domainCard.getByRole('button', { name: 'Save institution decision', exact: true }).click();
    await domainCard.waitFor({ state: 'detached' });
    const university = await db.university.findFirstOrThrow({ where: { name, emailDomains: { has: domain } }, select: { id: true } });
    universityId = university.id;
    await learner.getByRole('button', { name: 'Refresh institution status', exact: true }).click();
    await learner.getByRole('button', { name: 'Join institution', exact: true }).click();
    await learner.getByText('Current institution', { exact: false }).getByText(name, { exact: true }).waitFor();
    await learner.getByRole('link', { name: 'Request placement officer access', exact: true }).click();
    await learner.getByRole('button', { name: 'Submit application', exact: true }).click();
    await learner.getByLabel('Evidence label').fill('Institution staff directory');
    await learner.getByLabel('Reference', { exact: true }).fill('https://' + domain + '/staff');
    await learner.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await learner.getByText('1 of 10 items added.', { exact: false }).waitFor();

    await admin.getByRole('button', { name: 'Officer reviews', exact: true }).click();
    const officer = admin.locator('article.feature-card').filter({ has: admin.getByRole('heading', { name: accountName, exact: true }) });
    await officer.getByRole('combobox').selectOption('APPROVED');
    const approval = admin.waitForResponse((response) => response.request().method() === 'POST' &&
      /^\/api\/practice\/placement\/officer\/reviews\/[^/]+\/decision$/.test(new URL(response.url()).pathname));
    await officer.getByRole('button', { name: 'Save decision', exact: true }).click();
    const reviewed = await approval;
    assert.equal(reviewed.status(), 200, await reviewed.text());
    assert.equal((await reviewed.json()).status, 'APPROVED');
    await officer.waitFor({ state: 'detached' });
    const grant = await db.practicePlacementMember.findUniqueOrThrow({ where: { userId: applicant.id } });
    assert.equal(grant.universityId, universityId);
    assert.equal(grant.isPrimary, true);
    const roleChangeRequests = [];
    const observeRoleChange = (response) => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/auth/refresh' || path === '/api/practice/placement/me') {
        roleChangeRequests.push({ path, status: response.status() });
      }
    };
    learner.on('response', observeRoleChange);
    const accessAfterApproval = learner.waitForResponse((response) => new URL(response.url()).pathname === '/api/practice/placement/me');
    await open(learner, 'team');
    const loaded = await accessAfterApproval.catch((error) => {
      throw new Error('Placement access requests after approval: ' + JSON.stringify(roleChangeRequests), { cause: error });
    }).finally(() => learner.off('response', observeRoleChange));
    assert.equal(loaded.status(), 200, await loaded.text());
    assert.equal((await loaded.json()).college, true);
    await learner.getByText('Team lead', { exact: true }).waitFor();
    await learner.getByText(email, { exact: true }).waitFor();

    await admin.getByRole('button', { name: 'Placement teams', exact: true }).click();
    await admin.getByLabel('Search universities', { exact: true }).fill(name);
    const universityPicker = admin.locator('section.feature-card').filter({ has: admin.getByRole('heading', { name: 'University', exact: true }) });
    await universityPicker.getByRole('combobox').selectOption(universityId);
    admin.once('dialog', (dialog) => dialog.accept());
    await admin.getByRole('button', { name: 'Remove', exact: true }).click();
    await admin.getByText('Member removed.', { exact: true }).waitFor();
    await learner.reload();
    await learner.getByText('Your university’s placement team grants access to its cohorts.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    if (!universityId) universityId = (await db.university.findFirst({ where: { name }, select: { id: true } }))?.id;
    const applications = await db.practiceInstitutionApplication.findMany({ where: { domain }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { resourceId: { in: [...applications.map(({ id }) => id), ...(universityId ? [universityId] : [])] } } });
    await db.practiceInstitutionApplication.deleteMany({ where: { domain } });
    await db.user.delete({ where: { id: applicant.id } });
    if (universityId) await db.university.delete({ where: { id: universityId } });
  }
}
