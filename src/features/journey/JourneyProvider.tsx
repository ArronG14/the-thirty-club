/**
 * Alise's admissions, for every page of the club (ADR-020). One provider at
 * the root reads `/api/v1/journey` and keeps the answer current while the
 * page is open (on return to the page, and every minute while visible).
 *
 * Consumers that find no provider (unit tests of a single component) fall
 * back to the club's earlier, schedule-only rules; the application always
 * renders inside the provider, so the journey decides in the real club.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AdmissionRoomId } from '../../shared/journey/contract';
import {
  failureText,
  memberStanding,
} from '../correspondence/client/correspondenceApi';
import { deviceStorage } from '../rehearsal/storage';
import { acceptAdmission, journeyState } from './client/journeyApi';
import {
  JourneyContext,
  type AcceptOutcome,
  type JourneyStatus,
  type JourneyValue,
} from './journeyContext';
import {
  admit,
  deserialise,
  EMPTY_SNAPSHOT,
  JOURNEY_CACHE_KEY,
  serialise,
  snapshotOf,
  type JourneySnapshot,
} from './domain/access';

const REFRESH_MS = 60_000;

function readCache(): JourneySnapshot | null {
  try {
    return deserialise(deviceStorage().getItem(JOURNEY_CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(snapshot: JourneySnapshot) {
  try {
    deviceStorage().setItem(JOURNEY_CACHE_KEY, serialise(snapshot));
  } catch {
    // Storage full or blocked: the server still has the record.
  }
}

export function JourneyProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  /** False on owner pages, which never read Alise's journey. */
  enabled?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<JourneySnapshot>(
    () => readCache() ?? EMPTY_SNAPSHOT,
  );
  const [status, setStatus] = useState<JourneyStatus>('loading');
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    const standing = await memberStanding();
    if (mine !== generation.current) return;
    if (standing.kind === 'owner' || standing.kind === 'needs-membership') {
      setStatus('needs-membership');
      return;
    }
    if (standing.kind === 'unavailable') {
      setStatus(
        standing.failure.kind === 'offline' ? 'offline' : 'unavailable',
      );
      return;
    }
    const result = await journeyState();
    if (mine !== generation.current) return;
    if (result.ok) {
      const next = snapshotOf(result.data);
      setSnapshot(next);
      writeCache(next);
      setStatus('ready');
      return;
    }
    if (result.kind === 'offline') setStatus('offline');
    else if (result.kind === 'http' && result.status === 401)
      setStatus('needs-membership');
    else setStatus('unavailable');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // The first read; its state updates arrive after the network answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [enabled, load]);

  const accept = useCallback(
    async (room: AdmissionRoomId): Promise<AcceptOutcome> => {
      const result = await acceptAdmission(room);
      if (!result.ok) return { ok: false, message: failureText(result) };
      // Any in-flight read is older than this acceptance.
      generation.current++;
      setSnapshot((current) => {
        const next = admit(current, room);
        writeCache(next);
        return next;
      });
      setStatus('ready');
      return { ok: true };
    },
    [],
  );

  const value = useMemo<JourneyValue>(
    () => ({
      status,
      snapshot,
      stateOf: (room) => snapshot.rooms[room],
      accept,
      refresh: () => void load(),
    }),
    [status, snapshot, accept, load],
  );

  return (
    <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
  );
}
