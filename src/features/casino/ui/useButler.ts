import { useCallback, useEffect, useRef, useState } from 'react';
import { speechDuration } from '../../entrance/domain/butlerScript';
import { nextLine, type CasinoMoment } from '../domain/butler';

export interface CasinoSpeech {
  key: number;
  text: string;
}

/** Gentle spacing between lines, so he never talks over the game. */
const MIN_GAP_MS = 3500;

/**
 * The butler's voice in the casino. Lines walk each moment's pool in order
 * (never the same line twice running) and are rationed: a line requested
 * too soon after the last is dropped, unless it is marked important.
 */
export function useButler(now: () => number = Date.now) {
  const [speech, setSpeech] = useState<CasinoSpeech | null>(null);
  const cursors = useRef<Partial<Record<CasinoMoment, number>>>({});
  const last = useRef<{ text: string; at: number } | null>(null);
  const counter = useRef(0);

  const say = useCallback(
    (moment: CasinoMoment, important = false) => {
      const at = now();
      if (!important && last.current && at - last.current.at < MIN_GAP_MS)
        return;
      const cursor = cursors.current[moment] ?? 0;
      cursors.current[moment] = cursor + 1;
      const text = nextLine(moment, cursor, last.current?.text);
      last.current = { text, at };
      counter.current += 1;
      setSpeech({ key: counter.current, text });
    },
    [now],
  );

  useEffect(() => {
    if (!speech) return;
    const timer = setTimeout(
      () => setSpeech(null),
      Math.min(9000, speechDuration(speech.text) * 0.75),
    );
    return () => clearTimeout(timer);
  }, [speech]);

  return { speech, say, hush: () => setSpeech(null) };
}
