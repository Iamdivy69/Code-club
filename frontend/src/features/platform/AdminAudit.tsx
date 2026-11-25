import { useState } from 'react';
import type { PracticeAuditPage } from '../../../../shared/src/types/practice';
import { useResource } from './resource';

const areas = { catalogue: 'Problem bank', community: 'Community', placement: 'Placement', membership: 'Membership', accounts: 'Accounts' };
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function EventPage({ area, before, previous, next }: {
  area: string; before?: string; previous?: () => void; next(cursor: string): void;
}) {
  const query = new URLSearchParams();
  if (area) query.set('area', area);
  if (before) query.set('before', before);
  const audit = useResource<PracticeAuditPage>('/practice/admin/audit?' + query.toString());
  return <>
    {audit.error && <p className="error" role="alert">{audit.error}</p>}
    {!audit.data && !audit.error && <p role="status">Loading audit log…</p>}
    {audit.data?.entries.length === 0 && <p className="muted">No audit entries for this area.</p>}
    {audit.data?.entries.map((entry) => <article className="playlist" key={entry.id}>
      <div className="feature-row">
        <h3>{entry.action}</h3>
        <time className="muted" dateTime={entry.createdAt}>{timestamp.format(new Date(entry.createdAt))}</time>
      </div>
      <p>{entry.target.label ?? entry.target.type ?? areas[entry.area]}{entry.target.state && ' · ' + entry.target.state}</p>
      {entry.target.reason && <p>{entry.target.reason}</p>}
      {!entry.target.label && entry.target.id && <p className="muted">{entry.target.id}</p>}
      <p className="muted">{entry.actor ? entry.actor.name + ' · ' + entry.actor.email : 'Former account'}</p>
    </article>)}
    {(previous || audit.data?.next) && <div className="inline-controls">
      {previous && <button className="button" type="button" onClick={previous}>Newer entries</button>}
      {audit.data?.next && <button className="button" type="button" onClick={() => next(audit.data!.next!)}>Older entries</button>}
    </div>}
  </>;
}

export function AdminAudit() {
  const [area, setArea] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors[cursors.length - 1];
  return <section className="feature-card feature-form">
    <h2>Practice audit log</h2>
    <label>Area<select value={area} onChange={(event) => { setArea(event.target.value); setCursors([]); }}>
      <option value="">All areas</option>
      {Object.entries(areas).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select></label>
    <EventPage key={area + ':' + before} area={area} before={before}
      previous={cursors.length ? () => setCursors((rows) => rows.slice(0, -1)) : undefined}
      next={(cursor) => setCursors((rows) => [...rows, cursor])} />
  </section>;
}
