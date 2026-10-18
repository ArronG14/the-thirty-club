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
import { holdKey, isPlausibleVaultToken } from '../client/pendingKey';
import GiftVault from './GiftVault';

export interface VaultArrivalState {
  vaultKey?: string;
}

export function VaultKeyArrival() {
  const { token = '' } = useParams();
  const plausible = isPlausibleVaultToken(token);
  useEffect(() => {
    if (plausible) holdKey(token);
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

/** `/vault`: the member's vault, reachable directly (and after any scan). */
export function VaultRoute() {
  const location = useLocation();
  const arrival =
    (location.state as VaultArrivalState | null)?.vaultKey ?? null;
  return <GiftVault mode={{ kind: 'member', arrivalKey: arrival }} />;
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
