import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../app/api';

export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get<T>(path, { signal: controller.signal }).then((response) => { setData(response.data); setError(''); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load this page.')); });
    return () => controller.abort();
  }, [path, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data, error, reload };
}

export const slugUrl = (slug: string) => '/practice/solve/' + encodeURIComponent(slug);
