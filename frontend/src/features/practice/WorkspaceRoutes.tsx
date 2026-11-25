import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Community from '../platform/Community';
import { Notifications } from '../platform/Notifications';
import { LeaderboardView } from '../platform/Leaderboard';
import Competitions, { CompetitionDetail } from '../platform/Competitions';
import Placement from '../platform/Placement';
import Study, { PublicProfile } from '../platform/Study';
import Editions from '../platform/Editions';
import { CertificationsView, VerifyCertificate } from '../platform/Certifications';
import { Catalogue } from './Catalogue';
import { VerifyProfile } from '../platform/ProfileProof';
import PracticePlans from '../platform/PracticePlans';

const Compiler = lazy(() => import('./Compiler'));
const Solver = lazy(() => import('./Solver'));
const MockInterviews = lazy(() => import('./MockInterviews'));

function Loading({ children }: { children: string }) {
  return <div className="screen-status" role="status">{children}</div>;
}

type Props = {
  privatePage(page: ReactElement): ReactElement;
  publicPage?(page: ReactElement): ReactElement;
  legacyPage?: ReactElement;
  notFound?: ReactElement;
};

export function WorkspaceRoutes({ privatePage, publicPage = (page) => page, legacyPage, notFound }: Props) {
  return <Routes>
    <Route index element={privatePage(<Catalogue />)} />
    <Route path="dashboard" element={privatePage(<Study />)} />
    <Route path="editions" element={privatePage(<Editions />)} />
    <Route path="plans" element={privatePage(<PracticePlans />)} />
    <Route path="certifications" element={privatePage(<CertificationsView />)} />
    <Route path="leaderboard" element={privatePage(<LeaderboardView />)} />
    <Route path="compiler" element={privatePage(<Suspense fallback={<Loading>Loading the compiler…</Loading>}><Compiler /></Suspense>)} />
    <Route path="interviews/*" element={privatePage(<Suspense fallback={<Loading>Loading interviews…</Loading>}><MockInterviews /></Suspense>)} />
    <Route path="competitions" element={privatePage(<Competitions />)} />
    <Route path="competitions/:id" element={privatePage(<CompetitionDetail />)} />
    <Route path="placement" element={privatePage(<Placement />)} />
    <Route path="notifications" element={privatePage(<Notifications />)} />
    <Route path="community" element={privatePage(<Community />)} />
    <Route path="solve/:slug" element={privatePage(<Suspense fallback={<Loading>Loading the editor…</Loading>}><Solver /></Suspense>)} />
    <Route path="p/:handle" element={publicPage(<PublicProfile />)} />
    <Route path="verify/:id" element={publicPage(<VerifyCertificate />)} />
    <Route path="verify-profile/:id" element={publicPage(<VerifyProfile />)} />
    {legacyPage && <Route path="legacy" element={legacyPage} />}
    <Route path="*" element={notFound ?? publicPage(<main className="screen-status"><p>Page not found.</p><Link className="accent" to="/practice">Back to Practice Problems</Link></main>)} />
  </Routes>;
}
