import { useEffect, useState } from 'react';

/** The drum on every flap, in the order a real unit turns through. */
const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·-';
const STEP_MS = 48;
/** A flap never turns more than this many places for one change. */
const MAX_TURNS = 10;
/** Each flap starts a little after the one to its left. */
const STAGGER = 0.6;

function fit(text: string, width: number): string {
  return text.toUpperCase().slice(0, width).padEnd(width, ' ');
}

/** The characters a flap shows on its way from `a` to `b`. */
function path(a: string, b: string): string[] {
  if (a === b) return [b];
  const from = DRUM.indexOf(a);
  const to = DRUM.indexOf(b);
  if (from < 0 || to < 0) return [a, b];
  const distance = (to - from + DRUM.length) % DRUM.length;
  const turns = Math.min(distance, MAX_TURNS);
  const start = (to - turns + DRUM.length) % DRUM.length;
  return [
    a,
    ...Array.from(
      { length: turns },
      (_, k) => DRUM[(start + k + 1) % DRUM.length] ?? b,
    ),
  ];
}

interface Turning {
  from: string;
  to: string;
  frame: number;
}

function display({ from, to, frame }: Turning): string {
  return [...to]
    .map((want, i) => {
      const steps = path(from[i] ?? ' ', want);
      const index = Math.max(
        0,
        Math.min(steps.length - 1, Math.floor(frame - i * STAGGER)),
      );
      return steps[index] ?? want;
    })
    .join('');
}

/**
 * One row of flaps. When the text changes, each flap turns through the drum
 * from its old character to its new one, staggered from left to right, as a
 * departures board does. Reduced motion shows the new text at once.
 */
function FlapRow({
  text,
  width,
  still,
}: {
  text: string;
  width: number;
  still: boolean;
}) {
  const target = fit(text, width);
  // On arrival the board turns from blank, as boards do when they wake.
  const [turning, setTurning] = useState<Turning>({
    from: ' '.repeat(width),
    to: target,
    frame: 0,
  });
  // A new destination starts turning from whatever is showing now.
  if (turning.to !== target) {
    setTurning({ from: display(turning), to: target, frame: 0 });
  }
  const frames = width * STAGGER + MAX_TURNS + 1;
  const moving =
    !still && turning.from !== turning.to && turning.frame < frames;

  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(
      () => setTurning((t) => ({ ...t, frame: t.frame + 1 })),
      STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [moving, turning]);

  const shown = still ? target : display(turning);
  return (
    <span className="flap-row" aria-hidden="true">
      {[...shown].map((char, i) => (
        <span key={i} className="flap">
          <span key={char} className="flap__char" data-blank={char === ' '}>
            {char}
          </span>
        </span>
      ))}
    </span>
  );
}

export interface BoardLine {
  label: string;
  text: string;
}

/** The brass departures board above the lounge. */
export function SplitFlapBoard({
  lines,
  width = 15,
  still,
}: {
  lines: readonly BoardLine[];
  width?: number;
  still: boolean;
}) {
  return (
    <section className="board" aria-label="Departures">
      <div className="board__rivets" aria-hidden="true" />
      {lines.map((line) => (
        <div key={line.label} className="board__line">
          <span className="board__label">{line.label}</span>
          <FlapRow text={line.text} width={width} still={still} />
          <span className="sr-only">{line.text}</span>
        </div>
      ))}
    </section>
  );
}
