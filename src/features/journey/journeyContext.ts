/** The journey's React context (ADR-020); the provider is JourneyProvider. */
import { createContext, useContext, useEffect } from 'react';
import type {
  AdmissionRoomId,
  AdmissionState,
} from '../../shared/journey/contract';
import type { JourneySnapshot } from './domain/access';

export type JourneyStatus =
  /** Not yet heard from the office in this page. */
  | 'loading'
  | 'ready'
  /** The device is offline: remembered admissions only. */
  | 'offline'
  /** This device holds no membership the office recognises. */
  | 'needs-membership'
  /** The office did not answer: remembered admissions only. */
  | 'unavailable';

export type AcceptOutcome = { ok: true } | { ok: false; message: string };

export interface JourneyValue {
  status: JourneyStatus;
  snapshot: JourneySnapshot;
  stateOf(room: AdmissionRoomId): AdmissionState;
  accept(room: AdmissionRoomId): Promise<AcceptOutcome>;
  refresh(): void;
  /**
   * Records her membership on the server once the doors have opened
   * (ADR-022). Best effort: without a member session nothing is recorded.
   */
  enter(): Promise<void>;
  /**
   * Asks the provider to start reading the journey. Stable. Called by
   * `useJourney`, so pages that never consult the journey (the locked
   * doors) make no request for it.
   */
  want(): void;
}

export const JourneyContext = createContext<JourneyValue | null>(null);

/** The journey, or null outside the application's provider. */
export function useJourney(): JourneyValue | null {
  const journey = useContext(JourneyContext);
  const want = journey?.want;
  useEffect(() => want?.(), [want]);
  return journey;
}
