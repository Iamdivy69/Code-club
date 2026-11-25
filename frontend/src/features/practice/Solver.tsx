import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Check, Code2, FileText, FlaskConical, History, Play, RotateCcw, Send, Terminal } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';
import type { PracticeCase, PracticeLanguage, PracticeReflectionRating, ProblemDetail, RunResult, Submission, SubmissionDetail, SubmitResult } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useSession } from '../../app/session';
import { useTheme } from '../../app/theme';
import { DifficultyBadge } from './Catalogue';
import { SolverHints } from './SolverHints';
import { SubmissionReflection } from './SubmissionReflection';
import './monaco';

type Tab = 'problem' | 'code' | 'results';
type Attempt = { code: string; language: PracticeLanguage; key: string };

function fromStorage(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function useDesktop() {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const resize = () => setWide(list.matches);
    list.addEventListener('change', resize);
    return () => list.removeEventListener('change', resize);
  }, []);
  return wide;
}

function expectedLabel(test: PracticeCase) {
  return test.comparison === 'weighted-indices' ? 'Draw frequencies proportional to the weights' : test.expected;
}

function Statement({ problem }: { problem: ProblemDetail }) {
  return <div className="statement">
    <div className="problem-heading"><span className="muted eyebrow">{problem.topic}</span><DifficultyBadge difficulty={problem.difficulty} />{problem.status === 'SOLVED' && <span className="solved-label accepted"><Check size={15} />Solved</span>}</div>
    <h1>{problem.title}</h1>
    {!problem.contestOnly && <a className="inline-link" href={'/practice-reading/?slug=' + encodeURIComponent(problem.slug)} target="_blank" rel="noreferrer">Read public copy offline</a>}
    <p>{problem.description}</p>
    <h2>Examples</h2>
    {problem.cases.map((item) => <div className="example" key={item.index}>
      <strong>Case {item.index + 1}</strong>
      <div><span className="muted">Input</span><pre>{item.input}</pre></div>
      <div><span className="muted">Output</span><pre>{expectedLabel(item)}</pre></div>
    </div>)}
    <h2>Constraints</h2>
    <ul className="constraints">{problem.constraints.map((line) => <li key={line}>{line}</li>)}</ul>
    {problem.editorialLocked && <p className="muted">Solve this problem to unlock its editorial, or use an active Practice membership.</p>}
    {problem.editorial && <details className="hint"><summary>Editorial</summary><p>{problem.editorial}</p></details>}
    {problem.hints.map((hint, i) => <details className="hint" key={hint}><summary>Hint {i + 1}</summary><p>{hint}</p></details>)}
  </div>;
}

function Result({ run, submission, error, busy }: { run: RunResult | null; submission: Submission | null; error: string; busy: string | null }) {
  if (busy) return <p className="muted" role="status">{busy === 'submit' ? 'Grading submission…' : 'Running tests…'}</p>;
  if (error) return <p className="error" role="alert">{error}</p>;
  if (submission) return <div role="status">
    <strong className={submission.verdict === 'Accepted' ? 'accepted' : 'error'}>{submission.verdict}</strong>
    <p>{submission.passed} / {submission.total} tests passed.</p>
    {submission.diagnostic && <pre>{submission.diagnostic}</pre>}
    <p className="muted submission-metrics">{submission.runtimeMs !== null && <span>{submission.runtimeMs} ms</span>}{submission.memoryKb !== null && <span>{submission.memoryKb.toLocaleString()} KB</span>}</p>
  </div>;
  if (!run) return <p className="muted">Run your code to see example results here.</p>;
  if (run.compileFailed) return <><strong className="error">Compilation Error</strong><pre>{run.error}</pre></>;
  return <ul className="test-results">{run.results.map((item) => <li key={item.index}>
    <details open={!item.passed}>
      <summary><span>Case {item.index + 1}</span><span className={item.passed ? 'accepted' : 'error'}>{item.passed ? 'Passed' : 'Failed'}</span></summary>
      <div className="case-details"><span>Expected</span><code>{expectedLabel(item)}</code><span>Actual</span><code>{item.actual || 'No output'}</code></div>
      {item.error && <pre className="error">{item.error}</pre>}
    </details>
  </li>)}</ul>;
}

