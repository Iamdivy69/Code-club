import { useEffect, useRef, useState } from 'react';
import { ActionForm } from './ActionForm';
import { PlacementTeam } from './PlacementTeam';
import { AssignmentCompletion } from './AssignmentCompletion';
import { RecruiterDirectory } from './RecruiterDirectory';
import { ReadinessReport } from './ReadinessReport';
import { OfficerReviews, OfficerVerification } from './OfficerVerification';
import { InstitutionOnboarding, InstitutionReviews } from './InstitutionOnboarding';
import { ArrowRight, BookOpen, BriefcaseBusiness, GraduationCap, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { CohortImportResult, CohortImportStatus, ProblemSummary } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { slugUrl, useResource } from './resource';

const base = '/practice/placement';
type Access = { college: boolean; admin: boolean; reports: boolean; recruiter: { company: string; status: string } | null };
type Task = { slug: string; title: string; solved?: boolean };
type Cohort = { id: string; name: string; code: string; degree: string; batch: string; archivedAt: string | null;
  _count: { enrollments: number; practiceCohortInvites: number } };
type Assessment = { id: string; title: string; author: boolean; status: string; deadline: string | null; minutes: number; tasks: Task[]; solved: number; total: number };
const moment = (date: string) => new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function ProblemPicker() {
  const catalogue = useResource<{ problems: ProblemSummary[] }>('/practice/problems');
  return <fieldset className="problem-picker"><legend>Problems</legend>
    {catalogue.error && <p role="alert">{catalogue.error}</p>}
    {catalogue.data?.problems.map((item) => <label className="check-label" key={item.slug}>
      <input type="checkbox" name="problem" value={item.slug} />{item.title}
    </label>)}
  </fieldset>;
}

function StudentWork() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const assessment = params.get('assessment');
  const message = params.get('message');
  const assignments = useResource<{ assignments: Array<{ id: string; title: string; cohort: string; dueAt: string; problems: Task[] }> }>(base + '/assignments');
  const tests = useResource<{ tests: Assessment[] }>(base + '/tests' + (assessment ? '?assessment=' + encodeURIComponent(assessment) : ''));
  const inbox = useResource<{ messages: Array<{ id: string; message: string; createdAt: string; recruiter: { practiceRecruiter: { company: string } } }> }>(
    base + '/interest' + (message ? '?message=' + encodeURIComponent(message) : ''),
  );
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (hash === '#skills-tests' || hash === '#recruiter-messages') document.getElementById(hash.slice(1))?.focus();
  }, [hash]);
  const receivedTests = tests.data?.tests.filter((item) => !item.author);

  async function status(id: string, action: 'start' | 'finish') {
    setError('');
    try { await api.post(base + '/tests/' + id + '/' + action); tests.reload(); }
    catch (reason) { setError(errorMessage(reason, 'Could not update the skills test.')); }
  }
  return <div className="feature-grid">
    <section className="feature-card"><h2><BookOpen size={19} /> Class assignments</h2>
      {assignments.error && <p className="error" role="alert">{assignments.error}</p>}
      {assignments.data?.assignments.length === 0 && <p className="muted">Your class assignments will appear here.</p>}
      {assignments.data?.assignments.map((item) => <div className="playlist" key={item.id}>
        <strong>{item.title}</strong><p className="muted">{item.cohort} · Due {moment(item.dueAt)}</p>
        {item.problems.map((task) => <div className="feature-row" key={task.slug}>
          <Link className="inline-link" to={slugUrl(task.slug)}>{task.title}<ArrowRight size={15} /></Link>{task.solved && <span className="accepted">Complete</span>}
        </div>)}
      </div>)}
    </section>
    <section className="feature-card" id="skills-tests" tabIndex={-1}><h2><BriefcaseBusiness size={19} /> Skills tests</h2>
      {(error || tests.error) && <p className="error" role="alert">{error || tests.error}</p>}
      {assessment && <Link className="inline-link" to="/practice/placement?view=student#skills-tests">View all skills tests <ArrowRight size={15} /></Link>}
      {receivedTests?.length === 0 && <p className="muted">{assessment ? 'This skills test is unavailable.' : 'Skills tests from recruiters will appear here.'}</p>}
      {receivedTests?.map((item) => {
        const left = item.deadline ? Math.max(0, Math.ceil((new Date(item.deadline).getTime() - now) / 1_000)) : 0;
        const active = item.status === 'In progress' && left > 0;
        return <div className="playlist feature-form" key={item.id}>
          <strong>{item.title}</strong><p className="muted">{item.status === 'In progress' && !left ? 'Expired' : item.status} · {item.solved}/{item.total} solved</p>
          {item.status === 'Invited' && <button className="button primary" onClick={() => {
            if (confirm('Start your ' + item.minutes + '-minute skills test now?')) void status(item.id, 'start');
          }}>Start {item.minutes}-minute test</button>}
          {active && <><p className="muted">Time left {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
            {item.tasks.map((task) => <Link key={task.slug} className="inline-link" to={slugUrl(task.slug) + '?assessment=' + item.id}>{task.title}<ArrowRight size={15} /></Link>)}
            <button className="button" onClick={() => { if (confirm('Submit your completed skills test?')) void status(item.id, 'finish'); }}>Finish test</button>
          </>}
        </div>;
      })}
    </section>
    <section className="feature-card" id="recruiter-messages" tabIndex={-1}><h2>Recruiter messages</h2>
      {inbox.error && <p className="error" role="alert">{inbox.error}</p>}
      {message && <Link className="inline-link" to="/practice/placement?view=student#recruiter-messages">View all recruiter messages <ArrowRight size={15} /></Link>}
      {inbox.data?.messages.length === 0 && <p className="muted">{message ? 'This recruiter message is unavailable.' : 'No messages yet.'}</p>}
      {inbox.data?.messages.map((item) => <article className="playlist" key={item.id}>
        <strong>{item.recruiter.practiceRecruiter?.company}</strong>
        <p>{item.message}</p>
        <time className="muted" dateTime={item.createdAt}>{moment(item.createdAt)}</time>
      </article>)}
    </section>
  </div>;
}

