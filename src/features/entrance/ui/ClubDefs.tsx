import { memo } from 'react';

/**
 * Shared SVG paint servers (brass, mahogany, glass, wood grain). Rendered
 * once per screen at zero size — not display:none, which stops WebKit
 * resolving gradients — and referenced by id from every architectural SVG.
 */
export const ClubDefs = memo(function ClubDefs() {
  return (
    <svg className="club-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tc-brass" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#7c5c2c" />
          <stop offset="0.22" stopColor="#e9d39b" />
          <stop offset="0.42" stopColor="#c4a46a" />
          <stop offset="0.7" stopColor="#7a5a2a" />
          <stop offset="1" stopColor="#b8955a" />
        </linearGradient>
        <linearGradient id="tc-brass-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6d4f24" />
          <stop offset="0.35" stopColor="#d9bf84" />
          <stop offset="0.55" stopColor="#f1e0b0" />
          <stop offset="0.75" stopColor="#a8854c" />
          <stop offset="1" stopColor="#6d4f24" />
        </linearGradient>
        <linearGradient id="tc-mahogany" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d1b14" />
          <stop offset="0.45" stopColor="#4f2219" />
          <stop offset="1" stopColor="#25110d" />
        </linearGradient>
        <linearGradient id="tc-mahogany-panel" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#562619" />
          <stop offset="0.5" stopColor="#40190f" />
          <stop offset="1" stopColor="#2c120c" />
        </linearGradient>
        <linearGradient id="tc-walnut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e211e" />
          <stop offset="1" stopColor="#1a1211" />
        </linearGradient>
        <linearGradient id="tc-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a302b" />
          <stop offset="1" stopColor="#1b1514" />
        </linearGradient>
        <radialGradient id="tc-warm" cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#fff1cf" />
          <stop offset="0.35" stopColor="#f0c27a" />
          <stop offset="0.75" stopColor="#9a5326" />
          <stop offset="1" stopColor="#4a1424" />
        </radialGradient>
        <radialGradient id="tc-enamel" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#2a1c1f" />
          <stop offset="1" stopColor="#0b0b0d" />
        </radialGradient>
        {/* Long-grain figure: noise stretched along the vertical axis. */}
        <filter id="tc-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.42"
            numOctaves="2"
            seed="30"
          />
          <feColorMatrix values="0 0 0 0 0.09  0 0 0 0 0.03  0 0 0 0 0.02  0 0 0 -1.6 1.05" />
        </filter>
      </defs>
    </svg>
  );
});
