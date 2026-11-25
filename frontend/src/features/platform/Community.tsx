import { OperationalSettings } from './OperationalSettings';
import { useRef, useState } from 'react';
import { ArrowUpRight, Coins, Gift, Lightbulb, ThumbsUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../app/api';
import { opportunityCategories } from '../../../../shared/src/types/practice';
import { useSession } from '../../app/session';
import { ActionForm } from './ActionForm';
import { ProblemBankAdmin } from './ProblemBankAdmin';
import { AdminAudit } from './AdminAudit';
import { OpportunityImport } from './OpportunityImport';
import { AdminAccounts } from './AdminAccounts';
import { Ambassador } from './Ambassador';
import { AdminAnalytics } from './AdminAnalytics';
import { useResource } from './resource';

const base = '/practice/community';
const kinds: Record<string, string> = { FEATURE: 'Feature request', CONTRIBUTION: 'Contribution', AMBASSADOR: 'Ambassador application', REPORT: 'Community report' };
type Entry = { id: string; kind: string; state: string; title: string; body: string; ambassadorCollegeDomain?: string | null; payload?: unknown; reviewReason?: string | null };
type Opportunity = { id: string; title: string; company: string; summary: string; category: string; remote: boolean; applyUrl: string; closesAt: string | null };
type Reward = { id: string; title: string; details: string; stock: number; cost: number };
type CreditsData = { balance: number; qualified: number; referred: number; referral: string | null;
  entries: Array<{ id: string; reason: string; amount: number }>; store: Reward[];
  redemptions: Array<{ id: string; cost: number; state: string; reward: { title: string } }> };

function ReportItem({ targetType, targetId }: { targetType: 'FEATURE' | 'OPPORTUNITY'; targetId: string }) {
  return <details><summary>Report this item</summary><ActionForm submit="Send report" action={async form => {
    await api.post(base + '/reports', { targetType, targetId, reason: form.get('reason') });
  }}><label>Reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} /></label>
    <p className="muted">A moderator will review your report. Your report is private.</p>
  </ActionForm></details>;
}

function Board() {
  const board = useResource<{ requests: Array<Entry & { voted: boolean; votes: number }>; mine: Entry[] }>(base + '/board');
  const [error, setError] = useState('');
  const [submissionKind, setSubmissionKind] = useState('FEATURE');
  const [contributionType, setContributionType] = useState('new_problem');
  async function change(path: string, body?: { voted: boolean }) {
    setError('');
    try {
      if (body) await api.put(base + path, body);
      else await api.post(base + path);
      board.reload();
    } catch (reason) { setError(errorMessage(reason, 'Could not update this request.')); }
  }
  return <div className="feature-grid">
    <section className="feature-card">
      <h2><Lightbulb size={19} /> Feature board</h2>
      {(error || board.error) && <p role="alert" className="error">{error || board.error}</p>}
      {!board.data ? <p className="muted">Loading requests…</p> : !board.data.requests.length ? <p className="muted">Approved feature requests will appear here.</p> : board.data.requests.map((item) => <article key={item.id} className="feature-row">
        <div><strong>{item.title}</strong><p>{item.body}</p><span className="muted">{item.state.toLowerCase()}</span><ReportItem targetType="FEATURE" targetId={item.id} /></div>
        <button className="button" aria-pressed={item.voted} onClick={() => void change('/board/' + item.id + '/vote', { voted: !item.voted })}><ThumbsUp size={16} /> {item.votes}</button>
      </article>)}
    </section>
    <ActionForm submit="Send for review" onDone={board.reload} action={async (form) => {
      if (submissionKind === 'FEATURE') {
        await api.post(base + '/board', { kind: 'FEATURE', title: form.get('title'), body: form.get('body') });
      } else {
        const testcases = JSON.parse(String(form.get('testcases') ?? ''));
        const payload = contributionType === 'new_problem' ? {
          type: contributionType, title: form.get('title'), statement: form.get('body'),
          topic: form.get('topic'), difficulty: form.get('difficulty'), functionName: form.get('functionName'),
          examples: JSON.parse(String(form.get('examples') ?? '')), testcases,
        } : { type: contributionType, problemSlug: form.get('problemSlug'), reason: form.get('body'), testcases };
        await api.post(base + '/contributions', payload);
      }
    }}>
      <h2>Send a submission</h2>
      <label>Type<select value={submissionKind} onChange={event => setSubmissionKind(event.target.value)}><option value="FEATURE">Feature request</option><option value="CONTRIBUTION">Contribution</option></select></label>
      {submissionKind === 'CONTRIBUTION' && <label>Contribution type<select value={contributionType} onChange={event => setContributionType(event.target.value)}><option value="new_problem">New problem</option><option value="testcase_improvement">Testcase improvement</option></select></label>}
      {(submissionKind === 'FEATURE' || contributionType === 'new_problem') && <label>Title<input name="title" required minLength={3} maxLength={120} /></label>}
      {submissionKind === 'CONTRIBUTION' && (contributionType === 'new_problem' ? <>
        <label>Topic<input name="topic" required minLength={2} maxLength={50} /></label>
        <label>Difficulty<select name="difficulty"><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></label>
        <label>Function name<input name="functionName" required pattern="[A-Za-z_$][A-Za-z0-9_$]*" maxLength={100} /></label>
        <label>Examples (JSON)<textarea name="examples" required rows={3} placeholder={'[{"input":"values = [2,3]","output":"5"}]'} /></label>
      </> : <label>Published problem slug<input name="problemSlug" required maxLength={200} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>)}
      <label>{submissionKind === 'FEATURE' ? 'Details' : contributionType === 'new_problem' ? 'Problem statement' : 'Reason for improvement'}<textarea name="body" required minLength={10} maxLength={submissionKind === 'FEATURE' ? 15000 : contributionType === 'new_problem' ? 10000 : 2000} rows={4} /></label>
      {submissionKind === 'CONTRIBUTION' && <>
        <label>Proposed grading cases (JSON)<textarea name="testcases" required rows={4} placeholder={'[{"input":{"values":[2,3]},"expectedOutput":5}]'} /></label>
        <p className="muted">Proposals and grading cases stay private to you and administrators. Approval does not automatically change a published problem or its tests.</p>
      </>}
    </ActionForm>
    <section className="feature-card"><h2>Your submissions</h2>
      {board.data?.mine.length === 0 && <p className="muted">Nothing submitted yet.</p>}
      {board.data?.mine.map((item) => <div className="feature-row" key={item.id}>
        <div><strong>{item.title}</strong><p className="muted">{kinds[item.kind]} · {item.state.toLowerCase()}</p>{item.reviewReason && <p>Review: {item.reviewReason}</p>}{item.payload != null && <details><summary>Submission details</summary><pre>{JSON.stringify(item.payload, null, 2)}</pre></details>}</div>
        {item.state === 'PENDING' && <button className="button" onClick={() => void change('/board/' + item.id + '/withdraw')}>Withdraw</button>}
      </div>)}
    </section>
  </div>;
}

