import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import type { NotificationPage } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';
import { useResource } from './resource';

const inbox = '/practice/notifications';
const updated = 'practice-notifications-updated';
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function markRead(id?: string) {
  await api.post(inbox + (id ? '/' + id + '/read' : '/read-all'));
  window.dispatchEvent(new Event(updated));
}

export function NotificationLink({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let request: AbortController | undefined;
    function load() {
      if (document.visibilityState === 'hidden') return;
      request?.abort();
      const active = new AbortController();
      request = active;
      api.get<{ count: number }>(inbox + '/unread-count', { signal: active.signal })
        .then(({ data }) => { if (!active.signal.aborted) setCount(data.count); }).catch(() => {});
    }
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener(updated, load);
    document.addEventListener('visibilitychange', load);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener(updated, load);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  return <NavLink to={inbox} className={className} aria-label="Notifications" title={count ? count + ' unread notifications' : 'Notifications'}>
    <span className="notification-link">{compact ? <Bell size={19} /> : 'Notifications'}
      {count > 0 && <span className="notification-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </span>
  </NavLink>;
}

function InboxPage({ unread, cursors, setCursors }: { unread: boolean; cursors: string[]; setCursors(cursors: string[]): void }) {
  const before = cursors[cursors.length - 1];
  const feed = useResource<NotificationPage>(inbox + '?unread=' + unread + (before ? '&before=' + before : ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.addEventListener(updated, feed.reload);
    return () => window.removeEventListener(updated, feed.reload);
  }, [feed.reload]);

  async function read(id?: string) {
    setBusy(true);
    setError('');
    try { await markRead(id); }
    catch (reason) { setError(errorMessage(reason, 'Could not update notifications.')); }
    finally { setBusy(false); }
  }

  return <section className="feature-card" aria-label="Inbox">
    <div className="feature-row">
      <h2>Inbox</h2>
      <button type="button" className="button" onClick={() => void read()} disabled={busy}>Mark all as read</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {feed.error && <p className="error" role="alert">{feed.error}</p>}
    {!feed.data && !feed.error && <p role="status">Loading notifications…</p>}
    {feed.data?.notifications.length === 0 && <p className="muted">{unread ? 'You’re all caught up.' : 'You have no notifications here yet.'}</p>}
    {feed.data?.notifications.map((notice) => <article className="notification-entry" key={notice.id}>
      <div className="feature-row">
        <h3>{notice.title}</h3>
        {notice.readAt === null && <span className="muted">Unread</span>}
      </div>
      <p>{notice.message}</p>
      <time className="muted" dateTime={notice.createdAt}>{timestamp.format(new Date(notice.createdAt))}</time>
      <div className="inline-controls">
        <Link className="inline-link" to={notice.link} onClick={() => {
          if (notice.readAt === null) void markRead(notice.id).catch(() => {});
        }}>Open</Link>
        {notice.readAt === null && <button type="button" className="button" disabled={busy} onClick={() => void read(notice.id)}>Mark as read</button>}
      </div>
    </article>)}
    {(cursors.length > 0 || feed.data?.next) && <div className="inline-controls">
      <button type="button" className="button" disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))}>Newer</button>
      {feed.data?.next && <button type="button" className="button" onClick={() => setCursors([...cursors, feed.data!.next!])}>Older</button>}
    </div>}
  </section>;
}

export function Notifications() {
  const [unread, setUnread] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  function filter(next: boolean) { setUnread(next); setCursors([]); }
  return <main className="catalogue feature-page">
    <header className="catalogue-header"><div><h1>Notifications</h1></div></header>
    <nav className="feature-tabs" aria-label="Inbox filter">
      <button type="button" aria-pressed={!unread} onClick={() => filter(false)}>All</button>
      <button type="button" aria-pressed={unread} onClick={() => filter(true)}>Unread</button>
    </nav>
    <InboxPage key={String(unread) + ':' + cursors.length} unread={unread} cursors={cursors} setCursors={setCursors} />
  </main>;
}
