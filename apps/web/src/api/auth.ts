import { api } from './client.js';

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

export const register = (username: string, password: string): Promise<AuthResult> =>
  api.post<AuthResult>('/auth/register', { username, password });

export const login = (username: string, password: string): Promise<AuthResult> =>
  api.post<AuthResult>('/auth/login', { username, password });

export const logout = (): Promise<{ ok: boolean }> => api.post<{ ok: boolean }>('/auth/logout');
