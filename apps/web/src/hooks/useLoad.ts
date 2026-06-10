import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';

export interface Load<T> {
  data: T | null;
  loading: boolean;
  /** A user-facing message — pages render it instead of silently showing an empty list. */
  error: string | null;
  /** Re-run the loader (after an action). Stale responses are dropped, never raced. */
  reload: () => void;
}

/**
 * Fetch-on-mount with loading/error state plus unmount + out-of-order guards (audit §11 — this
 * retires the silent `.catch(() => {})` pattern and the setState-after-unmount class in one move).
 * `load` must be referentially stable (wrap it in useCallback); it doubles as the dependency.
 */
export function useLoad<T>(load: () => Promise<T>): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A ticket per run: only the latest run may write state (covers unmount AND stale responses).
  const ticketRef = useRef(0);

  const reload = useCallback(() => {
    const ticket = ++ticketRef.current;
    setLoading(true);
    setError(null);
    load().then(
      (d) => {
        if (ticketRef.current !== ticket) return;
        setData(d);
        setLoading(false);
      },
      (e: unknown) => {
        if (ticketRef.current !== ticket) return;
        setError(e instanceof ApiError ? e.message : 'Could not load — try a reload.');
        setLoading(false);
      },
    );
  }, [load]);

  useEffect(() => {
    reload();
    return () => {
      ticketRef.current++; // invalidate in-flight runs on unmount/dep change
    };
  }, [reload]);

  return { data, loading, error, reload };
}
