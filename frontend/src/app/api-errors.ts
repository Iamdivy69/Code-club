import axios from 'axios';

export function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: unknown }>(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}
