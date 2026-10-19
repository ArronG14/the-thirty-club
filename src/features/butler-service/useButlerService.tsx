/**
 * The Butler's service, shared by the locked Grand Entrance and the Members'
 * Lounge: one bell, one menu, one correspondence collection and one request
 * composer. The host supplies the Butler's existing voice (`say`) and decides
 * when he may speak (`enabled`): never during a ceremony or over a sheet.
 *
 * Overlays are a lazy chunk; this hook and the envelope stay small.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MemberLetter } from '../../shared/concierge/types';
import type { DeskFailure } from '../correspondence/client/correspondenceApi';
import { activeDesk, type ButlerDesk } from './client/desk';
import { nextLine } from './domain/dialogue';

import { OverlaysSlot } from './ui/OverlaysSlot';

export type ServicePlace = 'entrance' | 'lounge';

export type ServiceView =
  | { kind: 'none' }
  | { kind: 'menu' }
  | { kind: 'collection'; letterId: string | null; direct: boolean }
  | { kind: 'composer' }
  /** The Butler's invitation to the Departure Lounge (locked entrance). */
  | { kind: 'departure' };

export type ServiceStanding =
  | { kind: 'loading' }
  | { kind: 'member' }
  | { kind: 'owner' }
  | { kind: 'needs-membership' }
  | { kind: 'unavailable'; failure: DeskFailure };

const GREETED_KEY = 'thirty-club:butler-greeted';

function greetedFor(): string | null {
  try {
    return sessionStorage.getItem(GREETED_KEY);
  } catch {
    return null;
  }
}

export interface ButlerServiceOptions {
  place: ServicePlace;
  /** The Butler's existing voice in this room. */
  say(text: string): void;
  /** False while a ceremony plays or another sheet is open. */
  enabled: boolean;
  /** Wait before fetching, so the room settles first. */
  delayMs?: number;
  desk?: ButlerDesk;
}

export interface ButlerService {
  standing: ServiceStanding;
  letters: readonly MemberLetter[];
  unread: readonly MemberLetter[];
  view: ServiceView;
  /** The bell: opens the Butler's menu. */
  ring(): void;
  openLetter(id: string): void;
  /** The Butler offers to escort her to the Departure Lounge. */
  inviteToDeparture(): void;
  overlays: ReactNode;
}

export function useButlerService({
  place,
  say,
  enabled,
  delayMs = 2500,
  desk = activeDesk,
}: ButlerServiceOptions): ButlerService {
  const [standing, setStanding] = useState<ServiceStanding>({
    kind: 'loading',
  });
  const [letters, setLetters] = useState<readonly MemberLetter[]>([]);
  const [view, setView] = useState<ServiceView>({ kind: 'none' });
  const voice = useRef(say);
  useEffect(() => {
    voice.current = say;
  }, [say]);

  const load = useCallback(async () => {
    const found = await desk.standing();
    if (found.kind !== 'member') {
      setStanding(found);
      setLetters([]);
      return;
    }
    const result = await desk.letters();
    if (!result.ok) {
      setStanding({ kind: 'unavailable', failure: result });
      return;
    }
    setStanding({ kind: 'member' });
    setLetters(result.data.letters);
  }, [desk]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) void load();
    }, delayMs);
    // Dev Mode's controls add or clear simulated letters in this tab.
    const refresh = () => void load();
    window.addEventListener('thirty-club:butler-rehearsal', refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('thirty-club:butler-rehearsal', refresh);
    };
  }, [load, delayMs]);

  const unread = letters.filter((l) => !l.openedAt);
  const newest = unread[0] ?? null;

  // He greets once per newest unread letter in this tab, and only when the
  // room allows him to speak: never on every render or over a ceremony.
  const newestId = newest?.id ?? null;
  useEffect(() => {
    if (!enabled || !newestId || view.kind !== 'none') return;
    if (greetedFor() === newestId) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(GREETED_KEY, newestId);
      } catch {
        /* he may greet again next time; harmless */
      }
      voice.current(nextLine('unread-greeting'));
    }, 600);
    return () => clearTimeout(timer);
  }, [enabled, newestId, view.kind]);

  const ring = useCallback(() => {
    setView({ kind: 'menu' });
    void load();
  }, [load]);

  const openLetter = useCallback((id: string) => {
    setView({ kind: 'collection', letterId: id, direct: true });
  }, []);

  const inviteToDeparture = useCallback(
    () => setView({ kind: 'departure' }),
    [],
  );

  const replace = useCallback((letter: MemberLetter) => {
    setLetters((all) => all.map((l) => (l.id === letter.id ? letter : l)));
  }, []);

  const overlays =
    view.kind === 'none' ? null : (
      <OverlaysSlot
        place={place}
        view={view}
        standing={standing}
        letters={letters}
        desk={desk}
        onView={setView}
        onLetter={replace}
        onClose={(after) => {
          setView({ kind: 'none' });
          void load();
          if (after) voice.current(after);
        }}
      />
    );

  return {
    standing,
    letters,
    unread,
    view,
    ring,
    openLetter,
    inviteToDeparture,
    overlays,
  };
}
