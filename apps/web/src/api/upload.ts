import { api } from './client.js';

export interface UploadBond {
  name: string;
  type: string | null;
  affinity: number;
}

export interface UploadQuote {
  ok: true;
  horse: { id: string; name: string; coat: string; lifeStage: string };
  reward: number;
  isFoal: boolean;
  onAdventure: boolean;
  relationships: UploadBond[];
}

export const getUploadQuote = (id: string): Promise<UploadQuote> =>
  api.get<UploadQuote>(`/horses/${id}/upload-quote`);

export interface UploadResult {
  ok: true;
  reward: number;
  name: string;
  coat: string;
}

export const uploadHorse = (id: string): Promise<UploadResult> =>
  api.post<UploadResult>(`/horses/${id}/upload`);
