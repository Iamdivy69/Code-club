import { useEffect, useState, type FormEvent } from 'react';
import { Code2, Play } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { CompilerResult, LanguageChoice, PracticeLanguage } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useTheme } from '../../app/theme';
import './monaco';

const templates: Record<PracticeLanguage, string> = {
  javascript: 'console.log("Hello, world!");\n',
  typescript: 'const message: string = "Hello, world!";\nconsole.log(message);\n',
  python: 'print("Hello, world!")\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!\\n";\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    puts("Hello, world!");\n    return 0;\n}\n',
};

export default function Compiler() {
  const { theme } = useTheme();
  const [languages, setLanguages] = useState<LanguageChoice[]>([]);
  const [language, setLanguage] = useState<PracticeLanguage>('javascript');
  const [drafts, setDrafts] = useState<Partial<Record<PracticeLanguage, string>>>({});
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ languages: LanguageChoice[] }>('/practice/languages', { signal: controller.signal })
      .then(({ data }) => setLanguages(data.languages))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load compiler languages.'));
      });
    return () => controller.abort();
  }, []);

  const choice = languages.find((item) => item.key === language);
  const code = drafts[language] ?? templates[language];
  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !choice || !code.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post<CompilerResult>('/practice/compiler/run', { language, code, stdin }, { timeout: 100_000 });
      setResult(data);
    } catch (failure) {
      setError(errorMessage(failure, 'Could not run your program. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return <main className="catalogue feature-page compiler-page">
    <header className="catalogue-header"><h1>Compiler</h1></header>
    <form className="compiler-grid" onSubmit={run}>
      <section className="editor-section compiler-editor" aria-label="Code editor">
        <div className="pane-toolbar">
          <span><Code2 size={17} aria-hidden="true" /><select className="editor-language" aria-label="Compiler language" disabled={busy || !languages.length} value={language} onChange={(event) => {
            setLanguage(event.target.value as PracticeLanguage);
            setResult(null);
            setError('');
          }}>
            {languages.length ? languages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>) : <option value="javascript">JavaScript</option>}
          </select></span>
          <button className="button primary" type="submit" disabled={!choice || busy || !code.trim()}><Play size={16} />Run code</button>
        </div>
        <div className="editor-container">
          <Editor height="100%" language={choice?.editor ?? 'javascript'} path={'compiler:' + language} value={code}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={(value) => setDrafts((items) => ({ ...items, [language]: value ?? '' }))}
            options={{ automaticLayout: true, minimap: { enabled: false }, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, tabSize: choice?.indentSize ?? 2, padding: { top: 14 }, readOnly: busy, ariaLabel: 'Program source', scrollBeyondLastLine: false }} />
        </div>
      </section>
      <div className="compiler-console">
        <section className="feature-card compiler-input">
          <label htmlFor="compiler-stdin">Standard input</label>
          <textarea id="compiler-stdin" spellCheck={false} rows={5} maxLength={20_000} disabled={busy} value={stdin} onChange={(event) => setStdin(event.target.value)} />
        </section>
        <section className="feature-card compiler-output" aria-labelledby="compiler-output-title">
          <h2 id="compiler-output-title">Output</h2>
          {busy && <p className="muted" role="status">Running program…</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {result && <>
            <div className="compiler-status" role="status">
              <strong className={result.status === 'Finished' ? 'accepted' : 'error'}>{result.status}</strong>
              {result.time !== null && <span className="muted">{Math.round(result.time * 1000)} ms</span>}
              {result.memory !== null && <span className="muted">{result.memory.toLocaleString()} KB</span>}
            </div>
            {(result.stdout || result.status === 'Finished') && <pre aria-label="Standard output">{result.stdout || 'No output'}</pre>}
            {result.stderr && <><h3>Standard error</h3><pre>{result.stderr}</pre></>}
            {result.compileOutput && <><h3>Compiler diagnostics</h3><pre>{result.compileOutput}</pre></>}
            {result.truncated && <p className="muted">Output exceeded the display limit.</p>}
          </>}
          {!busy && !result && !error && <p className="muted">Run code to see its output.</p>}
        </section>
      </div>
    </form>
  </main>;
}