function College() {
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState('');
  const cohorts = useResource<{ cohorts: Cohort[] }>(base + '/cohorts?status=' + status + '&q=' + encodeURIComponent(search));
  return <div className="feature-grid">
    <section className="feature-card">
      <h2><GraduationCap size={20} /> Your cohorts</h2>
      <nav className="feature-tabs" aria-label="Cohort status">
        <button type="button" aria-pressed={status === 'active'} onClick={() => { setStatus('active'); setSelection(''); }}>Active</button>
        <button type="button" aria-pressed={status === 'archived'} onClick={() => { setStatus('archived'); setSelection(''); }}>Archived</button>
      </nav>
      <input aria-label="Find a cohort" placeholder="Search by name" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} />
      {cohorts.error && <p className="error" role="alert">{cohorts.error}</p>}
      {cohorts.data?.cohorts.map((item) => <button className="feature-row" aria-pressed={selection === item.id} key={item.id} onClick={() => setSelection(item.id)}>
        <strong>{item.name}</strong><span className="muted">{item._count.enrollments} {item._count.enrollments === 1 ? 'student' : 'students'}{item._count.practiceCohortInvites ? ' · ' + item._count.practiceCohortInvites + ' pending' : ''}</span><ArrowRight size={15} />
      </button>)}
      {cohorts.data?.cohorts.length === 0 && <p className="muted">No {status} cohorts found.</p>}
    </section>
    {status === 'active' && <ActionForm action={async (form) => {
      const { data } = await api.post<{ id: string }>(base + '/cohorts', Object.fromEntries(form));
      setSelection(data.id);
    }} onDone={cohorts.reload} submit="Create cohort">
      <h2>Create cohort</h2><CohortFields />
    </ActionForm>}
    {selection && <CohortDetail id={selection} key={selection} onChange={cohorts.reload} />}
  </div>;
}

