/**
 * Small pieces of drawn material for the Departure Lounge: the wax seal,
 * the ink stamp and the emblem. Inline SVG with gradients only (no filters),
 * so they stay sharp at 3× and cheap on an iPhone. All decorative.
 */
import { useId } from 'react';

/** A scalloped disc, the irregular rim of pressed wax. */
function waxRim(r: number, bumps: number, depth: number): string {
  const points: string[] = [];
  for (let i = 0; i <= bumps * 4; i += 1) {
    const angle = (i / (bumps * 4)) * Math.PI * 2;
    const wobble =
      Math.sin(angle * bumps) * depth + Math.sin(angle * 3 + 1.3) * depth * 0.6;
    const radius = r + wobble;
    points.push(
      `${(50 + Math.cos(angle) * radius).toFixed(2)},${(50 + Math.sin(angle) * radius).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

const RIM = waxRim(44, 9, 1.8);

/**
 * The oxblood seal with an embossed "30". Drawn as two halves so the
 * envelope can break it: `.seal__half--left` / `--right`.
 */
export function WaxSeal({ lit = true }: { lit?: boolean }) {
  const id = useId().replace(/:/g, '');
  const halves = [
    { side: 'left', clip: 'M0,0 L52,0 L47,38 L54,58 L48,100 L0,100 Z' },
    { side: 'right', clip: 'M52,0 L100,0 L100,100 L48,100 L54,58 L47,38 Z' },
  ] as const;
  return (
    <svg
      className="seal"
      data-lit={lit}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-wax`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={lit ? '#b0303f' : '#5b2a30'} />
          <stop offset="0.45" stopColor={lit ? '#7c1626' : '#3c1a1e'} />
          <stop offset="1" stopColor={lit ? '#3a0710' : '#1e0d10'} />
        </radialGradient>
        <radialGradient id={`${id}-well`} cx="55%" cy="60%" r="60%">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        {halves.map(({ side, clip }) => (
          <clipPath key={side} id={`${id}-${side}`}>
            <path d={clip} />
          </clipPath>
        ))}
      </defs>
      {halves.map(({ side }) => (
        <g
          key={side}
          className={`seal__half seal__half--${side}`}
          clipPath={`url(#${id}-${side})`}
        >
          <path d={RIM} fill={`url(#${id}-wax)`} />
          <circle cx="50" cy="50" r="31" fill={`url(#${id}-well)`} />
          <circle
            cx="50"
            cy="50"
            r="31"
            fill="none"
            stroke="#000"
            strokeOpacity="0.35"
            strokeWidth="1.6"
          />
          <circle
            cx="50"
            cy="50.8"
            r="31"
            fill="none"
            stroke="#ffb7a8"
            strokeOpacity={lit ? 0.22 : 0.08}
            strokeWidth="0.8"
          />
          <text
            x="50"
            y="61.5"
            textAnchor="middle"
            className="seal__mark seal__mark--shadow"
          >
            30
          </text>
          <text
            x="50"
            y="60.5"
            textAnchor="middle"
            className="seal__mark"
            fill={lit ? '#e8a598' : '#7a4a4f'}
            fillOpacity="0.55"
          >
            30
          </text>
          <path
            d="M28,30 Q38,20 52,19"
            fill="none"
            stroke="#fff"
            strokeOpacity={lit ? 0.32 : 0.1}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * The concierge's ink stamp: a double ring with the club's name around it
 * and a word across the middle.
 */
export function InkStamp({
  word,
  date,
  tone = 'oxblood',
}: {
  word: string;
  date: string;
  tone?: 'oxblood' | 'navy';
}) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="ink-stamp"
      data-tone={tone}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path
          id={`${id}-ring`}
          d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0"
        />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" strokeWidth="3" />
      <circle cx="60" cy="60" r="50" fill="none" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="31" fill="none" strokeWidth="1.2" />
      <text className="ink-stamp__ring">
        <textPath href={`#${id}-ring`} startOffset="0">
          THE THIRTY CLUB · CONCIERGE · THE THIRTY CLUB · CONCIERGE ·
        </textPath>
      </text>
      <rect
        x="6"
        y="49"
        width="108"
        height="22"
        rx="1"
        className="ink-stamp__band"
      />
      <text x="60" y="65" textAnchor="middle" className="ink-stamp__word">
        {word.toUpperCase()}
      </text>
      <text x="60" y="84" textAnchor="middle" className="ink-stamp__date">
        {date}
      </text>
    </svg>
  );
}

/** The club's emblem: a "30" within a sunburst, for letterheads. */
export function Emblem() {
  const rays = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg
      className="emblem"
      viewBox="0 0 60 60"
      aria-hidden="true"
      focusable="false"
    >
      {rays.map((angle) => (
        <line
          key={angle}
          x1="30"
          y1="30"
          x2={30 + Math.cos((angle * Math.PI) / 180) * 28}
          y2={30 + Math.sin((angle * Math.PI) / 180) * 28}
          strokeWidth={angle % 45 === 0 ? 0.9 : 0.45}
        />
      ))}
      <circle cx="30" cy="30" r="13.5" className="emblem__disc" />
      <circle cx="30" cy="30" r="13.5" fill="none" strokeWidth="0.8" />
      <text x="30" y="34.6" textAnchor="middle" className="emblem__mark">
        30
      </text>
    </svg>
  );
}
