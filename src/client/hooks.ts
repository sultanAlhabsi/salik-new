import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { LoadState } from './types';

export function useApiResource<T>(path: string) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'success', data: await api<T>(path) });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : 'Request failed' });
    }
  }, [path]);

  useEffect(() => {
    let active = true;
    api<T>(path)
      .then((data) => {
        if (active) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', error: error instanceof Error ? error.message : 'Request failed' });
      });
    return () => {
      active = false;
    };
  }, [path]);

  return { state, reload };
}
