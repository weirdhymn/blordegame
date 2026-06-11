import { api } from './client.js';
import type { DailyResult } from './daily.js';

export interface SessionUser {
  id: string;
  username: string;
  role?: string;
}

export interface Herd {
  id: string;
  name: string;
  cubes: number;
  level: number;
}

export interface AuthResult {
  user: SessionUser;
  herd: Herd;
}

export const getMe = (): Promise<AuthResult> => api.get<AuthResult>('/me');

export const register = (
  username: string,
  password: string,
  inviteCode?: string,
): Promise<AuthResult> =>
  api.post<AuthResult>('/auth/register', { username, password, inviteCode });

/** Login also performs the daily catch-up server-side and returns the digest (§8.2) — the
 *  session provider carries it to the Pasture so the Morning Post can greet the player. */
export const login = (
  username: string,
  password: string,
): Promise<AuthResult & { daily?: DailyResult }> =>
  api.post<AuthResult & { daily?: DailyResult }>('/auth/login', { username, password });

export const logout = (): Promise<{ ok: boolean }> => api.post<{ ok: boolean }>('/auth/logout');
