import { api } from './client.js';

export interface SellResult {
  ok: true;
  itemId: string;
  sold: number;
  gained: number;
  cubes: number;
}

/** Quick-sell `qty` of an item for Cubes (server clamps to what's held). */
export const sellItem = (itemId: string, qty = 1): Promise<SellResult> =>
  api.post<SellResult>('/inventory/sell', { itemId, qty });
