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
  /** The Naturalist's Purse ladder (§7n) — thresholds with claimed flags. */
  milestones: { coats: number; cubes: number; claimed: boolean }[];
}

export const getJournal = (): Promise<JournalEvent[]> => api.get<JournalEvent[]>('/journal');

export const getFieldGuide = (): Promise<FieldGuide> => api.get<FieldGuide>('/field-guide');

export interface Club {
  id: string;
  type: string;
  members: string[];
}

export interface Relationship {
  id: string;
  horseA: string;
  horseB: string;
  affinity: number;
  type: string | null;
}

export interface Message {
  id: string;
  fromHerd: string;
  toHerd: string;
  body: string;
  createdAt: string;
}

export interface HerdProfile {
  id: string;
  name: string;
  level: number;
  horseCount: number;
  adultCount: number;
  highlights: { id: string; name: string | null; displayName: string; lifeStage: string }[];
  recentJournal: { kind: string; text: string; glyph: string | null }[];
  clubs: string[];
}

export const getClubs = (): Promise<Club[]> => api.get<Club[]>('/clubs');
export const getRelationships = (): Promise<Relationship[]> =>
  api.get<Relationship[]>('/relationships');
export const getInbox = (): Promise<Message[]> => api.get<Message[]>('/messages');
export const sendMessage = (toHerd: string, body: string): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>('/messages', { toHerd, body });
export const getHerdProfile = (id: string): Promise<HerdProfile> =>
  api.get<HerdProfile>(`/herds/${id}/profile`);
