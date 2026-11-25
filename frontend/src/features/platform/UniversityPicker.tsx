import { useState, type ReactNode } from 'react';
import { useResource } from './resource';

type University = { id: string; name: string };

export function UniversityPicker({ render }: { render(universityId: string): ReactNode }) {
  const [query, setQuery] = useState('');
  const [universityId, setUniversityId] = useState('');
  const universities = useResource<{ universities: University[] }>('/practice/placement/team/universities?q=' + encodeURIComponent(query));
  return <>
    <section className="feature-card feature-form">
      <h2>University</h2>
      <label>Search universities<input maxLength={100} type="search" value={query}
        onChange={(event) => { setQuery(event.target.value); setUniversityId(''); }} /></label>
      <label>Choose a university<select value={universityId} onChange={(event) => setUniversityId(event.target.value)}>
        <option value="">Select a university</option>
        {universities.data?.universities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {universities.error && <p className="error" role="alert">{universities.error}</p>}
      {universities.data?.universities.length === 0 && <p className="muted">No universities found.</p>}
    </section>
    {universityId && render(universityId)}
  </>;
}
