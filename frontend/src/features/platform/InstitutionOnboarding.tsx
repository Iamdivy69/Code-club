import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstitutionApplication, InstitutionOnboardingStatus, InstitutionReviewQueue, InstitutionStatus } from '../../../../shared/src/types/practice';
import { api } from '../../app/api';
import { ActionForm } from './ActionForm';
import { useResource } from './resource';

const base = '/practice/placement/institution';
const labels: Record<InstitutionStatus, string> = { PENDING: 'Awaiting review', APPROVED: 'Approved', REJECTED: 'Rejected', REVOKED: 'Revoked' };
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function DecisionSummary({ application }: { application: InstitutionApplication }) {
  return <>
    <div className="feature-row">
      <strong>{labels[application.status]}</strong>
      <time className="muted" dateTime={application.submittedAt}>{date.format(new Date(application.submittedAt))}</time>
    </div>
    {application.reason && <p className="officer-proof-text">{application.reason}</p>}
  </>;
}

export function InstitutionOnboarding() {
  const resource = useResource<InstitutionOnboardingStatus>(base);
  const data = resource.data;
  const pending = data?.history.some(({ status, domain }) => domain === data.domain && status === 'PENDING');
  return <div className="feature-grid">
    <section className="feature-card">
      <h2>Institution onboarding</h2>
      {resource.error && <p className="error" role="alert">{resource.error}</p>}
      {!data && !resource.error && <p role="status">Loading institution status…</p>}
      {data?.currentUniversity && <p>Current institution <strong>{data.currentUniversity.name}</strong></p>}
      {data && !data.emailVerified && <p className="muted">Verify your account email before requesting institution access.</p>}
      {data?.emailVerified && !data.domain && <p className="muted">Sign in with an institutional email to request access.</p>}
      {data?.recognized && <p><strong>{data.recognized.name}</strong> recognizes {data.domain}.</p>}
      {data?.recognized && !data.canJoin && data.currentUniversity?.id !== data.recognized.id && !data.canRequestOfficer &&
        <p className="muted">Contact your DSA administrator to change your existing affiliation.</p>}
      {data?.canRequestOfficer && <Link className="inline-link" to="/practice/placement?view=verification">Request placement officer access</Link>}
      {data && <button className="button" type="button" onClick={resource.reload}>Refresh institution status</button>}
    </section>
    {data?.canJoin && data.recognized && <ActionForm submit="Join institution" onDone={resource.reload} action={async () => {
      await api.post(base + '/join');
    }}>
      <h2>Join {data.recognized.name}</h2>
      <p className="muted">Use your verified email to associate your student account with this institution.</p>
    </ActionForm>}
    {data?.domain && !data.recognized && !pending && <ActionForm submit="Request institution review" onDone={resource.reload} action={async (form) => {
      await api.post(base + '/application', { name: form.get('name'), evidence: form.get('evidence') });
    }}>
      <h2>Register {data.domain}</h2>
      <label>Institution name<input name="name" required minLength={3} maxLength={150} /></label>
      <label>Domain evidence<textarea name="evidence" required minLength={10} maxLength={1000} rows={3}
        placeholder="Institution website or a reference that confirms this domain" /></label>
    </ActionForm>}
    {!!data?.history.length && <section className="feature-card">
      <h2>Institution applications</h2>
      {data.history.map((application) => <article className="officer-application" key={application.id}>
        <strong>{application.name} · {application.domain}</strong>
        <DecisionSummary application={application} />
      </article>)}
    </section>}
  </div>;
}

function UniversityAssociation({ institutionName }: { institutionName: string }) {
  const [search, setSearch] = useState('');
  const universities = useResource<{ universities: Array<{ id: string; name: string }> }>(
    '/practice/placement/team/universities?q=' + encodeURIComponent(search),
  );
  return <>
    <label>Search existing universities<input type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label>Associate with<select name="universityId" key={search}>
      <option value="">Create {institutionName} in DSA</option>
      {universities.data?.universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
    </select></label>
    {universities.error && <p role="alert">{universities.error}</p>}
  </>;
}

function InstitutionDecision({ application, reload }: { application: InstitutionApplication; reload(): void }) {
  const reviewing = application.status === 'PENDING';
  const [decision, setDecision] = useState(reviewing ? '' : 'REVOKED');
  return <ActionForm submit={reviewing ? 'Save institution decision' : 'Revoke domain'} onDone={reload} action={async (form) => {
    const reason = String(form.get('reason') ?? '').trim();
    await api.post(base + '/reviews/' + application.id + '/decision', {
      status: decision, version: application.version, reason: reason || undefined,
      ...(decision === 'APPROVED' && form.get('universityId') ? { universityId: form.get('universityId') } : {}),
    });
  }}>
    {reviewing ? <label>Institution decision<select required value={decision} onChange={(event) => setDecision(event.target.value)}>
      <option value="">Select a decision</option><option value="APPROVED">Approve domain</option><option value="REJECTED">Reject application</option>
    </select></label> : <p className="muted">Revoking this domain stops new affiliations. Existing enrolments and separately reviewed placement access keep their current status.</p>}
    {decision === 'APPROVED' && <UniversityAssociation institutionName={application.name} />}
    <label>Institution decision reason<textarea name="reason" rows={2} maxLength={1000}
      required={decision === 'REJECTED' || decision === 'REVOKED'} /></label>
  </ActionForm>;
}

export function InstitutionReviews() {
  const [state, setState] = useState<InstitutionStatus>('PENDING');
  const [page, setPage] = useState(1);
  const list = useResource<InstitutionReviewQueue>(base + '/reviews?status=' + state + '&page=' + page);
  return <div className="feature-grid">
    <section className="feature-card">
      <h2>Institution reviews</h2>
      <nav className="feature-tabs" aria-label="Institution review status">
        {(Object.keys(labels) as InstitutionStatus[]).map((value) => <button type="button" key={value} aria-pressed={state === value}
          onClick={() => { setState(value); setPage(1); }}>{labels[value]}</button>)}
      </nav>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      {!list.data && !list.error && <p role="status">Loading institution requests…</p>}
      {list.data?.applications.length === 0 && <p className="muted">No applications in this view.</p>}
      <div className="inline-controls">
        <button className="button" type="button" onClick={list.reload}>Refresh institution reviews</button>
        <button className="button" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button className="button" type="button" disabled={!list.data?.hasNext} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </section>
    {list.data?.applications.map((item) => <article className="feature-card" key={item.id}>
      <h2>{item.name}</h2>
      <p className="muted">{item.domain} · {item.applicant?.name ?? 'Former account'} · {item.submittedEmail}</p>
      {item.university && <p>Associated with {item.university.name}</p>}
      <DecisionSummary application={item} />
      <details className="officer-proof"><summary>Domain evidence</summary><p className="officer-proof-text">{item.evidence}</p></details>
      {(item.status === 'PENDING' || item.status === 'APPROVED') &&
        <InstitutionDecision key={item.version} application={item} reload={list.reload} />}
    </article>)}
  </div>;
}