function CohortFields({ cohort }: { cohort?: Pick<Cohort, 'name' | 'code' | 'batch' | 'degree'> }) {
  return <>
    <label>Name<input name="name" required minLength={3} maxLength={100} defaultValue={cohort?.name} /></label>
    <div className="field-grid">
      <label>Cohort code<input name="code" required minLength={2} maxLength={50} defaultValue={cohort?.code} /></label>
      <label>Batch<input name="batch" required minLength={2} maxLength={20} defaultValue={cohort?.batch} /></label>
    </div>
    <label>Degree<input name="degree" required minLength={2} maxLength={100} defaultValue={cohort?.degree} /></label>
  </>;
}

const rosterLabels: Record<CohortImportStatus, string> = {
  enrolled: 'Enrolled', invited: 'Invited', 'already-member': 'Already enrolled', 'already-invited': 'Already invited',
  duplicate: 'Duplicate row', 'invalid-email': 'Invalid email', unavailable: 'Unavailable for this university', capacity: 'Cohort full',
};

function RosterReport({ result }: { result: CohortImportResult }) {
  const [page, setPage] = useState(0);
  const size = 25;
  const visible = result.rows.slice(page * size, (page + 1) * size);
  return <div className="cohort-report">
    <p role="status">{result.summary.enrolled} enrolled · {result.summary.invited} invited · {result.rows.length} rows checked</p>
    <ul aria-label="Roster import results">
      {visible.map((row) => <li className="feature-row" key={row.row}>
        <span className="muted">Row {row.row}</span><span>{row.email || 'Missing address'}</span><strong>{rosterLabels[row.status]}</strong>
      </li>)}
    </ul>
    {result.rows.length > size && <div className="inline-controls">
      <button type="button" className="button" onClick={() => setPage(page - 1)} disabled={page === 0}>Previous rows</button>
      <button type="button" className="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * size >= result.rows.length}>Next rows</button>
    </div>}
  </div>;
}

