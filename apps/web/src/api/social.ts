import type { Genotype } from '@blorse/genetics';
import type { GlitchKind } from '@blorse/render-core';
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

/** One inbox letter (§7p) — null sender = a Post Office system letter (postmark only). */
export interface InboxLetter {
  id: string;
  fromHerd: string | null;
  fromName: string | null;
  body: string;
  /** Items that rode this letter (§7s) — already delivered; this is the gift tag. */
  parcel: { id: string; qty: number }[] | null;
  read: boolean;
  createdAt: number;
}

/** A visited herd's horse — adults carry render fields; foals NEVER do (the coat stays
 *  hidden until the reveal, §4.2): the client paints foals with a stock white silhouette. */
export interface ProfileHighlight {
  id: string;
  name: string | null;
  displayName: string;
  lifeStage: string;
  genotype?: Genotype;
  seed?: number;
  glitch?: GlitchKind | null;
}

export interface HerdProfile {
  id: string;
  name: string;
  level: number;
  horseCount: number;
  adultCount: number;
  highlights: ProfileHighlight[];
  recentJournal: { kind: string; text: string; glyph: string | null }[];
  clubs: string[];
}

/** One calling card (§7q) — how you met rides along. */
export interface CallingCard {
  herdId: string;
  name: string;
  via: 'mail' | 'trade' | 'road';
  lastContactAt: number;
}

export const getClubs = (): Promise<Club[]> => api.get<Club[]>('/clubs');
export const getRelationships = (): Promise<Relationship[]> =>
  api.get<Relationship[]>('/relationships');
export const getInbox = (): Promise<InboxLetter[]> => api.get<InboxLetter[]>('/messages');
export const sendMessage = (
  toHerd: string,
  body: string,
  parcel?: { id: string; qty: number }[],
): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>('/messages', {
    toHerd,
    body,
    ...(parcel && parcel.length > 0 ? { parcel } : {}),
  });
/** Opening the Post Office reads everything — one stamp (§7p). */
export const readAllMail = (): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>('/messages/read-all');
export const getHerdProfile = (id: string): Promise<HerdProfile> =>
  api.get<HerdProfile>(`/herds/${id}/profile`);
export const getContacts = (): Promise<CallingCard[]> => api.get<CallingCard[]>('/contacts');
