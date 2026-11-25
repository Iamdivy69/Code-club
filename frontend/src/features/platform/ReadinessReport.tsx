import { useState, type FormEvent } from 'react';
import { ChartNoAxesCombined, Download } from 'lucide-react';
import type { InstitutionReadinessReport, ReadinessCounts } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { UniversityPicker } from './UniversityPicker';
import { useResource } from './resource';

const base = '/practice/placement/reports/overview';
const day = 86_400_000;

function periodPreset() {
  const today = Date.now() + 330 * 60_000;
  const iso = (date: number) => new Date(date).toISOString().slice(0, 10);
  return { from: iso(today - 29 * day), to: iso(today) };
}

function Difficulty({ result }: { result: ReadinessCounts }) {
  return <p className="muted">{result.easy} easy · {result.medium} medium · {result.hard} hard</p>;
}

function ReportContents({ path }: { path: string }) {
  const { data, error } = useResource<InstitutionReadinessReport>(path);
  const [exportError, setExportError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setExportError('');
    try {
      const [{ data: latest }, { downloadReadiness }] = await Promise.all([
        api.get<InstitutionReadinessReport>(path), import('./readiness-pdf'),
      ]);
      await downloadReadiness(latest);
    } catch (reason) {
      setExportError(errorMessage(reason, 'Could not export the placement report.'));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">Loading readiness report…</p>;
  const { totals, assignments } = data;
  return <>
    <section className="feature-card readiness-layout">
      <div className="feature-row">
        <div><h2><ChartNoAxesCombined size={19} /> {data.university.name}</h2><p className="muted">Placement readiness</p></div>
        <button className="button" type="button" onClick={() => void download()} disabled={busy}>
          <Download size={16} /> {busy ? 'Preparing PDF…' : 'Download report PDF'}
        </button>
      </div>
      {exportError && <p className="error" role="alert">{exportError}</p>}
      <dl className="stat-grid readiness-stats">
        <div><dt>Readiness</dt><dd>{totals.score}/100</dd></div>
        <div><dt>Sharing progress</dt><dd>{totals.students}</dd></div>
        <div><dt>Active streaks</dt><dd>{totals.activePercent}%</dd></div>
        <div><dt>Avg. problems solved</dt><dd>{totals.averageSolved}</dd></div>
      </dl>
      <p className="muted">{totals.totalSolved} solves · {data.optedOut} students outside reporting · {data.unassigned} sharing students without a cohort</p>
      <Difficulty result={totals} />
      <p className="muted">Readiness uses lifetime solves, hard problems solved, and current streaks for students who share their progress.</p>
    </section>
    <section className="feature-card">
      <h2>Assignment completion</h2>
      <p className="muted">{data.range.from} to {data.range.to}</p>
      <p><strong>{assignments.percent}% complete</strong></p>
      <p className="muted">{assignments.completed} of {assignments.opportunities} student assignments completed across {assignments.total} assignments.</p>
    </section>
    <section className="feature-card">
      <h2>Cohorts</h2>
      {data.cohorts.length === 0 && <p className="muted">This university has no cohorts yet.</p>}
      {data.cohorts.map((cohort) => <article className="feature-row" key={cohort.id}>
        <div><strong>{cohort.name}</strong>
          <p className="muted">{cohort.students} sharing · {cohort.averageSolved} avg. solved · {cohort.activePercent}% active{cohort.archived ? ' · Archived' : ''}</p>
          <Difficulty result={cohort} />
          {!!cohort.topTopics.length && <p className="muted">Top topics {cohort.topTopics.map(({ topic, solves }) => topic + ' (' + solves + ')').join(', ')}</p>}
        </div><strong>{cohort.score}/100</strong>
      </article>)}
    </section>
    <section className="feature-card">
      <h2>Student rankings</h2>
      {data.rankings.length === 0 && <p className="muted">Rankings will appear when students share their progress.</p>}
      <ol className="readiness-rankings">
        {data.rankings.map((student, index) => <li key={index}>
          <strong>{student.name}</strong><span className="muted">{student.solved} solved · {student.streak} day streak · {student.xp} XP</span>
        </li>)}
      </ol>
    </section>
  </>;
}

function UniversityReadiness({ universityId }: { universityId?: string }) {
  const [period, setPeriod] = useState(periodPreset);
  const params = new URLSearchParams(period);
  if (universityId) params.set('universityId', universityId);
  const path = base + '?' + params.toString();
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPeriod({ from: String(data.get('from')), to: String(data.get('to')) });
  }
  return <>
    <form className="feature-card feature-form" onSubmit={filter}>
      <h2>Assignment dates</h2>
      <div className="field-grid">
        <label>From<input type="date" name="from" required defaultValue={period.from} /></label>
        <label>To<input type="date" name="to" required defaultValue={period.to} /></label>
      </div>
      <button className="button" type="submit">Apply dates</button>
    </form>
    <ReportContents key={path} path={path} />
  </>;
}

export function ReadinessReport({ admin }: { admin: boolean }) {
  return <div className="feature-grid">{admin
    ? <UniversityPicker render={(id) => <UniversityReadiness key={id} universityId={id} />} />
    : <UniversityReadiness />}</div>;
}
