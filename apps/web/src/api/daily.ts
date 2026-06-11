import { api } from './client.js';

/** A foal whose coat was revealed this check-in — the Morning Post's headline moment. */
export interface MaturedFoal {
  id: string;
  name: string | null;
  coat: string;
}

/** A Living-Herd beat from the caught-up days (also in the Journal). */
export interface DigestBeat {
  day: number;
  text: string;
  glyph: string | null;
}

/** A quest that completed at this sunrise (rewards already granted server-side). */
export interface DigestQuest {
  questId: string;
  title: string;
  cubes: number;
}

/** A studbook goal fulfilled by this check-in's coat reveals (§7m, rewards granted). */
export interface StudbookBeat {
  goalId: string;
  title: string;
  cubes: number;
  horse: string | null;
  coat: string;
}

export interface DailyResult {
  daysAdvanced: number;
  cubesGained: number;
  jobCubes: number;
  groomCubes: number;
  matured: MaturedFoal[];
  journal: DigestBeat[];
  questCompletions: DigestQuest[];
  /** Studbook goals fulfilled by this check-in's reveals (§7m). */
  studbook: StudbookBeat[];
  /** Basic fertilizer the horses produced overnight (only for fed days — §7j). */
  fertilizer: number;
  day: number;
  nextRolloverMs: number;
}

/** Does this check-in carry anything worth a Morning Post? */
export const hasNews = (r: DailyResult): boolean => r.daysAdvanced > 0 || r.matured.length > 0;

export const checkIn = (): Promise<DailyResult> => api.post<DailyResult>('/daily');
