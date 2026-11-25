import { useState } from 'react';
import type { WeeklyReviewPreference } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';

const endpoint = '/practice/study/weekly-review';

export function WeeklyReviewSettings() {
  const { data, error } = useResource<WeeklyReviewPreference>(endpoint);
  const [saved, setSaved] = useState<WeeklyReviewPreference>();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const preference = saved ?? data;
  if (preference && !preference.eligible) return null;

  async function change(enabled: boolean) {
    setSaving(true);
    setFailure('');
    try {
      const response = await api.put<WeeklyReviewPreference>(endpoint, { enabled });
      setSaved(response.data);
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not save your preference.'));
    } finally {
      setSaving(false);
    }
  }

  return <section className="feature-card">
    <h2>Weekly practice review</h2>
    <p className="muted">Get a weekly email with your solve totals, acceptance rate, and an AI-generated practice suggestion after a week with an accepted solution.</p>
    {error ? <p role="alert">{error}</p> : preference ? <>
      <label className="check-label"><input type="checkbox" checked={preference.enabled} disabled={saving}
        onChange={(event) => void change(event.target.checked)} /> Email me a weekly practice review</label>
      {!preference.emailVerified && <p className="muted">Verify your account email to receive reviews.</p>}
      {!preference.deliveryEnabled && <p className="muted">Email delivery is currently disabled.</p>}
      {preference.lastSentAt && <p className="muted">Last sent {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(preference.lastSentAt))}.</p>}
      {saving && <p role="status">Saving…</p>}
      {failure && <p role="alert">{failure}</p>}
    </> : <p role="status">Loading email preference…</p>}
  </section>;
}
