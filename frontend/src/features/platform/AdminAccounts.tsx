import { ProgressReset } from './ProgressReset';
import { useState, type FormEvent } from 'react';
import type { PracticeAccount, PracticeAccountPage } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';

const base = '/practice/admin/accounts';
const roles = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' };
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function AccountRow({ account, reload }: { account: PracticeAccount; reload(): void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suspended = Boolean(account.suspendedAt);
  const label = suspended ? 'Restore Practice access' : 'Suspend Practice access';
  const access = suspended ? 'active' : 'suspended';
  const canManage = account.role === 'STUDENT' || account.role === 'TEACHER';

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    setBusy(true);
    setError('');
    try {
      await api.patch(base + '/' + account.id + '/access', { access, reason });
      setEditing(false);
      reload();
    } catch (error) {
      setError(errorMessage(error, 'Could not change Practice access.'));
    } finally {
      setBusy(false);
    }
  }

  return <article className="playlist">
    <div className="feature-row">
      <div><h3 className="account-identity">{account.name}</h3><p className="account-identity">{account.email}</p></div>
      <p>{suspended ? 'Practice suspended' : 'Practice unrestricted'}</p>
    </div>
    <p className="muted">{roles[account.role]} · DSA account {account.approvalStatus.toLowerCase()}, {account.isActive ? 'active' : 'inactive'} · Joined {date.format(new Date(account.createdAt))}</p>
    {account.suspendedAt && <p className="muted">Suspended {date.format(new Date(account.suspendedAt))}</p>}
    {account.role === 'STUDENT' && <ProgressReset userId={account.id} />}
    {canManage && !editing && <button className="button" type="button" onClick={() => setEditing(true)}>{label}</button>}
    {editing && <form className="feature-form" onSubmit={(event) => void update(event)}>
      <label>Reason for {suspended ? 'restoring' : 'suspending'} Practice access
        <textarea name="reason" required minLength={3} maxLength={240} disabled={busy} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="inline-controls">
        <button type="submit" className="button accent" disabled={busy}>{label}</button>
        <button type="button" className="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
      </div>
    </form>}
  </article>;
}

function AccountPage({ query, before, previous, next }: {
  query: string; before?: string; previous?: () => void; next(cursor: string): void;
}) {
  const filters = new URLSearchParams(query);
  if (before) filters.set('before', before);
  const { data, error, reload } = useResource<PracticeAccountPage>(base + '?' + filters);
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading Practice accounts…</p>}
    {data?.accounts.length === 0 && <p>No accounts match your search.</p>}
    {data?.accounts.map((account) => <AccountRow key={account.id} account={account} reload={reload} />)}
    {(previous || data?.next) && <div className="inline-controls">
      {previous && <button className="button" type="button" onClick={previous}>Newer accounts</button>}
      {data?.next && <button className="button" type="button" onClick={() => next(data.next!)}>Older accounts</button>}
    </div>}
  </>;
}

export function AdminAccounts() {
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors[cursors.length - 1];

  function findAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) filters.set(key, value.trim());
    }
    setQuery(filters.toString());
    setCursors([]);
  }

  return <section className="feature-card feature-form">
    <h2>Practice accounts</h2>
    <p className="muted">Manage Practice access for students and teachers. Access changes are recorded in the audit log.</p>
    <form className="feature-form" onSubmit={findAccounts}>
      <label>Name or email<input name="q" type="search" maxLength={120} /></label>
      <div className="field-grid">
        <label>Role<select name="role"><option value="">All roles</option>
          {Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Practice access<select name="access"><option value="">Any access state</option>
          <option value="active">Unrestricted</option><option value="suspended">Suspended</option>
        </select></label>
      </div>
      <button className="button" type="submit">Search accounts</button>
    </form>
    <AccountPage key={query + ':' + before} query={query} before={before}
      previous={cursors.length ? () => setCursors((rows) => rows.slice(0, -1)) : undefined}
      next={(cursor) => setCursors((rows) => [...rows, cursor])} />
  </section>;
}
