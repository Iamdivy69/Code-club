import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LearnerAnalytics as Analytics } from '../../../../shared/src/types/practice';
import { CoachingInsights } from './CoachingInsights';
import { slugUrl, useResource } from './resource';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const daysLabel = (count: number) => number.format(count) + (count === 1 ? ' day' : ' days');
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function SolveVelocity({ weeks }: { weeks: Analytics['weeks'] }) {
  const peak = Math.max(1, ...weeks.map((week) => week.solved));
  const label = (week: Analytics['weeks'][number]) => day.format(new Date(week.start)) + ' – ' + day.format(new Date(week.end));
  return <section className="feature-card">
    <h2>Weekly solves</h2>
    <p className="muted">{number.format(weeks.reduce((sum, week) => sum + week.solved, 0))} first solves in the past 8 weeks (IST)</p>
    <figure className="analytics-figure" aria-hidden="true">
      <div className="analytics-bars" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
        {weeks.map((week) => <div key={week.start} title={label(week) + ' · ' + week.solved + ' solved'}>
          <span style={{ height: week.solved / peak * 100 + '%' }} />
        </div>)}
      </div>
      <div className="analytics-axis muted"><span>{day.format(new Date(weeks[0]!.start))}</span>
        <span>{day.format(new Date(weeks[weeks.length - 1]!.end))}</span></div>
    </figure>
    <details className="analytics-details">
      <summary>View weekly totals</summary>
      <table className="analytics-table">
        <thead><tr><th scope="col">Week (IST)</th><th scope="col">Problems solved</th></tr></thead>
        <tbody>{weeks.map((week) => <tr key={week.start}><th scope="row">{label(week)}</th><td>{week.solved}</td></tr>)}</tbody>
      </table>
    </details>
  </section>;
}

function TopicRows({ topics }: { topics: Analytics['topics'] }) {
  return <ul className="learner-distribution">{topics.map(({ topic, solved, available, covered }) => <li key={topic}>
    <div className="feature-row"><strong>{topic}</strong><span>{number.format(solved)} solved</span></div>
    {available > 0 && <>
      <div className="learner-meter" aria-hidden="true"><span style={{ width: covered / available * 100 + '%' }} /></div>
      <p className="muted">{number.format(covered)} of {number.format(available)} available problems solved</p>
    </>}
  </li>)}</ul>;
}

function RecentSubmissions({ rows }: { rows: Analytics['recent'] }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="feature-card">
    <h2>Recent submissions</h2>
    {rows.length === 0 ? <p className="muted">Your graded submissions will appear here.</p>
      : <ul className="learner-distribution" id="learner-recent-submissions">{rows.slice(0, expanded ? rows.length : 5).map((row) => <li className="feature-row" key={row.id}>
        <div>
          {row.slug ? <Link className="inline-link" to={slugUrl(row.slug)}>{row.title}</Link> : <strong>{row.title}</strong>}
          <p className="muted">{row.language} · <time dateTime={row.createdAt}>{timestamp.format(new Date(row.createdAt))}</time></p>
        </div>
        <span className={row.verdict === 'Accepted' ? 'accepted' : 'muted'}>{row.verdict}</span>
      </li>)}</ul>}
    {rows.length > 5 && <button type="button" className="button" aria-controls="learner-recent-submissions"
      aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      {expanded ? 'Show fewer submissions' : 'Show ' + (rows.length - 5) + ' more submissions'}
    </button>}
  </section>;
}

export function LearnerAnalytics() {
  const { data, error } = useResource<Analytics>('/practice/study/analytics');
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">Loading learner analytics…</p>;
  const { progress, submissions, topics, languages, weeks, recent } = data;
  const metrics = [
    ['Problems solved', number.format(progress.solved)], ['Graded submissions', number.format(submissions.total)],
    ['Acceptance rate', submissions.rate === null ? '—' : number.format(submissions.rate) + '%'],
    ['Mean accepted runtime', submissions.averageRuntimeMs === null ? '—' : number.format(submissions.averageRuntimeMs) + ' ms'],
    ['Current streak', daysLabel(progress.streak.current)], ['Best streak', daysLabel(progress.streak.best)],
  ];
  return <>
    <section className="feature-card">
      <h2>Learner analytics</h2>
      <div className="feature-row"><strong>Level {progress.level} · {progress.rank}</strong><span>{number.format(progress.xp)} XP</span></div>
      <div className="learner-meter" aria-hidden="true"><span style={{ width: progress.xpCurrent / progress.xpNeeded * 100 + '%' }} /></div>
      <p className="muted">{number.format(progress.xpCurrent)} of {number.format(progress.xpNeeded)} XP toward level {progress.level + 1}</p>
      <dl className="stat-grid">{metrics.map(([label, value]) => <div className="stat-card" key={label}>
        <dt>{label}</dt><dd><strong>{value}</strong></dd>
      </div>)}</dl>
    </section>
    <CoachingInsights />
    <div className="feature-grid">
      <SolveVelocity weeks={weeks} />
      <section className="feature-card">
        <h2>Languages used</h2>
        {languages.length === 0 ? <p className="muted">Submit a solution to see your language usage.</p>
          : <ul className="learner-distribution">{languages.map(({ key, label, submissions: count }) => <li key={key}>
            <div className="feature-row"><strong>{label}</strong><span>{number.format(count)} {count === 1 ? 'submission' : 'submissions'}</span></div>
            <div className="learner-meter" aria-hidden="true"><span style={{ width: count / submissions.total * 100 + '%' }} /></div>
          </li>)}</ul>}
      </section>
    </div>
    <section className="feature-card">
      <h2>Topic coverage</h2>
      {topics.length === 0 ? <p className="muted">Topic coverage will appear as the catalogue grows.</p> : <TopicRows topics={topics.slice(0, 8)} />}
      {topics.length > 8 && <details className="analytics-details"><summary>More topics</summary>
        <TopicRows topics={topics.slice(8)} />
      </details>}
    </section>
    <RecentSubmissions rows={recent} />
  </>;
}
