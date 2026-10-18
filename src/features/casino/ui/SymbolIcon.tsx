import type { SlotSymbol } from '../domain/slots';
import { SYMBOL_NAMES } from '../domain/slots';
import { DISPLAY_FONT, SYMBOL_ART } from '../scene/symbolArt';

/** A slot symbol as inline SVG: the same art that is on the reels. */
export function SymbolIcon({
  symbol,
  decorative = false,
}: {
  symbol: SlotSymbol;
  /** True where the symbol's name is already given in text. */
  decorative?: boolean;
}) {
  return (
    <svg
      className="symbol-icon"
      viewBox="0 0 100 100"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : SYMBOL_NAMES[symbol]}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {SYMBOL_ART[symbol].map((layer, i) => {
        const transform = layer.rotate
          ? `rotate(${layer.rotate} 50 50)`
          : undefined;
        if (layer.text)
          return (
            <text
              key={i}
              x="50"
              y="53"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={layer.fill}
              fontFamily={DISPLAY_FONT}
              fontSize="44"
              fontWeight="600"
            >
              {layer.text}
            </text>
          );
        const common = {
          fill: layer.fill ?? 'none',
          stroke: layer.stroke ?? 'none',
          strokeWidth: layer.width,
          transform,
        };
        return layer.circle ? (
          <circle
            key={i}
            cx={layer.circle[0]}
            cy={layer.circle[1]}
            r={layer.circle[2]}
            {...common}
          />
        ) : (
          <path key={i} d={layer.d} {...common} />
        );
      })}
    </svg>
  );
}
