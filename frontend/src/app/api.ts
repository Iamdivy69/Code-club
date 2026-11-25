import axios from 'axios';
import type { SessionUser } from '../../../shared/src/types/practice';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

type AuthResponse = { user: SessionUser; accessToken: string };
let accessToken: string | null = null;
let refreshInFlight: Promise<SessionUser> | null = null;

export function saveToken(token: string | null) { accessToken = token; }

export function refreshSession(): Promise<SessionUser> {
  refreshInFlight ??= api.post<AuthResponse>('/auth/refresh').then(({ data }) => {
    saveToken(data.accessToken);
    return data.user;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

api.interceptors.request.use((request) => {
  if (accessToken) request.headers.set('Authorization', 'Bearer ' + accessToken);
  return request;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) throw error;
  const request = error.config as typeof error.config & { refreshed?: boolean };
  if (request.refreshed || request.url?.startsWith('/auth/')) throw error;
  request.refreshed = true;
  try {
    await refreshSession();
  } catch {
    saveToken(null);
    window.dispatchEvent(new Event('practice-session-expired'));
    throw new Error('Your session expired. Sign in to continue.');
  }
  return api.request(request);
});

export { errorMessage } from './api-errors';
