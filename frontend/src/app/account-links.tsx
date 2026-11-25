import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from './api';
import { useSession } from './session';

type Mode = 'verify-email' | 'resend-verification' | 'forgot-password' | 'reset-password';
const labels = {
  'verify-email': { title: 'Verify your email', button: 'Verify email', result: 'Email verified. You can sign in.' },
  'resend-verification': { title: 'Request a verification email', button: 'Send verification email',
    result: 'If the account still needs verification, check its inbox for a link.' },
  'forgot-password': { title: 'Forgot your password?', button: 'Send reset link',
    result: 'If the account can be recovered, check its inbox for a reset link.' },
  'reset-password': { title: 'Choose a new password', button: 'Reset password', result: 'Password updated. Sign in with your new password.' },
} as const;

export function AccountLinkForm({ mode }: { mode: Mode }) {
  const { clearSession } = useSession();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [availability, setAvailability] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const needsEmail = mode === 'resend-verification' || mode === 'forgot-password';
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const { title, button, result } = labels[mode];
  const requestPath = mode === 'verify-email' ? '/resend-verification' : '/forgot-password';

  useEffect(() => {
    if (!needsEmail) return;
    const controller = new AbortController();
    api.get<{ accountEmailEnabled: boolean }>('/auth/options', { signal: controller.signal })
      .then(({ data }) => setAvailability(data.accountEmailEnabled))
      .catch(() => { if (!controller.signal.aborted) setAvailability(false); });
    return () => controller.abort();
  }, [needsEmail]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (needsEmail) await api.post('/auth/' + mode, { email: fields.get('email') });
      else if (mode === 'reset-password') {
        const newPassword = String(fields.get('password'));
        if (newPassword !== fields.get('confirmation')) {
          setError('The passwords must match.');
          return;
        }
        await api.post('/auth/reset-password', { token, newPassword });
        clearSession();
      } else await api.post('/auth/verify-email', { token });
      if (!needsEmail) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      setDone(true);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not complete this request. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1>{title}</h1>
    {done ? <p role="status">{result}</p> : needsEmail && availability === false
      ? <p className="muted" role="status">Account email is currently unavailable.</p>
      : !needsEmail && !validToken ? <p className="error" role="alert">This link is invalid. Request a new email.</p>
        : <form className="login-form" onSubmit={onSubmit}>
          {needsEmail && <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
          {mode === 'reset-password' && <>
            <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
            <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
          </>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary" type="submit" disabled={busy || (needsEmail && availability !== true)}>{busy ? 'Working…' : button}</button>
        </form>}
    {!needsEmail && !done && (!validToken || error) &&
      <Link className="inline-link login-option" to={requestPath}>Request a new email</Link>}
    <Link className="inline-link login-option" to="/login">Back to sign in</Link>
  </>;
}
