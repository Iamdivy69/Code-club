import { useState } from 'react';
import { api, errorMessage } from '../../app/api';
type Preview = { email: string; problems: number; solved: number; retainedSubmissions: number; retainedCertificates: number; digest: string };
export function ProgressReset({ userId }: { userId: string }) {
  const [preview, setPreview] = useState<Preview>(); const [confirmation, setConfirmation] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [key, setKey] = useState('');
  async function inspect() {
    setBusy(true); setNotice('');
    try { const { data } = await api.get<Preview>('/practice/admin/accounts/' + userId + '/reset-preview'); setPreview(data); setKey(crypto.randomUUID()); setConfirmation(''); }
    catch (e) { setNotice(errorMessage(e, 'Could not preview reset.')); } finally { setBusy(false); }
  }
  async function reset() {
    if (!preview) return; setBusy(true); setNotice('');
    try { const { data } = await api.post<{ id: string }>('/practice/admin/accounts/' + userId + '/reset', { requestKey: key, digest: preview.digest, confirmation, reason }); setPreview(undefined); setNotice('Practice reset completed. Receipt: ' + data.id); }
    catch (e) { setNotice(errorMessage(e, 'Could not reset progress.')); } finally { setBusy(false); }
  }
  return <div className="feature-form"><button className="button" type="button" disabled={busy} onClick={() => void inspect()}>Preview Practice reset</button>
    {preview && <><p>Reset {preview.solved} solves across {preview.problems} Practice records for {preview.email}. Keep {preview.retainedSubmissions} submissions, {preview.retainedCertificates} certificates, assignment completions and legacy DSA progress.</p>
    <label>Reason<input value={reason} maxLength={240} onChange={e => setReason(e.target.value)} /></label>
    <label>Type RESET PRACTICE<input value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
    <button className="button" type="button" disabled={busy || confirmation !== 'RESET PRACTICE' || reason.trim().length < 3} onClick={() => void reset()}>Confirm Practice reset</button></>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
