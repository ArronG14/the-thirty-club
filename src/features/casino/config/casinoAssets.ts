/**
 * THE CENTRAL ASSET REGISTRY. Every optional piece of bespoke artwork the
 * casino can use is named here, with where it goes and how big it should be.
 * `src: null` means "use the built-in procedural stand-in". To use real
 * artwork, drop the file under `public/images/casino/` and set its `src`
 * (for example `'/images/casino/wall-art-left.webp'`); no component changes.
 *
 * A missing, slow or failing file always falls back to the stand-in.
 */
export type CasinoAssetKey =
  | 'wallArtLeft'
  | 'wallArtCentre'
  | 'wallArtRight'
  | 'slotMarquee'
  | 'ceilingMural'
  | 'rewardFirstFortune'
  | 'rewardClue'
  | 'rewardMystery'
  | 'rewardGildedReel'
  | 'rewardVaultKey'
  | 'rewardPrivilege'
  | 'entranceVideo';

export interface CasinoAsset {
  kind: 'image' | 'video';
  /** URL of the real asset, or null to use the procedural stand-in. */
  src: string | null;
  /** Poster frame for a video. */
  poster?: string | null;
  /** Suggested pixel size (width × height) for generation. */
  size: string;
  where: string;
}

export const CASINO_ASSETS: Record<CasinoAssetKey, CasinoAsset> = {
  wallArtLeft: {
    kind: 'image',
    src: null,
    size: '1024 × 1536 (2:3 portrait)',
    where: 'Left wall, framed, beside the roulette table.',
  },
  wallArtCentre: {
    kind: 'image',
    src: null,
    size: '1536 × 2048 (3:4 portrait)',
    where: 'Back wall, large central frame between the curtains.',
  },
  wallArtRight: {
    kind: 'image',
    src: null,
    size: '1024 × 1536 (2:3 portrait)',
    where: 'Right wall, framed, above the banquette.',
  },
  slotMarquee: {
    kind: 'image',
    src: null,
    size: '1536 × 384 (4:1)',
    where: 'Backlit marquee panel at the top of the slot machine.',
  },
  ceilingMural: {
    kind: 'image',
    src: null,
    size: '2048 × 2048 (square)',
    where: 'Ceiling medallion around the chandelier.',
  },
  rewardFirstFortune: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: The First Fortune.',
  },
  rewardClue: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: The Croupier’s Clue.',
  },
  rewardMystery: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: The Lucky Number.',
  },
  rewardGildedReel: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: The Gilded Reel.',
  },
  rewardVaultKey: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: Vault Key I.',
  },
  rewardPrivilege: {
    kind: 'image',
    src: null,
    size: '768 × 768',
    where: 'Reveal card: The House Favour.',
  },
  entranceVideo: {
    kind: 'video',
    src: null,
    poster: null,
    size: '1080 × 1920 (9:16 portrait), 6–10 s, H.264 MP4, under 8 MB',
    where:
      'Optional entrance cinematic played once before the lobby appears, with a Skip control.',
  },
};

/** Assets the scene loads as textures (images only). */
export const SCENE_ASSET_KEYS = [
  'wallArtLeft',
  'wallArtCentre',
  'wallArtRight',
  'slotMarquee',
  'ceilingMural',
] as const satisfies readonly CasinoAssetKey[];

export type SceneAssetKey = (typeof SCENE_ASSET_KEYS)[number];
