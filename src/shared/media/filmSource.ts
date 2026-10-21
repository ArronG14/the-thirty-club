import { useCallback, useEffect, useRef, useState } from 'react';
import { protectedMediaId, type MediaId, type MediaTicket } from './contract';

/**
 * Where a film can be played from right now (ADR-026). An ordinary source
 * is ready at once; a protected one (`/api/v1/media/<id>`) needs a ticket
 * from the server, fetched as soon as the film is shown — never inside her
 * tap, because iPhone only opens its player when play() runs synchronously
 * in the gesture — and renewed before it expires, when she comes back to
 * the page, and when the connection returns.
 */
export type FilmProblem =
  /** Not uploaded or not configured yet: honestly "being prepared". */
  | 'preparing'
  /** The server says not yet (the birthday film before midnight). */
  | 'not-open'
  /** This session may not see it (signed out, not admitted, not won). */
  | 'refused'
  /** No connection. */
  | 'offline'
  /** Anything else; try again. */
  | 'error';

export type TicketResult =
  { ok: true; ticket: MediaTicket } | { ok: false; problem: FilmProblem };

export async function requestTicket(id: MediaId): Promise<TicketResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/media/${id}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, problem: navigator.onLine ? 'error' : 'offline' };
  }
  const data = (await response.json().catch(() => null)) as
    (MediaTicket & { error?: string }) | null;
  if (response.ok && data && typeof data.url === 'string')
    return { ok: true, ticket: data };
  if (data?.error === 'not-configured')
    return { ok: false, problem: 'preparing' };
  if (data?.error === 'not-open') return { ok: false, problem: 'not-open' };
  if (response.status === 401 || response.status === 403)
    return { ok: false, problem: 'refused' };
  return { ok: false, problem: 'error' };
}

export interface FilmSource {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  /** The standard print. */
  url: string | null;
  /** A smaller print for a weak connection, if the film has one. */
  lighterUrl: string | null;
  /** The TEST rehearsal's five-second film stands in. */
  simulated: boolean;
  problem: FilmProblem | null;
  /** Ask again now (Retry). Resolves once the answer is in. */
  renew(): Promise<void>;
  /**
   * Ask again only if the ticket in hand has (nearly) expired: for a load
   * that failed while nothing was playing. Never a loop: a fresh ticket
   * whose film still will not load is left for her Retry.
   */
  renewIfExpiring(): Promise<void>;
}

/** Renew this long before a ticket expires. */
const RENEW_BEFORE_MS = 15 * 60_000;

/** The playable source for `src` (null: no film). */
export function useFilmSource(src: string | null | undefined): FilmSource {
  const id = protectedMediaId(src);
  const [state, setState] = useState<{
    key: string | null;
    status: FilmSource['status'];
    ticket: MediaTicket | null;
    problem: FilmProblem | null;
  }>({ key: null, status: 'idle', ticket: null, problem: null });
  const inFlight = useRef<Promise<void> | null>(null);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);

  const renew = useCallback((): Promise<void> => {
    if (!id) return Promise.resolve();
    inFlight.current ??= (async () => {
      setState((s) =>
        s.key === id && s.ticket
          ? s
          : { key: id, status: 'loading', ticket: null, problem: null },
      );
      const result = await requestTicket(id);
      setState(
        result.ok
          ? { key: id, status: 'ready', ticket: result.ticket, problem: null }
          : (s) =>
              // A valid ticket in hand outlives a failed renewal.
              s.key === id &&
              s.ticket &&
              Date.parse(s.ticket.expiresAt) > Date.now() + 60_000
                ? s
                : {
                    key: id,
                    status: 'unavailable',
                    ticket: null,
                    problem: result.problem,
                  },
      );
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [id]);

  const renewIfExpiring = useCallback((): Promise<void> => {
    const ticket = current.current.ticket;
    return ticket && Date.parse(ticket.expiresAt) - Date.now() < 60_000
      ? renew()
      : Promise.resolve();
  }, [renew]);

  // First ticket as soon as the film is on screen.
  useEffect(() => {
    if (id) void renew();
  }, [id, renew]);

  // Renew before expiry, on return to the page, and when back online.
  useEffect(() => {
    if (!id) return;
    const stale = () => {
      const s = current.current;
      return (
        s.key !== id ||
        s.status !== 'ready' ||
        !s.ticket ||
        Date.parse(s.ticket.expiresAt) - Date.now() < RENEW_BEFORE_MS
      );
    };
    const check = () => {
      if (document.visibilityState === 'visible' && stale()) void renew();
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
    };
  }, [id, renew]);

  if (!src) return { ...EMPTY, renew, renewIfExpiring };
  if (!id)
    return {
      status: 'ready',
      url: src,
      lighterUrl: null,
      simulated: false,
      problem: null,
      renew,
      renewIfExpiring,
    };
  const own = state.key === id ? state : null;
  return {
    status: own?.status === 'idle' || !own ? 'loading' : own.status,
    url: own?.ticket?.url ?? null,
    lighterUrl: own?.ticket?.lighterUrl ?? null,
    simulated: own?.ticket?.simulated ?? false,
    problem: own?.problem ?? null,
    renew,
    renewIfExpiring,
  };
}

const EMPTY = {
  status: 'idle',
  url: null,
  lighterUrl: null,
  simulated: false,
  problem: null,
} as const;

/** Her words for a problem, in the club's voice. */
export function filmProblemText(problem: FilmProblem): string {
  switch (problem) {
    case 'preparing':
    case 'not-open':
      return 'This film is still being prepared.';
    case 'refused':
      return 'Please present your membership card to watch this film.';
    case 'offline':
      return 'The film needs a connection. It is not kept on this device.';
    case 'error':
      return 'The film could not be fetched just now. Please try again.';
  }
}
