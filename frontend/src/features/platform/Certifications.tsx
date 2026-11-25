import { useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Download, ExternalLink, Link2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { CertificationTrack, CertificateDocument } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useSession } from '../../app/session';
import { useResource } from './resource';

const verificationPath = (id: string) => '/practice/verify/' + encodeURIComponent(id);
const verificationUrl = (id: string) => new URL(verificationPath(id), window.location.origin).href;
const issueDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function DownloadCertificate({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function download() {
    setBusy(true);
    setFailure('');
    try {
      const response = await api.get<CertificateDocument>('/practice/study/certificates/' + encodeURIComponent(id) + '/document');
      const { downloadCertificate } = await import('./certificate-pdf');
      await downloadCertificate(response.data, verificationUrl(response.data.id));
    } catch (error) {
      setFailure(errorMessage(error, 'Could not download the certificate.'));
    } finally {
      setBusy(false);
    }
  }

  return <div className="certificate-download">
    <button className="button" type="button" disabled={busy} onClick={() => void download()}>
      <Download size={16} /> {busy ? 'Preparing PDF…' : 'Download PDF'}
    </button>
    {failure && <p className="error" role="alert">{failure}</p>}
  </div>;
}

function TrackCard({ track, onClaim }: { track: CertificationTrack; onClaim(): void }) {
  const [claiming, setClaiming] = useState(false);
  const [failure, setFailure] = useState('');
  const [claimedId, setClaimedId] = useState<string>();
  const id = track.certificateId ?? claimedId;
  const remaining = Math.max(0, track.required - track.solved);

  async function claim() {
    setFailure('');
    setClaiming(true);
    try {
      const { data } = await api.post<CertificateDocument>('/practice/study/certificate-tracks/' + track.id + '/claim');
      setClaimedId(data.id);
      onClaim();
    } catch (error) {
      setFailure(errorMessage(error, 'Could not claim the certificate.'));
    } finally {
      setClaiming(false);
    }
  }

  return <article className="feature-card certification-track">
    <div className="certification-track-title">
      <Award size={21} className="accent" />
      <h2>{track.title}</h2>
      {id && <span className="accepted"><CheckCircle2 size={15} /> Earned</span>}
    </div>
    <div className="certification-progress">
      <p><span>{track.topic}</span><span>{track.solved} / {track.required} solved</span></p>
      <progress value={Math.min(track.solved, track.required)} max={track.required} aria-label={track.title + ' progress'} />
    </div>
    {id ? <div className="inline-controls">
      <DownloadCertificate id={id} />
      <Link to={verificationPath(id)} className="inline-link">Verify <ExternalLink size={14} /></Link>
    </div> : remaining === 0 ? <button className="button primary" type="button" disabled={claiming} onClick={() => void claim()}>
      {claiming ? 'Claiming…' : 'Claim certificate'}
    </button> : <p className="muted">{remaining} more {remaining === 1 ? 'solve' : 'solves'} to qualify</p>}
    {failure && <p className="error" role="alert">{failure}</p>}
  </article>;
}

export function CertificationsView() {
  const { data, error, reload } = useResource<{ tracks: CertificationTrack[] }>('/practice/study/certificate-tracks');
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div>
      <h1>Certifications</h1>
      <p className="muted">Reach a topic’s solve target to earn a verifiable certificate.</p>
    </div></header>
    {error ? <div role="alert" className="feature-card"><p>{error}</p><button className="button" onClick={reload}>Try again</button></div>
      : !data ? <p role="status">Loading certifications…</p>
      : <div className="certification-grid">{data.tracks.map((track) => <TrackCard key={track.id} track={track} onClaim={reload} />)}</div>}
  </main>;
}

function CertificateVerification({ id }: { id: string }) {
  const cert = useResource<CertificateDocument>('/practice/study/verify/' + encodeURIComponent(id));
  const { user } = useSession();
  const [notice, setNotice] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(verificationUrl(id));
      setNotice('Verification link copied.');
    } catch {
      setNotice('Copy the address from this browser tab.');
    }
  }
  return <main className="catalogue public-content">
    <Link className="inline-link print-hide" to="/practice"><ArrowLeft size={15} /> Practice Problems</Link>
    {cert.error ? <section className="feature-card" role="alert"><h1>Certificate unavailable</h1><p>{cert.error}</p></section>
      : !cert.data ? <p role="status">Verifying certificate…</p> : <section className="feature-card certificate">
        <div className="accepted certificate-verified"><CheckCircle2 size={17} /> Verified by DSA V2 Practice</div>
        <h1>{cert.data.title}</h1>
        <p>Awarded to <strong><bdi>{cert.data.issuerName}</bdi></strong></p>
        <p className="muted">Issued <time dateTime={cert.data.createdAt}>{issueDate.format(new Date(cert.data.createdAt))}</time></p>
        <div className="certificate-id"><span className="muted">Certificate ID</span><code>{cert.data.id}</code></div>
        <div className="inline-controls print-hide">
          {user && <DownloadCertificate id={cert.data.id} />}
          <button type="button" className="button" onClick={() => void copy()}><Link2 size={16} /> Copy verification link</button>
          <button type="button" className="button" onClick={() => window.print()}>Print certificate</button>
        </div>
        {notice && <p className="muted print-hide" role="status">{notice}</p>}
      </section>}
  </main>;
}

export function VerifyCertificate() {
  const { id = '' } = useParams();
  return <CertificateVerification key={id} id={id} />;
}
