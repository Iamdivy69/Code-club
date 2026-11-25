import { PublicAnnouncement } from '../features/platform/OperationalSettings';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, BriefcaseBusiness, Code2, ListChecks, LogOut, Moon, Sun, Terminal, Trophy, UserRound, UsersRound } from 'lucide-react';
import { useSession } from './session';
import { useTheme } from './theme';
import { api, errorMessage } from './api';
import { AccountLinkForm } from './account-links';
import { GoogleResult, SignInMethods, type AuthOptions } from './google-account';
import { WorkspaceRoutes } from '../features/practice/WorkspaceRoutes';
import { NotificationLink } from '../features/platform/Notifications';
import { VerifyCertificate } from '../features/platform/Certifications';

const Solver = lazy(() => import('../features/practice/Solver'));

function Brand() {
  return <Link className="brand" to="/practice" aria-label="DSA V2 Practice"><img src="/practice.svg" alt="" width="38" height="38" /></Link>;
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return <button className="icon-button" onClick={toggle} title={label} aria-label={label}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="screen-status" role="status">Loading your workspace…</div>;
  if (!user) return <Navigate replace to="/login" state={{ next: location.pathname + location.search }} />;
  return children;
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setMessage('');
    try { await logout(); }
    catch { setMessage('Could not sign out. Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Practice tools">
        <Brand />
        <NavLink end to="/practice" className="rail-link" title="Practice Problems" aria-label="Practice Problems"><ListChecks size={20} /></NavLink>
        <NavLink to="/practice/dashboard" className="rail-link" title="Your practice" aria-label="Your practice"><Activity size={19} /></NavLink>
        <NavLink to="/practice/competitions" className="rail-link" title="Competitions" aria-label="Competitions"><Trophy size={19} /></NavLink>
        <NavLink to="/practice/placement" className="rail-link" title="Placement" aria-label="Placement"><BriefcaseBusiness size={19} /></NavLink>
        <NavLink to="/practice/community" className="rail-link" title="Community" aria-label="Community"><UsersRound size={19} /></NavLink>
        <NavLink to="/practice/compiler" className="rail-link" title="Compiler" aria-label="Compiler"><Terminal size={19} /></NavLink>
        <NotificationLink className="rail-link" compact />
        <div className="rail-end">
          <NavLink to="/account" className="rail-link" title="Sign-in methods" aria-label="Sign-in methods"><UserRound size={19} /></NavLink>
          <ThemeButton />
          <button className="icon-button" disabled={busy} onClick={() => void signOut()} aria-label="Sign out" title={user ? 'Sign out as ' + user.name : 'Sign out'}><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="shell-content">
        <PublicAnnouncement />
        {message && <div className="shell-message" role="alert">{message}</div>}
        {children}
      </div>
    </div>
  );
}

function AccountLayout({ children }: { children: ReactNode }) {
  return <div className="login-page">
    <header className="login-header"><Brand /><ThemeButton /></header>
    <main className="login-main"><div className="login-card">{children}</div></main>
  </div>;
}

function Login({ signup = false }: { signup?: boolean }) {
  const { user, loading, login } = useSession();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = location.state as { next?: string } | null;
  const next = state?.next && /^\/(practice(?:\/|\?|$)|solve\/)/.test(state.next) ? state.next : '/practice';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authOptions, setAuthOptions] = useState<AuthOptions>();
  const [verificationSent, setVerificationSent] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get<AuthOptions>('/auth/options', { signal: controller.signal })
      .then(({ data }) => setAuthOptions(data))
      .catch(() => { if (!controller.signal.aborted) setAuthOptions({ signupEnabled: false, accountEmailEnabled: false, googleEnabled: false }); });
    return () => controller.abort();
  }, []);
  if (signup && authOptions?.signupEnabled === false) return <Navigate replace to="/login" />;
  if (user) return <Navigate to={next} replace />;
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      const email = String(form.get('email')), password = String(form.get('password'));
      if (signup) {
        const { data } = await api.post<{ verificationRequired: boolean }>('/auth/signup', { name: form.get('name'), email, password, referral: params.get('ref') || undefined });
        if (data.verificationRequired) {
          setVerificationSent(true);
          return;
        }
      }
      await login(email, password);
    }
    catch (problem) { setError(errorMessage(problem, 'Sign in failed. Try again.')); }
    finally { setBusy(false); }
  }
  return (
    <AccountLayout>
      <Code2 className="accent" size={24} aria-hidden="true" />
      <h1>{signup ? 'Create a practice account' : 'Sign in to practice'}</h1>
      <p className="muted">Write solutions, run examples, and track your submissions.</p>
      <a className="inline-link" href="/practice-reading/">Read public problems</a>
      <GoogleResult />
      {verificationSent ? <p role="status">Check your inbox for a verification link.</p> : <form className="login-form" onSubmit={onSubmit}>
        {signup && <label>Name<input name="name" required minLength={2} maxLength={100} autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required autoComplete="username" placeholder="student@practice.test" /></label>
        <label>Password<input name="password" type="password" required minLength={signup ? 12 : undefined} autoComplete={signup ? "new-password" : "current-password"} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy || loading || (signup && authOptions?.signupEnabled !== true)} type="submit">{busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></button>
      </form>}
      {authOptions?.googleEnabled && !verificationSent && <a className="button login-option"
        href={api.getUri({ url: '/auth/google/start', params: { next, referral: params.get('ref') || undefined } })}>
        Continue with Google
      </a>}
      {(signup || authOptions?.signupEnabled) && <Link className="inline-link login-option" state={location.state} to={signup ? '/login' : '/signup'}>{signup ? 'Back to sign in' : 'Create a practice account'}</Link>}
      {authOptions?.accountEmailEnabled && (!signup || verificationSent) && <div className="inline-controls login-option">
        {!signup && <Link className="inline-link" to="/forgot-password">Forgot password?</Link>}
        <Link className="inline-link" to="/resend-verification">Resend verification email</Link>
      </div>}
    </AccountLayout>
  );
}

