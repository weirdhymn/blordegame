import { api } from './client.js';

export interface JournalEvent {
  id: string;
  day: number;
  kind: string;
  text: string;
  glyph: string | null;
  createdAt: string;
}

export interface FieldGuide {
  discovered: { slug: string; name: string }[];
  discoveredCount: number;
  catalogSize: number;
}

export const getJournal = (): Promise<JournalEvent[]> => api.get<JournalEvent[]>('/journal');

export const getFieldGuide = (): Promise<FieldGuide> => api.get<FieldGuide>('/field-guide');
