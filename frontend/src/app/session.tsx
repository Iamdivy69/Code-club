import { clearReadingStorage } from '../features/practice/reading-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../../../shared/src/types/practice';
import { api, refreshSession, saveToken } from './api';

type Session = {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  clearSession(): void;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const expired = () => { setUser(null); void clearReadingStorage().catch(() => { /* Storage may be disabled by this browser. */ }); };
    window.addEventListener('practice-session-expired', expired);
    refreshSession().then((next) => { if (active) setUser(next); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener('practice-session-expired', expired); };
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post<{ user: SessionUser; accessToken: string }>('/auth/login', { email, password });
    await clearReadingStorage().catch(() => { /* Public cache cleanup must not block sign-in. */ });
    saveToken(data.accessToken);
    setUser(data.user);
  }

  function clearSession() {
    void clearReadingStorage().catch(() => { /* Storage may be disabled by this browser. */ });
    saveToken(null);
    setUser(null);
  }

  async function logout() {
    await api.post('/auth/logout');
    clearSession();
  }
  return <Context.Provider value={{ user, loading, login, logout, clearSession }}>{children}</Context.Provider>;
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider is required.');
  return context;
}
