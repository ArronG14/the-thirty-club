import { memo } from 'react';

type Side = 'left' | 'right';

/** Sunburst rays for the left leaf; the right leaf mirrors them. */
const RAYS = Array.from({ length: 10 }, (_, i) => {
  const angle = Math.PI / 2 + (i * Math.PI) / 2 / 9; // 90° → 180°
  return {
    x1: 120 + Math.cos(angle) * 30,
    y1: 166 - Math.sin(angle) * 30,
    x2: 120 + Math.cos(angle) * 220,
    y2: 166 - Math.sin(angle) * 220,
  };
});

/**
 * One mahogany leaf, drawn as the left-hand door in a 120×360 field (hinge at
 * x=0, meeting stile at x=120). The right leaf mirrors the joinery, but the
 * medallion is drawn unmirrored on the meeting edge so its "3" and "0" part
 * as the doors open.
 */
export const DoorLeaf = memo(function DoorLeaf({ side }: { side: Side }) {
  const clip = `tc-sun-${side}`;
  const meeting = side === 'left' ? 120 : 0;
  return (
    <svg
      className="door__art"
      viewBox="0 0 120 360"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="16" y="18" width="104" height="148" />
        </clipPath>
      </defs>
      <g
        transform={
          side === 'right' ? 'translate(120 0) scale(-1 1)' : undefined
        }
      >
        {/* Body and figure */}
        <rect width="120" height="360" fill="url(#tc-mahogany)" />
        <rect width="120" height="360" filter="url(#tc-grain)" opacity="0.55" />
        {/* Stile and rail moulding */}
        <rect
          x="5.5"
          y="5.5"
          width="114"
          height="349"
          fill="none"
          stroke="#120806"
          strokeWidth="1"
        />
        <rect
          x="7"
          y="7"
          width="111"
          height="346"
          fill="none"
          stroke="#c4a46a"
          strokeOpacity="0.28"
          strokeWidth="0.5"
        />

        {/* Upper panel with rising-sun marquetry */}
        <rect
          x="16"
          y="18"
          width="104"
          height="148"
          fill="url(#tc-mahogany-panel)"
        />
        <g clipPath={`url(#${clip})`}>
          {RAYS.map((ray, i) => (
            <line
              key={i}
              {...ray}
              stroke="url(#tc-brass)"
              strokeWidth={i % 3 === 0 ? 1.1 : 0.55}
              strokeOpacity={i % 3 === 0 ? 0.95 : 0.7}
            />
          ))}
          <circle
            cx="120"
            cy="166"
            r="40"
            fill="none"
            stroke="url(#tc-brass)"
            strokeWidth="0.6"
            strokeOpacity="0.8"
          />
          <circle
            cx="120"
            cy="166"
            r="22"
            fill="url(#tc-brass)"
            opacity="0.92"
          />
          <circle
            cx="120"
            cy="166"
            r="17"
            fill="none"
            stroke="#3a2610"
            strokeWidth="0.6"
            strokeOpacity="0.6"
          />
        </g>
        <path
          d="M16 166 V18 H120"
          fill="none"
          stroke="#f4ebdd"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
        <path
          d="M16 166 H120"
          stroke="#000"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        <rect
          x="19.5"
          y="21.5"
          width="100.5"
          height="141"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.7"
          strokeOpacity="0.85"
        />

        {/* Mid rail inlay */}
        <line
          x1="12"
          y1="176"
          x2="120"
          y2="176"
          stroke="url(#tc-brass-h)"
          strokeWidth="0.8"
        />
        <line
          x1="12"
          y1="196"
          x2="120"
          y2="196"
          stroke="url(#tc-brass-h)"
          strokeWidth="0.8"
        />

        {/* Lower panel: stepped deco fielding */}
        <rect
          x="16"
          y="206"
          width="94"
          height="112"
          fill="url(#tc-mahogany-panel)"
        />
        <path
          d="M16 318 V206 H110"
          fill="none"
          stroke="#f4ebdd"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
        <path
          d="M16 318 H110 V206"
          fill="none"
          stroke="#000"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        <path
          d="M24 310 V226 L32 218 H62 L70 214 H102 V310 Z"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.7"
        />
        <path
          d="M32 302 V232 L38 226 H62 L70 222 H94 V302 Z"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.45"
          strokeOpacity="0.7"
        />
        <g stroke="url(#tc-brass)" strokeWidth="0.4" strokeOpacity="0.55">
          <line x1="54" y1="240" x2="54" y2="294" />
          <line x1="60" y1="236" x2="60" y2="294" />
          <line x1="66" y1="240" x2="66" y2="294" />
        </g>

        {/* Kick plate */}
        <rect
          x="8"
          y="326"
          width="112"
          height="26"
          fill="url(#tc-brass)"
          opacity="0.88"
        />
        <g stroke="#3a2610" strokeOpacity="0.35" strokeWidth="0.35">
          <line x1="8" y1="331" x2="120" y2="331" />
          <line x1="8" y1="347" x2="120" y2="347" />
        </g>

        {/* Pull handle */}
        <rect x="99" y="214" width="3" height="8" fill="#5c4220" />
        <rect x="99" y="290" width="3" height="8" fill="#5c4220" />
        <rect
          x="96.5"
          y="208"
          width="6"
          height="96"
          rx="3"
          fill="url(#tc-brass-h)"
        />
        <rect
          x="97.5"
          y="210"
          width="1.2"
          height="92"
          rx="0.6"
          fill="#fff6dc"
          opacity="0.55"
        />

        {/* Meeting-stile shadow */}
        <rect x="117" y="0" width="3" height="360" fill="#000" opacity="0.5" />
      </g>

      {/* Medallion straddling the meeting edge */}
      <g className="door__medallion">
        <circle cx={meeting} cy="186" r="17" fill="url(#tc-brass)" />
        <circle cx={meeting} cy="186" r="13.2" fill="url(#tc-enamel)" />
        <circle
          cx={meeting}
          cy="186"
          r="12"
          fill="none"
          stroke="#c4a46a"
          strokeWidth="0.35"
        />
        <text
          x={meeting}
          y="191.2"
          textAnchor="middle"
          className="door__monogram"
        >
          30
        </text>
      </g>
    </svg>
  );
});
