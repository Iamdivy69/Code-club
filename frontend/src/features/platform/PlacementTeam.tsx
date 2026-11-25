import { useState } from 'react';
import { Users } from 'lucide-react';
import { api, errorMessage } from '../../app/api';
import { ActionForm } from './ActionForm';
import { UniversityPicker } from './UniversityPicker';
import { useResource } from './resource';

const base = '/practice/placement/team';
type University = { id: string; name: string };
type Member = { id: string; name: string; email: string; isPrimary: boolean; eligible: boolean };
type Team = {
  university: University;
  member: boolean;
  canManage: boolean;
  canDesignate: boolean;
  primaryId: string | null;
  members: Member[];
};

function TeamPanel({ universityId }: { universityId?: string }) {
  const institution = universityId ? '?universityId=' + encodeURIComponent(universityId) : '';
  const team = useResource<Team>(base + institution);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const info = team.data;

  async function change(member: Member, transfer: boolean) {
    const prompt = transfer ? 'Make ' + member.name + ' the placement team lead?'
      : 'Remove ' + member.name + ' from the placement team?';
    if (!confirm(prompt)) return;
    setMessage('');
    setBusy(true);
    try {
      const memberPath = base + '/' + member.id;
      if (transfer) await api.post(memberPath + '/make-primary' + institution, { expectedPrimary: info?.primaryId });
      else await api.delete(memberPath + institution);
      team.reload();
      setMessage(transfer ? 'Team lead updated.' : 'Member removed.');
    } catch (reason) {
      setMessage(errorMessage(reason, 'Could not update the placement team.'));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="feature-card">
      <h2><Users size={19} /> Placement team</h2>
      {!info && !team.error && <p role="status">Loading placement team…</p>}
      {team.error && <p className="error" role="alert">{team.error}</p>}
      {info && <p className="muted">{info.university.name}</p>}
      {info && !info.member && <p>Your university’s placement team grants access to its cohorts.</p>}
      {info?.member && info.members.length === 0 && <p className="muted">This university has no placement team yet.</p>}
      {info?.members.map((member) => <div className="feature-row" key={member.id}>
        <div>
          <strong>{member.name}</strong>
          <p className="muted">{member.email}</p>
          <p className="muted">{member.isPrimary ? 'Team lead' : 'Team member'}{member.eligible ? '' : ' · Inactive'}</p>
        </div>
        {info.canManage && (!member.isPrimary || (universityId && info.members.length === 1)) && <div className="inline-controls">
          {!member.isPrimary && info.primaryId && member.eligible && <button className="button" type="button" disabled={busy}
            onClick={() => void change(member, true)}>Make lead</button>}
          <button className="button" type="button" disabled={busy} onClick={() => void change(member, false)}>Remove</button>
        </div>}
      </div>)}
      {message && <p role="status">{message}</p>}
    </section>
    {info?.canDesignate && <ActionForm key="designate" submit="Set team lead" onDone={team.reload} action={async (form) => {
      await api.post(base + '/primary' + institution, { email: form.get('email'), expectedPrimary: info.primaryId });
    }}>
      <h2>Set team lead</h2>
      <p className="muted">Choose a verified DSA teacher at this university.</p>
      <label>Lead’s email<input name="email" type="email" required maxLength={254} /></label>
    </ActionForm>}
    {info?.canManage && info.primaryId && <ActionForm key="invite" submit="Add team member" onDone={team.reload} action={async (form) => {
      await api.post(base + '/invite' + institution, { email: form.get('email') });
    }}>
      <h2>Add a teacher</h2>
      <label>Teacher’s email<input name="email" type="email" required maxLength={254} /></label>
    </ActionForm>}
  </>;
}

export function PlacementTeam({ admin }: { admin: boolean }) {
  return <div className="feature-grid">{admin ? <UniversityPicker render={(id) => <TeamPanel key={id} universityId={id} />} /> : <TeamPanel />}</div>;
}
