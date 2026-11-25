import { useState } from 'react';
import type { AmbassadorStatus } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { ActionForm } from './ActionForm';
import { useResource } from './resource';

const base = '/practice/community/ambassador';

export function Ambassador() {
  const { data, error, reload } = useResource<AmbassadorStatus>(base);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');

  async function claim(milestone: string) {
    setBusy(true);
    setMessage('');
    setFailure('');
    try {
      const { data } = await api.post<{ rewardDays: number }>(base + '/claim', { milestone });
      setMessage(data.rewardDays + ' access days earned.');
      reload();
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not claim the milestone.'));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    setMessage('');
    setFailure('');
    try {
      const { data } = await api.post<{ activatedDays: number }>(base + '/activate');
      setMessage(data.activatedDays ? data.activatedDays + ' days added to your Practice access.' : 'Your earned days are already scheduled.');
      reload();
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not activate the earned days.'));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="feature-card"><h2>Campus ambassador</h2>
    {error ? <p className="error" role="alert">{error}</p> : <p role="status">Loading your application…</p>}
  </section>;
  const { application, dashboard } = data;
  if (!application) return <ActionForm submit="Apply to become an ambassador" onDone={reload} action={async (form) => {
    await api.post(base + '/apply', Object.fromEntries(form));
  }}>
    <h2>Campus ambassador</h2>
    <p className="muted">Represent Practice at your college and earn access days through referral signups.</p>
    <label>College name<input name="collegeName" minLength={2} maxLength={200} required /></label>
    <label>College domain<input name="collegeDomain" maxLength={253} placeholder="college.edu" required /></label>
    <label>Why do you want to join?<textarea name="motivation" rows={4} maxLength={1000} /></label>
  </ActionForm>;

  const shareUrl = dashboard?.referral ? location.origin + '/signup?ref=' + encodeURIComponent(dashboard.referral) : null;
  return <section className="feature-card feature-form">
    <h2>Campus ambassador</h2>
    <p>{application.collegeName}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {application.state === 'PENDING' && <p role="status">Application pending review.</p>}
    {application.state === 'REJECTED' && <p role="status">Application declined.{application.rejectionReason && ' ' + application.rejectionReason}</p>}
    {dashboard && <>
      {shareUrl && <label>Ambassador referral link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label>}
      <div className="stat-grid">
        <div className="stat-card"><strong>{dashboard.referred}</strong><span>Referral signups</span></div>
        <div className="stat-card"><strong>{dashboard.earnedDays}</strong><span>Access days earned</span></div>
        <div className="stat-card"><strong>{dashboard.bankedDays}</strong><span>Days available</span></div>
      </div>
      <h3>Milestones</h3>
      {dashboard.milestones.map((item) => <article className="playlist" key={item.id}>
        <div className="feature-row">
          <div><strong>{item.threshold} referral signups</strong><p>{item.rewardDays} access days</p></div>
          <button className="button" type="button" disabled={busy || !item.achieved || item.claimed} onClick={() => void claim(item.id)}>
            {item.claimed ? 'Claimed' : 'Claim ' + item.rewardDays + ' days'}
          </button>
        </div>
        <progress aria-label={item.threshold + ' signup milestone'} max={item.threshold} value={Math.min(item.threshold, dashboard.referred)} />
      </article>)}
      {dashboard.bankedDays > 0 && (dashboard.billingEnabled
        ? <button className="button primary" type="button" disabled={busy} onClick={() => void activate()}>Activate earned days</button>
        : <p className="muted">Your days are saved for when Practice membership is enabled.</p>)}
      {failure && <p className="error" role="alert">{failure}</p>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