function Opportunities() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [remote, setRemote] = useState(false);
  const [closingSoon, setClosingSoon] = useState(false);
  const filters = new URLSearchParams({ q, ...(category && { category }), ...(remote && { remote: 'true' }), ...(closingSoon && { closingSoon: 'true' }) });
  const resource = useResource<{ opportunities: Opportunity[] }>(base + '/opportunities?' + filters);
  return <div className="feature-page">
    <label className="feature-form"><span>Find an opportunity</span> <input value={q} maxLength={80} onChange={(event) => setQ(event.target.value)} placeholder="Search roles or companies" /></label>
    <div className="field-grid"><label>Opportunity type<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All types</option>{opportunityCategories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" checked={remote} onChange={event => setRemote(event.target.checked)} />Remote only</label>
      <label className="check-label"><input type="checkbox" checked={closingSoon} onChange={event => setClosingSoon(event.target.checked)} />Closing within seven days</label></div>
    {resource.error && <p className="error" role="alert">{resource.error}</p>}
    {resource.data?.opportunities.length === 0 && <p className="empty-state">No open opportunities match this search.</p>}
    <div className="feature-grid">{resource.data?.opportunities.map((item) => <article className="feature-card" key={item.id}>
      <span className="eyebrow muted">{item.category} · {item.company}{item.remote ? ' · Remote' : ''}</span>
      <h2>{item.title}</h2><p>{item.summary}</p>
      {item.closesAt && <p className="muted">Closes {new Date(item.closesAt).toLocaleDateString()}</p>}
      <a className="inline-link" href={item.applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => {
        void api.post(base + '/opportunities/' + item.id + '/click').catch(() => undefined);
      }}>Apply <ArrowUpRight size={16} /></a><ReportItem targetType="OPPORTUNITY" targetId={item.id} />
    </article>)}</div>
  </div>;
}

