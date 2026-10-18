import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newIdempotencyKey, type ConciergeApi } from './client/api';
import type {
  ConciergeRecord,
  ConciergeStorage,
  PendingIntent,
} from './client/localRecord';
import type { StoredSession } from './client/sessionStore';
import type { PrivilegeId } from './domain/catalogue';
import type {
  ActivateResponse,
  ConciergeState,
  PublicRedemption,
} from './domain/contract';
import type { CredentialId } from './domain/credentials';
import { loungePhase, nextChange, privilegeViews } from './domain/lounge';
import { hasScope, type Realm } from './domain/session';

export interface SessionAccess {
  active(): StoredSession | null;
  save(token: string): StoredSession | null;
  clear(realm: Realm): void;
}

export interface ConciergeDeps {
  api: ConciergeApi;
  storage: ConciergeStorage;
  sessions: SessionAccess;
}

export type Connection = 'checking' | 'online' | 'offline' | 'unavailable';

export type PresentOutcome =
  | { ok: true; credential: CredentialId; response: ActivateResponse }
  | {
      ok: false;
      reason: 'unrecognised' | 'offline' | 'unavailable' | 'limited';
    };

export type RedeemOutcome =
  | { kind: 'redeemed'; redemption: PublicRedemption }
  /** Saved on the device; sent automatically once a connection returns. */
  | { kind: 'queued' }
  | { kind: 'refused'; message: string };

const REFRESH_MS = 30_000;

function withRedemption(
  state: ConciergeState | null,
  redemption: PublicRedemption,
): ConciergeState | null {
  if (!state) return state;
  return {
    ...state,
    redemptions: { ...state.redemptions, [redemption.privilegeId]: redemption },
  };
}

function withoutPending(
  record: ConciergeRecord,
  id: PrivilegeId,
): ConciergeRecord {
  const pending = { ...record.pending };
  delete pending[id];
  return { ...record, pending };
}

/**
 * The concierge as the Departure Lounge sees it. Composes the service, the
 * device record and the session; every rule lives in the pure domain.
 */
