import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from './api';
import { useSession } from './session';

export type AuthOptions = { signupEnabled: boolean; accountEmailEnabled: boolean; googleEnabled: boolean };

const messages: Record<string, string> = {
  'access-denied': 'This CodeClub account cannot use Google sign-in. Check your account access or sign in again.',
  'cancelled': 'Google sign-in was cancelled. You can try again.',
  'check-email': 'Check your inbox for a CodeClub verification link. Then continue with Google.',
  'conflict': 'This Google account or CodeClub account already has a connection.',
  'connect-first': 'Sign in with your existing CodeClub account, then open Sign-in methods to connect Google.',
  'email-mismatch': 'Choose a Google account with the same email address as your CodeClub account.',
  'expired': 'This Google sign-in request expired. Start a new request.',
  'failed': 'Google sign-in could not finish. Try again.',
  'linked': 'Google is connected to your CodeClub account.',
  'signup-disabled': 'New CodeClub accounts are currently closed.',
  'verification-unavailable': 'CodeClub email verification is unavailable. Try again later or use a Google-hosted email address.',
  'verify-first': 'Verify your CodeClub email before continuing with Google.',
};

export function GoogleResult() {
  const [params] = useSearchParams();
  const result = params.get('google') ?? '';
  if (!Object.hasOwn(messages, result)) return null;
  const success = ['check-email', 'linked'].includes(result);
  return <p className={success ? undefined : 'error'} role={success ? 'status' : 'alert'}>{messages[result]}</p>;
}

export function SignInMethods() {
  const { user } = useSession();
  const [state, setState] = useState<'loading' | 'unavailable' | 'connected' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const { data } = await api.get<AuthOptions>('/auth/options', { signal: controller.signal });
      if (!data.googleEnabled) {
        setState('unavailable');
        return;
      }
      const connection = await api.get<{ connected: boolean }>('/auth/google/connection', { signal: controller.signal });
      setState(connection.data.connected ? 'connected' : 'ready');
    }
    void load().catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ url: string }>('/auth/google/link');
      window.location.assign(data.url);
    } catch (problem) {
      setError(errorMessage(problem, 'Could not connect Google. Try again.'));
      setBusy(false);
    }
  }

  return <main className="login-main"><section className="login-card" aria-labelledby="sign-in-methods">
    <h1 id="sign-in-methods">Sign-in methods</h1>
    <p className="muted">{user?.email}</p>
    <GoogleResult />
    {state === 'loading' && <p role="status">Checking sign-in methods…</p>}
    {state === 'unavailable' && <p>Google sign-in is currently unavailable.</p>}
    {state === 'error' && <p role="alert">Could not load your sign-in methods. Reload to try again.</p>}
    {state === 'connected' && <p>Google is connected.</p>}
    {state === 'ready' && <>
      <p>Connect a Google account with the same email address.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button primary login-option" type="button" disabled={busy} onClick={() => void connect()}>
        {busy ? 'Opening Google…' : 'Connect Google'} <ArrowRight size={16} />
      </button>
    </>}
  </section></main>;
}
