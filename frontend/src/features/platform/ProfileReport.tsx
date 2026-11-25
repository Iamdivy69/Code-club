import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, errorMessage } from '../../app/api';
import type { ProfileActivityReport } from '../../../../shared/src/types/practice';

export function ProfileReport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef<string | null>(null);

  async function download() {
    setBusy(true);
    setError('');
    try {
      const { downloadProfileReport } = await import('./profile-report-pdf');
      requestKey.current ??= crypto.randomUUID();
      const { data } = await api.post<ProfileActivityReport>('/practice/study/profile/report', { requestKey: requestKey.current });
      await downloadProfileReport(data);
      requestKey.current = null;
    } catch (reason) {
      setError(errorMessage(reason, 'Could not download the activity report.'));
    } finally {
      setBusy(false);
    }
  }

  return <fieldset className="hiring-preferences">
    <legend>Practice activity</legend>
    <button className="button" type="button" disabled={busy} onClick={() => void download()}>
      <Download size={16} /> {busy ? 'Preparing PDF…' : 'Download activity report'}
    </button>
    <Link className="inline-link" to="/practice/plans">Practice plans</Link>
    {error && <p className="error" role="alert">{error}</p>}
  </fieldset>;
}