function Credits() {
  const account = useResource<CreditsData>(base + '/credits');
  const [error, setError] = useState('');
  const requests = useRef<Record<string, string>>({});
  async function update(id: string, cancel: boolean) {
    setError('');
    try {
      if (cancel) await api.post(base + '/credits/redemptions/' + id + '/cancel');
      else {
        const requestKey = requests.current[id] ??= crypto.randomUUID();
        await api.post(base + '/credits/redeem', { rewardId: id, requestKey });
        delete requests.current[id];
      }
      account.reload();
    } catch (cause) { setError(errorMessage(cause, 'The redemption could not be updated.')); }
  }
  const data = account.data;
  if (!data) return <p className="muted" role="status">{account.error || 'Loading credits…'}</p>;
  const referral = data.referral ? location.origin + '/signup?ref=' + encodeURIComponent(data.referral) : null;
  return <div className="feature-grid">
    <section className="feature-card"><h2><Coins size={19} /> {data.balance} credits</h2>
      <p>{data.qualified} of {data.referred} referrals have solved their first problem.</p>
      {referral ? <label>Referral link<input readOnly value={referral} onFocus={(event) => event.target.select()} /></label>
        : <Link className="inline-link" to="/practice/dashboard?tab=profile">Set a handle to get a referral link</Link>}
      {data.entries.map((item) => <div className="feature-row" key={item.id}><span>{item.reason.toLowerCase().replace(/_/g, ' ')}</span><strong>{item.amount > 0 ? '+' : ''}{item.amount}</strong></div>)}
    </section>
    <section className="feature-card"><h2><Gift size={19} /> Rewards store</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {!data.store.length && <p className="muted">No rewards are available right now.</p>}
      {data.store.map((item) => <div className="feature-row" key={item.id}>
        <div><strong>{item.title}</strong><p>{item.details}</p><p className="muted">{item.cost} credits · {item.stock} available</p></div>
        <button className="button" disabled={!item.stock || item.cost > data.balance} onClick={() => {
          if (confirm('Redeem ' + item.title + ' for ' + item.cost + ' credits?')) void update(item.id, false);
        }}>Redeem</button>
      </div>)}
    </section>
    <section className="feature-card"><h2>Your redemptions</h2>
      {data.redemptions.map((item) => <div className="feature-row" key={item.id}><strong>{item.reward.title}</strong><span className="muted">{item.state.toLowerCase()}</span>
        {item.state === 'PENDING' && <button className="button" onClick={() => void update(item.id, true)}>Cancel</button>}
      </div>)}
      {!data.redemptions.length && <p className="muted">Nothing redeemed yet.</p>}
    </section>
  </div>;
}

