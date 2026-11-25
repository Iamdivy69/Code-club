import { useState } from 'react';
import { Code2 } from 'lucide-react';
import { api, errorMessage } from '../../app/api';
import { ActionForm } from './ActionForm';
import { useResource } from './resource';

const path = '/practice/admin/problems';
const template = {
  slug: 'example-problem', title: 'Example problem', topic: 'Arrays', difficulty: 'EASY',
  description: 'Return the first element of a nonempty array.', contestOnly: false,
  functionName: 'first', parameterOrder: ['values'],
  starters: { javascript: 'function first(values) {\n  // Write your solution.\n}' },
  visible: [{ input: { values: [1, 4] }, expected: 1 }], hidden: [{ input: { values: [8] }, expected: 8 }],
};

export function ProblemBankAdmin() {
  const bank = useResource<{ problems: Array<{ title: string; slug: string; topic: string; isPublished: boolean; contestOnly: boolean }> }>(path);
  const [message, setMessage] = useState('');
  async function publish(slug: string, published: boolean) {
    try { await api.put(path + '/' + encodeURIComponent(slug) + '/publish', { published }); bank.reload(); setMessage('Catalogue updated.'); }
    catch (error) { setMessage(errorMessage(error, 'Could not update publishing state.')); }
  }

  return <>
    <section className="feature-card">
      <h2><Code2 size={18} /> Problem catalogue</h2>
      {bank.data?.problems.map((row) => <div className="feature-row" key={row.slug}>
        <div><strong>{row.title}</strong><p className="muted">{row.topic} · {row.isPublished ? 'Published' : 'Draft'}{row.contestOnly ? ' · Contest only' : ''}</p></div>
        <button className="button" onClick={() => void publish(row.slug, !row.isPublished)}>{row.isPublished ? 'Unpublish' : 'Publish'}</button>
      </div>)}
      {(message || bank.error) && <p className="muted" role="status">{message || bank.error}</p>}
    </section>
    <ActionForm submit="Save as draft" onDone={bank.reload} action={async (form) => {
      let spec: unknown;
      try { spec = JSON.parse(String(form.get('spec'))); }
      catch { throw new SyntaxError('Enter valid problem JSON.'); }
      await api.post(path, spec);
    }}>
      <h2>Import a problem</h2>
      <p className="muted">Set contestOnly to true for a problem reserved for scheduled contests.</p>
      <label>Problem JSON<textarea name="spec" className="font-mono" rows={18} maxLength={350000} required defaultValue={JSON.stringify(template, null, 2)} /></label>
    </ActionForm>
  </>;
}