function CohortDetail({ id, onChange }: { id: string; onChange(): void }) {
  const path = base + '/cohorts/' + id;
  const cohort = useResource<{ cohort: Omit<Cohort, '_count'>; roster: Array<{ id: string; name: string; email: string; solved: number }>;
    invites: Array<{ email: string; createdAt: string }>;
    assignments: Array<{ id: string; title: string; dueAt: string; total: number; completed: number; totalStudents: number; archived: boolean }> }>(path);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [reminderStatus, setReminderStatus] = useState('');
  const [assignmentHistory, setAssignmentHistory] = useState(false);
  const [assignmentDetail, setAssignmentDetail] = useState('');
  const [report, setReport] = useState<CohortImportResult>();
  const [reportVersion, setReportVersion] = useState(0);

  function reload() { cohort.reload(); onChange(); }
  function showReport(data: CohortImportResult) {
    setReport(data);
    setReportVersion((version) => version + 1);
  }
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure('');
    try { await action(); reload(); }
    catch (error) { setFailure(errorMessage(error, 'Could not update the cohort.')); }
    finally { setBusy(false); }
  }

  if (cohort.error) return <p className="error" role="alert">{cohort.error}</p>;
  if (!cohort.data) return <p role="status">Loading cohort…</p>;
  const { cohort: details, invites, roster, assignments } = cohort.data;
  const archived = Boolean(details.archivedAt);
  const shownAssignments = assignments.filter((item) => item.archived === assignmentHistory);
  return <>
    <section className="feature-card">
      <div className="feature-row">
        <div><h2>{details.name}</h2><p className="muted">{details.code} · {details.degree} · {details.batch}</p></div>
        {archived ? <span className="muted">Archived</span> : <div className="inline-controls">
          <button type="button" className="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel edit' : 'Edit cohort'}</button>
          <button type="button" className="button" disabled={busy} onClick={() => {
            if (window.confirm('Archive this Practice cohort? The roster and reports will be read-only.')) void mutate(() => api.post(path + '/archive'));
          }}>Archive cohort</button>
        </div>}
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
      <h3>Enrolled students</h3>
      {!roster.length && <p className="muted">No students are enrolled.</p>}
      {roster.map((student) => <div className="feature-row" key={student.id}>
        <div><strong>{student.name}</strong><p className="muted">{student.email}</p></div>
        <span>{student.solved} solved</span>
        {!archived && <button type="button" className="button" disabled={busy} onClick={() => {
          if (window.confirm('Remove ' + student.name + ' from this cohort?')) void mutate(() => api.delete(path + '/students/' + student.id));
        }}>Remove</button>}
      </div>)}
      {invites.length > 0 && <div className="cohort-report">
        <h3>Pending invitations</h3>
        <p className="muted">Reserved seats activate when verified students from this university open Class assignments.</p>
        {invites.map((invite) => <div className="feature-row" key={invite.email}>
          <span>{invite.email}</span>{!archived && <button type="button" className="button" disabled={busy} onClick={() => {
            void mutate(() => api.post(path + '/invites/revoke', { email: invite.email }));
          }}>Revoke invitation</button>}
        </div>)}
      </div>}
      <h3>Assignment completion</h3>
      <nav className="feature-tabs print-hide" aria-label="Assignment status">
        <button type="button" aria-pressed={!assignmentHistory} onClick={() => { setAssignmentHistory(false); setAssignmentDetail(''); }}>Active</button>
        <button type="button" aria-pressed={assignmentHistory} onClick={() => { setAssignmentHistory(true); setAssignmentDetail(''); }}>Archived</button>
      </nav>
      {!shownAssignments.length && <p className="muted">No {assignmentHistory ? 'archived' : 'active'} assignments.</p>}
      {shownAssignments.map((item) => {
        const detailPath = path + '/assignments/' + item.id;
        return <article className="assignment-item" key={item.id}>
          <div className="feature-row">
            <div><strong>{item.title}</strong><p className="muted">{item.total} {item.total === 1 ? 'problem' : 'problems'} · Due {moment(item.dueAt)}</p></div>
            <span>{item.completed}/{item.totalStudents} complete</span>
          </div>
          <div className="inline-controls print-hide">
            <button type="button" className="button" aria-expanded={assignmentDetail === item.id}
              onClick={() => setAssignmentDetail((active) => active === item.id ? '' : item.id)}>View completion</button>
            {!archived && !item.archived && Date.parse(item.dueAt) > Date.now() && <button type="button" className="button" disabled={busy} onClick={() => {
              if (!window.confirm('Remind students who have yet to finish this assignment?')) return;
              setReminderStatus('');
              void mutate(async () => {
                const { data } = await api.post<{ remindedCount: number }>(detailPath + '/remind');
                setReminderStatus(data.remindedCount === 0 ? 'No students need a reminder.' :
                  'Reminder sent to ' + data.remindedCount + (data.remindedCount === 1 ? ' student.' : ' students.'));
              });
            }}>Send reminder</button>}
            {!archived && !item.archived && <button type="button" className="button" disabled={busy} onClick={() => {
              if (!window.confirm('Archive this assignment and close its scoring window?')) return;
              setReminderStatus('');
              void mutate(async () => {
                await api.post(detailPath + '/archive');
                setAssignmentHistory(true);
                setAssignmentDetail(item.id);
              });
            }}>Archive assignment</button>}
          </div>
          {assignmentDetail === item.id && <AssignmentCompletion key={item.id + ':' + item.archived} path={detailPath} />}
        </article>;
      })}
      {reminderStatus && <p role="status">{reminderStatus}</p>}
      <button type="button" className="button print-hide" onClick={() => window.print()}>Print cohort report</button>
    </section>
    {!archived && <div className="feature-page">
      {editing && <ActionForm submit="Save cohort" onDone={reload} action={async (form) => {
        await api.patch(path, Object.fromEntries(form)); setEditing(false);
      }}><h2>Edit cohort</h2><CohortFields cohort={details} /></ActionForm>}
      <ActionForm submit="Add student" onDone={reload} action={async (form) => {
        const { data } = await api.post<CohortImportResult>(path + '/students', { email: form.get('email') });
        showReport(data);
      }}>
        <h2>Add a student</h2><label>Student email<input name="email" required type="email" maxLength={254} /></label>
      </ActionForm>
      <ActionForm submit="Import roster" onDone={reload} action={async (form) => {
        const file = form.get('roster');
        const addresses = String(form.get('emails') ?? '').split(/[\n,;]+/)
          .map((value) => value.trim().replace(/^"|"$/g, '')).filter((value) => value && value.toLowerCase() !== 'email');
        const pasted = 'email\n' + addresses.map((value) => '"' + value.replace(/"/g, '""') + '"').join('\n');
        const csv = file instanceof File && file.size ? await file.text() : pasted;
        const { data } = await api.post<CohortImportResult>(path + '/import', csv, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        showReport(data);
      }}>
        <h2>Import students</h2>
        <label>Roster CSV<input name="roster" type="file" accept=".csv,text/csv" /></label>
        <p className="muted">Include an email column. Up to 2 MB and 10,000 rows.</p>
        <label>Or paste email addresses<textarea name="emails" rows={3} placeholder="One email per line" /></label>
      </ActionForm>
      {report && <section className="feature-card"><h2>Roster results</h2><RosterReport key={reportVersion} result={report} /></section>}
      <ActionForm submit="Assign problems" onDone={cohort.reload} action={async (form) => {
        await api.post(path + '/assignments', { title: form.get('title'), dueAt: new Date(String(form.get('due'))).toISOString(), problemSlugs: form.getAll('problem') });
      }}>
        <h2>New assignment</h2><label>Title<input name="title" required minLength={3} maxLength={100} /></label>
        <label>Due date<input name="due" type="datetime-local" required /></label><ProblemPicker />
      </ActionForm>
    </div>}
  </>;
}

function RecruiterDesk({ account, reload }: { account: Access['recruiter']; reload(): void }) {
  if (!account) return <ActionForm submit="Request recruiter access" onDone={reload} action={async (form) => { await api.post(base + '/recruiters', { company: form.get('company') }); }}>
    <h2>Recruiter application</h2><label>Company<input name="company" required minLength={3} maxLength={100} /></label>
  </ActionForm>;
  if (account.status !== 'APPROVED') return <section className="feature-card"><h2>{account.company}</h2><p className="muted">Application {account.status.toLowerCase()}.</p></section>;
  return <RecruiterSearch />;
}

function RecruiterSearch() {
  const assessments = useResource<{ tests: Assessment[] }>(base + '/tests');
  const sent = useResource<{ messages: Array<{ id: string; candidateHandle: string | null; message: string; createdAt: string }> }>(base + '/interests/sent');
  const [candidate, setCandidate] = useState('');
  const pendingInvite = useRef<{ details: string; key: string }>(null);
  return <div className="feature-grid">
    <RecruiterDirectory select={setCandidate} />
    <section className="feature-card"><h2>Assigned tests</h2>
      {assessments.data?.tests.filter((item) => item.author).map((item) => <div className="feature-row" key={item.id}>
        <strong>{item.title}</strong><span className="muted">{item.status}</span><span>{item.solved}/{item.total} solved</span>
      </div>)}
    </section>
    {candidate && <>
      <ActionForm submit="Send in-app message" onDone={sent.reload} action={async (form) => { await api.post(base + '/interest', { handle: candidate, message: form.get('message') }); }}>
        <h2>Contact {candidate}</h2><label>Message<textarea name="message" required maxLength={1500} /></label>
      </ActionForm>
      <ActionForm submit="Invite to skills test" onDone={assessments.reload} action={async (form) => {
        const invite = { handle: candidate, title: form.get('title'), minutes: Number(form.get('minutes')), problemSlugs: form.getAll('problem') };
        const details = JSON.stringify(invite);
        if (pendingInvite.current?.details !== details) pendingInvite.current = { details, key: crypto.randomUUID() };
        await api.post(base + '/tests', { ...invite, requestKey: pendingInvite.current.key });
        pendingInvite.current = null;
      }}>
        <h2>Assess {candidate}</h2><label>Title<input name="title" required minLength={3} maxLength={100} /></label>
        <label>Minutes<input name="minutes" type="number" min={5} max={180} required defaultValue={45} /></label><ProblemPicker />
      </ActionForm>
    </>}
    <section className="feature-card">
      <h2>Sent messages</h2>
      {sent.error && <p className="error" role="alert">{sent.error}</p>}
      {sent.data?.messages.length === 0 && <p className="muted">You haven’t sent any messages yet.</p>}
      {sent.data?.messages.map((item) => <article className="playlist" key={item.id}>
        <strong>{item.candidateHandle ? '@' + item.candidateHandle : 'Candidate'}</strong>
        <p>{item.message}</p>
        <time className="muted" dateTime={item.createdAt}>{moment(item.createdAt)}</time>
      </article>)}
    </section>
  </div>;
}

function Reviews() {
  const data = useResource<{ applications: Array<{ userId: string; company: string; workEmail: string }> }>(base + '/admin/recruiters');
  const [error, setError] = useState('');
  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await api.patch(base + '/admin/recruiters/' + id, { status }); data.reload(); }
    catch (reason) { setError(errorMessage(reason, 'Could not review this application.')); }
  }
  return <section className="feature-card"><h2><ShieldCheck size={19} /> Recruiter applications</h2>
    {(error || data.error) && <p role="alert">{error || data.error}</p>}
    {data.data?.applications.length === 0 && <p className="muted">Nothing awaiting review.</p>}
    {data.data?.applications.map((item) => <div className="feature-row" key={item.userId}>
      <div><strong>{item.company}</strong><p className="muted">{item.workEmail}</p></div>
      <div className="inline-controls"><button className="button primary" onClick={() => void review(item.userId, 'APPROVED')}>Approve</button>
        <button className="button" onClick={() => void review(item.userId, 'REJECTED')}>Reject</button></div>
    </div>)}
  </section>;
}

