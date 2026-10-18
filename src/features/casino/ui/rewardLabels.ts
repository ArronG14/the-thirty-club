import type { RewardKind } from '../../prizes/rewards';

export const KIND_LABEL: Record<RewardKind, string> = {
  collectible: 'A keepsake',
  clue: 'A clue',
  'vault-code': 'A vault code',
  privilege: 'A privilege',
  mystery: 'A mystery',
};