function Workspace({ initial }: { initial: ProblemDetail }) {
  const { user } = useSession();
  const { theme } = useTheme();
  const desktop = useDesktop();
  const [params] = useSearchParams();
  const competitionId = params.get('competition') ?? undefined;
  const assessmentId = params.get('assessment') ?? undefined;
  const draftRoot = 'practice:draft:' + user?.id + ':' + initial.id + ':';
  const [language, setLanguage] = useState<PracticeLanguage>(() => {
    const saved = fromStorage(draftRoot + 'selected', 'javascript');
    return initial.languages.find((choice) => choice.key === saved)?.key ?? initial.languages[0]?.key ?? 'javascript';
  });
  const languageInfo = initial.languages.find((choice) => choice.key === language);
  const starter = initial.starterCode[language] ?? '';
  const key = draftRoot + language;
  const [problem, setProblem] = useState(initial);
  const [code, setCode] = useState(() => fromStorage(key, starter));
  const [note, setNote] = useState(initial.note);
  const [studyMessage, setStudyMessage] = useState('');
  const [studyBusy, setStudyBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('problem');
  const [resultTab, setResultTab] = useState<'results' | 'custom' | 'history'>('results');
  const [testInput, setTestInput] = useState(initial.cases[0]?.input ?? '{}');
  const [testExpected, setTestExpected] = useState(initial.cases[0]?.expected ?? 'null');
  const [testError, setTestError] = useState('');
  const [run, setRun] = useState<RunResult | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<Submission[]>([]);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'run' | 'custom' | 'submit' | null>(null);
  const pending = useRef<Attempt | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ submissions: Submission[] }>('/practice/submissions', { params: { slug: initial.slug }, signal: controller.signal })
      .then(({ data }) => setHistory((current) => [...current, ...data.submissions.filter((x) => !current.some((y) => y.id === x.id))]))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(failure, 'Could not load submission history.'));
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [initial.slug]);

  function changeDraft(value: string) {
    setCode(value);
    try { localStorage.setItem(key, value); }
    catch { /* Keep the current editor usable when storage is disabled. */ }
  }

  function selectLanguage(value: PracticeLanguage) {
    setLanguage(value);
    setCode(fromStorage(draftRoot + value, initial.starterCode[value] ?? ''));
    setRun(null);
    setSubmission(null);
    setError('');
    try { localStorage.setItem(draftRoot + 'selected', value); } catch { /* The current selection is still applied. */ }
  }

  async function saveStudy(changes: { note?: string; saved?: boolean }) {
    setStudyBusy(true);
    setStudyMessage('');
    try {
      const { data } = await api.put<{ study: { note: string; saved: boolean } }>('/practice/study/problems/' + problem.slug, changes);
      setProblem((item) => ({ ...item, saved: data.study.saved }));
      setStudyMessage(changes.note !== undefined ? 'Note saved.' : data.study.saved ? 'Problem saved.' : 'Bookmark removed.');
    } catch (reason) { setStudyMessage(errorMessage(reason, 'Could not save your change.')); }
    finally { setStudyBusy(false); }
  }

  async function execute(action: 'run' | 'custom' | 'submit') {
    if (busy || !code.trim() || problem.executionPending) return;
    let testcases: Array<{ input: object; expectedOutput: unknown }> | undefined;
    if (action === 'custom') {
      setTestError('');
      try {
        const input: unknown = JSON.parse(testInput);
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          setTestError('Enter a JSON object with the problem’s parameter names.');
          return;
        }
        testcases = [{ input, expectedOutput: JSON.parse(testExpected) }];
      } catch {
        setTestError('Enter valid JSON in both fields.');
        return;
      }
    }
    setRun(null);
    setSubmission(null);
    setError('');
    setBusy(action);
    setResultTab('results');
    setTab('results');
    try {
      const body = { problemSlug: problem.slug, language, code };
      if (action !== 'submit') {
        const { data } = await api.post<RunResult>('/practice/judge/run', { ...body, testcases }, { timeout: 180_000 });
        setRun(data);
      } else {
        if (pending.current?.code !== code || pending.current.language !== language) pending.current = { code, language, key: crypto.randomUUID() };
        const { data } = await api.post<SubmitResult>('/practice/judge/submit', { ...body, requestKey: pending.current.key, competitionId, assessmentId }, { timeout: 180_000 });
        pending.current = null;
        setSubmission(data.submission);
        setProblem((value) => ({ ...value, status: data.solved ? 'SOLVED' : 'ATTEMPTED' }));
        setHistory((rows) => [data.submission, ...rows.filter((item) => item.id !== data.submission.id)].slice(0, 30));
      }
    } catch (failure) {
      setError(errorMessage(failure, 'Could not finish the request. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  function refreshRating(id: string, reflectionRating: PracticeReflectionRating) {
    setSubmission((current) => current?.id === id ? { ...current, reflectionRating } : current);
    setDetail((current) => current?.id === id ? { ...current, reflectionRating } : current);
    setHistory((rows) => rows.map((row) => row.id === id ? { ...row, reflectionRating } : row));
  }

  async function showSource(id: string) {
    if (detail?.id === id) { setDetail(null); return; }
    setHistoryError('');
    try {
      const { data } = await api.get<{ submission: SubmissionDetail }>('/practice/submissions/' + id);
      setDetail(data.submission);
    } catch (failure) {
      setHistoryError(errorMessage(failure, 'Could not open this submission.'));
    }
  }

  const statement = <div className="statement-pane"><Statement problem={problem} />
    {!assessmentId && <SolverHints key={problem.slug} slug={problem.slug} />}
    {!assessmentId && !competitionId && !problem.contestOnly && <div className="solver-mock-entry">
      <Link className="button" to={'/practice/interviews/start/' + encodeURIComponent(problem.slug)}>Mock interview</Link>
    </div>}
    {!problem.contestOnly && <section className="solver-note">
    <label htmlFor="personal-note">Your notes</label>
    <textarea id="personal-note" maxLength={10000} value={note} onChange={(event) => setNote(event.target.value)} />
    <button className="button" onClick={() => void saveStudy({ note })} disabled={studyBusy}>Save note</button>
    {studyMessage && <p className="muted" role="status">{studyMessage}</p>}
  </section>}</div>;
  const editor = <div className="editor-section">
    <div className="pane-toolbar"><span><Code2 size={17} /><select className="editor-language" aria-label="Editor language" value={language} disabled={Boolean(busy)} onChange={(event) => selectLanguage(event.target.value as PracticeLanguage)}>{problem.languages.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></span><button className="icon-button" aria-label="Reset draft" title="Reset draft" disabled={Boolean(busy)} onClick={() => { if (code === starter || confirm('Replace the current draft with the starter code?')) changeDraft(starter); }}><RotateCcw size={17} /></button></div>
    <div className="editor-container"><Editor height="100%" language={languageInfo?.editor ?? "javascript"} path={key} value={code} theme={theme === 'dark' ? 'vs-dark' : 'light'} onChange={(value) => changeDraft(value ?? '')} options={{ automaticLayout: true, minimap: { enabled: false }, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, tabSize: languageInfo?.indentSize ?? 2, padding: { top: 14 }, readOnly: Boolean(busy), ariaLabel: (languageInfo?.label ?? 'Code') + ' solution', scrollBeyondLastLine: false }} /></div>
  </div>;
  const output = <div className="result-section">
    <div className="pane-toolbar result-tabs" aria-label="Output views">
      <button aria-pressed={resultTab === 'results'} onClick={() => setResultTab('results')}><Terminal size={16} /> Results</button>
      <button aria-pressed={resultTab === 'custom'} onClick={() => setResultTab('custom')}><FlaskConical size={16} /> Custom test</button>
      <button aria-pressed={resultTab === 'history'} onClick={() => setResultTab('history')}><History size={16} /> Submissions</button>
    </div>
    <div className="result-body">
      {resultTab === 'results' ? <>
        <Result run={run} submission={submission} busy={busy} error={error} />
        {submission?.verdict === 'Accepted' && <SubmissionReflection key={submission.id} submission={submission} onSaved={refreshRating} />}
      </> : resultTab === 'custom' ?
        <form className="custom-test" onSubmit={(event) => { event.preventDefault(); void execute('custom'); }}>
          <div className="custom-test-fields">
            <label>Input (JSON object)<textarea rows={3} maxLength={30_000} disabled={Boolean(busy)} spellCheck={false} value={testInput} onChange={(event) => setTestInput(event.target.value)} /></label>
            <label>Expected output (JSON)<textarea rows={3} maxLength={30_000} disabled={Boolean(busy)} spellCheck={false} value={testExpected} onChange={(event) => setTestExpected(event.target.value)} /></label>
          </div>
          {testError && <p className="error" role="alert">{testError}</p>}
          <button type="submit" className="button" disabled={!code.trim() || Boolean(busy) || problem.executionPending}><Play size={16} />Run custom test</button>
        </form> : <>
        {historyError && <p className="error" role="alert">{historyError}</p>}
        {historyLoading ? <p className="muted" role="status">Loading history…</p> : history.length === 0 ? <p className="muted">Your submissions will appear here.</p> : <ul className="history-list">
          {history.map((item) => <li key={item.id}>
            <button onClick={() => void showSource(item.id)} aria-expanded={detail?.id === item.id}><span className={item.verdict === 'Accepted' ? 'accepted' : 'error'}>{item.verdict}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time><span>{item.passed}/{item.total}</span></button>
            {detail?.id === item.id && <>
              <pre>{detail.code}</pre>
              {detail.verdict === 'Accepted' && <SubmissionReflection key={detail.id} submission={detail} onSaved={refreshRating} />}
            </>}
          </li>)}
        </ul>}
      </>}
    </div>
  </div>;
  return <main className="solver">
    {problem.executionPending && <p className="shell-message" role="status">Read &amp; edit · Code execution is not available for this problem yet.</p>}
    <header className="solver-header">
      <Link className="back-link" to={competitionId ? '/practice/competitions/' + competitionId : assessmentId ? '/practice/placement' : '/practice'}><ArrowLeft size={18} /> <span>{competitionId ? 'Competition' : assessmentId ? 'Skills test' : 'Practice Problems'}</span></Link>
      <div className="solver-actions">
        {!problem.contestOnly && <button className="icon-button solver-bookmark" aria-label={problem.saved ? 'Remove bookmark' : 'Bookmark problem'} aria-pressed={problem.saved} disabled={studyBusy} onClick={() => void saveStudy({ saved: !problem.saved })}><Bookmark size={18} fill={problem.saved ? 'currentColor' : 'none'} /></button>}
        <button className="button" disabled={!code.trim() || Boolean(busy) || problem.executionPending} onClick={() => void execute('run')}><Play size={16} /> Run</button>
        <button className="button primary" disabled={!code.trim() || Boolean(busy) || problem.executionPending} onClick={() => void execute('submit')}><Send size={16} /> Submit</button>
      </div>
    </header>
    {desktop ? <Group orientation="horizontal" className="solver-panels">
      <Panel defaultSize="42%" minSize="24%">{statement}</Panel>
      <Separator className="resize-handle vertical" aria-label="Resize problem and code panes" />
      <Panel minSize="30%"><Group orientation="vertical">
        <Panel defaultSize="62%" minSize="28%">{editor}</Panel>
        <Separator className="resize-handle horizontal" aria-label="Resize editor and results" />
        <Panel minSize="20%">{output}</Panel>
      </Group></Panel>
    </Group> : <>
      <nav className="mobile-tabs" aria-label="Workspace panes">
        <button aria-pressed={tab === 'problem'} onClick={() => setTab('problem')}><FileText size={16} /> Problem</button>
        <button aria-pressed={tab === 'code'} onClick={() => setTab('code')}><Code2 size={16} /> Code</button>
        <button aria-pressed={tab === 'results'} onClick={() => setTab('results')}><Terminal size={16} /> Results</button>
      </nav>
      <div className="mobile-panels">
        <div hidden={tab !== 'problem'}>{statement}</div>
        <div hidden={tab !== 'code'}>{editor}</div>
        <div hidden={tab !== 'results'}>{output}</div>
      </div>
    </>}
  </main>;
}

export default function Solver({ initial }: { initial?: ProblemDetail }) {
  const { slug } = useParams();
  if (initial && initial.slug === slug) return <Workspace key={slug} initial={initial} />;
  return <LoadProblem key={slug} slug={slug ?? ''} />;
}

function LoadProblem({ slug }: { slug: string }) {
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ problem: ProblemDetail }>('/practice/problems/' + encodeURIComponent(slug), { signal: controller.signal })
      .then(({ data }) => setProblem(data.problem))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load the practice problem.')); });
    return () => controller.abort();
  }, [slug, retry]);
  if (error) return <main className="screen-status"><p role="alert">{error}</p><div className="inline-actions"><Link to="/practice">Back to Practice</Link><button className="button" onClick={() => { setError(''); setRetry((value) => value + 1); }}>Try again</button></div></main>;
  return problem ? <Workspace initial={problem} /> : <div className="screen-status" role="status">Loading problem…</div>;
}