export default function Placement() {
  const access = useResource<Access>(base + '/me');
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') ?? 'student';
  const views = [['student', 'My assignments and tests'], ['recruiter', 'Recruiter'],
    ...(access.data && !access.data.admin ? [['institution', 'Institution']] : []),
    ...(access.data?.college ? [['college', 'College'], ['team', 'Placement team'], ['verification', 'Officer verification']] : []),
    ...(access.data?.admin ? [['review', 'Review applications'], ['team', 'Placement teams'], ['officer-reviews', 'Officer reviews'], ['institution-reviews', 'Institution reviews']] : []),
    ...(access.data?.reports ? [['reports', 'Readiness reports']] : [])];
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>Placement workspace</h1><p className="muted">Manage class assignments and skills tests.</p></div></header>
    <nav className="feature-tabs" aria-label="Placement views">{views.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setParams({ view: id! })}>{label}</button>)}</nav>
    {access.error && <p role="alert">{access.error}</p>}
    {tab === 'student' ? <StudentWork /> : !access.data ? <p role="status">Loading access…</p> :
      tab === 'college' && access.data.college ? <College /> : tab === 'review' && access.data.admin ? <Reviews /> :
      tab === 'institution' && !access.data.admin ? <InstitutionOnboarding /> :
      tab === 'institution-reviews' && access.data.admin ? <InstitutionReviews /> :
      tab === 'verification' && !access.data.admin ? <OfficerVerification /> :
      tab === 'officer-reviews' && access.data.admin ? <OfficerReviews /> :
      tab === 'reports' && access.data.reports ? <ReadinessReport admin={access.data.admin} /> :
      tab === 'team' && (access.data.college || access.data.admin) ? <PlacementTeam admin={access.data.admin} /> :
      tab === 'recruiter' ? <RecruiterDesk account={access.data.recruiter} reload={access.reload} /> : <p className="muted">This view is unavailable to your account.</p>}
  </main>;
}
