import { useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LeaderboardPage } from '../../../../shared/src/types/practice';
import { useResource } from './resource';

type Scope = 'global' | 'college';

function Rankings({ scope, page, handle, movePage }: {
  scope: Scope; page: number; handle?: string; movePage(page: number): void;
}) {
  const path = '/practice/study/leaderboard/' + (scope === 'college' ? scope : 'global?page=' + page);
  const { data, error, reload } = useResource<LeaderboardPage>(path);
  const title = scope === 'global' ? 'Global rankings' : 'College rankings';

  if (error) return <section className="feature-card">
    <h2>{title}</h2><p className="error" role="alert">{error}</p>
    <button type="button" className="button" onClick={reload}>Try again</button>
  </section>;
  if (!data) return <p className="muted" role="status">Loading rankings…</p>;

  return <section className="feature-card">
    <div className="feature-row leaderboard-heading">
      <h2>{data.college ?? title}</h2>
      <p className="muted">{data.total} ranked {data.total === 1 ? 'profile' : 'profiles'}</p>
    </div>
    {data.rows.length === 0 ? <p className="muted">No public practice profiles on this page.</p> :
      <table className="leaderboard-table" aria-label={title}>
        <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Solved</th><th scope="col">Streak</th><th scope="col">XP</th></tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.handle} className={handle === row.handle ? 'leaderboard-self' : undefined}>
          <td>{row.rank}</td>
          <th scope="row">
            <Link className="inline-link" to={'/practice/p/' + row.handle}>{row.handle}</Link>
            {handle === row.handle && <span className="muted"> (you)</span>}
            <small className="muted">Level {row.level}{scope === 'global' && row.college ? ' · ' + row.college : ''}</small>
          </th>
          <td><strong>{row.solved}</strong>{row.solved > 0 && <small className="muted">{row.easy} E · {row.medium} M · {row.hard} H</small>}</td>
          <td>{row.streak} d</td>
          <td><strong>{row.xp}</strong></td>
        </tr>)}</tbody>
      </table>}
    {data.capped && <p className="muted">Showing the top {scope === 'global' ? 500 : 100} ranked profiles.</p>}
    {scope === 'global' && (data.hasNext || page > 1) && <nav className="leaderboard-pagination" aria-label="Leaderboard pages">
      <button type="button" className="button" disabled={page === 1} onClick={() => movePage(page - 1)}><ArrowLeft size={16} /> Previous</button>
      <span className="muted" aria-live="polite">Page {page}</span>
      <button type="button" className="button" disabled={!data.hasNext} onClick={() => movePage(page + 1)}>Next <ArrowRight size={16} /></button>
    </nav>}
  </section>;
}

export function Leaderboard() {
  const { data } = useResource<{ profile: { handle: string } | null }>('/practice/study/profile');
  const [scope, setScope] = useState<Scope>('global');
  const [page, setPage] = useState(1);
  function open(next: Scope) {
    setScope(next);
    setPage(1);
  }

  return <>
    <nav className="feature-tabs leaderboard-tabs" aria-label="Leaderboard scope">
      <button type="button" aria-pressed={scope === 'global'} onClick={() => open('global')}><Globe size={16} /> Global</button>
      <button type="button" aria-pressed={scope === 'college'} onClick={() => open('college')}><GraduationCap size={18} /> My college</button>
    </nav>
    <Rankings key={scope + '/' + page} scope={scope} page={page} handle={data?.profile?.handle} movePage={setPage} />
  </>;
}

export function LeaderboardView() {
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>Leaderboard</h1><p className="muted">Rankings based on verified practice solves.</p></div>
      <Link to="/practice/dashboard?tab=profile" className="inline-link">Profile settings <ArrowRight size={16} /></Link>
    </header>
    <Leaderboard />
  </main>;
}
