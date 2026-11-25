import { useEffect, useState } from 'react';
import type { CoachingStatus } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';

const path = '/practice/study/coaching';
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const labels = { strongestArea: 'Strongest area', weakestArea: 'Area to work on', nextStep: 'What to practice next', encouragement: 'Coach note' } as const;

export function CoachingInsights() {
  const { data, error, reload } = useResource<CoachingStatus>(path);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!data?.retryAt) return;
    const timer = window.setTimeout(reload, Math.max(250, Date.parse(data.retryAt) - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [data?.retryAt, reload]);

  async function generate() {
    setBusy(true);
    setFailure('');
    try {
      await api.post<CoachingStatus>(path, undefined, { timeout: 55_000 });
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not generate coaching.'));
    } finally {
      reload();
      setBusy(false);
    }
  }

  return <section className="feature-card">
    <h2>AI coaching</h2>
    {(error || failure) && <p className="error" role="alert">{failure || error}</p>}
    {!data && !error && <p role="status">Loading coaching…</p>}
    {data?.enabled && data.hasActivity && <>
      <p className="muted">Generating a note sends a summary of your practice counts, topics, and public exercises to the configured AI provider.</p>
      <div className="inline-controls">
        <button type="button" className="button" disabled={busy || Boolean(data.retryAt)} onClick={() => void generate()}>
          {data.insights ? 'Refresh coaching' : 'Generate coaching'}
        </button>
        {busy && <span role="status">Generating coaching…</span>}
        {!busy && data.retryAt && <span className="muted">Available again at <time dateTime={data.retryAt}>{timestamp.format(new Date(data.retryAt))}</time>.</span>}
      </div>
    </>}
    {data?.enabled && !data.hasActivity && <p className="muted">Submit a solution to a public Practice problem to generate coaching.</p>}
    {data && !data.enabled && <p className="muted">AI coaching is unavailable until a provider is configured.</p>}
    {data?.insights && <dl className="learner-distribution">
      {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <div key={key}>
        <dt><strong>{labels[key]}</strong></dt><dd>{data.insights?.[key]}</dd>
      </div>)}
    </dl>}
    {data?.generatedAt && <p className="muted">Generated <time dateTime={data.generatedAt}>{timestamp.format(new Date(data.generatedAt))}</time></p>}
  </section>;
}
