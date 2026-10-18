import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from '../../shared/ui/useReducedMotion';
import {
  anticipation,
  msUntilNextTick,
  openingInstant,
  remainingUntil,
  timePhase,
} from './domain/countdown';
import {
  ceremonyTimeline,
  entranceReducer,
  initialEntranceState,
  nextRecord,
} from './domain/entranceMachine';
import type { EntranceEnvironment } from './domain/environment';

/** Lands each tick just after the displayed second changes. */
const TICK_SLACK_MS = 8;

export function useEntrance(
  { clock, storage, card }: EntranceEnvironment,
  { presentedNow = false }: { presentedNow?: boolean } = {},
) {
  const reducedMotion = useReducedMotion();
  const [initialRecord] = useState(() => storage.load());
  const recordRef = useRef(initialRecord);
  const [member, setMember] = useState(() => card.isPresented());
  const memberRef = useRef(member);
  const [now, setNow] = useState(() => clock.now());
  const [state, dispatch] = useReducer(entranceReducer, undefined, () =>
    initialEntranceState({
      phase: timePhase(clock.now(), openingInstant()),
      record: initialRecord,
      member,
      presentedNow,
    }),
  );
  const counting = state.stage === 'locked' || state.stage === 'final-minute';

  // Recompute from the real clock every second, and immediately whenever the
  // page returns from the background, bfcache or device sleep.
  useEffect(() => {
    if (!counting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = clock.now();
      const target = openingInstant();
      setNow(current);
      dispatch({
        type: 'time',
        phase: timePhase(current, target),
        member: memberRef.current,
      });
      timer = setTimeout(
        tick,
        msUntilNextTick(current, target) + TICK_SLACK_MS,
      );
    };
    const resync = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      tick();
    };
    timer = setTimeout(
      tick,
      msUntilNextTick(clock.now(), openingInstant()) + TICK_SLACK_MS,
    );
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('pageshow', resync);
    window.addEventListener('focus', resync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('pageshow', resync);
      window.removeEventListener('focus', resync);
    };
  }, [clock, counting]);

  // Ceremony beats.
  useEffect(() => {
    if (state.stage !== 'unlocking' && state.stage !== 'opening') return;
    const timeline = ceremonyTimeline(reducedMotion);
    const delay =
      state.stage === 'unlocking' ? timeline.unlockingMs : timeline.openingMs;
    const timer = setTimeout(() => dispatch({ type: 'advance' }), delay);
    return () => clearTimeout(timer);
  }, [state.stage, reducedMotion]);

  // Remember the unlock and the completed ceremony on this device.
  useEffect(() => {
    const next = nextRecord(
      recordRef.current,
      state,
      new Date(clock.now()).toISOString(),
    );
    if (next !== recordRef.current) {
      recordRef.current = next;
      storage.save(next);
    }
  }, [clock, state, storage]);

  const target = openingInstant();
  const enter = useCallback(() => dispatch({ type: 'enter' }), []);
  /** The card has just been presented (by hand, or seen on another device). */
  const presentMembership = useCallback(() => {
    memberRef.current = true;
    setMember(true);
    dispatch({ type: 'credential' });
  }, []);
  const replay = useCallback(() => dispatch({ type: 'replay' }), []);
  const currentHour = useCallback(
    () => new Date(clock.now()).getHours(),
    [clock],
  );

  return {
    stage: state.stage,
    welcomed: state.welcomed,
    remaining: remainingUntil(counting ? now : target, target),
    anticipation: counting ? anticipation(now, target) : 1,
    reducedMotion,
    member,
    /** The entrance clock, refreshed every second while counting. */
    now,
    enter,
    replay,
    presentMembership,
    currentHour,
  };
}

export type EntranceModel = ReturnType<typeof useEntrance>;
