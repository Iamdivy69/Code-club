import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../app/api';
import { useSession } from '../../app/session';
import type { PracticeMembership, PracticePlanCatalogue, PracticeGrantPlanId } from '../../../../shared/src/types/practice';
import { ActionForm } from './ActionForm';
import { useResource } from './resource';

const billing = '/practice/billing';
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type Grant = {
  id: string; plan: PracticeGrantPlanId; grantedAt: string; expiresAt: string | null;
  reason: string; revokedAt: string | null; revocationReason: string | null;
};
type Account = { userId: string; name: string; grants: Grant[] };
type Plan = PracticePlanCatalogue['plans'][number];

function MembershipAdmin({ plans }: { plans: Plan[] }) {
  const [account, setAccount] = useState<Account>();
  const [email, setEmail] = useState('');
  const pending = useRef<{ details: string; key: string }>(null);

  function grantLabel(plan: PracticeGrantPlanId) {
    return plan === 'ambassador_reward' ? 'Ambassador reward' : plans.find((item) => item.id === plan)?.label ?? plan;
  }

  async function load(address: string) {
    const response = await api.post<Account>(billing + '/admin/lookup', { email: address });
    setAccount(response.data);
    setEmail(address);
  }

  return <section className="feature-grid" aria-label="Membership administration">
    <ActionForm submit="Find account" action={async (form) => {
      setAccount(undefined);
      await load(String(form.get('email')).trim());
    }}>
      <h2>Membership administration</h2>
      <label>Account email<input name="email" type="email" required maxLength={254} /></label>
    </ActionForm>
    {account && <>
      <ActionForm key={account.userId} submit="Grant membership" action={async (form) => {
        const grant = { userId: account.userId, plan: form.get('plan'), reason: String(form.get('reason')).trim() };
        const details = JSON.stringify(grant);
        if (pending.current?.details !== details) pending.current = { details, key: crypto.randomUUID() };
        await api.post(billing + '/admin/grants', { ...grant, requestKey: pending.current.key });
        await load(email);
        pending.current = null;
      }}>
        <h2>Grant access to {account.name}</h2>
        <label>Plan<select name="plan">{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.label}</option>)}</select></label>
        <label>Reason<textarea name="reason" required minLength={3} maxLength={280} /></label>
      </ActionForm>
      <section className="feature-card">
        <h2>Grant history</h2>
        {!account.grants.length && <p className="muted">This account has no grants.</p>}
        {account.grants.map((grant) => <article className="playlist" key={grant.id}>
          <strong>{grantLabel(grant.plan)}</strong>
          <p>{grant.reason}</p>
          <p className="muted">{date.format(new Date(grant.grantedAt))} · {
            grant.revokedAt ? 'Revoked' : grant.expiresAt ? 'Expires ' + date.format(new Date(grant.expiresAt)) : 'Lifetime'
          }</p>
          {grant.revocationReason && <p>{grant.revocationReason}</p>}
        </article>)}
      </section>
      {account.grants.some((grant) => !grant.revokedAt) && <ActionForm submit="Revoke grant" action={async (form) => {
        await api.post(billing + '/admin/grants/' + form.get('grant') + '/revoke', { reason: form.get('reason') });
        await load(email);
      }}>
        <h2>Revoke access</h2>
        <label>Grant<select name="grant">{account.grants.filter((grant) => !grant.revokedAt).map((grant) =>
          <option value={grant.id} key={grant.id}>{(grantLabel(grant.plan)) + ' · ' + grant.reason}</option>)}</select></label>
        <label>Revocation reason<textarea name="reason" required minLength={3} maxLength={280} /></label>
      </ActionForm>}
    </>}
  </section>;
}

export default function PracticePlans() {
  const { user } = useSession();
  const catalogue = useResource<PracticePlanCatalogue>(billing + '/plans');
  const membership = useResource<PracticeMembership>(billing + '/membership');
  const plans = catalogue.data?.plans ?? [];
  const current = membership.data;
  const selected = plans.find((plan) => plan.id === current?.plan);
  return <main className="catalogue feature-page">
    <header className="catalogue-header">
      <div><h1>Practice plans</h1></div>
      <Link className="inline-link" to="/practice/dashboard?tab=profile">Back to profile</Link>
    </header>
    {(catalogue.error || membership.error) && <p className="error" role="alert">{catalogue.error || membership.error}</p>}
    {current && <section className="feature-card">
      <h2>{current.plan === 'ambassador_reward' ? 'Ambassador reward' : selected?.label ?? 'Free plan'}</h2>
      {current.expiresAt && <p>Access through {date.format(new Date(current.expiresAt))}.</p>}
      <p>{current.profilePdf.remaining === null ? 'Activity PDF downloads are unlimited.'
        : current.profilePdf.remaining === 0 ? 'You’ve used your free activity report this month.'
          : 'One free activity report is available this month.'}</p>
    </section>}
    {current && <section className="feature-card">
      <h2>Your learning benefits</h2>
      <ul>
        <li>{!current.enabled || current.plan !== 'free' ? 'Unlimited AI hints.' : 'Three AI hints per IST day.'}</li>
        <li>{!current.enabled || current.plan !== 'free' ? 'Read available editorials before solving.' : 'Solve a problem to unlock its editorial.'}</li>
        <li>{!current.enabled || current.plan !== 'free' ? 'Start timed mock interviews and request interviewer follow-ups.' : 'An active membership unlocks timed mock interviews and interviewer follow-ups.'}</li>
      </ul>
      <p className="muted">AI features are available when the coaching service is connected. Your saved interview transcripts remain available if your membership ends.</p>
    </section>}    {catalogue.data?.enabled && <section className="feature-card">
      <h2>Personal plans</h2>
      <p className="muted">Administrators manage plan access.</p>
      <div className="stat-grid">{plans.map((plan) => <article className="stat-card" key={plan.id}>
        <h3>{plan.label}</h3>
        <span>{plan.durationDays ? plan.durationDays + ' days of access' : 'Lifetime access'}</span>
      </article>)}</div>
    </section>}
    {user?.role === 'SUPER_ADMIN' && plans.length > 0 && <MembershipAdmin plans={plans} />}
  </main>;
}
