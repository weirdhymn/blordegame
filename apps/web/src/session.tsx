import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getMe, logout as apiLogout, type Herd, type SessionUser } from './api/auth.js';
import type { DailyResult } from './api/daily.js';

interface SessionState {
  user: SessionUser | null;
  herd: Herd | null;
  loading: boolean;
  /** Re-fetch /me (e.g. after an action that changes Cubes). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Adopt a session from a register/login response without a round-trip. Login's daily
   *  catch-up digest rides along so the Pasture can show the Morning Post on arrival. */
  setSession: (user: SessionUser, herd: Herd, daily?: DailyResult) => void;
  /** Take (and clear) the digest the login carried — consumed once by the Pasture. */
  consumeDaily: () => DailyResult | null;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [herd, setHerd] = useState<Herd | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const me = await getMe();
      setUser(me.user);
      setHerd(me.herd);
    } catch {
      setUser(null);
      setHerd(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Clear local state regardless of the network result.
    }
    setUser(null);
    setHerd(null);
  }, []);

  // The login digest waits here (a ref: consume-once survives StrictMode's double effects).
  const pendingDaily = useRef<DailyResult | null>(null);

  const setSession = useCallback((u: SessionUser, h: Herd, daily?: DailyResult): void => {
    setUser(u);
    setHerd(h);
    if (daily) pendingDaily.current = daily;
    setLoading(false);
  }, []);

  const consumeDaily = useCallback((): DailyResult | null => {
    const d = pendingDaily.current;
    pendingDaily.current = null;
    return d;
  }, []);

  return (
    <SessionContext.Provider
      value={{ user, herd, loading, refresh, signOut, setSession, consumeDaily }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
