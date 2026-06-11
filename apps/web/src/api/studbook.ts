import { api } from './client.js';

/** The Studbook (§7m) — read-only; goals fulfill themselves at the coat reveal. */
export interface StudbookGoalView {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  flavor: string;
  cubes: number;
  done: { horse: string | null; coat: string; completedAt: number } | null;
}

export interface FoundedLine {
  coat: string;
  count: number;
  firstId: string;
  firstName: string | null;
}

export interface StudbookView {
  goals: StudbookGoalView[];
  registry: FoundedLine[];
}

export const getStudbook = (): Promise<StudbookView> => api.get<StudbookView>('/studbook');
