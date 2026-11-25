import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PracticeAnalytics, PracticeAnalyticsTrend } from '../../../../shared/src/types/practice';
import { slugUrl, useResource } from './resource';

const base = '/practice/admin/analytics';
const number = new Intl.NumberFormat();
const buckets = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const percent = (value: number | null) => value === null ? '—' : value + '%';

function Totals({ metrics }: { metrics: Array<[string, number | string]> }) {
  return <dl className="stat-grid">{metrics.map(([label, value]) => <div className="stat-card" key={label}>
    <dt>{label}</dt><dd><strong>{typeof value === 'number' ? number.format(value) : value}</strong></dd>
  </div>)}</dl>;
}

function TrendChart({ title, periods, field }: {
  title: string;
  periods: PracticeAnalyticsTrend['periods'];
  field: 'registrations' | 'submissions';
}) {
  const peak = Math.max(1, ...periods.map((period) => period[field]));
  return <figure className="analytics-figure">
    <figcaption>{title}</figcaption>
    <div className="analytics-bars" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
      {periods.map((period) => <div key={period.start} title={period.label + ' · ' + number.format(period[field])}>
        <span style={{ height: period[field] / peak * 100 + '%' }} />
      </div>)}
    </div>
    <div className="analytics-axis muted" aria-hidden="true">
      <span>{periods[0]?.start.slice(0, 10)}</span><span>{periods[periods.length - 1]?.start.slice(0, 10)}</span>
    </div>
  </figure>;
}

function Trends({ bucket }: { bucket: PracticeAnalyticsTrend['bucket'] }) {
  const { data, error } = useResource<PracticeAnalyticsTrend>(base + '/trend?bucket=' + bucket);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">Loading trends…</p>;
  return <>
    <div className="feature-grid">
      <TrendChart title="Account registrations" periods={data.periods} field="registrations" />
      <TrendChart title="Practice submissions" periods={data.periods} field="submissions" />
    </div>
    <details className="analytics-details">
      <summary>View trend data</summary>
      <table className="analytics-table" style={{ tableLayout: 'fixed' }}>
        <thead style={{ fontSize: '.75rem' }}><tr>
          <th scope="col">Period (UTC)</th><th scope="col" aria-label="New accounts">Accounts</th>
          <th scope="col" aria-label="Practice submissions">Attempts</th><th scope="col">Accepted</th>
        </tr></thead>
        <tbody>{[...data.periods].reverse().map((period) => <tr key={period.start}>
          <th scope="row">{period.label}</th>
          <td>{number.format(period.registrations)}</td><td>{number.format(period.submissions)}</td><td>{number.format(period.accepted)}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </>;
}

function ProblemRanks({ title, rows }: { title: string; rows: PracticeAnalytics['problems']['mostSolved'] }) {
  return <section className="feature-card">
    <h2>{title}</h2>
    {rows.length ? <ol className="analytics-ranking">{rows.map((row) => <li key={row.slug}>
      <Link className="inline-link" to={slugUrl(row.slug)}>{row.title}</Link>
      <span className="muted">{number.format(row.acceptedCount)} accepted</span>
    </li>)}</ol> : <p className="muted">No accepted submissions in the published catalogue.</p>}
  </section>;
}

export function AdminAnalytics() {
  const { data, error } = useResource<PracticeAnalytics>(base);
  const [bucket, setBucket] = useState<PracticeAnalyticsTrend['bucket']>('daily');
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading analytics…</p>}
    {data && <>
      <section className="feature-card">
        <h2>Practice overview</h2>
        <Totals metrics={[
          ['Student accounts', data.accounts.students], ['Active student accounts', data.accounts.activeStudents],
          ['Recruiter accounts', data.accounts.recruiters], ['Active recruiters', data.accounts.activeRecruiters],
          ['Placement team members', data.accounts.members], ['Active placement members', data.accounts.activeMembers],
          ['Registered today (UTC)', data.accounts.registrationsToday], ['Published problems', data.practice.published],
          ['Submissions', data.practice.submissions], ['Accepted submissions', data.practice.accepted],
          ['Acceptance rate', percent(data.practice.acceptanceRate)], ['Problems never solved', data.problems.neverSolved],
          ['Pending recruiter reviews', data.approvals.recruiters], ['Pending officer reviews', data.approvals.officers],
        ]} />
      </section>
      <section className="feature-card">
        <h2>Engagement</h2>
        <p className="muted">Counts distinct accounts with at least one Practice submission in each window.</p>
        <Totals metrics={[
          ['Active in the last 7 days', data.engagement.active7Days], ['Active in the last 30 days', data.engagement.active30Days],
          ['Active in the preceding week', data.engagement.previous7Days], ['Active in both weeks', data.engagement.retained],
          ['Weekly retention', percent(data.engagement.retentionPercent)],
        ]} />
      </section>
    </>}
    <section className="feature-card feature-form">
      <h2>Trends</h2>
      <div className="inline-controls analytics-intervals" aria-label="Trend intervals">{Object.entries(buckets).map(([key, label]) =>
        <button className="button" type="button" key={key} aria-pressed={bucket === key}
          onClick={() => setBucket(key as PracticeAnalyticsTrend['bucket'])}>{label}</button>)}</div>
      <Trends key={bucket} bucket={bucket} />
    </section>
    {data && <>
      <div className="feature-grid">
        <ProblemRanks title="Most solved problems" rows={data.problems.mostSolved} />
        <ProblemRanks title="Least solved problems" rows={data.problems.leastSolved} />
      </div>
      <section className="feature-card">
        <h2>Languages</h2>
        {data.languages.length ? <table className="analytics-table">
          <thead><tr><th scope="col">Language</th><th scope="col">Submissions</th><th scope="col">Accepted</th></tr></thead>
          <tbody>{data.languages.map((row) => <tr key={row.language}>
            <th scope="row">{row.language}</th><td>{number.format(row.submissions)}</td><td>{number.format(row.accepted)}</td>
          </tr>)}</tbody>
        </table> : <p className="muted">No submissions yet.</p>}
      </section>
    </>}
  </>;
}
