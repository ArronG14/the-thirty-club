/** The website's client for the Shopping Privilege. The limit is not known here. */
import { call, type ApiResult } from './api';

export type ShoppingState =
  | { status: 'available' }
  | { status: 'awaiting-settlement'; amountPence: number; requestedAt: string };

export type ShoppingReceipt = ShoppingState & { duplicate: boolean };

export interface ShoppingApi {
  state(session: string): Promise<ApiResult<ShoppingState>>;
  request(
    request: { amount: string; idempotencyKey: string },
    session: string,
  ): Promise<ApiResult<ShoppingReceipt>>;
}

export const httpShoppingApi: ShoppingApi = {
  state: (session) =>
    call('/api/concierge/shopping', { method: 'GET', session }),
  request: (request, session) =>
    call('/api/concierge/shopping', { method: 'POST', body: request, session }),
};
