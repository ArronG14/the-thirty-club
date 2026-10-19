/**
 * Ways into the vault.
 *
 * `/v/:token` is what every vault NFC tag points to. Scanning opens Safari
 * (often a fresh page, sometimes a fresh storage context), so the key is
 * held in storage AND in the history entry, the address is replaced (the
 * token does not linger in the URL bar), and Alise lands directly in the
 * vault: no entrance, no midnight ceremony, no lounge.
 */
import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { AdmissionGate } from '../../journey/ui/AdmissionGate';
import { heldKey, holdKey, isPlausibleVaultToken } from '../client/pendingKey';
import GiftVault from './GiftVault';

export interface VaultArrivalState {
  vaultKey?: string;
}

/**
 * This tab arrived with a physical key (ADR-020). The vault consumes the key
 * once it opens a compartment, so the tab remembers the arrival: a reload or
 * a return within the same visit is not sent away by the admission gate.
 */
const KEY_ARRIVAL = 'thirty-club:vault-key-arrival';
function rememberKeyArrival() {
  try {
    sessionStorage.setItem(KEY_ARRIVAL, '1');
  } catch {
    // Without session storage the history state still carries the key.
  }
}
function arrivedWithKey(): boolean {
  try {
    return sessionStorage.getItem(KEY_ARRIVAL) === '1';
  } catch {
    return false;
  }
}

export function VaultKeyArrival() {
  const { token = '' } = useParams();
  const plausible = isPlausibleVaultToken(token);
  useEffect(() => {
    if (plausible) holdKey(token);
    rememberKeyArrival();
  }, [plausible, token]);
  // An implausible token still goes to the vault, which explains kindly.
  return (
    <Navigate
      to="/vault"
      replace
      state={
        {
          vaultKey: plausible ? token : 'unrecognised',
        } satisfies VaultArrivalState
      }
    />
  );
}

/**
 * `/vault`: the member's vault. Arriving with a physical key (a scan, or a
 * key still held from one) goes straight in, as the tags were designed to;
 * the key is the proof and the server decides each compartment. Without a
 * key, the vault needs its admission like any other room (ADR-020).
 */
export function VaultRoute() {
  const location = useLocation();
  const arrival =
    (location.state as VaultArrivalState | null)?.vaultKey ?? null;
  const vault = <GiftVault mode={{ kind: 'member', arrivalKey: arrival }} />;
  if (arrival || heldKey() || arrivedWithKey()) return vault;
  return <AdmissionGate roomId="gift-vault">{vault}</AdmissionGate>;
}

/** `/owner/vault-preview/:id`: owner rehearsal; the server checks the owner session. */
export function VaultPreviewRoute() {
  const { id = '' } = useParams();
  return <GiftVault key={id} mode={{ kind: 'preview', vaultId: id }} />;
}

/** `/rooms/gift-vault`, through the club's door staff (RoomGate). */
export default function GiftVaultRoom() {
  return <GiftVault mode={{ kind: 'member', arrivalKey: null }} />;
}
