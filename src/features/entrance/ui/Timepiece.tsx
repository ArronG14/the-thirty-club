import { useState } from 'react';
import { describeRemaining, pad, type Remaining } from '../domain/countdown';

/**
 * A single number drum. On change it briefly holds the outgoing and incoming
 * figures and rolls between them, like a wheel turning behind an aperture.
 * Reduced motion shows only the current figure.
 */
function Drum({ digit, still }: { digit: string; still: boolean }) {
  const [roll, setRoll] = useState({ from: digit, to: digit, turn: 0 });
  if (roll.to !== digit) {
    setRoll({ from: roll.to, to: digit, turn: roll.turn + 1 });
  }
  const rolling = !still && roll.turn > 0 && roll.from !== roll.to;
  return (
    <span className="drum">
      {rolling ? (
        <span key={roll.turn} className="drum__strip drum__strip--rolling">
          <span>{roll.to}</span>
          <span>{roll.from}</span>
        </span>
      ) : (
        <span className="drum__strip">
          <span>{roll.to}</span>
        </span>
      )}
    </span>
  );
}

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
] as const;

export function Timepiece({
  remaining,
  reducedMotion,
}: {
  remaining: Remaining;
  reducedMotion: boolean;
}) {
  return (
    <div
      className="timepiece"
      role="timer"
      aria-label="Time until the club opens"
    >
      <p className="sr-only">{describeRemaining(remaining)}</p>
      <div className="timepiece__case" aria-hidden="true">
        {UNITS.map(({ key, label }, index) => {
          const figures = pad(remaining[key]);
          return (
            <div key={key} className="timepiece__unit">
              {index > 0 && <span className="timepiece__jewel" />}
              <span className="timepiece__window">
                {[...figures].map((digit, i) => (
                  <Drum
                    key={`${figures.length}-${i}`}
                    digit={digit}
                    still={reducedMotion}
                  />
                ))}
              </span>
              <span className="timepiece__label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
