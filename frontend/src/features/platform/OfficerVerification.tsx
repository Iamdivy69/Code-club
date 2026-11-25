import { useState } from 'react';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OfficerApplication, OfficerApplicationStatus, OfficerEvidenceInput, OfficerReviewQueue, OfficerStatus } from '../../../../shared/src/types/practice';
import { api } from '../../app/api';
import { ActionForm } from './ActionForm';
import { useResource } from './resource';

const base = '/practice/placement/officer';
const proofKinds: Record<OfficerEvidenceInput['kind'], string> = {
  invitation: 'Appointment or invitation',
  staff_id: 'Staff affiliation',
  document: 'Institutional document',
  manual_note: 'Additional context',
};
const statusLabels: Record<OfficerStatus, string> = {
  PENDING: 'Awaiting review', APPROVED: 'Approved', REJECTED: 'Rejected',
};
const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function Evidence({ application }: { application: OfficerApplication }) {
  return <details className="officer-proof">
    <summary>Evidence and decision</summary>
    <p className="muted">Verified university email {application.submittedEmail}</p>
    {application.evidence.length === 0 && <p className="muted">University email submitted as evidence.</p>}
    {application.evidence.length > 0 && <ul>
      {application.evidence.map((item, index) => <li key={index}>
        <strong>{item.label}</strong>
        <p className="muted">{proofKinds[item.kind]}</p>
        {item.reference && <p className="officer-proof-text">{item.reference}</p>}
        {item.note && <p className="officer-proof-text">{item.note}</p>}
      </li>)}
    </ul>}
    {application.reason && <p className="officer-proof-text"><strong>Decision reason</strong><br />{application.reason}</p>}
  </details>;
}

function ApplicationTitle({ application }: { application: OfficerApplication }) {
  return <div className="feature-row">
    <strong>{statusLabels[application.status]}</strong>
    <span className="muted">Submitted {date.format(new Date(application.submittedAt))}
      {application.reviewedAt && ' · Reviewed ' + date.format(new Date(application.reviewedAt))}
    </span>
  </div>;
}

function EvidenceForm({ application, reload }: { application: OfficerApplication; reload(): void }) {
  return <ActionForm submit="Add evidence" onDone={reload} action={async (form) => {
    const item = {
      kind: form.get('kind'),
      label: form.get('label'),
      reference: form.get('reference'),
      note: form.get('note'),
    };
    await api.post(base + '/application/' + application.id + '/evidence', { evidence: [item] });
  }}>
    <h2>Supporting evidence</h2>
    <p className="muted">Use an institutional staff listing, appointment reference, or a short note. {application.evidence.length} of 10 items added.</p>
    <label>Evidence type<select name="kind">
      {Object.entries(proofKinds).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
    </select></label>
    <label>Evidence label<input name="label" required maxLength={120} /></label>
    <label>Reference<input name="reference" maxLength={500} placeholder="Public link or reference" /></label>
    <label>Note<textarea name="note" maxLength={1000} rows={3} /></label>
  </ActionForm>;
}

export function OfficerVerification() {
  const result = useResource<OfficerApplicationStatus>(base + '/application');
  const account = result.data;
  const latest = account?.history[0];
  const pending = latest?.status === 'PENDING';
  return <div className="feature-grid">
    <section className="feature-card">
      <h2><ShieldCheck size={19} /> Placement officer verification</h2>
      {result.error && <p className="error" role="alert">{result.error}</p>}
      {!account && !result.error && <p role="status">Loading application…</p>}
      {account && <><p>{account.university.name}</p><p className="muted">{account.email}</p></>}
      {account?.provisionsTeacher && <p className="muted">Approval creates a DSA teacher profile at this institution and grants placement-team access.</p>}
      {account?.member && <Link className="inline-link" to="/practice/placement?view=team">Open placement team</Link>}
      {account && !account.institutionalEmail && <p className="muted">Applications require a verified email from one of your university’s registered domains.</p>}
      {account && <button type="button" className="button" onClick={result.reload}>Refresh status</button>}
    </section>
    {account?.institutionalEmail && !account.member && !pending && <ActionForm submit={latest ? 'Submit new application' : 'Submit application'} onDone={result.reload} action={async () => {
      await api.post(base + '/application', {});
    }}>
      <h2>Request placement access</h2>
      <p className="muted">A super admin reviews your request. You can add supporting evidence after submitting.</p>
    </ActionForm>}
    {pending && account?.institutionalEmail && latest.evidence.length < 10 &&
      <EvidenceForm key={latest.id + ':' + latest.version} application={latest} reload={result.reload} />}
    {!!account?.history.length && <section className="feature-card">
      <h2>Application history</h2>
      {account.history.map((application) => <article key={application.id} className="officer-application">
        <ApplicationTitle application={application} /><Evidence application={application} />
      </article>)}
    </section>}
  </div>;
}

function ReviewForm({ application, reload }: { application: OfficerApplication; reload(): void }) {
  const [decision, setDecision] = useState('');
  return <ActionForm submit="Save decision" onDone={reload} action={async (form) => {
    await api.post(base + '/reviews/' + application.id + '/decision', {
      status: decision, version: application.version, reason: form.get('reason'),
    });
  }}>
    <label>Decision<select required value={decision} onChange={(event) => setDecision(event.target.value)}>
      <option value="">Select a decision</option>
      <option value="APPROVED">Approve</option><option value="REJECTED">Reject</option>
    </select></label>
    <label>Decision reason<textarea name="reason" rows={2} maxLength={1000} required={decision === 'REJECTED'} /></label>
  </ActionForm>;
}

function ReviewList({ state, page, changePage }: { state: OfficerStatus; page: number; changePage(page: number): void }) {
  const result = useResource<OfficerReviewQueue>(base + '/reviews?status=' + state + '&page=' + page);
  return <>
    <section className="feature-card">
      <h2><ClipboardCheck size={19} /> Officer applications</h2>
      {result.error && <p className="error" role="alert">{result.error}</p>}
      {!result.data && !result.error && <p role="status">Loading applications…</p>}
      {result.data?.applications.length === 0 && <p className="muted">No applications in this view.</p>}
      <div className="inline-controls">
        <button type="button" className="button" onClick={result.reload}>Refresh applications</button>
        <button type="button" className="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <button type="button" className="button" disabled={!result.data?.hasNext} onClick={() => changePage(page + 1)}>Next</button>
      </div>
    </section>
    {result.data?.applications.map((application) => <article className="feature-card" key={application.id}>
      <h2>{application.applicant.name}</h2>
      <p className="muted">{application.university.name}</p>
      <ApplicationTitle application={application} /><Evidence application={application} />
      {application.status === 'PENDING' && application.applicant.role === 'STUDENT' && <p className="muted">An approval for this standalone applicant provisions a DSA teacher profile and placement-team membership.</p>}
      {application.status === 'PENDING' && <ReviewForm key={application.version} application={application} reload={result.reload} />}
    </article>)}
  </>;
}

export function OfficerReviews() {
  const [state, setState] = useState<OfficerStatus>('PENDING');
  const [page, setPage] = useState(1);
  return <div className="feature-grid">
    <nav className="feature-tabs" aria-label="Officer review status">
      {(Object.keys(statusLabels) as OfficerStatus[]).map((status) => <button type="button" key={status}
        aria-pressed={status === state} onClick={() => { setState(status); setPage(1); }}>{statusLabels[status]}</button>)}
    </nav>
    <ReviewList key={state + ':' + page} state={state} page={page} changePage={setPage} />
  </div>;
}
