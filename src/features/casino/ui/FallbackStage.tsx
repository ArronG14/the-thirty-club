import { useEffect, useState } from 'react';
import { colourOf, WHEEL_ORDER } from '../domain/roulette';
import { symbolAt, STRIPS, type SlotSymbol } from '../domain/slots';
import { POCKET_STEP } from '../scene/casinoMath';
import { SymbolIcon } from './SymbolIcon';

export type FallbackSpin =
  | { game: 'roulette'; pocket: number; key: number }
  | { game: 'slots'; stops: readonly number[]; key: number }
  | null;

const COLOURS = { red: '#a3122d', black: '#0e0e10', green: '#0c6b3e' } as const;

const WHEEL_GRADIENT = `conic-gradient(from ${-POCKET_STEP / 2}rad, ${WHEEL_ORDER.map(
  (n, i) =>
    `${COLOURS[colourOf(n)]} ${((i / WHEEL_ORDER.length) * 100).toFixed(3)}% ${(((i + 1) / WHEEL_ORDER.length) * 100).toFixed(3)}%`,
).join(', ')})`;

/**
 * What the games show when the 3D room is unavailable: a flat wheel that
 * really turns to the engine's pocket, and three reels that really stop on
 * the engine's symbols. The same results, honestly without the theatre.
 */
export function FallbackStage({
  game,
  spin,
  reducedMotion,
}: {
  game: 'roulette' | 'slots';
  spin: FallbackSpin;
  reducedMotion: boolean;
}) {
  return (
    <div className="fallback" data-game={game}>
      {game === 'roulette' ? (
        <FallbackWheel
          spin={spin?.game === 'roulette' ? spin : null}
          reducedMotion={reducedMotion}
        />
      ) : (
        <FallbackReels
          spin={spin?.game === 'slots' ? spin : null}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}

function FallbackWheel({
  spin,
  reducedMotion,
}: {
  spin: Extract<FallbackSpin, { game: 'roulette' }> | null;
  reducedMotion: boolean;
}) {
  const key = spin?.key ?? 0;
  const pocket = spin?.pocket ?? 0;
  // Whole turns grow with every spin, so the wheel always travels forward.
  const turns = key * (reducedMotion ? 1 : 5);
  const angle = turns * 360 - (pocket * POCKET_STEP * 180) / Math.PI;
  return (
    <div className="fallback__wheel" aria-hidden="true">
      <div
        className="fallback__disc"
        style={{
          background: WHEEL_GRADIENT,
          transform: `rotate(${angle}deg)`,
          transition: key
            ? `transform ${reducedMotion ? 1.2 : 3.2}s cubic-bezier(0.15, 0.7, 0.2, 1)`
            : 'none',
        }}
      />
      <div className="fallback__hub" />
      <div className="fallback__pointer" />
    </div>
  );
}

function FallbackReels({
  spin,
  reducedMotion,
}: {
  spin: Extract<FallbackSpin, { game: 'slots' }> | null;
  reducedMotion: boolean;
}) {
  const [shown, setShown] = useState<SlotSymbol[]>(() => [
    symbolAt(0, 0),
    symbolAt(1, 1),
    symbolAt(2, 2),
  ]);
  const key = spin?.key ?? 0;
  const stops = spin?.stops;
  useEffect(() => {
    if (!key || !stops) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = setInterval(() => {
      setShown((current) =>
        current.map((symbol, reel) => {
          const strip = STRIPS[reel]!;
          return strip[Math.floor(Math.random() * strip.length)] ?? symbol;
        }),
      );
    }, 90);
    stops.forEach((stop, reel) => {
      timers.push(
        setTimeout(
          () => {
            setShown((current) =>
              current.map((s, i) => (i === reel ? symbolAt(reel, stop) : s)),
            );
            if (reel === stops.length - 1) clearInterval(cycle);
          },
          (reducedMotion ? 400 : 1100) + reel * (reducedMotion ? 200 : 600),
        ),
      );
    });
    return () => {
      clearInterval(cycle);
      timers.forEach(clearTimeout);
    };
  }, [key, stops, reducedMotion]);
  return (
    <div className="fallback__reels" aria-hidden="true">
      {shown.map((symbol, i) => (
        <span key={i} className="fallback__reel">
          <SymbolIcon symbol={symbol} decorative />
        </span>
      ))}
    </div>
  );
}