export function App() {
  return <Routes>
    <Route path="/" element={<Navigate replace to="/practice" />} />
    <Route path="/login" element={<Login key="login" />} />
    <Route path="/signup" element={<Login key="signup" signup />} />
    <Route path="/account" element={<SignedIn><Shell><SignInMethods /></Shell></SignedIn>} />
    <Route path="/verify-email" element={<AccountLayout><AccountLinkForm key="verify" mode="verify-email" /></AccountLayout>} />
    <Route path="/resend-verification" element={<AccountLayout><AccountLinkForm key="resend" mode="resend-verification" /></AccountLayout>} />
    <Route path="/forgot-password" element={<AccountLayout><AccountLinkForm key="forgot" mode="forgot-password" /></AccountLayout>} />
    <Route path="/reset-password" element={<AccountLayout><AccountLinkForm key="reset" mode="reset-password" /></AccountLayout>} />
    <Route path="/practice/*" element={<WorkspaceRoutes privatePage={(page) => <SignedIn><Shell>{page}</Shell></SignedIn>} />} />
    <Route path="/dashboard" element={<Navigate replace to="/practice/dashboard" />} />
    <Route path="/certifications" element={<Navigate replace to="/practice/certifications" />} />
    <Route path="/verify/:id" element={<VerifyCertificate />} />
    <Route path="/club" element={<Navigate replace to="/practice/competitions" />} />
    <Route path="/club/leaderboard" element={<Navigate replace to="/practice/leaderboard" />} />
    <Route path="/leaderboard" element={<Navigate replace to="/practice/leaderboard" />} />
    <Route path="/solve/:slug" element={<SignedIn><Shell><Suspense fallback={<div className="screen-status">Loading the editor…</div>}><Solver /></Suspense></Shell></SignedIn>} />
    <Route path="/student/practice" element={<Navigate replace to="/practice" />} />
    <Route path="/student/problems" element={<Navigate replace to="/practice" />} />
    <Route path="*" element={<main className="screen-status"><p>Page not found.</p><Link className="accent" to="/practice">Back to Practice Problems</Link></main>} />
  </Routes>;
}
