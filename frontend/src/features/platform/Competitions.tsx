import { Fragment, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Clock, LockKeyhole, Shield, Trophy, Users } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ProblemSummary } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useSession } from '../../app/session';
import { slugUrl, useResource } from './resource';

type Event = { id: string; title: string; description: string; kind: 'CONTEST' | 'BATTLE'; isPrivate: boolean;
  startsAt: string | null; endsAt: string | null; status: 'Lobby' | 'Upcoming' | 'Active' | 'Ended';
  battleDurationMinutes: number | null; battleMaxTeamSize: number | null; joined: boolean; host: boolean; players: number };
type Competition = Omit<Event, 'players'> & {
  joinCode: string | null;
  myTeam: number | null;
  roster: RosterEntry[];
  problems: Array<Pick<ProblemSummary, 'slug' | 'title' | 'difficulty'> & { solved?: boolean; teamSolved?: boolean; contestOnly?: boolean }>;
  teams: Array<{ name: string; points: number; solved: number }>;

  rows: Array<{ displayName: string; team: number | null; points: number; solved: number; own: boolean }>;
};
type RosterEntry = { userId?: string; displayName: string; team: number | null; own: boolean };
const teamLabel = (team: number | null) => team === 0 ? 'Team Alpha' : team === 1 ? 'Team Beta' : 'Unassigned';
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const eventUrl = (id: string) => '/practice/competitions/' + id;
function localInput(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CreateEvent({ cancelled }: { cancelled(): void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<'CONTEST' | 'BATTLE'>('CONTEST');
  const catalogue = useResource<{ problems: Array<{ slug: string; title: string; contestOnly: boolean }> }>('/practice/competitions/problem-options?kind=' + kind);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const { user } = useSession();
  const battle = kind === 'BATTLE';
  const student = user?.role === 'STUDENT';
  const problemLimit = battle ? student ? 8 : 250 : 10;
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(''); setBusy(true);
    try {
      const { data } = await api.post<{ id: string }>('/practice/competitions', {
        title: form.get('title'), description: form.get('description'), kind, problemSlugs: selected,
        ...(battle ? {
          durationMinutes: Number(form.get('duration')), maxTeamSize: Number(form.get('teamSize')),
        } : {
          isPrivate: form.get('visibility') !== 'public',
          startsAt: new Date(String(form.get('start'))).toISOString(),
          endsAt: new Date(String(form.get('end'))).toISOString(),
        }),
      });
      navigate(eventUrl(data.id));
    } catch (reason) { setNotice(errorMessage(reason, 'Could not create the competition.')); }
    finally { setBusy(false); }
  }
  return <form className="feature-card feature-form" onSubmit={create}>
    <h2>Create competition</h2>
    <label>Title<input name="title" minLength={battle ? 1 : 3} maxLength={100} required /></label>
    <label>Description<textarea name="description" maxLength={battle ? 300 : 1000} rows={3} /></label>
    <div className="field-grid">
      <label>Format<select name="kind" value={kind} onChange={(event) => { setSelected([]); setKind(event.target.value === 'BATTLE' ? 'BATTLE' : 'CONTEST'); }}><option value="CONTEST">Contest</option><option value="BATTLE">Battle room</option></select></label>
      {battle ? <Fragment key="battle">
        <label>Match duration (minutes)<input type="number" name="duration" min={student ? 30 : 1} max={student ? 240 : 10080} defaultValue={30} required /></label>
        <label>Players per team<input type="number" name="teamSize" min={2} max={6} defaultValue={4} required /></label>
      </Fragment> : <Fragment key="contest">
        <label>Visibility<select name="visibility"><option value="private">Invite only</option>{user && !student && <option value="public">Public</option>}</select></label>
        <label>Starts<input type="datetime-local" required name="start" defaultValue={localInput(Date.now())} /></label>
        <label>Ends<input type="datetime-local" required name="end" defaultValue={localInput(Date.now() + 3_600_000)} /></label>
      </Fragment>}
    </div>
    {battle && <p className="muted">Players join by invite code. The timer starts when the host starts the battle.</p>}
    <fieldset className="problem-picker"><legend>Problems ({selected.length}/{problemLimit})</legend>
      {catalogue.error && <p role="alert" className="error">{catalogue.error}</p>}
      {catalogue.data?.problems.filter((item) => !battle || !item.contestOnly).map((item) => <label className="check-label" key={item.slug}><input type="checkbox"
        checked={selected.includes(item.slug)} disabled={!selected.includes(item.slug) && selected.length >= problemLimit} onChange={(event) => setSelected((slugs) => event.target.checked ? [...slugs, item.slug] : slugs.filter((slug) => slug !== item.slug))} />{item.title}{item.contestOnly && <span className="muted">(Contest only)</span>}</label>)}
    </fieldset>
    {notice && <p className="error" role="alert">{notice}</p>}
    <div className="inline-controls"><button className="button primary" disabled={busy || !selected.length || selected.length > problemLimit}>{battle ? 'Create battle room' : 'Create competition'}</button><button className="button" type="button" onClick={cancelled}>Cancel</button></div>
  </form>;
}

export default function Competitions() {
  const list = useResource<{ events: Event[] }>('/practice/competitions');
  const [notice, setNotice] = useState('');
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const filter = params.get('type') ?? 'all';
  const navigate = useNavigate();
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      const { data } = await api.post<{ id: string }>('/practice/competitions/join-private', { invite: form.get('invite') });
      navigate(eventUrl(data.id));
    } catch (reason) { setNotice(errorMessage(reason, 'Could not join with that code.')); }
  }
  const events = list.data?.events.filter((item) => filter === 'all' || (filter === 'private' ? item.isPrivate && item.kind === 'CONTEST' : filter === 'public' ? !item.isPrivate && item.kind === 'CONTEST' : item.kind === 'BATTLE'));
  return <main className="catalogue feature-page">
    <header className="catalogue-header">
      <div><h1>Competitions</h1><p className="muted">Solve problems in timed contests or compete in teams.</p></div>
      <div className="inline-controls">
        <Link className="button" to="/practice/leaderboard">Leaderboard</Link>
        <button className="button primary" onClick={() => setCreating((value) => !value)}>{creating ? 'Close form' : 'Create competition'}</button>
      </div>
    </header>
    {creating ? <CreateEvent cancelled={() => setCreating(false)} /> : <>
      <form className="join-form feature-card" onSubmit={join}><label>Invite code<input name="invite" required maxLength={12} autoComplete="off" /></label><button className="button">Join</button>
        {notice && <p role="alert" className="error">{notice}</p>}
      </form>
      <nav className="feature-tabs" aria-label="Competition filters">{[['all', 'All'], ['public', 'Public contests'], ['private', 'Private contests'], ['battle', 'Battle rooms']].map(([key, title]) =>
        <button key={key} aria-pressed={filter === key} onClick={() => setParams(key === 'all' ? {} : { type: key! })}>{title}</button>)}</nav>
      {list.error ? <p className="error" role="alert">{list.error}</p> : !events ? <p role="status">Loading competitions…</p> : !events.length ?
        <p className="empty-state">No competitions in this view.</p> : <div className="feature-grid">
          {events.map((item) => <Link to={eventUrl(item.id)} className="feature-card event-card" key={item.id}>
            <div className="feature-row"><span className="eyebrow muted">{item.kind === 'BATTLE' ? 'Battle room' : 'Contest'}</span><span className={item.status === 'Active' ? 'accepted' : 'muted'}>{item.status}</span></div>
            <h2>{item.title} {item.isPrivate && <LockKeyhole size={16} />}</h2>
            <span className="muted"><Clock size={15} /> {item.startsAt ? dateLabel(item.startsAt) : 'Waiting for host'}</span>
            <span className="muted"><Users size={15} /> {item.players} joined <ArrowRight size={16} className="event-arrow" /></span>
          </Link>)}
        </div>}
    </>}
  </main>;
}

