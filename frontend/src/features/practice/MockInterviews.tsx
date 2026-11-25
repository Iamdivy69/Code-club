import { useEffect, useRef, useState, type FormEvent } from 'react';
import Editor from '@monaco-editor/react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import type { MockInterview, MockInterviewList, PracticeLanguage, ProblemDetail } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useSession } from '../../app/session';
import { useTheme } from '../../app/theme';
import { slugUrl, useResource } from '../platform/resource';
import './monaco';

const base = '/practice/interviews';
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatTime(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function InterviewHistory() {
  const { data, error } = useResource<MockInterviewList>(base);
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><h1>Mock interviews</h1><Link className="inline-link" to="/practice">Practice Problems</Link></header>
    {error && <p role="alert" className="error">{error}</p>}
    {data && <section className="feature-card">
      <h2>Your interviews</h2>
      {!data.sessions.length && <p className="muted">Choose a Practice problem to start an interview.</p>}
      {data.sessions.map((item) => <article className="feature-row" key={item.id}>
        <div><Link className="inline-link" to={base + '/' + item.id}>{item.title}</Link>
          <p className="muted">{date.format(new Date(item.startedAt))} · {item.status.toLowerCase()}</p>
        </div>
        <span>{item.questions} {item.questions === 1 ? 'question' : 'questions'}</span>
      </article>)}
    </section>}
  </main>;
}

function StartInterview({ slug }: { slug: string }) {
  const { data, error } = useResource<MockInterviewList>(base);
  const exercise = useResource<{ problem: ProblemDetail }>('/practice/problems/' + encodeURIComponent(slug));
  const problem = exercise.data?.problem;
  const navigate = useNavigate();
  const requestKey = useRef('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const active = data?.sessions.find((item) => item.status === 'ACTIVE');

  async function start() {
    setBusy(true);
    setFailure('');
    try {
      requestKey.current ||= crypto.randomUUID();
      const { data } = await api.post<MockInterview>(base + '/start', { slug, requestKey: requestKey.current });
      navigate(base + '/' + data.id);
    } catch (reason) {
      setFailure(errorMessage(reason, 'Could not start the interview.'));
    } finally { setBusy(false); }
  }

  return <main className="catalogue feature-page">
    <header className="catalogue-header"><h1>Mock interview</h1><Link className="inline-link" to={base}>Interview history</Link></header>
    <section className="feature-card">
      <h2>{problem?.title ?? 'Start an interview'}</h2>
      <p>Explain your approach, write a solution, and answer follow-up questions in a 45-minute session.</p>
      {active ? <Link className="button primary" to={base + '/' + active.id}>Resume active interview</Link> : <>
        {data && !data.enabled && <p className="muted">Mock interviews need a configured coaching provider.</p>}
        {data && !data.eligible && <p className="muted">An active Practice membership is required.</p>}
        {problem?.contestOnly && <p className="muted">Choose a public Practice problem for a mock interview.</p>}
        <button className="button primary" type="button" disabled={busy || !data?.eligible || !data.enabled || !problem || Boolean(problem.contestOnly)}
          onClick={() => void start()}>Start 45-minute interview</button>
      </>}
      {(failure || error || exercise.error) && <p role="alert" className="error">{failure || error || exercise.error}</p>}
      <Link className="inline-link" to={slugUrl(slug)}>Back to problem</Link>
    </section>
  </main>;
}

function draft(key: string, alternative: string) {
  try { return localStorage.getItem(key) ?? alternative; }
  catch { return alternative; }
}

function InterviewRoom({ session, reload }: { session: MockInterview; reload(): void }) {
  const { theme } = useTheme();
  const { user } = useSession();
  const draftPrefix = 'practice:interview:' + user?.id + ':' + session.id + ':';
  const [language, setLanguage] = useState<PracticeLanguage>(() => {
    const saved = draft(draftPrefix + 'language', '');
    return session.problem.languages.find((item) => item.key === saved)?.key ?? session.problem.languages[0]!.key;
  });
  const [code, setCode] = useState(() => draft(draftPrefix + language, session.problem.starterCode[language] ?? ''));
  const [answer, setAnswer] = useState('');
  const [shareCode, setShareCode] = useState(false);
  const [operation, setOperation] = useState<'answer' | 'finish' | null>(null);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(() => Date.parse(session.expiresAt) - Date.parse(session.serverNow));
  const pendingAnswer = useRef<{ key: string; data: string } | null>(null);
  const languageChoice = session.problem.languages.find((item) => item.key === language);
  const expired = session.status === 'EXPIRED' || (session.status === 'ACTIVE' && remaining <= 0);
  const active = session.status === 'ACTIVE' && !expired;

  useEffect(() => {
    if (session.status !== 'ACTIVE') return;
    const receivedAt = performance.now();
    const initial = Date.parse(session.expiresAt) - Date.parse(session.serverNow);
    const update = () => {
      const left = Math.max(0, initial - (performance.now() - receivedAt));
      setRemaining(left);
      if (!left) window.clearInterval(timer);
    };
    const timer = window.setInterval(update, 500);
    update();
    return () => window.clearInterval(timer);
  }, [session.expiresAt, session.serverNow, session.status]);

  function saveDraft(value: string) {
    setCode(value);
    try { localStorage.setItem(draftPrefix + language, value); } catch { /* Keep the editor usable without storage. */ }
  }

  function changeLanguage(value: PracticeLanguage) {
    setLanguage(value);
    setCode(draft(draftPrefix + value, session.problem.starterCode[value] ?? ''));
    try { localStorage.setItem(draftPrefix + 'language', value); } catch { /* Keep the language selection in this session. */ }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation || !active || !answer.trim()) return;
    if (shareCode && code.length > 20_000) { setError('Use up to 20,000 characters when sharing code.'); return; }
    const input = { answer: answer.trim(), ...(shareCode && { currentCode: code, language }) };
    const data = JSON.stringify(input);
    if (pendingAnswer.current?.data !== data) pendingAnswer.current = { key: crypto.randomUUID(), data };
    setOperation('answer');
    setError('');
    try {
      await api.post(base + '/' + session.id + '/answer', { ...input, requestKey: pendingAnswer.current.key }, { timeout: 55_000 });
      pendingAnswer.current = null;
      setAnswer('');
    } catch (reason) {
      setError(errorMessage(reason, 'Could not get a follow-up.'));
    } finally {
      reload();
      setOperation(null);
    }
  }

  async function finish() {
    if (operation || !active || !window.confirm('End this interview and save the summary?')) return;
    setOperation('finish');
    setError('');
    try {
      await api.post(base + '/' + session.id + '/finish');
      reload();
    } catch (reason) { setError(errorMessage(reason, 'Could not finish the interview.')); }
    finally { setOperation(null); }
  }

  return <main className="catalogue feature-page">
    <header className="catalogue-header">
      <div><h1>{session.title}</h1><p className="muted">Mock interview · {session.difficulty.toLowerCase()}</p></div>
      <Link className="inline-link" to={base}>Interview history</Link>
    </header>
    {active ? <>
      <section className="feature-card">
        <div className="feature-row">
          <div><strong>Time remaining</strong><p className={remaining <= 300_000 ? 'error' : 'muted'} aria-label="Time remaining">{formatTime(remaining)}</p></div>
          <button className="button" type="button" disabled={Boolean(operation)} onClick={() => void finish()}>End interview</button>
        </div>
        <details className="analytics-details">
          <summary>Problem statement</summary>
          <p>{session.problem.description}</p>
          {!!session.problem.constraints.length && <ul>{session.problem.constraints.map((line, index) => <li key={index}>{line}</li>)}</ul>}
          {session.problem.cases.map((item) => <div className="example" key={item.index}>
            <strong>Example {item.index + 1}</strong><p>Input</p><pre>{item.input}</pre>
            <p>Expected output</p><pre>{item.comparison === 'weighted-indices' ? 'Draw frequencies proportional to the weights' : item.expected}</pre>
          </div>)}
        </details>
      </section>
      <div className="feature-grid interview-workspace">
        <section className="feature-card">
          <h2>Code editor</h2>
          <label className="feature-form">Interview language<select value={language} onChange={(event) => changeLanguage(event.target.value as PracticeLanguage)}>
            {session.problem.languages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
          <div className="interview-editor">
            <Editor height="100%" path={draftPrefix + language} language={languageChoice?.editor ?? 'javascript'}
              value={code} theme={theme === 'dark' ? 'vs-dark' : 'light'} onChange={(value) => saveDraft(value ?? '')}
              options={{ automaticLayout: true, minimap: { enabled: false }, fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
                tabSize: languageChoice?.indentSize, ariaLabel: 'Interview solution', scrollBeyondLastLine: false }} />
          </div>
        </section>
        <section className="feature-card">
          <h2>AI interviewer</h2>
          <div className="interview-transcript" aria-live="polite">
            {!session.turns.length || session.turns[0]?.position === 1 ? <div><strong>Interviewer</strong><p>How would you approach this problem?</p></div> : null}
            {session.turns.map((turn) => <div className="interview-exchange" key={turn.position}>
              <div><strong>You</strong><p>{turn.answer}</p></div>
              <div><strong>Interviewer</strong><p>{turn.question}</p></div>
            </div>)}
          </div>
          <form className="feature-form" onSubmit={(event) => void submitAnswer(event)}>
            <label>Your answer<textarea value={answer} maxLength={4000} rows={4} onChange={(event) => setAnswer(event.target.value)}
              disabled={Boolean(operation)} required /></label>
            <label className="check-label"><input type="checkbox" checked={shareCode} onChange={(event) => setShareCode(event.target.checked)}
              disabled={Boolean(operation)} /> Include current code</label>
            <p className="muted">Your answer and any code you include go to the coaching provider. Answers and follow-up questions are saved in your transcript.</p>
            <button type="submit" className="button primary" disabled={Boolean(operation) || !answer.trim()}>
              {operation === 'answer' ? 'Waiting for follow-up…' : 'Send answer'}
            </button>
          </form>
        </section>
      </div>
    </> : <section className="feature-card">
      <h2>{expired ? 'Interview time expired' : 'Interview complete'}</h2>
      <p>{session.questions} {session.questions === 1 ? 'question' : 'questions'} · {formatTime(expired ? Date.parse(session.expiresAt) - Date.parse(session.startedAt) : session.usedMs)} used</p>
      <Link className="inline-link" to={slugUrl(session.slug)}>Back to problem</Link>
      {!!session.turns.length && <details className="analytics-details">
        <summary>View transcript</summary>
        <div className="interview-transcript">{session.turns.map((turn) => <div className="interview-exchange" key={turn.position}>
          <div><strong>You</strong><p>{turn.answer}</p></div>
          <div><strong>Interviewer</strong><p>{turn.question}</p></div>
        </div>)}</div>
      </details>}
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}

function SavedInterview({ id }: { id: string }) {
  const { data, error, reload } = useResource<MockInterview>(base + '/' + encodeURIComponent(id));
  if (!data || error) return <main className="catalogue feature-page">
    {error ? <p className="error" role="alert">{error}</p> : <p role="status">Loading interview…</p>}
    <Link className="inline-link" to={base}>Interview history</Link>
  </main>;
  return <InterviewRoom key={data.id} session={data} reload={reload} />;
}

function StartRoute() {
  const { slug = '' } = useParams();
  return <StartInterview key={slug} slug={slug} />;
}

function SavedRoute() {
  const { id = '' } = useParams();
  return <SavedInterview key={id} id={id} />;
}

export default function MockInterviews() {
  return <Routes>
    <Route index element={<InterviewHistory />} />
    <Route path="start/:slug" element={<StartRoute />} />
    <Route path=":id" element={<SavedRoute />} />
  </Routes>;
}
