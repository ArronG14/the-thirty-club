import { memo } from 'react';
import { DoorLeaf } from './DoorLeaf';

/** Fanlight glazing bars radiating from the head of the doors. */
const GLAZING = Array.from({ length: 13 }, (_, i) => {
  const angle = (i * Math.PI) / 12;
  return {
    x2: 150 + Math.cos(angle) * 140,
    y2: 100 - Math.sin(angle) * 140,
  };
});

/**
 * Stone and walnut surround in a 300×470 field. The door aperture occupies
 * x 30–270, y 100–460; the HTML door leaves are positioned to match.
 */
const PortalFrame = memo(function PortalFrame() {
  return (
    <svg
      className="portal__frame"
      viewBox="0 0 300 470"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="tc-crown">
          <path d="M2 470 V64 H14 V46 H32 V30 H62 V16 H104 V6 H196 V16 H238 V30 H268 V46 H286 V64 H298 V470 Z" />
        </clipPath>
        <clipPath id="tc-lunette">
          <path d="M40 100 A110 68 0 0 1 260 100 Z" />
        </clipPath>
        <mask id="tc-aperture-cut">
          <rect width="300" height="470" fill="#fff" />
          <rect x="30" y="100" width="240" height="360" fill="#000" />
          <path d="M40 100 A110 68 0 0 1 260 100 Z" fill="#000" />
        </mask>
      </defs>

      <g mask="url(#tc-aperture-cut)">
        {/* Stepped Art Deco crown */}
        <path
          d="M2 470 V64 H14 V46 H32 V30 H62 V16 H104 V6 H196 V16 H238 V30 H268 V46 H286 V64 H298 V470 Z"
          fill="url(#tc-walnut)"
        />
        <g clipPath="url(#tc-crown)">
          <rect
            width="300"
            height="470"
            filter="url(#tc-grain)"
            opacity="0.35"
          />
        </g>
        <path
          d="M8 470 V70 H20 V52 H38 V36 H68 V22 H110 V12 H190 V22 H232 V36 H262 V52 H280 V70 H292 V470"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.9"
        />
        <path
          d="M14 470 V76 H26 V58 H44 V42 H74 V28 H116 V18 H184 V28 H226 V42 H256 V58 H274 V76 H286 V470"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.4"
          strokeOpacity="0.6"
        />
        {/* Fluted pilasters */}
        <g stroke="url(#tc-brass)" strokeWidth="0.45" strokeOpacity="0.55">
          {[18, 21, 24, 276, 279, 282].map((x) => (
            <line key={x} x1={x} y1="118" x2={x} y2="430" />
          ))}
        </g>
        <rect
          x="12"
          y="104"
          width="16"
          height="6"
          fill="url(#tc-brass)"
          opacity="0.8"
        />
        <rect
          x="272"
          y="104"
          width="16"
          height="6"
          fill="url(#tc-brass)"
          opacity="0.8"
        />
        <rect
          x="12"
          y="436"
          width="16"
          height="10"
          fill="url(#tc-brass)"
          opacity="0.6"
        />
        <rect
          x="272"
          y="436"
          width="16"
          height="10"
          fill="url(#tc-brass)"
          opacity="0.6"
        />
      </g>

      {/* Fanlight: dark glass, a warm glow that rises with anticipation,
          then brass glazing bars over it. */}
      <path d="M40 100 A110 68 0 0 1 260 100 Z" fill="#120a09" />
      <g clipPath="url(#tc-lunette)">
        <rect
          className="portal__fanlight-glow"
          x="30"
          y="20"
          width="240"
          height="90"
          fill="url(#tc-warm)"
        />
        {GLAZING.map((bar, i) => (
          <line
            key={i}
            x1="150"
            y1="100"
            {...bar}
            stroke="url(#tc-brass)"
            strokeWidth="0.9"
          />
        ))}
        <path
          d="M110 100 A40 26 0 0 1 190 100"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="1"
        />
        <path
          d="M76 100 A74 46 0 0 1 224 100"
          fill="none"
          stroke="url(#tc-brass)"
          strokeWidth="0.6"
        />
      </g>
      <path
        d="M40 100 A110 68 0 0 1 260 100"
        fill="none"
        stroke="url(#tc-brass)"
        strokeWidth="1.6"
      />
      {/* Keystone */}
      <path d="M144 30 H156 L153 40 H147 Z" fill="url(#tc-brass)" />

      {/* Transom bar and architrave */}
      <rect x="26" y="98" width="248" height="5" fill="url(#tc-brass-h)" />
      <path
        d="M28 460 V102 M272 102 V460"
        stroke="url(#tc-brass)"
        strokeWidth="1.2"
      />

      {/* Marble step */}
      <rect x="0" y="460" width="300" height="10" fill="url(#tc-stone)" />
      <line
        x1="0"
        y1="460.5"
        x2="300"
        y2="460.5"
        stroke="#f4ebdd"
        strokeOpacity="0.22"
        strokeWidth="0.6"
      />
    </svg>
  );
});

const LockDial = memo(function LockDial() {
  return (
    <svg
      className="portal__lock"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="24"
        cy="24"
        r="22.5"
        fill="none"
        stroke="url(#tc-brass)"
        strokeWidth="1.2"
      />
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="url(#tc-brass)"
        strokeWidth="0.4"
        strokeDasharray="0.6 2.54"
      />
      <path
        className="portal__lock-bolt"
        d="M24 0.5 L26.4 5.5 H21.6 Z"
        fill="url(#tc-brass)"
      />
    </svg>
  );
});

export function Portal({ onEnter }: { onEnter?: (() => void) | undefined }) {
  return (
    <div className="portal">
      <div className="portal__sconce portal__sconce--left" aria-hidden="true" />
      <div
        className="portal__sconce portal__sconce--right"
        aria-hidden="true"
      />
      <div className="portal__body">
        <PortalFrame />
        {/* Clicking the doors is a convenience; the labelled button is the
            accessible control. */}
        <div className="portal__aperture" onClick={onEnter} aria-hidden="true">
          <div className="portal__beyond" />
          <div className="portal__seam" />
          <div className="portal__sill" />
          <div className="door door--left">
            <DoorLeaf side="left" />
            <div className="door__sheen" />
          </div>
          <div className="door door--right">
            <DoorLeaf side="right" />
            <div className="door__sheen" />
          </div>
          <LockDial />
        </div>
        <div className="portal__spill" aria-hidden="true" />
      </div>
    </div>
  );
}
