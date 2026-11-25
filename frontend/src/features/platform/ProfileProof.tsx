import { useState } from 'react';
import { ArrowUpRight, Download, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../app/api';
import type { ProfileSnapshot, ProfileVerification } from '../../../../shared/src/types/practice';
import { useResource } from './resource';

const verificationPath = (id: string) => '/practice/verify-profile/' + id;
const signedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ProfileProofActions({ busy }: { busy: boolean }) {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>();
  const [action, setAction] = useState<'sign' | 'export'>();
  const [error, setError] = useState('');

  async function sign(exportPdf = false) {
    setAction(exportPdf ? 'export' : 'sign');
    setError('');
    try {
      const { data } = await api.post<ProfileSnapshot>('/practice/study/profile/sign');
      setSnapshot(data);
      if (exportPdf) {
        const { downloadProfileProof } = await import('./profile-proof-pdf');
        await downloadProfileProof(data, new URL(verificationPath(data.id), window.location.origin).href);
      }
    } catch (reason) {
      setError(errorMessage(reason, exportPdf ? 'Could not download your profile.' : 'Could not sign your profile.'));
    } finally {
      setAction(undefined);
    }
  }

  return <fieldset className="hiring-preferences">
    <legend>Profile verification</legend>
    <p className="muted">Share a signed record of your practice progress. Making your profile private or changing your handle revokes the verification link.</p>
    <div className="feature-row">
      <button className="button" type="button" disabled={busy || Boolean(action)} onClick={() => void sign()}>
        <ShieldCheck size={16} /> {action === 'sign' ? 'Signing…' : 'Sign profile'}
      </button>
      <button className="button" type="button" disabled={busy || Boolean(action)} onClick={() => void sign(true)}>
        <Download size={16} /> {action === 'export' ? 'Preparing PDF…' : 'Download profile PDF'}
      </button>
    </div>
    {snapshot && <Link className="inline-link" to={verificationPath(snapshot.id)}>Open verification <ArrowUpRight size={16} /></Link>}
    {error && <p className="error" role="alert">{error}</p>}
  </fieldset>;
}

export function VerifyProfile() {
  const { id } = useParams();
  const { data, error } = useResource<ProfileVerification>('/practice/study/profile/verify/' + encodeURIComponent(id ?? ''));
  return <main className="catalogue public-content">
    <Link className="inline-link" to="/practice">Practice Problems <ArrowUpRight size={16} /></Link>
    <section className="feature-card">
      <h1>Practice profile verification</h1>
      {error ? <p role="alert">{error}</p> : !data ? <p role="status">Checking profile…</p>
        : data.status === 'invalid' ? <p role="status">This signature could not be verified.</p>
          : <>
            <h2>{data.status === 'verified' ? 'Verified profile' : 'Profile progress has changed'}</h2>
            <p><Link to={'/practice/p/' + data.snapshot.handle}>@{data.snapshot.handle}</Link> · Signed {signedDate.format(new Date(data.snapshot.signedAt))}</p>
            <dl className="stat-grid">
              {[
                ['Problems solved', data.snapshot.solved], ['XP', data.snapshot.xp], ['Level', data.snapshot.level],
                ['Easy', data.snapshot.easy], ['Medium', data.snapshot.medium], ['Hard', data.snapshot.hard],
              ].map(([label, value]) => <div className="stat-card" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {data.status === 'changed' && <p className="muted">These are the signed totals. Ask the candidate for a new verification link to see their current totals.</p>}
          </>}
    </section>
  </main>;
}
