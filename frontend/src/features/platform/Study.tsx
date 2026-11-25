import { useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Award, BookOpen, Flame, ListPlus, Target, Trash2 } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../app/api';
import { slugUrl, useResource } from './resource';
import { Leaderboard } from './Leaderboard';
import { LearnerAnalytics } from './LearnerAnalytics';
import { ProfileProofActions } from './ProfileProof';
import { ProfileReport } from './ProfileReport';
import { WeeklyReviewSettings } from './WeeklyReviewSettings';
import { LeetCodeSettings, LeetCodeSummary } from './LeetCodeStats';
import { recruiterRoles, type CertificateSummary, type HiringPreferences, type LeetCodeStats, type ProblemSummary } from '../../../../shared/src/types/practice';

type Overview = {
  solved: number; attempts: number; xp: number; streak: { current: number; best: number };
  byTopic: Array<{ topic: string; total: number; solved: number; next: string | null }>;
  activity: Array<{ day: string; solved: number }>; next: string | null;
  profile: ({ handle: string; bio: string; isPublic: boolean; hiringOpen: boolean; sharePlacement: boolean } & HiringPreferences) | null;
};
type Challenge = { title: string; slug: string; done: boolean };
type Daily = { day: string; challenge: Challenge | null; weekly: Challenge | null; quiz: {
  prompt: string; topic: string; choices: string[]; correct: number | null; explanation: string | null; result: { score: number; total: number; skipped: boolean; choice: number | null } | null;
} | null };
type Playlist = { id: string; name: string; problems: Array<{ slug: string; title: string }> };

function ProblemLink({ item, children }: { item: string; children: string }) {
  return <Link to={slugUrl(item)} className="inline-link">{children}<ArrowRight size={16} /></Link>;
}

function Challenges() {
  const daily = useResource<Daily>('/practice/study/daily');
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const data = daily.data;
  async function answer(choice: number | null) {
    if (!data || saving) return;
    setSaving(true);
    setFailure('');
    try { await api.post('/practice/study/daily/quiz', { day: data.day, choice }); daily.reload(); }
    catch (reason) { setFailure(errorMessage(reason, 'Could not save your answer.')); }
    finally { setSaving(false); }
  }
  if (!data) return <p className="muted" role="status">{daily.error || 'Loading challenges…'}</p>;
  return <div className="feature-grid">
    <section className="feature-card">
      <h2><Target size={19} /> Challenges</h2>
      {([['Today', data.challenge], ['This week', data.weekly]] as const).map(([label, item]) => item && <div className="feature-row" key={label}>
        <div><span className="muted">{label}</span><ProblemLink item={item.slug}>{item.title}</ProblemLink></div>
        {item.done && <span className="accepted">Complete</span>}
      </div>)}
    </section>
    {data.quiz && <section className="feature-card">
      <h2><BookOpen size={18} /> Daily quiz</h2>
      <p className="muted">{data.quiz.topic} · {data.day} (IST)</p>
      <p>{data.quiz.prompt}</p>
      <div className="quiz-options">
        {data.quiz.choices.map((label, i) => <button key={label} className={'button ' + (data.quiz?.correct === i ? 'quiz-correct' : '')}
          aria-pressed={data.quiz?.result?.choice === i} disabled={saving || Boolean(data.quiz?.result)} onClick={() => void answer(i)}>{label}</button>)}
      </div>
      {!data.quiz.result && <button className="button" disabled={saving} onClick={() => void answer(null)}>Skip today</button>}
      {data.quiz.result && <p role="status" className={data.quiz.result.score ? 'accepted' : 'muted'}>
        {data.quiz.result.skipped ? 'Skipped today. ' : data.quiz.result.score ? 'Correct. ' : 'Incorrect. '}
        {data.quiz.explanation}
      </p>}
      {failure && <p className="error" role="alert">{failure}</p>}
    </section>}
  </div>;
}

function TrackCards({ overview }: { overview: Overview }) {
  const certs = useResource<{ certificates: CertificateSummary[] }>('/practice/study/certificates');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function claim(track: string) {
    setSaving(true); setMessage('');
    try { await api.post('/practice/study/certificates', { track }); certs.reload(); setMessage('Certificate issued.'); }
    catch (reason) { setMessage(errorMessage(reason, 'Could not issue a certificate.')); }
    finally { setSaving(false); }
  }
  return <section className="feature-card">
    <div className="feature-row">
      <h2><Award size={18} /> Learning paths and certificates</h2>
      <Link className="inline-link" to="/practice/certifications">Certifications <ArrowRight size={16} /></Link>
    </div>
    {overview.byTopic.map((path) => {
      const cert = certs.data?.certificates.find((item) => item.track === path.topic);
      return <div className="feature-row" key={path.topic}>
        <div><strong>{path.topic}</strong><p className="muted">{path.solved} of {path.total} solved</p></div>
        <progress value={path.solved} max={path.total} aria-label={path.topic + ' progress'} />
        {cert ? <Link className="button" to={'/practice/verify/' + cert.id}>Certificate <ArrowUpRight size={14} /></Link>
          : path.next ? <ProblemLink item={path.next}>Continue</ProblemLink>
          : path.total > 1 ? <button className="button" disabled={saving} onClick={() => void claim(path.topic)}>Claim certificate</button> : null}
      </div>;
    })}
    {(message || certs.error) && <p role="status">{message || certs.error}</p>}
  </section>;
}

