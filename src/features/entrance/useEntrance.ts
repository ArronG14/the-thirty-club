import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from '../../shared/ui/useReducedMotion';
import {
  anticipation,
  msUntilNextTick,
  openingInstant,
  remainingUntil,
  timePhase,
  type TimePhase,
} from './domain/countdown';
import {
  earlyActive,
  earlyView,
  parseEntrance,
  resumableStart,
  serverOffset,
  shouldStartFinal,
  type EarlyAdmission,
} from './domain/earlyAdmission';
import {
  ceremonyTimeline,
  entranceReducer,
  initialEntranceState,
  nextRecord,
} from './domain/entranceMachine';
import type { EntranceEnvironment } from './domain/environment';

/** Lands each tick just after the displayed second changes. */
const TICK_SLACK_MS = 8;
/** How often the entrance asks the server about an early opening. */
const ADMISSION_REFRESH_MS = 60_000;

interface Timing {
  phase: TimePhase;
  /** A target such that `target - now` is what the clock shows. */
  now: number;
  target: number;
  /** The doors may open: server-eligible and the card presented (ADR-023). */
  admitted: boolean;
}

export function useEntrance(
  { clock, storage, card, admission: source }: EntranceEnvironment,
  { presentedNow = false }: { presentedNow?: boolean } = {},
) {
  const reducedMotion = useReducedMotion();
  const [initialRecord] = useState(() => storage.load());
  const recordRef = useRef(initialRecord);
  const [member, setMember] = useState(() => card.isPresented());
  const memberRef = useRef(member);

  // Early admission (ADR-022): the server's schedule and this device's
  // memory of the final ten seconds.
  const [early, setEarly] = useState<EarlyAdmission | null>(null);
  const earlyRef = useRef(early);
  const finalRef = useRef<number | null>(null);
  // Server clock minus device clock, once the server has answered.
  const offsetRef = useRef(0);

  /** What the clock shows now, and whether the doors may open. */
  const timing = useCallback((): Timing => {
    const deviceNow = clock.now();
    const birthday = openingInstant();
    const e = earlyRef.current;
    if (earlyActive(e, birthday) && deviceNow + e.offsetMs < birthday) {
      const now = deviceNow + e.offsetMs;
      const view = earlyView(now, e, finalRef.current);
      return {
        phase: view.phase,
        now,
        target: now + view.remainingMs,
        admitted: e.eligible && memberRef.current,
      };
    }
    // The birthday's own countdown, by the server's clock once known.
    const now = deviceNow + offsetRef.current;
    return {
      phase: timePhase(now, birthday),
      now,
      target: birthday,
      admitted: false,
    };
  }, [clock]);

  // Before the server has answered, the birthday's own countdown.
  const [view, setView] = useState<Timing>(() => {
    const now = clock.now();
    const target = openingInstant();
    return { phase: timePhase(now, target), now, target, admitted: false };
  });
  const [state, dispatch] = useReducer(entranceReducer, undefined, () =>
    initialEntranceState({
      phase: timePhase(clock.now(), openingInstant()),
      record: initialRecord,
      member,
      presentedNow,
    }),
  );
  const counting = state.stage === 'locked' || state.stage === 'final-minute';

  /** Re-evaluates the clock, and begins the final ten seconds if due. */
  const evaluate = useCallback(() => {
    const e = earlyRef.current;
    if (e && source) {
      const now = clock.now() + e.offsetMs;
      if (
        shouldStartFinal(
          now,
          e,
          finalRef.current,
          document.visibilityState !== 'hidden',
          memberRef.current,
        )
      ) {
        finalRef.current = now;
        source.saveFinalStart(now);
      }
    }
    const next = timing();
    setView(next);
    dispatch({
      type: 'time',
      phase: next.phase,
      member: memberRef.current || next.admitted,
    });
    return next;
  }, [clock, source, timing]);

  // Ask the server about an early opening: now, every minute, on return to
  // the page, and exactly when the doors are due (so a watcher sees the
  // final ten seconds begin on time).
  useEffect(() => {
    if (!source || !counting) return;
    let alive = true;
    let due: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const data = await source.read();
      if (!alive) return;
      const deviceNow = clock.now();
      // Unreachable: keep what the server last said (never invent eligibility).
      const offset = serverOffset(data, deviceNow);
      if (offset !== null) offsetRef.current = offset;
      if (data !== null) {
        const next = parseEntrance(data, deviceNow);
        earlyRef.current = next;
        setEarly(next);
      }
      const current = earlyRef.current;
      if (current && finalRef.current === null)
        finalRef.current = resumableStart(
          source.loadFinalStart(),
          deviceNow + current.offsetMs,
        );
      clearTimeout(due);
      if (current && !current.eligible) {
        const wait = current.opensAt - (deviceNow + current.offsetMs);
        if (wait > 0 && wait < 2 ** 31 - 1)
          due = setTimeout(() => void read(), wait + 800);
      }
      evaluate();
    };
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void read();
    }, ADMISSION_REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Looking away during the final ten seconds: they begin again.
        if (finalRef.current !== null) {
          finalRef.current = null;
          source.saveFinalStart(null);
        }
        return;
      }
      void read();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(due);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clock, counting, evaluate, source]);

  // Recompute from the real clock every second, and immediately whenever the
  // page returns from the background, bfcache or device sleep.
  useEffect(() => {
    if (!counting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const next = evaluate();
      timer = setTimeout(
        tick,
        msUntilNextTick(next.now, next.target) + TICK_SLACK_MS,
      );
    };
    const resync = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      tick();
    };
    const first = timing();
    timer = setTimeout(
      tick,
      msUntilNextTick(first.now, first.target) + TICK_SLACK_MS,
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
  }, [counting, evaluate, timing]);

  // Once the doors have opened, the final ten seconds are spent.
  useEffect(() => {
    if (!source || counting || finalRef.current === null) return;
    finalRef.current = null;
    source.saveFinalStart(null);
  }, [counting, source]);

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

  const enter = useCallback(() => dispatch({ type: 'enter' }), []);
  /** The card has just been presented (by hand, or seen on another device). */
  const presentMembership = useCallback(() => {
    memberRef.current = true;
    setMember(true);
    dispatch({ type: 'credential' });
    // Early admission: the final ten seconds may begin at once.
    evaluate();
  }, [evaluate]);

  // Another tab of this browser (the card's link opens a new Safari tab):
  // a card presented there counts here, and a ceremony completed there is
  // not played again here.
  useEffect(() => {
    const recheck = () => {
      if (!memberRef.current && card.isPresented()) presentMembership();
      const stored = storage.load();
      if (stored.ceremonySeenAt && !recordRef.current.ceremonySeenAt) {
        recordRef.current = stored;
        dispatch({ type: 'admitted' });
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') recheck();
    };
    window.addEventListener('storage', recheck);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', recheck);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [card, storage, presentMembership]);
  const replay = useCallback(() => dispatch({ type: 'replay' }), []);
  /** Already a member by the server's record: no second ceremony. */
  const admitted = useCallback(() => dispatch({ type: 'admitted' }), []);
  const currentHour = useCallback(
    () => new Date(clock.now()).getHours(),
    [clock],
  );

  return {
    stage: state.stage,
    welcomed: state.welcomed,
    remaining: remainingUntil(counting ? view.now : view.target, view.target),
    anticipation: counting ? anticipation(view.now, view.target) : 1,
    reducedMotion,
    member,
    /** The doors open early by the owner's schedule (ADR-022). */
    early: early !== null && earlyActive(early, openingInstant()),
    /** 19:00 has fired on the server: the doors wait only for the card. */
    eligible:
      early !== null && earlyActive(early, openingInstant()) && early.eligible,
    /** The Butler's 19:00 letter (with the clue), once the server shows it. */
    earlyLetter:
      early !== null && earlyActive(early, openingInstant())
        ? early.letter
        : null,
    /** The entrance clock, refreshed every second while counting. */
    now: view.now,
    enter,
    replay,
    presentMembership,
    admitted,
    currentHour,
  };
}

export type EntranceModel = ReturnType<typeof useEntrance>;
