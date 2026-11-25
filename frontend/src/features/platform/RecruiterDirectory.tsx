import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { recruiterRoles, type CandidateDirectoryPage, type PracticeLanguage } from '../../../../shared/src/types/practice';
import { useResource } from './resource';
import { LeetCodeSummary } from './LeetCodeStats';

const base = '/practice/placement/candidates';
type Filters = { universities: { id: string; name: string }[]; topics: string[]; languages: { key: PracticeLanguage; label: string }[] };

function CandidatePage({ query, cursors, setCursors, select }: {
  query: string; cursors: string[]; setCursors(cursors: string[]): void; select(handle: string): void;
}) {
  const params = new URLSearchParams(query);
  const cursor = cursors[cursors.length - 1];
  if (cursor) params.set('cursor', cursor);
  const result = useResource<CandidateDirectoryPage>(base + '?' + params.toString());
  const candidates = result.data?.candidates;
  const next = result.data?.next;

  return <section className="feature-card recruiter-directory" aria-label="Candidate results">
    <h2>Candidate results</h2>
    {result.error ? <p className="error" role="alert">{result.error}</p>
      : !candidates ? <p role="status">Loading candidates…</p>
      : candidates.length === 0 && <p className="muted">No candidates match these filters.</p>}
    {candidates?.map((person) => {
      const description = [person.college, person.preferredRole, person.expectedGraduation ? 'Class of ' + person.expectedGraduation : null]
        .filter(Boolean).join(' · ');
      return <article className="candidate-card" key={person.handle}>
      <div className="feature-row">
        <div>
          <h3><Link className="inline-link" to={'/practice/p/' + person.handle}>{person.handle}</Link></h3>
          {description && <p className="muted">{description}</p>}
        </div>
        <button className="button" type="button" onClick={() => select(person.handle)}>Select</button>
      </div>
      {person.bio && <p>{person.bio}</p>}
      <p><strong>{person.xp.toLocaleString()} XP</strong> · Level {person.level} · {person.solved} solved · {person.streak}-day streak</p>
      <p className="muted">{person.easy} easy · {person.medium} medium · {person.hard} hard</p>
      {person.leetcode && <LeetCodeSummary stats={person.leetcode} />}
      {!!person.topTopics.length && <p className="muted">{person.topTopics.join(' · ')}</p>}
      {person.availableForWork && <p className="accepted">Available for work</p>}
      </article>;
    })}
    {(cursors.length > 0 || next) && <div className="inline-controls">
      <button type="button" className="button" disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button>
      <span className="muted">Page {cursors.length + 1}</span>
      <button type="button" className="button" disabled={!next} onClick={() => { if (next) setCursors([...cursors, next]); }}>Next</button>
    </div>}
  </section>;
}

export function RecruiterDirectory({ select }: { select(handle: string): void }) {
  const filters = useResource<Filters>(base + '/filters');
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  function search(value: string) {
    setQuery(value);
    setCursors([]);
    setRevision((current) => current + 1);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) values.set(key, value.trim());
    }
    search(values.toString());
  }

  return <>
    <form className="feature-card feature-form" onSubmit={apply} onReset={() => search('')}>
      <h2>Find candidates</h2>
      <label>Search by handle<input name="q" maxLength={64} type="search" placeholder="Enter a handle" /></label>
      <div className="field-grid">
        <label>University<select name="university"><option value="">Any university</option>
          {filters.data?.universities.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
        </select></label>
        <label>Topic<select name="topic"><option value="">Any topic</option>
          {filters.data?.topics.map((topic) => <option key={topic}>{topic}</option>)}
        </select></label>
        <label>Language<select name="language"><option value="">Any language</option>
          {filters.data?.languages.map((language) => <option key={language.key} value={language.key}>{language.label}</option>)}
        </select></label>
        <label>Preferred role<select name="preferredRole"><option value="">Any role</option>
          {recruiterRoles.map((role) => <option key={role}>{role}</option>)}
        </select></label>
        <label>Graduation year<input name="expectedGraduation" type="number" min={1900} max={2200} placeholder="Any year" /></label>
        <label>Minimum solves<input name="minSolved" type="number" min={0} max={1_000_000} /></label>
        <label>Maximum solves<input name="maxSolved" type="number" min={0} max={1_000_000} /></label>
      </div>
      <label className="check-label"><input name="availableForWork" value="true" type="checkbox" /> Available for work</label>
      {filters.error && <p className="error" role="alert">{filters.error}</p>}
      <div className="inline-controls"><button type="submit" className="button primary">Search</button><button type="reset" className="button">Clear filters</button></div>
    </form>
    <CandidatePage key={revision + ':' + cursors.length} query={query} cursors={cursors} setCursors={setCursors} select={select} />
  </>;
}
