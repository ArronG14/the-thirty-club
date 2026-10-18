/**
 * DEVELOPMENT ONLY. Reached exclusively through an `import.meta.env.DEV`
 * branch, which Vite replaces with `false` in production so this module and
 * its query parameter are removed from the shipped bundle. Previews use a
 * shifted clock and in-memory storage: they never touch the real record.
 */
import { openingInstant } from '../domain/countdown';
import { memoryMembershipStorage } from '../../club/domain/membershipRecord';
import { instantInZone } from '../../club/domain/schedule';
import { memoryEntranceStorage } from '../domain/entranceRecord';
import type {
  Clock,
  EntranceEnvironment,
  PreviewMode,
} from '../domain/environment';

export const PREVIEW_PARAM = 'preview';

export const PREVIEW_MODES: readonly { mode: PreviewMode; label: string }[] = [
  { mode: 'locked', label: 'Locked' },
  { mode: 'final-minute', label: 'Final minute' },
  { mode: 'midnight', label: 'Midnight' },
  { mode: 'arrival', label: 'Late arrival' },
  { mode: 'induction', label: 'Lounge: first visit' },
  { mode: 'lounge', label: 'Lounge: member' },
  { mode: 'evening', label: 'Lounge: evening' },
  { mode: 'casino-lobby', label: 'Casino: lobby' },
  { mode: 'casino-roulette', label: 'Casino: roulette' },
  { mode: 'casino-slots', label: 'Casino: slots' },
  { mode: 'casino-jackpot', label: 'Casino: jackpot next' },
  { mode: 'casino-completed', label: 'Casino: completed' },
];

const SECOND = 1000;
const HOUR = 3600 * SECOND;

/** Virtual time at load for each mode, relative to local opening midnight. */
function startOffset(mode: PreviewMode): number {
  switch (mode) {
    case 'locked':
      return -((2 * 24 + 6) * HOUR + 41 * 60 * SECOND + 30 * SECOND);
    case 'final-minute':
      return -64 * SECOND;
    case 'midnight':
      return -8 * SECOND;
    case 'arrival':
    case 'induction':
    case 'lounge':
      return 9 * HOUR;
    default:
      return 0; // absolute: see previewStart
  }
}

/** Virtual time at load. `evening` is 9 pm in Jamaica, every room open. */
function previewStart(mode: PreviewMode): number {
  return mode === 'evening' || mode.startsWith('casino-')
    ? instantInZone({ date: '2026-10-24', time: '21:00' })
    : openingInstant() + startOffset(mode);
}

export function previewClock(mode: PreviewMode, realNow = Date.now()): Clock {
  const shift = previewStart(mode) - realNow;
  return { now: () => Date.now() + shift };
}

function isPreviewMode(value: string | null): value is PreviewMode {
  return PREVIEW_MODES.some((entry) => entry.mode === value);
}

export function resolveDevPreview(search: string): EntranceEnvironment | null {
  const mode = new URLSearchParams(search).get(PREVIEW_PARAM);
  if (!isPreviewMode(mode)) return null;
  const seen = new Date(openingInstant()).toISOString();
  const casino = mode.startsWith('casino-');
  const inLounge =
    mode === 'induction' || mode === 'lounge' || mode === 'evening' || casino;
  const member = mode === 'lounge' || mode === 'evening' || casino;
  return {
    preview: mode,
    clock: previewClock(mode),
    storage: memoryEntranceStorage(
      inLounge
        ? { unlockedAt: seen, ceremonySeenAt: seen }
        : { unlockedAt: null, ceremonySeenAt: null },
    ),
    membership: memoryMembershipStorage(
      member
        ? {
            inductedAt: seen,
            rooms: {
              'screening-room': { unlockedAt: seen, announcedAt: seen },
            },
          }
        : { inductedAt: null, rooms: {} },
    ),
  };
}
