import { useState, type FormEvent } from 'react';
import { opportunityCategories, type OpportunityImportCandidate, type OpportunityImportReport } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';

const path = '/practice/community/admin/opportunities/import';
const categories = opportunityCategories;
const fields = [
  { key: 'title', label: 'Title', type: 'text', limit: 120 },
  { key: 'company', label: 'Company', type: 'text', limit: 100 },
  { key: 'applyUrl', label: 'Application URL', type: 'url', limit: 2048 },
  { key: 'sourceUrl', label: 'Official source URL', type: 'url', limit: 2048 },
  { key: 'closingDate', label: 'Closing date (UTC)', type: 'date', limit: 10 },
] as const;
type Row = { candidate: OpportunityImportCandidate; selected: boolean; index: number };

function CandidateCard({ row, disabled, onChange }: { row: Row; disabled: boolean; onChange(row: Row): void }) {
  const { candidate, selected, index } = row;
  function edit(change: Partial<OpportunityImportCandidate>) {
    onChange({ ...row, candidate: { ...candidate, ...change } });
  }
  return <fieldset className="feature-form opportunity-candidate" disabled={disabled}>
    <legend>{candidate.title || 'Listing ' + (index + 1)}</legend>
    <label className="check-label"><input type="checkbox" checked={selected} onChange={(event) => onChange({ ...row, selected: event.target.checked })} /> Include this listing</label>
    {candidate.flags.length > 0 && <ul>{candidate.flags.map((flag, index) => <li key={index}>{flag}</li>)}</ul>}
    <div className="field-grid">
      {fields.map(({ key, label, type, limit }) => <label key={key}>{label}
        <input type={type} maxLength={limit} value={candidate[key]} onChange={(event) => edit({ [key]: event.target.value })} />
      </label>)}
      <label>Type<select value={candidate.category} onChange={(event) => edit({ category: event.target.value as OpportunityImportCandidate['category'] })}>
        <option value="">Select a type</option>{categories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
    </div>
    <label>Summary<textarea rows={3} maxLength={2000} value={candidate.summary} onChange={(event) => edit({ summary: event.target.value })} /></label>
    <label className="check-label"><input type="checkbox" checked={candidate.remote} onChange={(event) => edit({ remote: event.target.checked })} />Remote</label>
  </fieldset>;
}

export function OpportunityImport({ onImported }: { onImported(): void }) {
  const [research, setResearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<OpportunityImportReport>();

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReport(undefined);
    setRows([]);
    setError('');
    try {
      const { data } = await api.post<{ opportunities: OpportunityImportCandidate[] }>(path + '/extract', { researchText: research }, { timeout: 45_000 });
      setRows(data.opportunities.map((candidate, index) => ({ candidate, selected: !candidate.invalidFields.length && !candidate.flags.length, index })));
      if (!data.opportunities.length) setError('No opportunities were found in this text.');
    } catch (failure) {
      setError(errorMessage(failure, 'Could not extract opportunities.'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const selected = rows.filter((row) => row.selected);
    setBusy(true);
    setError('');
    setReport(undefined);
    try {
      const { data } = await api.post<OpportunityImportReport>(path + '/bulk', { opportunities: selected.map((row) => row.candidate) });
      setReport(data);
      const done = new Set([...data.imported, ...data.duplicates].map(({ index }) => selected[index]?.index));
      setRows((current) => current.filter((row) => !done.has(row.index)));
      if (data.imported.length) onImported();
    } catch (failure) {
      setError(errorMessage(failure, 'Could not save the selected opportunities.'));
    } finally {
      setBusy(false);
    }
  }

  return <details className="feature-card opportunity-import">
    <summary>Import opportunities</summary>
    <form className="feature-form" onSubmit={(event) => void extract(event)}>
      <label>Research text or JSON<textarea rows={6} maxLength={20_000} value={research} required disabled={busy || rows.length > 0}
        onChange={(event) => setResearch(event.target.value)} /></label>
      <p className="muted">Review and edit up to 25 listings before saving them for verification.</p>
      {!rows.length && <button className="button" type="submit" disabled={busy || !research.trim()}>Extract opportunities</button>}
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {busy && <p className="muted" role="status">Working on the import…</p>}
    {rows.map((row) => <CandidateCard key={row.index} row={row} disabled={busy}
      onChange={(changed) => setRows((current) => current.map((item) => item.index === changed.index ? changed : item))} />)}
    {rows.length > 0 && <div className="inline-controls">
      <button className="button primary" type="button" disabled={busy || !rows.some((row) => row.selected)} onClick={() => void save()}>Save selected listings</button>
      <button className="button" type="button" disabled={busy} onClick={() => { setRows([]); setReport(undefined); setError(''); }}>Back to research</button>
    </div>}
    {report && <div role="status">
      <p>{report.imported.length} saved · {report.duplicates.length} already imported · {report.failed.length} need edits</p>
      {report.failed.length > 0 && <ul>{report.failed.map((item) => <li key={item.index}>{item.title} — {item.errors.join(', ')}</li>)}</ul>}
    </div>}
  </details>;
}