function Playlists() {
  const lists = useResource<{ playlists: Playlist[] }>('/practice/study/playlists');
  const catalogue = useResource<{ problems: ProblemSummary[] }>('/practice/problems');
  const [name, setName] = useState('');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function mutate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      if (edit) await api.put('/practice/study/playlists/' + edit, { name, slugs });
      else await api.post('/practice/study/playlists', { name, slugs });
      setName(''); setSlugs([]); setEdit(null); lists.reload();
    } catch (reason) { setMessage(errorMessage(reason, 'Could not save the playlist.')); }
    finally { setBusy(false); }
  }
  async function remove(item: Playlist) {
    if (!confirm('Delete “' + item.name + '”?')) return;
    try { await api.delete('/practice/study/playlists/' + item.id); lists.reload(); }
    catch (reason) { setMessage(errorMessage(reason, 'Could not remove the playlist.')); }
  }
  return <div className="feature-grid">
    <section className="feature-card"><h2>Your playlists</h2>
      {lists.data?.playlists.length === 0 && <p className="muted">Create a playlist of the problems you want to practice.</p>}
      {lists.data?.playlists.map((item) => <div className="playlist" key={item.id}>
        <div className="feature-row"><strong>{item.name}</strong><div className="inline-controls"><button className="button" onClick={() => { setEdit(item.id); setName(item.name); setSlugs(item.problems.map((problem) => problem.slug)); }}>Edit</button>
          <button className="icon-button" aria-label={'Delete ' + item.name} onClick={() => void remove(item)}><Trash2 size={17} /></button></div></div>
        {item.problems.map((problem) => <ProblemLink key={problem.slug} item={problem.slug}>{problem.title}</ProblemLink>)}
      </div>)}
      {lists.error && <p className="error" role="alert">{lists.error}</p>}
    </section>
    <form className="feature-card feature-form" onSubmit={mutate}><h2><ListPlus size={18} /> {edit ? 'Edit playlist' : 'Create playlist'}</h2>
      <label>Name<input value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></label>
      <fieldset className="problem-picker"><legend>Problems</legend>
        {catalogue.data?.problems.map((item) => <label className="check-label" key={item.slug}><input type="checkbox" checked={slugs.includes(item.slug)}
          onChange={(event) => setSlugs((items) => event.target.checked ? [...items, item.slug] : items.filter((slug) => slug !== item.slug))} />{item.title}</label>)}
      </fieldset>
      <button className="button primary" disabled={busy}>{edit ? 'Save playlist' : 'Create playlist'}</button>
      {message && <p className="error" role="alert">{message}</p>}
    </form>
  </div>;
}

