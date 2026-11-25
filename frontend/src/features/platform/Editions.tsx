import { ArrowRight, BookOpen, Check, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { slugUrl, useResource } from './resource';

type Mission = { id: string; objective: string; title: string; slug: string | null; status: 'available' | 'locked' | 'completed' | 'unavailable' };
type Chapter = { id: string; title: string; description: string; status: 'available' | 'locked' | 'completed' | 'upcoming'; completed: number; total: number; missions: Mission[] };

export default function Editions() {
  const { data, error, reload } = useResource<{ chapters: Chapter[] }>('/practice/study/editions');
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>CodeClub Editions</h1><p className="muted">Eight missions, two chapters. Each Accepted solution opens the next mission.</p></div>
      <button className="button" onClick={reload}>Refresh progress</button></header>
    <p className="muted">Missions use your existing Practice submissions. Complete each chapter to open the next one.</p>
    {error ? <p className="error" role="alert">{error}</p> : !data ? <p role="status">Loading Editions…</p> : data.chapters.map((chapter, index) =>
      <section className="feature-card" key={chapter.id} aria-label={chapter.title}>
        <div className="feature-row"><h2><BookOpen size={18} /> {index + 1}. {chapter.title}</h2>
          <span className={chapter.status === 'completed' ? 'accepted' : 'muted'}>{chapter.status === 'upcoming' ? 'Upcoming' : chapter.status === 'locked' ? 'Locked' : chapter.completed + ' of ' + chapter.total + ' complete'}</span></div>
        <p className="muted">{chapter.description}</p>
        {chapter.missions.map((mission, missionIndex) => <div className="feature-row" key={mission.id}>
          <div><strong>{missionIndex + 1}. {mission.title}</strong><p className="muted">{mission.objective}</p>
            {mission.status === 'unavailable' && <p role="status" className="muted">This exercise is currently unavailable. Your completed missions are retained.</p>}</div>
          {mission.status === 'completed' ? <span className="accepted"><Check size={16} /> Completed</span>
            : mission.slug && mission.status === 'available' ? <Link className="button" to={slugUrl(mission.slug)}>Open mission <ArrowRight size={16} /></Link>
            : mission.status === 'locked' ? <span className="muted"><Lock size={15} /> Complete the previous mission</span> : null}
        </div>)}
      </section>)}
  </main>;
}
