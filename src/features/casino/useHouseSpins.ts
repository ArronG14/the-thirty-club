import { useCallback, useEffect, useRef, useState } from 'react';
import { establishStanding, vaultRequest } from '../vault/client/vaultApi';

/** A prize as the server recorded it (snapshot at issue time). */
export interface HousePrize {
  title: string;
  description: string;
  presentation: string;
  kind: 'VOUCHER' | 'VAULT_GIFT';
  imageUrl?: string | null;
  drinksKind?: 'airport' | 'jamaica' | null;
  drinksQuantity?: number | null;
  videoUrl?: string | null;
}
export interface HouseSpin {
  id: string;
  batchId: string;
  position: number;
  prize: HousePrize | null;
  entitlementId: string | null;
  idempotencyKey?: string;
  createdAt?: string;
}
interface Status {
  available: number;
  spins: HouseSpin[];
}
export type Standing = 'checking' | 'member' | 'other';
export type SpinResult =
  { ok: true; spin: HouseSpin } | { ok: false; message: string };

const PENDING = 'thirty-club:casino:pending';

/**
 * Her complimentary spins, decided by the server (ADR-020/024). The reels
 * only ever animate a result the server has already committed; an
 * interrupted spin is recovered by its idempotency key, never replayed.
 */
export function useHouseSpins() {
  const [standing, setStanding] = useState<Standing>('checking');
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [recovered, setRecovered] = useState<HouseSpin | null>(null);
  const busy = useRef(false);

  /**
   * `recover` (first load only): a spin committed before the page closed is
   * shown again rather than lost. Later refreshes never re-present it.
   */
  const refresh = useCallback(async (recover = false) => {
    const response = await vaultRequest<Status>('/casino');
    if (!response.ok) {
      setError(
        response.kind === 'http'
          ? response.message
          : 'The tables are temporarily unavailable.',
      );
      return null;
    }
    setError('');
    setStatus(response.data);
    const pending = recover ? sessionStorage.getItem(PENDING) : null;
    if (pending) {
      const found = response.data.spins.find(
        (spin) => spin.idempotencyKey === pending,
      );
      if (found) {
        sessionStorage.removeItem(PENDING);
        setRecovered(found);
      }
    }
    return response.data;
  }, []);

  useEffect(() => {
    let active = true;
    void establishStanding().then((found) => {
      if (!active) return;
      setStanding(found.kind === 'member' ? 'member' : 'other');
      if (found.kind === 'member') void refresh(true);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  // Spins issued while she is in the room appear without a reload.
  useEffect(() => {
    if (standing !== 'member') return;
    const again = () => {
      if (document.visibilityState === 'visible' && !busy.current)
        void refresh();
    };
    const timer = setInterval(again, 30_000);
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [standing, refresh]);

  const spin = useCallback(async (): Promise<SpinResult> => {
    if (busy.current) return { ok: false, message: '' };
    busy.current = true;
    try {
      const key = sessionStorage.getItem(PENDING) ?? crypto.randomUUID();
      sessionStorage.setItem(PENDING, key);
      const response = await vaultRequest<HouseSpin>('/casino/spins', {
        body: { idempotencyKey: key },
      });
      if (!response.ok) {
        await refresh();
        return {
          ok: false,
          message:
            response.kind === 'http'
              ? response.message
              : 'The connection was interrupted. Check the table before trying again.',
        };
      }
      // The key stays until the result has been presented (`settle`), so
      // a reload during the reels recovers it.
      void refresh();
      return { ok: true, spin: response.data };
    } finally {
      busy.current = false;
    }
  }, [refresh]);

  return {
    standing,
    available: status?.available ?? null,
    spins: status?.spins ?? [],
    error,
    recovered,
    clearRecovered: () => setRecovered(null),
    /** The committed result has been presented: forget its key. */
    settle: () => sessionStorage.removeItem(PENDING),
    spin,
    refresh,
  };
}

/** The reels' class for a committed result: the jackpot is the Vault's. */
export function reelClassFor(
  spin: HouseSpin,
): 'jackpot' | 'triple' | 'pair' | 'miss' {
  if (spin.prize?.kind === 'VAULT_GIFT') return 'jackpot';
  if (spin.prize) return 'triple';
  return spin.position % 2 === 1 ? 'pair' : 'miss';
}