function PublicSettings({ initial }: { initial: Overview['profile'] }) {
  const [profile, setProfile] = useState(initial ?? { handle: '', bio: '', isPublic: false, hiringOpen: false, sharePlacement: false,
    availableForWork: false, preferredRole: null, expectedGraduation: null });
  const [published, setPublished] = useState(initial?.isPublic ? initial.handle : null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(''); setBusy(true);
    try {
      const { data } = await api.put<NonNullable<Overview['profile']>>('/practice/study/profile', profile);
      setProfile(data); setPublished(data.isPublic ? data.handle : null); setNotice('Profile saved.');
    } catch (reason) { setNotice(errorMessage(reason, 'Could not save the profile.')); }
    finally { setBusy(false); }
  }
  return <form className="feature-card feature-form profile-form" onSubmit={save}>
    <h2>Share your progress</h2>
    <label>Public handle<input required pattern="[a-z][a-z0-9-]{2,31}" value={profile.handle} placeholder="your-handle" onChange={(event) => setProfile({ ...profile, handle: event.target.value })} /></label>
    <label>Bio<textarea maxLength={500} rows={4} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
    <label className="check-label"><input type="checkbox" checked={profile.isPublic} onChange={(event) => setProfile({ ...profile, isPublic: event.target.checked })} /> Make my practice profile public</label>
    <p className="muted">Public profiles appear on leaderboards with their practice stats and verified college.</p>
    <label className="check-label"><input type="checkbox" checked={profile.hiringOpen} disabled={!profile.isPublic} onChange={(event) => setProfile({ ...profile, hiringOpen: event.target.checked })} /> Appear in recruiter search</label>
    <fieldset className="hiring-preferences">
      <legend>Hiring details</legend>
      <label className="check-label"><input type="checkbox" checked={profile.availableForWork} onChange={(event) => setProfile({ ...profile, availableForWork: event.target.checked })} /> Available for work</label>
      <div className="field-grid">
        <label>Preferred role<select value={profile.preferredRole ?? ''} onChange={(event) => setProfile({
          ...profile, preferredRole: recruiterRoles.find((role) => role === event.target.value) ?? null,
        })}><option value="">Select a role</option>{recruiterRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label>Expected graduation year<input type="number" min={1900} max={2200} value={profile.expectedGraduation ?? ''}
          onChange={(event) => setProfile({ ...profile, expectedGraduation: event.target.value ? Number(event.target.value) : null })} /></label>
      </div>
      <p className="muted">These details appear to approved recruiters when you opt into recruiter search.</p>
    </fieldset>
    <label className="check-label"><input type="checkbox" checked={profile.sharePlacement} onChange={(event) => setProfile({ ...profile, sharePlacement: event.target.checked })} /> Include my progress in university placement reports</label>
    <p className="muted">Your university’s placement team can see your name, solves, streak, and assignment completion in its reports.</p>
    {published && <Link className="inline-link" to={'/practice/p/' + published}>View public profile <ArrowUpRight size={16} /></Link>}
    <button className="button primary" disabled={busy}>Save profile</button>
    {notice && <p role="status">{notice}</p>}
    <ProfileReport />
    {published && <ProfileProofActions key={published} busy={busy || !profile.isPublic || profile.handle !== published} />}
  </form>;
}

export default function Study() {
  const { data, error } = useResource<Overview>('/practice/study/overview');
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'overview';
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>Your practice</h1><p className="muted">Track progress, pick a challenge, or organize problems for later.</p></div>
      <div className="inline-controls">
        {data?.next && <ProblemLink item={data.next}>Continue practice</ProblemLink>}
        <Link className="inline-link" to="/practice/interviews">Mock interviews</Link>
        <Link className="inline-link" to="/practice/editions">Editions</Link>
      </div>
    </header>
    <nav className="feature-tabs" aria-label="Study views">{[['overview', 'Overview'], ['analytics', 'Analytics'], ['playlists', 'Playlists'], ['leaderboard', 'Leaderboard'], ['profile', 'Profile']].map(([key, title]) =>
      <button key={key} aria-pressed={active === key} onClick={() => setParams(key === 'overview' ? {} : { tab: key! })}>{title}</button>)}</nav>
    {active === 'playlists' ? <Playlists /> : active === 'leaderboard' ? <Leaderboard /> : active === 'analytics' ? <LearnerAnalytics /> : error ? <p className="error" role="alert">{error}</p> : !data ? <p className="muted" role="status">Loading your practice…</p> : active === 'profile'
      ? <><PublicSettings initial={data.profile} /><LeetCodeSettings /><WeeklyReviewSettings /></>
      : <>
        <div className="stat-grid">
          {[[Target, 'Problems solved', data.solved], [Activity, 'Submissions', data.attempts], [Award, 'XP earned', data.xp], [Flame, 'Current streak', data.streak.current + ' days']].map(([Icon, label, value]) => {
            const Symbol = Icon as typeof Target;
            return <div className="stat-card" key={String(label)}><Symbol size={18} className="accent" /><span className="muted">{String(label)}</span><strong>{String(value)}</strong></div>;
          })}
        </div>
        <section className="feature-card"><h2>Activity</h2><p className="muted">First solves over the past 28 days · Best streak {data.streak.best} days</p>
          <div className="activity-grid">{data.activity.map((cell) => <span className={cell.solved ? 'activity-on' : ''} title={cell.day + ': ' + cell.solved + ' solved'} key={cell.day} />)}</div>
        </section>
        <Challenges /><TrackCards overview={data} />
      </>}
  </main>;
}

export function PublicProfile() {
  const { handle } = useParams();
  const profile = useResource<{ handle: string; bio: string; solved: number; xp: number; proofId: string | null;
    certificates: CertificateSummary[]; leetcode: LeetCodeStats | null }>('/practice/study/public-profile/' + handle);
  return <main className="catalogue public-content">
    <Link className="inline-link" to="/practice">Practice Problems <ArrowRight size={15} /></Link>
    {profile.error ? <p role="alert">{profile.error}</p> : !profile.data ? <p role="status">Loading profile…</p> : <section className="feature-card">
      <h1>{profile.data.handle}</h1>{profile.data.bio && <p>{profile.data.bio}</p>}
      <div className="feature-row"><strong>{profile.data.solved} solved</strong><strong>{profile.data.xp} XP</strong></div>
      {profile.data.leetcode && <LeetCodeSummary stats={profile.data.leetcode} />}
      {profile.data.proofId && <Link className="inline-link" to={'/practice/verify-profile/' + profile.data.proofId}>Check signed profile <ArrowUpRight size={16} /></Link>}
      {profile.data.certificates.map((item) => <Link className="inline-link" key={item.id} to={'/practice/verify/' + item.id}>{item.title} certificate <ArrowUpRight size={16} /></Link>)}
    </section>}
  </main>;
}
