import { useEffect, useRef, useState } from 'react';
import {
  describeRemaining,
  msUntilNextTick,
  pad,
  remainingUntil,
} from '../../entrance/domain/countdown';

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
] as const;

/**
 * An engraved countdown inside the opened letter. It owns its own one-second
 * clock, so only this small element rerenders each second, never the
 * entrance. Every figure derives from the absolute `target` instant, so the
 * device's time zone cannot affect it. `onElapsed` fires once at zero.
 */
export function LetterCountdown({
  target,
  now,
  onElapsed,
}: {
  target: number;
  now(): number;
  onElapsed(): void;
}) {
  const [current, setCurrent] = useState(() => now());
  const elapsed = useRef(onElapsed);
  useEffect(() => {
    elapsed.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const at = now();
      setCurrent(at);
      if (at >= target) {
        elapsed.current();
        return;
      }
      timer = setTimeout(tick, msUntilNextTick(at, target));
    };
    timer = setTimeout(tick, msUntilNextTick(now(), target));
    return () => clearTimeout(timer);
  }, [target, now]);

  const remaining = remainingUntil(current, target);

  return (
    <div className="letter-clock" role="timer" aria-label="Time until opening">
      <p className="sr-only">{describeRemaining(remaining)}</p>
      <div className="letter-clock__case" aria-hidden="true">
        {UNITS.map(({ key, label }, index) => (
          <div key={key} className="letter-clock__unit">
            {index > 0 && <span className="letter-clock__jewel" />}
            <span className="letter-clock__figures">{pad(remaining[key])}</span>
            <span className="letter-clock__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