function BattleLobby({ item, working, act }: {
  item: Competition;
  working: boolean;
  act(path: string, payload?: unknown): Promise<boolean>;
}) {
  const [changes, setChanges] = useState<Record<string, number | null>>({});
  const assignments = item.roster.flatMap(({ userId, team }) =>
    userId !== undefined && userId in changes && changes[userId] !== team ? [{ userId, team: changes[userId]! }] : []);
  const maxPlayers = item.battleMaxTeamSize ?? 0;
  const ready = [0, 1].every((team) => item.roster.some((player) => player.team === team));

  async function assign(mode: 'random' | 'manual') {
    if (await act('/assign-teams', { mode, assignments })) setChanges({});
  }

  return <section className="feature-card feature-form">
    <h2>Lobby roster</h2>
    <p className="muted">{item.roster.length} of {maxPlayers * 2} players · Up to {maxPlayers} per team</p>
    {item.roster.length === 0 && <p className="muted">Waiting for players to join.</p>}
    {item.roster.map(({ userId, displayName, team, own }, index) => <div className="feature-row" key={userId ?? index}>
      <span>{displayName}{own ? ' (you)' : ''}</span>
      {item.host && userId ? <select aria-label={'Team for ' + displayName} disabled={working}
        value={(userId in changes ? changes[userId] : team) ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          setChanges((prior) => ({ ...prior, [userId]: value === '' ? null : Number(value) }));
        }}>
        <option value="">Unassigned</option><option value="0">Team Alpha</option><option value="1">Team Beta</option>
      </select> : <span className="muted">{teamLabel(team)}</span>}
    </div>)}
    {item.host ? <>
      <p className="muted">Assign at least one player to each team to start. Unassigned players can spectate.</p>
      <div className="inline-controls">
        <button className="button" disabled={working || !assignments.length} onClick={() => void assign('manual')}>Save teams</button>
        <button className="button" disabled={working || item.roster.length < 2} onClick={() => void assign('random')}>Randomize teams</button>
        <button className="button primary" disabled={working || !ready || !!assignments.length} onClick={() => void act('/start')}>Start battle</button>
        <button className="button" disabled={working} onClick={() => void act('cancel')}>Cancel battle</button>
      </div>
    </> : <button className="button" disabled={working} onClick={() => void act('/leave')}>Leave lobby</button>}
  </section>;
}