function Administration() {
  const queue = useResource<{ entries: Entry[] }>(base + '/admin/board');
  const opportunities = useResource<{ opportunities: Array<Opportunity & { published: boolean; clicks: number; imported: boolean; verifiedAt: string | null; sourceUrl: string | null }> }>(base + '/admin/opportunities');
  const redemptions = useResource<{ redemptions: Array<{ id: string; reward: { title: string }; user: { name: string }; cost: number }> }>(base + '/admin/redemptions');
  const [error, setError] = useState('');
  async function update(path: string, reload: () => void, values?: object) {
    try {
      if (values) await api.patch(base + path, values);
      else await api.post(base + path);
      setError(''); reload();
    } catch (failure) { setError(errorMessage(failure, 'The change could not be saved.')); }
  }
  return <div className="feature-grid">
    <ProblemBankAdmin />
    {(error || queue.error) && <p className="error" role="alert">{error || queue.error}</p>}
    <section className="feature-card"><h2>Review submissions</h2>
      {queue.data?.entries.length === 0 && <p className="muted">Nothing awaiting review.</p>}
      {queue.data?.entries.map((item) => <div className="feature-row" key={item.id}>
        <div><strong>{item.title}</strong><p>{item.body}</p><p className="muted">{kinds[item.kind]}{item.ambassadorCollegeDomain && ' · ' + item.ambassadorCollegeDomain}</p>{item.payload != null && <details><summary>Review submitted details</summary><pre>{JSON.stringify(item.payload, null, 2)}</pre></details>}</div>
        <div className="inline-controls">{item.kind === 'REPORT' ? <>
          <button className="button" onClick={() => { const reason = window.prompt('Reason for removing this reported item'); if (reason) void update('/admin/reports/' + item.id, queue.reload, { state: 'APPROVED', reason }); }}>Remove reported item</button>
          <button className="button" onClick={() => { const reason = window.prompt('Reason for dismissing this report'); if (reason) void update('/admin/reports/' + item.id, queue.reload, { state: 'REJECTED', reason }); }}>Dismiss report</button>
        </> : item.state === 'PENDING' ? <>
          <button className="button primary" onClick={() => void update('/admin/board/' + item.id, queue.reload, { state: 'APPROVED' })}>Approve</button>
          <button className="button" onClick={() => {
            const reason = window.prompt('Enter an optional reason for declining this submission.');
            if (reason !== null) void update('/admin/board/' + item.id, queue.reload, { state: 'REJECTED', reason });
          }}>Reject</button>
        </> : <button className="button" onClick={() => void update('/admin/board/' + item.id, queue.reload, { state: 'SHIPPED' })}>Mark shipped</button>}</div>
      </div>)}
    </section>
    <ActionForm submit="Save opportunity" onDone={opportunities.reload} action={async (form) => {
      const due = String(form.get('due') ?? '');
      await api.post(base + '/admin/opportunities', { title: form.get('title'), company: form.get('company'),
        category: form.get('category'), summary: form.get('summary'), applyUrl: form.get('applyUrl'),
        closesAt: due ? new Date(due).toISOString() : null, published: form.has('published'), remote: form.has('remote') });
    }}>
      <h2>New opportunity</h2><label>Title<input name="title" required minLength={3} maxLength={120} /></label>
      <label>Company<input name="company" required minLength={2} maxLength={100} /></label>
      <label>Type<select name="category">{opportunityCategories.map((label) => <option key={label}>{label}</option>)}</select></label>
      <label>Summary<textarea name="summary" required minLength={10} maxLength={2000} /></label>
      <label>Application URL<input type="url" name="applyUrl" placeholder="https://" required /></label>
      <label>Closing date<input type="datetime-local" name="due" /></label>
      <label className="check-label"><input type="checkbox" name="remote" />Remote</label>
      <label className="check-label"><input type="checkbox" name="published" />Publish</label>
    </ActionForm>
    <OpportunityImport onImported={opportunities.reload} />
    <section className="feature-card"><h2>Manage opportunities</h2>{opportunities.data?.opportunities.map((item) =>
      <div className="feature-row opportunity-admin-row" key={item.id}>
        <div><strong>{item.title}</strong><p className="muted">{item.clicks} apply clicks
          {item.imported && (item.verifiedAt ? ' · Source verified' : ' · Pending verification')}</p>
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Official source</a>}
        </div>
        {item.imported && !item.verifiedAt
          ? <button className="button" type="button" onClick={() => {
            if (window.confirm('Confirm you checked the official source and application details.')) {
              void update('/admin/opportunities/' + item.id + '/verify', opportunities.reload, { confirmed: true });
            }
          }}>Verify source</button>
          : <button className="button" type="button" onClick={() => void update('/admin/opportunities/' + item.id, opportunities.reload, { published: !item.published })}>{item.published ? 'Unpublish' : 'Publish'}</button>}
      </div>)}
    </section>
    <ActionForm submit="Add reward" action={async (form) => {
      await api.post(base + '/admin/rewards', { title: form.get('title'), details: form.get('details'), stock: Number(form.get('stock')), cost: Number(form.get('cost')) });
    }}>
      <h2>Add store reward</h2><label>Title<input name="title" required minLength={3} maxLength={120} /></label>
      <label>Details<textarea name="details" required minLength={2} maxLength={1500} /></label>
      <div className="field-grid"><label>Stock<input type="number" name="stock" min={1} max={10000} defaultValue={1} required /></label>
        <label>Credits<input type="number" name="cost" min={1} max={1000000} required /></label></div>
    </ActionForm>
    <section className="feature-card"><h2>Pending redemptions</h2>
      {redemptions.data?.redemptions.map((row) => <div className="feature-row" key={row.id}><div><strong>{row.reward.title}</strong><p>{row.user.name}</p></div>
        <button className="button" onClick={() => void update('/admin/redemptions/' + row.id + '/fulfill', redemptions.reload)}>Mark fulfilled</button></div>)}
    </section>
  </div>;
}

export default function Community() {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();
  const admin = user?.role === 'SUPER_ADMIN';
  const tab = params.get('view') ?? 'board';
  const items = [['board', 'Feature board'], ['opportunities', 'Opportunities'], ['credits', 'Credits and rewards'], ['ambassador', 'Ambassador'], ...(admin ? [['admin', 'Administration'], ['accounts', 'Accounts'], ['analytics', 'Analytics'], ['audit', 'Audit log'], ['settings', 'Settings']] : [])];
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>Community</h1><p className="muted">Suggest improvements, find opportunities, and manage credits.</p></div></header>
    <nav className="feature-tabs" aria-label="Community views">{items.map(([id, label]) => <button key={id} aria-pressed={id === tab} onClick={() => setParams({ view: id! })}>{label}</button>)}</nav>
    {tab === 'settings' && admin ? <OperationalSettings /> : tab === 'opportunities' ? <Opportunities /> : tab === 'credits' ? <Credits /> : tab === 'ambassador' ? <Ambassador /> : tab === 'admin' && admin ? <Administration /> : tab === 'accounts' && admin ? <AdminAccounts /> : tab === 'audit' && admin ? <AdminAudit /> : tab === 'analytics' && admin ? <AdminAnalytics /> : <Board />}
  </main>;
}
