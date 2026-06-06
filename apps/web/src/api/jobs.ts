import { api } from './client.js';

export interface JobAssignment {
  horseId: string;
  herdId: string;
  structureType: string;
  skill: string;
  stat: string;
}

export const getJob = (horseId: string): Promise<{ job: JobAssignment | null }> =>
  api.get<{ job: JobAssignment | null }>(`/horses/${horseId}/job`);

export const assignJob = (
  horseId: string,
  structureType: string,
): Promise<{ ok: boolean; structureType: string; skill: string }> =>
  api.post<{ ok: boolean; structureType: string; skill: string }>(`/horses/${horseId}/job`, {
    structureType,
  });

export const unassignJob = (horseId: string): Promise<{ ok: boolean }> =>
  api.del<{ ok: boolean }>(`/horses/${horseId}/job`);