function BattleClock({ endsAt, onEnd }: { endsAt: string; onEnd(): void }) {
  const getRemaining = () => Math.max(0, Math.ceil((+new Date(endsAt) - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(getRemaining);
  useEffect(() => {
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((+new Date(endsAt) - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) { clearInterval(timer); onEnd(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt, onEnd]);
  const parts = [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60];
  return <p className="muted"><Clock size={15} /> <time>{parts.map((part) => String(part).padStart(2, '0')).join(':')}</time> remaining</p>;
}

export function CompetitionDetail() {
  const { id } = useParams();
  const event = useResource<Competition>('/practice/competitions/' + id);
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const reload = event.reload;
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setInterval(reload, 15_000);
    return () => clearInterval(timer);
  }, [reload]);

  async function act(path: string, payload?: unknown) {
    if (path === 'cancel' && !window.confirm('Cancel this battle lobby?')) return false;
    setWorking(true); setNotice('');
    const endpoint = '/practice/competitions/' + id;
    try {
      if (path === 'cancel') await api.delete(endpoint);
      else await api.post(endpoint + path, payload);
      if (path === 'cancel' || path === '/leave') navigate('/practice/competitions');
      else reload();
      return true;
    } catch (reason) {
      setNotice(errorMessage(reason, 'Could not update the competition.'));
      reload();
      return false;
    } finally { setWorking(false); }
  }
  const item = event.error || event.data?.id !== id ? undefined : event.data;
  const battle = item?.battleDurationMinutes != null;
  const canJoin = item && !item.joined && (battle ? item.status === 'Lobby' && item.host : item.status !== 'Ended');
  const canPlay = item?.joined && item.status === 'Active' && (!battle || item.myTeam !== null);
  const [alpha, beta] = item?.teams ?? [];
  const result = battle && item?.status === 'Ended' && alpha && beta
    ? alpha.points === beta.points ? 'Tie game' : (alpha.points > beta.points ? alpha.name : beta.name) + ' wins'
    : null;
  return <main className="catalogue feature-page">
    <Link className="back-link" to="/practice/competitions"><ArrowLeft size={18} /> Competitions</Link>
    {!item ? <p className={event.error ? 'error' : 'muted'} role="status">{event.error || 'Loading competition…'}</p> : <>
      <header className="catalogue-header"><div><h1>{item.title}</h1>
        {item.startsAt && item.endsAt
          ? <p className="muted">{dateLabel(item.startsAt)} · Ends {dateLabel(item.endsAt)}</p>
          : <p className="muted">{item.battleDurationMinutes} minute match</p>}
        {battle && item.status === 'Active' && item.endsAt && <BattleClock endsAt={item.endsAt} onEnd={reload} />}
        {item.description && <p>{item.description}</p>}</div>
        <strong className={item.status === 'Active' ? 'accepted' : 'muted'}>{item.status}</strong></header>
      {canJoin && <button className="button primary" disabled={working} onClick={() => void act('/join')}>{battle ? 'Join as a player' : 'Join competition'}</button>}
      {notice && <p className="error" role="alert">{notice}</p>}
      {item.joinCode && <div className="feature-card" aria-label="Invite code"><span className="muted">Invite code</span> <code>{item.joinCode}</code></div>}
      {item.status === 'Lobby' && <BattleLobby key={item.id} item={item} working={working} act={act} />}
      {result && <div className="feature-card"><h2><Trophy size={18} /> {result}</h2></div>}
      {battle && item.status === 'Active' && item.myTeam === null && <p className="muted">You’re spectating this battle.</p>}
      {item.status !== 'Lobby' && item.teams.length > 0 && <div className="feature-grid">
        {item.teams.map((team) => <div className="feature-card" key={team.name}>
          <h2><Shield size={18} />{team.name}</h2>
          <div className="feature-row"><strong>{team.points} points</strong>{battle && <span className="muted">{team.solved} solved</span>}</div>
        </div>)}
      </div>}
      {(item.status !== 'Lobby' || item.host) && <div className="feature-grid">
        <section className="feature-card"><h2>Problems</h2>
          {!item.problems.length && <p className="muted">Problems open to participants at the start.</p>}
          {item.problems.map((problem) => <div className="feature-row" key={problem.slug}>
            {canPlay ? <Link className="inline-link" to={slugUrl(problem.slug) + '?competition=' + item.id}>{problem.title}<ArrowRight size={16} /></Link>
              : problem.contestOnly && (item.host || item.status === 'Ended')
                ? <Link className="inline-link" to={slugUrl(problem.slug)}>{problem.title}<ArrowRight size={16} /></Link>
                : <span>{problem.title}</span>}
            {problem.solved ? <span className="accepted">Solved</span>
              : problem.teamSolved ? <span className="muted">Solved by your team</span>
              : <span className="muted">{problem.difficulty.toLowerCase()}</span>}
          </div>)}
        </section>
        {item.status !== 'Lobby' && <section className="feature-card"><h2><Trophy size={18} /> Leaderboard</h2>
          {item.rows.length === 0 && <p className="muted">No participants yet.</p>}
          {item.rows.map((row, i) => <div className="feature-row" key={i + ':' + row.displayName}>
            <span>{i + 1}. {row.displayName}{row.own ? ' (you)' : ''}</span>
            {battle && <span className="muted">{row.team === null ? 'Spectator' : teamLabel(row.team)}</span>}
            <span className="muted">{row.solved} solved</span><strong>{row.points}</strong>
          </div>)}
        </section>}
      </div>}
    </>}
  </main>;
}
