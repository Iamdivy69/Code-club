import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { errorMessage } from '../../app/api';

export function ActionForm({ children, action, submit, onDone }: {
  children: ReactNode;
  action(form: FormData): Promise<void>;
  submit: string;
  onDone?(): void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    setBusy(true);
    try { await action(form); onDone?.(); setMessage('Saved.'); }
    catch (reason) { setMessage(errorMessage(reason, reason instanceof SyntaxError ? 'Enter valid JSON.' : 'The change could not be saved.')); }
    finally { setBusy(false); }
  }
  return <form className="feature-card feature-form" onSubmit={handle}>
    {children}
    <button className="button primary" disabled={busy}>{busy ? 'Saving…' : submit}</button>
    {message && <p className="muted" role="status">{message}</p>}
  </form>;
}
