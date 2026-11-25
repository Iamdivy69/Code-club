import { useEffect, useState } from 'react';
import type { SolverHint, SolverHintStatus } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from '../platform/resource';

const choices = [
  [1, 'Nudge'],
  [2, 'Approach'],
  [3, 'Walkthrough'],
] as const;
type Level = typeof choices[number][0];

function HintChoices({ slug }: { slug: string }) {
  const path = '/practice/problems/' + encodeURIComponent(slug) + '/hints';
  const { data, error, reload } = useResource<SolverHintStatus>(path);
  const [results, setResults] = useState<Partial<Record<Level, string>>>({});
  const [selected, setSelected] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!data?.resetAt || data.remaining !== 0) return;
    const timer = window.setTimeout(reload, Math.max(250, Date.parse(data.resetAt) - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [data?.remaining, data?.resetAt, reload]);

  async function request(level: Level) {
    setFailure('');
    if (results[level]) {
      setSelected(level);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<SolverHint>(path, { level }, { timeout: 55_000 });
      setResults((current) => ({ ...current, [level]: data.hint }));
      setSelected(level);
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not load the hint.'));
    } finally {
      setBusy(false);
      reload();
    }
  }

  const available = data?.remaining;
  return <div className="solver-hint-options">
    {(error || failure) && <p className="error" role="alert">{failure || error}</p>}
    {!data && !error && <p role="status">Loading hints…</p>}
    {data && !data.enabled && <p className="muted">AI hints are unavailable until a coaching provider is configured.</p>}
    {data?.enabled && <>
      <div className="inline-controls" aria-label="Hint depth">{choices.map(([level, label]) =>
        <button className="button" key={level} type="button" aria-pressed={selected === level}
          disabled={busy || (available === 0 && !results[level])} onClick={() => void request(level)}>{label}</button>,
      )}</div>
      {typeof available === 'number' && <p className="muted">{available} {available === 1 ? 'hint' : 'hints'} available today. Resets at midnight IST.</p>}
      {busy && <p role="status">Preparing the hint…</p>}
      {selected && results[selected] && <p className="solver-hint-result" role="status">{results[selected]}</p>}
    </>}
  </div>;
}

export function SolverHints({ slug }: { slug: string }) {
  const [loaded, setLoaded] = useState(false);
  return <details className="hint solver-ai-hints" onToggle={(event) => { if (event.currentTarget.open) setLoaded(true); }}>
    <summary>AI hints</summary>
    {loaded && <HintChoices slug={slug} />}
  </details>;
}
