import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssignmentCompletion as Completion } from '../../../../shared/src/types/practice';
import { slugUrl, useResource } from './resource';

const size = 20;
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function AssignmentCompletion({ path }: { path: string }) {
  const result = useResource<Completion>(path + '/completion');
  const [followUp, setFollowUp] = useState(true);
  const [page, setPage] = useState(0);

  if (result.error) return <p className="error" role="alert">{result.error}</p>;
  if (!result.data) return <p role="status">Loading completion…</p>;

  const { students, completed, dueAt, scoringEndsAt, problems } = result.data;
  const list = followUp ? students.filter((student) => student.missing.length) : students;
  const choices = new Map(problems.map((problem) => [problem.id, problem]));
  const percent = students.length ? Math.round(100 * completed / students.length) : 0;

  return <section className="assignment-completion" aria-label="Student completion">
    <div className="feature-row">
      <h3>Student completion</h3>
      <strong>{completed}/{students.length} complete · {percent}%</strong>
    </div>
    {scoringEndsAt < dueAt && <p className="muted">Scoring closed {date.format(new Date(scoringEndsAt))}.</p>}
    <nav className="feature-tabs" aria-label="Completion filter">
      <button type="button" aria-pressed={followUp} onClick={() => { setFollowUp(true); setPage(0); }}>Needs follow-up</button>
      <button type="button" aria-pressed={!followUp} onClick={() => { setFollowUp(false); setPage(0); }}>All students</button>
    </nav>
    {!list.length && <p className="muted">{students.length ? 'Everyone has completed this assignment.' : 'No eligible students in this cohort.'}</p>}
    {list.slice(page * size, (page + 1) * size).map((student) => <article className="assignment-student" key={student.id}>
      <div className="feature-row">
        <div><strong>{student.name}</strong><p className="muted">{student.email}</p></div>
        <span>{student.solved}/{problems.length} solved</span>
      </div>
      {student.missing.length ? <ul aria-label="Remaining problems">
        {student.missing.map((id) => {
          const problem = choices.get(id);
          return <li key={id}>{problem?.slug ? <Link className="inline-link" to={slugUrl(problem.slug)}>{problem.title}</Link>
            : problem?.title ?? 'Unavailable problem'}</li>;
        })}
      </ul> : <p className="accepted">Complete</p>}
    </article>)}
    {list.length > size && <div className="inline-controls">
      <button type="button" className="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <span className="muted">{page * size + 1}–{Math.min((page + 1) * size, list.length)} of {list.length}</span>
      <button type="button" className="button" disabled={(page + 1) * size >= list.length} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </section>;
}
