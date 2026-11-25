import { useEffect, useState } from 'react';
import { Bookmark, Check, ChevronRight, CircleDashed, Code2, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ProblemSummary } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';

export function DifficultyBadge({ difficulty }: { difficulty: ProblemSummary['difficulty'] }) {
  return <span className={'difficulty ' + difficulty.toLowerCase()}>{difficulty[0] + difficulty.slice(1).toLowerCase()}</span>;
}

export function Catalogue() {
  const [params, setParams] = useSearchParams();
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const search = params.get('q') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const state = params.get('status') ?? '';
  const savedOnly = params.get('saved') === '1';
  const topic = params.get('topic') ?? '';
  const language = params.get('language') ?? '';
  const availableLanguages = [...new Set(problems?.flatMap(problem => (problem as ProblemSummary & { languages?: string[] }).languages ?? []))].sort();
  const topics = [...new Set(problems?.map((problem) => problem.topic))];
  const solved = problems?.filter((item) => item.status === 'SOLVED').length;
  const results = problems?.filter((item) => (
    (item.title + ' ' + item.topic).toLowerCase().includes(search.trim().toLowerCase()) &&
    (!difficulty || item.difficulty === difficulty) &&
    (!state || item.status === state) && (!language || (item as ProblemSummary & { languages?: string[] }).languages?.includes(language)) && (!savedOnly || item.saved) && (!topic || item.topic === topic)
  ));

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ problems: ProblemSummary[] }>('/practice/problems', { signal: controller.signal }).then(({ data }) => {
      setProblems(data.problems);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load the problem catalogue.'));
    });
    return () => controller.abort();
  }, [retry]);

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <main className="catalogue">
      <header className="catalogue-header">
        <div>
          <h1>Practice Problems</h1>
          <p className="muted">Write solutions, run example cases, and submit when you’re ready.</p>
        </div>
        {problems && <div className="catalogue-progress"><Check size={17} /><span><strong>{solved}</strong> of {problems.length} solved</span></div>}
      </header>
      <div className="catalogue-filters">
        <label className="search"><Search size={18} aria-hidden="true" /><input aria-label="Search problems" placeholder="Search by title or topic" value={search} onChange={(event) => filter('q', event.target.value)} /></label>
        <select aria-label="Difficulty" value={difficulty} onChange={(event) => filter('difficulty', event.target.value)}><option value="">All difficulties</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select>
        <select aria-label="Topic" value={topic} onChange={(event) => filter('topic', event.target.value)}><option value="">All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Language" value={language} onChange={event => filter('language', event.target.value)}><option value="">All languages</option>{availableLanguages.map(key => <option key={key} value={key}>{({ javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', cpp: 'C++', c: 'C' } as Record<string, string>)[key] ?? key}</option>)}</select>
        <button className="button" aria-pressed={savedOnly} onClick={() => filter('saved', savedOnly ? '' : '1')}><Bookmark size={16} /> Saved</button>
        <select aria-label="Progress" value={state} onChange={(event) => filter('status', event.target.value)}><option value="">All progress</option><option value="NOT_STARTED">Not started</option><option value="ATTEMPTED">Attempted</option><option value="SOLVED">Solved</option></select>
      </div>
      {error ? <div className="empty-state"><p role="alert">{error}</p><button className="button" onClick={() => { setError(''); setRetry((n) => n + 1); }}>Try again</button></div> : !results ? <p className="empty-state" role="status">Loading problems…</p> : results.length ? (
        <ul className="problem-list">
          {results.map((item) => <li key={item.id}>
            <Link className="problem-row" to={'/practice/solve/' + encodeURIComponent(item.slug)}>
              <span className="problem-icon"><Code2 size={19} /></span>
              <span className="problem-name"><strong>{item.title}</strong><span className="muted">{item.topic}{item.executionPending ? " · Read & edit" : ""}</span></span>
              <DifficultyBadge difficulty={item.difficulty} />
              <span className="problem-status" aria-label={item.status === 'SOLVED' ? 'Solved' : item.status === 'ATTEMPTED' ? 'Attempted' : 'Not started'}>{item.status === 'SOLVED' ? <Check size={16} className="accepted" /> : <CircleDashed size={16} />}</span>
              <ChevronRight className="row-arrow" size={18} />
            </Link>
          </li>)}
        </ul>
      ) : <p className="empty-state">No problems match your filters.</p>}
    </main>
  );
}
