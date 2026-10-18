import { CASINO_ASSETS, type CasinoAssetKey } from '../config/casinoAssets';
import type { RewardDefinition, RewardKind } from '../../prizes/rewards';
import type { SlotSymbol } from '../domain/slots';
import { SymbolIcon } from './SymbolIcon';

/** Stand-in artwork per kind, drawn from the machine's own symbols. */
const KIND_SYMBOL: Record<RewardKind, SlotSymbol> = {
  collectible: 'emblem',
  clue: 'diamond',
  'vault-code': 'key',
  privilege: 'crown',
  mystery: 'thirty',
};

/** The bespoke image when one is registered, otherwise the stand-in. */
export function RewardArt({ reward }: { reward: RewardDefinition }) {
  const asset = reward.artwork
    ? CASINO_ASSETS[reward.artwork as CasinoAssetKey]
    : undefined;
  if (asset?.src && asset.kind === 'image') {
    return <img className="reward-art" src={asset.src} alt="" />;
  }
  return (
    <span className="reward-art reward-art--stand-in">
      <SymbolIcon symbol={KIND_SYMBOL[reward.kind]} decorative />
    </span>
  );
}
