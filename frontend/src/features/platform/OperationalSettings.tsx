import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';
type Settings = { id: string; version: number; maintenance: boolean; recruiterRegistration: boolean; officerRegistration: boolean; announcement: string };
export function OperationalSettings() {
  const resource = useResource<Settings>('/practice/admin/settings');
  const [form, setForm] = useState<Settings>(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { if (resource.data) setForm(resource.data); }, [resource.data]);
  async function save(e: FormEvent) {
    e.preventDefault(); if (!form || busy) return; setBusy(true); setNotice('');
    try { const { id: _id, ...values } = form; const { data } = await api.put<Settings>('/practice/admin/settings', values); setForm(data); setNotice('Settings saved.'); }
    catch (error) { setNotice(errorMessage(error, 'Could not save settings.')); } finally { setBusy(false); }
  }
  if (!form) return <p role="status">{resource.error || 'Loading settings…'}</p>;
  return <form className="feature-card feature-form" onSubmit={save}><h2>Operational settings</h2>
    <p className="muted">Super admins retain access during maintenance. Existing applications remain reviewable.</p>
    {([['maintenance', 'Maintenance mode'], ['recruiterRegistration', 'Accept recruiter applications'], ['officerRegistration', 'Accept placement officer applications']] as const).map(([key, label]) => <label className="check-label" key={key}><input type="checkbox" checked={form[key]} disabled={busy} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}
    <label htmlFor="practice-announcement">Public announcement</label><textarea id="practice-announcement" maxLength={1000} value={form.announcement} onChange={e => setForm({ ...form, announcement: e.target.value })} />
    <div className="inline-controls"><button className="button primary" disabled={busy}>Save settings</button><button className="button" type="button" disabled={busy} onClick={resource.reload}>Reload settings</button></div>
    {notice && <p role="status">{notice}</p>}
  </form>;
}
export function PublicAnnouncement() {
  const { data } = useResource<Pick<Settings, 'maintenance' | 'announcement'>>('/practice/settings/public');
  return data?.maintenance || data?.announcement ? <div className="shell-message" role="status">{data.maintenance && <strong>Practice maintenance is in progress. </strong>}{data.announcement}</div> : null;
}
