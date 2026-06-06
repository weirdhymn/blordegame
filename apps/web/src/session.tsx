import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getMe, logout as apiLogout, type Herd, type SessionUser } from './api/auth.js';

interface SessionState {
  user: SessionUser | null;
  herd: Herd | null;
  loading: boolean;
  /** Re-fetch /me (e.g. after an action that changes Cubes). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Adopt a session from a register/login response without a round-trip. */
  setSession: (user: SessionUser, herd: Herd) => void;
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

  const setSession = useCallback((u: SessionUser, h: Herd): void => {
    setUser(u);
    setHerd(h);
    setLoading(false);
  }, []);

  return (
    <SessionContext.Provider value={{ user, herd, loading, refresh, signOut, setSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
