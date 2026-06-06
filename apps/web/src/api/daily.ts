import { api } from './client.js';

export interface DailyResult {
  daysAdvanced: number;
  cubesGained: number;
  jobCubes: number;
  matured: string[];
  day: number;
  nextRolloverMs: number;
}

export const checkIn = (): Promise<DailyResult> => api.post<DailyResult>('/daily');

/** Dev-only (local): fast-forward the clock to exercise the tick. 403 in production. */
export const simulate = (days: number): Promise<DailyResult> =>
  api.post<DailyResult>('/daily/simulate', { days });
