import { useState, type FormEvent } from 'react';
import type { LeetCodeStats } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';

const endpoint = '/practice/study/external-stats';
const difficulty = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
] as const;
type Counts = Record<typeof difficulty[number]['key'], string>;
type Saved = { stats: LeetCodeStats | null; revision: string | null };
type Settings = Saved & { syncEnabled: boolean };
type Preview = { stats: LeetCodeStats; token: string };

function countFields(stats?: LeetCodeStats | null): Counts {
  return { easy: String(stats?.easy ?? 0), medium: String(stats?.medium ?? 0), hard: String(stats?.hard ?? 0) };
}

export function LeetCodeSummary({ stats }: { stats: LeetCodeStats }) {
  const when = new Date(stats.recordedAt).toLocaleDateString();
  return <div className="external-practice-stats">
    <p><a className="inline-link" href={'https://leetcode.com/u/' + encodeURIComponent(stats.username) + '/'}>LeetCode {'@' + stats.username}</a></p>
    <p><strong>{stats.total.toLocaleString()} LeetCode solves</strong> · {stats.easy} easy · {stats.medium} medium · {stats.hard} hard</p>
    <p className="muted">{stats.source === 'fetched' ? 'Fetched' : 'Self-reported'} · {when}{stats.stale ? ' · Sync older than 7 days' : ''}</p>
  </div>;
}

function StatsEditor({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState<Saved>(initial);
  const [syncEnabled, setSyncEnabled] = useState(initial.syncEnabled);
  const [username, setUsername] = useState(initial.stats?.username ?? '');
  const [counts, setCounts] = useState(() => countFields(initial.stats));
  const [preview, setPreview] = useState<Preview>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function execute(action: () => Promise<void>) {
    setPending(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (reason) { setError(errorMessage(reason, 'Could not update your LeetCode stats.')); }
    finally { setPending(false); }
  }

  function update(data: Saved, message: string) {
    setSaved(data);
    setUsername(data.stats?.username ?? '');
    setCounts(countFields(data.stats));
    setPreview(undefined);
    setNotice(message);
  }

  async function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await execute(async () => {
      const { data } = await api.put<Saved>(endpoint, {
        username, easy: Number(counts.easy), medium: Number(counts.medium), hard: Number(counts.hard), revision: saved.revision,
      });
      update(data, 'Self-reported counts saved.');
    });
  }

  function fetchPreview() {
    return execute(async () => {
      setPreview(undefined);
      const { data } = await api.post<Preview>(endpoint + '/preview', { username });
      setPreview(data);
    });
  }

  function confirm(token: string) {
    return execute(async () => {
      const { data } = await api.post<Saved>(endpoint + '/confirm', { token });
      update(data, 'Fetched counts saved.');
    });
  }

  function disconnect() {
    return execute(async () => {
      const { data } = await api.delete<Saved>(endpoint, { data: { revision: saved.revision } });
      update(data, 'LeetCode disconnected.');
    });
  }

  function reload() {
    return execute(async () => {
      const { data } = await api.get<Settings>(endpoint);
      setSyncEnabled(data.syncEnabled);
      update(data, 'Saved LeetCode stats reloaded.');
    });
  }

  return <section className="feature-card" aria-label="LeetCode solve history">
    <h2>LeetCode solve history</h2>
    <p className="muted">Saved counts appear on your public profile when it’s published, and in recruiter search when you opt in.</p>
    {saved.stats && <LeetCodeSummary stats={saved.stats} />}
    <form className="feature-form external-practice-form" onSubmit={saveManual}>
      <label>LeetCode username<input required maxLength={50} value={username} disabled={pending}
        onChange={(event) => { setUsername(event.target.value); setPreview(undefined); }} /></label>
      {!syncEnabled && <p className="muted">LeetCode sync is unavailable. You can enter your counts manually.</p>}
      {syncEnabled && <button className="button" type="button" disabled={pending || !username.trim()}
        onClick={() => void fetchPreview()}>Fetch LeetCode counts</button>}
      <div className="field-grid">
        {difficulty.map(({ key, label }) => <label key={key}>{label} solves<input type="number" required min={0} max={5000}
          disabled={pending} value={counts[key]} onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} /></label>)}
      </div>
      <div className="inline-controls">
        <button className="button primary" disabled={pending}>Save manual counts</button>
        {saved.stats && <button className="button" type="button" disabled={pending} onClick={() => void disconnect()}>Disconnect LeetCode</button>}
      </div>
    </form>
    {preview && <section className="feature-card" aria-label="Fetched counts preview">
      <h3>Fetched counts preview</h3>
      <LeetCodeSummary stats={preview.stats} />
      <div className="inline-controls">
        <button className="button primary" type="button" disabled={pending} onClick={() => void confirm(preview.token)}>Save fetched counts</button>
        <button className="button" type="button" disabled={pending} onClick={() => setPreview(undefined)}>Cancel</button>
      </div>
    </section>}
    {notice && <p role="status">{notice}</p>}
    {error && <div className="inline-controls"><p className="error" role="alert">{error}</p>
      <button className="button" type="button" disabled={pending} onClick={() => void reload()}>Reload saved stats</button>
    </div>}
  </section>;
}

export function LeetCodeSettings() {
  const result = useResource<Settings>(endpoint);
  if (result.error) return <section className="feature-card"><h2>LeetCode solve history</h2><p role="alert">{result.error}</p>
    <button className="button" type="button" onClick={result.reload}>Retry</button></section>;
  if (!result.data) return <p role="status">Loading LeetCode stats…</p>;
  return <StatsEditor initial={result.data} />;
}
