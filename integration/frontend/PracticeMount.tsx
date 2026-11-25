import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { isAxiosError } from 'axios';
import { Link, Navigate, NavLink, useLocation, useParams } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { Menu } from '@components/Menu';
import { useAuth } from '@features/auth/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { api, errorMessage } from './api';
import { WorkspaceRoutes } from '../features/practice/WorkspaceRoutes';
import { NotificationLink } from '../features/platform/Notifications';
import type { ProblemDetail } from '../../../shared/src/types/practice';
import './practice-host.css';

const Solver = lazy(() => import('../features/practice/Solver'));
const links = [
  ['/practice', 'Practice Problems'],
  ['/practice/dashboard', 'Your practice'],
  ['/practice/certifications', 'Certifications'],
  ['/practice/competitions', 'Competitions'],
  ['/practice/placement', 'Placement'],
  ['/practice/community', 'Community'],
  ['/practice/compiler', 'Compiler'],
] as const;

function useAvailability() {
  const [enabled, setEnabled] = useState<boolean>();
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ enabled: boolean }>('/practice/availability', { signal: controller.signal, timeout: 3000 })
      .then(({ data }) => { if (!controller.signal.aborted) setEnabled(data.enabled === true); })
      .catch(() => { if (!controller.signal.aborted) setEnabled(false); });
    return () => controller.abort();
  }, []);
  return enabled;
}

function Loading() {
  return <p className="p-6 text-center text-[var(--text-muted)]" role="status">Loading Practice…</p>;
}

function Shell({ children, tools = true }: { children: ReactElement; tools?: boolean }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const legacyAvailable = user?.role === 'STUDENT' || user?.role === 'TEACHER';
  return <div className="dsa-practice-host">
    <Menu currentLevel="Problems" onSelectLevel={() => {}} />
    <div className="dsa-practice-content">
      {tools && <div className="dsa-practice-mobile-tools">
        <Link to="/">DSA V2</Link>
        <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>}
      {tools && <nav className="dsa-practice-nav" aria-label="Practice tools">
        {links.map(([path, name]) => <NavLink key={path} to={path} end={path === '/practice'}>{name}</NavLink>)}
        <NotificationLink />
        {legacyAvailable && <Link to="/practice/legacy">Legacy problems</Link>}
        <Link to="/problems">3D Problem Arena</Link>
      </nav>}
      {children}
    </div>
  </div>;
}

type MountProps = {
  protect(page: ReactElement): ReactElement;
  legacy: ReactElement;
  notFound: ReactElement;
};

export function PracticeMount({ protect, legacy, notFound }: MountProps) {
  const enabled = useAvailability();
  const location = useLocation();
  if (enabled === undefined) return <Loading />;
  if (!enabled) return /^\/practice(?:\/legacy)?\/?$/.test(location.pathname) ? legacy : notFound;
  const tools = !location.pathname.startsWith('/practice/solve/');
  return <WorkspaceRoutes
    privatePage={(page) => protect(<Shell tools={tools}>{page}</Shell>)}
    publicPage={(page) => <div className="dsa-practice-content">{page}</div>}
    legacyPage={legacy}
    notFound={notFound}
  />;
}

export function PracticeCatalogueAlias({ legacy }: { legacy: ReactElement }) {
  const enabled = useAvailability();
  const { search, hash } = useLocation();
  if (enabled === undefined) return <Loading />;
  return enabled ? <Navigate replace to={{ pathname: '/practice', search, hash }} /> : legacy;
}

export function PracticeSolverAlias({ protect, legacy }: Omit<MountProps, 'notFound'>) {
  const enabled = useAvailability();
  const { slug } = useParams();
  if (enabled === undefined) return <Loading />;
  if (!enabled || !slug) return legacy;
  return protect(<ResolveSolver key={slug} slug={slug} legacy={legacy} />);
}

function ResolveSolver({ slug, legacy }: { slug: string; legacy: ReactElement }) {
  const [resolution, setResolution] = useState<ProblemDetail | 'legacy'>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ problem: ProblemDetail }>('/practice/problems/' + encodeURIComponent(slug), { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResolution(data.problem); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (isAxiosError(reason) && reason.response?.status === 404) setResolution('legacy');
        else setError(errorMessage(reason, 'Could not load the practice problem.'));
      });
    return () => controller.abort();
  }, [slug]);
  if (resolution === 'legacy') return legacy;
  if (error) return <Shell tools={false}><main className="screen-status">
    <p role="alert">{error}</p><Link className="accent" to="/practice">Back to Practice Problems</Link>
  </main></Shell>;
  if (!resolution) return <Loading />;
  return <Shell tools={false}><Suspense fallback={<Loading />}><Solver initial={resolution} /></Suspense></Shell>;
}