export function useConcierge({ api, storage, sessions }: ConciergeDeps) {
  const [record, setRecord] = useState(() => storage.load());
  const [session, setSession] = useState(() => sessions.active());
  // Service clock minus device clock. A rehearsal's virtual time arrives
  // with every state; before the first answer its offset stands in.
  const [skew, setSkew] = useState(() => session?.claims.offsetMs ?? 0);
  const [connection, setConnection] = useState<Connection>('checking');
  const [tick, setTick] = useState(() => Date.now());
  const recordRef = useRef(record);
  const sessionRef = useRef(session);
  const syncing = useRef(new Set<PrivilegeId>());

  const update = useCallback(
    (change: (current: ConciergeRecord) => ConciergeRecord) => {
      const next = change(recordRef.current);
      if (next === recordRef.current) return;
      recordRef.current = next;
      setRecord(next);
      storage.save(next);
    },
    [storage],
  );

  const adopt = useCallback(
    (token: string) => {
      const stored = sessions.save(token);
      sessionRef.current = stored;
      setSession(stored);
      return stored;
    },
    [sessions],
  );

  const acceptState = useCallback(
    (state: ConciergeState) => {
      setSkew(state.now - Date.now());
      setTick(Date.now());
      update((current) => ({ ...current, state }));
      setConnection('online');
    },
    [update],
  );

  const refresh = useCallback(async () => {
    const result = await api.state(sessionRef.current?.token);
    if (result.ok) {
      acceptState(result.data);
      return;
    }
    if (result.kind === 'http' && result.status === 401 && sessionRef.current) {
      // The service no longer honours this session: forget it and ask again.
      sessions.clear(sessionRef.current.claims.realm);
      sessionRef.current = sessions.active();
      setSession(sessionRef.current);
      const retry = await api.state(sessionRef.current?.token);
      if (retry.ok) acceptState(retry.data);
      return;
    }
    setConnection(result.kind === 'http' ? 'unavailable' : 'offline');
  }, [acceptState, api, sessions]);

  // Fetch on arrival, periodically, on return to the page and on reconnect.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, REFRESH_MS);
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      setTick(Date.now());
      void refresh();
    };
    const lost = () => setConnection('offline');
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', lost);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', lost);
    };
  }, [refresh]);

  const now = tick + skew;
  const hasDeparture = hasScope(session?.claims ?? null, 'departure');
  const inputs = useMemo(
    () => ({
      now,
      state: record.state,
      hasDeparture,
      opened: record.opened,
      pending: record.pending,
    }),
    [hasDeparture, now, record],
  );
  const phase = loungePhase(inputs);
  const privileges = useMemo(() => privilegeViews(inputs), [inputs]);

  // Keep the clock moving; land exactly on the next release.
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 15_000);
    const upcoming = nextChange(inputs);
    const timer =
      upcoming === null
        ? undefined
        : setTimeout(
            () => {
              setTick(Date.now());
              void refresh();
            },
            Math.min(upcoming - now + 250, 2 ** 31 - 1),
          );
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [inputs, now, refresh]);

  const submit = useCallback(
    async (id: PrivilegeId, intent: PendingIntent): Promise<RedeemOutcome> => {
      const current = sessionRef.current;
      if (!current)
        return {
          kind: 'refused',
          message: 'Please present your travel credential.',
        };
      if (syncing.current.has(id)) return { kind: 'queued' };
      syncing.current.add(id);
      try {
        const result = await api.redeem(
          {
            privilegeId: id,
            idempotencyKey: intent.idempotencyKey,
            ...(intent.choice ? { choice: intent.choice } : {}),
            ...(intent.note ? { note: intent.note } : {}),
          },
          current.token,
        );
        if (result.ok) {
          update((r) => ({
            ...withoutPending(r, id),
            state: withRedemption(r.state, result.data.redemption),
          }));
          setConnection('online');
          return { kind: 'redeemed', redemption: result.data.redemption };
        }
        if (result.kind !== 'http') {
          setConnection('offline');
          return { kind: 'queued' };
        }
        const standing = result.body?.redemption;
        if (result.status === 409 && standing) {
          update((r) => ({
            ...withoutPending(r, id),
            state: withRedemption(r.state, standing),
          }));
          return { kind: 'redeemed', redemption: standing };
        }
        if (result.status >= 500 || result.status === 429) {
          setConnection('unavailable');
          return { kind: 'queued' };
        }
        update((r) => withoutPending(r, id));
        return {
          kind: 'refused',
          message:
            result.body?.message ?? 'The concierge could not arrange this.',
        };
      } finally {
        syncing.current.delete(id);
      }
    },
    [api, update],
  );

  // Send anything that was waiting for a connection.
  useEffect(() => {
    if (connection !== 'online' || !session) return;
    for (const [id, intent] of Object.entries(record.pending)) {
      if (intent) void submit(id as PrivilegeId, intent);
    }
  }, [connection, record.pending, session, submit]);

  // While Arron has not yet been reached, check back more often.
  const awaitingDelivery = privileges.some(
    (view) =>
      view.redemption?.delivery === 'pending' ||
      view.redemption?.delivery === 'unconfigured',
  );
  useEffect(() => {
    if (!awaitingDelivery) return;
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [awaitingDelivery, refresh]);

  const present = useCallback(
    async (input: {
      code?: string;
      token?: string;
    }): Promise<PresentOutcome> => {
      const result = await api.activate(input, sessionRef.current?.token);
      if (result.ok) {
        adopt(result.data.session);
        acceptState(result.data.state);
        return {
          ok: true,
          credential: result.data.credential,
          response: result.data,
        };
      }
      if (result.kind !== 'http') return { ok: false, reason: 'offline' };
      if (result.status === 404) return { ok: false, reason: 'unrecognised' };
      if (result.status === 429) return { ok: false, reason: 'limited' };
      return { ok: false, reason: 'unavailable' };
    },
    [acceptState, adopt, api],
  );

  const breakSeal = useCallback(
    (id: PrivilegeId) =>
      update((r) =>
        r.opened.includes(id) ? r : { ...r, opened: [...r.opened, id] },
      ),
    [update],
  );

  const redeem = useCallback(
    (id: PrivilegeId, details: { choice?: string; note?: string }) => {
      const intent: PendingIntent = {
        idempotencyKey:
          recordRef.current.pending[id]?.idempotencyKey ?? newIdempotencyKey(),
        createdAt: new Date().toISOString(),
        ...(details.choice ? { choice: details.choice } : {}),
        ...(details.note ? { note: details.note } : {}),
      };
      // Written before sending: a dropped connection loses nothing.
      update((r) => ({ ...r, pending: { ...r.pending, [id]: intent } }));
      return submit(id, intent);
    },
    [submit, update],
  );

  const markBoarded = useCallback(
    () =>
      update((r) =>
        r.boardedAt ? r : { ...r, boardedAt: new Date().toISOString() },
      ),
    [update],
  );

  return {
    now,
    phase,
    privileges,
    connection,
    session,
    realm: session?.claims.realm ?? 'live',
    state: record.state,
    boarded: record.boardedAt !== null,
    present,
    breakSeal,
    redeem,
    markBoarded,
    refresh,
  };
}

export type ConciergeModel = ReturnType<typeof useConcierge>;
