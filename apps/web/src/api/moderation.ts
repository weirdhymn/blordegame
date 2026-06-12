import { api } from './client.js';

/** The Mod Desk (§7r) — queue, stats, freeze. All /mod calls are role-gated server-side. */
export interface ModReport {
  id: string;
  reporterHerd: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ModStats {
  users: number;
  herds: number;
  horses: number;
  openReports: number;
}

export const getModReports = (): Promise<ModReport[]> => api.get<ModReport[]>('/mod/reports');
export const getModStats = (): Promise<ModStats> => api.get<ModStats>('/mod/stats');
export const closeReport = (
  id: string,
  status: 'resolved' | 'dismissed',
): Promise<{ ok: boolean }> => api.post<{ ok: boolean }>(`/mod/reports/${id}/resolve`, { status });
export const freezeUser = (userId: string, frozen: boolean): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>(`/mod/users/${userId}/${frozen ? 'freeze' : 'unfreeze'}`);

/** Any player may file a report (rate-limited server-side). */
export const fileReport = (
  targetType: string,
  targetId: string,
  reason: string,
): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>('/report', { targetType, targetId, reason });
