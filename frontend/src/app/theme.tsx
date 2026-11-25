import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';
const Context = createContext<{ theme: Theme; toggle(): void }>({ theme: 'dark', toggle() {} });

function initialTheme(): Theme {
  try {
    const saved = JSON.parse(localStorage.getItem('DSA_THEME') ?? 'null');
    return saved?.data === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('DSA_THEME', JSON.stringify({ _version: 1, data: theme })); }
    catch { /* The theme stays selected for this page when storage is disabled. */ }
  }, [theme]);
  return <Context.Provider value={{ theme, toggle: () => setTheme((value) => value === 'dark' ? 'light' : 'dark') }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
