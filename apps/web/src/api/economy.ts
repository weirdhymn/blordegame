import { api } from './client.js';

export interface Listing {
  id: string;
  horseId: string;
  price: number;
  sellerId: string;
  name: string | null;
  displayName: string | null;
}

export interface Trade {
  id: string;
  fromHerd: string;
  toHerd: string;
  offerHorses: string[];
  offerCubes: number;
  requestHorses: string[];
  requestCubes: number;
  status: string;
}

export interface TradeOffer {
  toHerd: string;
  offerHorses?: string[];
  offerCubes?: number;
  requestHorses?: string[];
  requestCubes?: number;
}

// ── Marketplace ──
export const browseMarket = (): Promise<Listing[]> => api.get<Listing[]>('/market');
export const listHorse = (horseId: string, price: number): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>('/market', { horseId, price });
export const buyListing = (id: string): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>(`/market/${id}/buy`);
export const cancelListing = (id: string): Promise<{ ok: boolean }> =>
  api.del<{ ok: boolean }>(`/market/${id}`);

// ── Direct trades ──
export const listTrades = (): Promise<Trade[]> => api.get<Trade[]>('/trades');
export const createTrade = (offer: TradeOffer): Promise<{ ok: boolean; tradeId: string }> =>
  api.post<{ ok: boolean; tradeId: string }>('/trades', offer);
export const acceptTrade = (id: string): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>(`/trades/${id}/accept`);
export const declineTrade = (id: string): Promise<{ ok: boolean }> =>
  api.post<{ ok: boolean }>(`/trades/${id}/decline`);
export const cancelTrade = (id: string): Promise<{ ok: boolean }> =>
  api.del<{ ok: boolean }>(`/trades/${id}`);
