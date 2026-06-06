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
