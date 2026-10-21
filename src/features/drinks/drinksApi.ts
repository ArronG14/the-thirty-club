import type { DrinkKind } from '../../shared/drinks/templates';
import { vaultRequest } from '../vault/client/vaultApi';

export interface DrinkBalance {
  granted: number;
  used: number;
  available: number;
}
export interface DrinkRequest {
  id: string;
  kind: DrinkKind;
  beverage: string;
  createdAt: string;
  /** Whether the owner's SMS has left: never his number or errors. */
  notice: 'pending' | 'sent' | 'delayed';
}
export interface UnclaimedDrinks {
  id: string;
  title: string;
  kind: DrinkKind;
  quantity: number;
  presentation: string | null;
  createdAt: string;
}
export interface DrinksStatus {
  airport: DrinkBalance;
  jamaica: DrinkBalance;
  requests: DrinkRequest[];
  unclaimed: UnclaimedDrinks[];
}

const failure = (
  response: { kind: string; message?: string },
  fallback: string,
) =>
  response.kind === 'http' && response.message ? response.message : fallback;

export async function loadDrinks() {
  const response = await vaultRequest<DrinksStatus>('/drinks');
  return response.ok
    ? ({ ok: true, data: response.data } as const)
    : ({
        ok: false,
        message: failure(
          response,
          'Your privileges cannot be reached just now.',
        ),
      } as const);
}

/** Her CLAIM of a prize that grants drinks. Idempotent on the server. */
export async function claimDrinks(entitlementId: string) {
  const response = await vaultRequest<{
    balance: DrinkBalance;
    kind: DrinkKind;
  }>('/vouchers/claim', { body: { id: entitlementId } });
  return response.ok
    ? ({ ok: true, data: response.data } as const)
    : ({
        ok: false,
        message: failure(
          response,
          'The claim could not be recorded. Please try again.',
        ),
      } as const);
}

export async function requestDrink(
  kind: DrinkKind,
  beverage: string,
  idempotencyKey: string,
) {
  const response = await vaultRequest<{
    request: DrinkRequest;
    balance: DrinkBalance;
  }>('/drinks/requests', { body: { kind, beverage, idempotencyKey } });
  return response.ok
    ? ({ ok: true, data: response.data } as const)
    : ({
        ok: false,
        status: response.kind === 'http' ? response.status : 0,
        message: failure(
          response,
          'The connection was interrupted. Your request has not been lost — please try again.',
        ),
      } as const);
}
