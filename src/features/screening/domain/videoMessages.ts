/**
 * Content format for the Private Screening Room's birthday video messages.
 * Adding or replacing a video means editing VIDEO_MESSAGES only.
 *
 * Every entry below is a PLACEHOLDER: no real message, sender or file exists
 * yet. Placeholders must be replaced (and `placeholder` removed) before the
 * collection is released; `realMessages` never returns them, so the room cannot
 * present one to Alise by accident.
 */

export interface VideoSource {
  /** Same-origin path under /media/screening/. MP4 (H.264 + AAC) for iOS. */
  src: string;
  /** Always 'video/mp4' for iPhone Safari; widen only with a tested reason. */
  type: 'video/mp4';
}

export interface VideoMessage {
  /** Stable, unique, URL-safe. Used for progress records; never reuse. */
  id: string;
  /** Sender as Alise should see it, e.g. "Mum". */
  sender: string;
  video: VideoSource;
  /** Optional still shown before play, same-origin under /media/screening/. */
  poster?: string;
  /** Optional one-line introduction shown with the message. */
  intro?: string;
  /** Ascending playback and navigation order. Unique across entries. */
  order: number;
  /** Optional WebVTT captions, same-origin. Needed for the acceptance check. */
  captions?: string;
  /** True while the entry is a stand-in. Remove when real content lands. */
  placeholder?: boolean;
  /** Accessible alternative where captions are not supplied. */
  transcript?: string;
}

export const MEDIA_ROOT = '/media/screening/';

export const VIDEO_MESSAGES: readonly VideoMessage[] = [
  {
    id: 'placeholder-1',
    sender: 'Placeholder sender 1',
    video: { src: `${MEDIA_ROOT}placeholder-1.mp4`, type: 'video/mp4' },
    intro: 'Placeholder introduction. Replace with real content.',
    order: 1,
    placeholder: true,
  },
  {
    id: 'placeholder-2',
    sender: 'Placeholder sender 2',
    video: { src: `${MEDIA_ROOT}placeholder-2.mp4`, type: 'video/mp4' },
    poster: `${MEDIA_ROOT}placeholder-2.jpg`,
    order: 2,
    placeholder: true,
  },
];

/** Messages in display order. Does not mutate its input. */
export function orderedMessages(
  messages: readonly VideoMessage[] = VIDEO_MESSAGES,
): VideoMessage[] {
  return [...messages].sort((a, b) => a.order - b.order);
}

/** Ordered messages with placeholders removed: what the room may present. */
export function realMessages(
  messages: readonly VideoMessage[] = VIDEO_MESSAGES,
): VideoMessage[] {
  return orderedMessages(messages).filter((m) => !m.placeholder);
}

/** Human-readable problems with a content list; empty means valid. */
export function validateMessages(
  messages: readonly VideoMessage[] = VIDEO_MESSAGES,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const m of messages) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id))
      problems.push(`"${m.id}": id must be lowercase letters, digits, hyphens`);
    if (ids.has(m.id)) problems.push(`"${m.id}": duplicate id`);
    ids.add(m.id);
    if (!Number.isFinite(m.order)) problems.push(`"${m.id}": invalid order`);
    if (orders.has(m.order))
      problems.push(`"${m.id}": duplicate order ${m.order}`);
    orders.add(m.order);
    if (!m.sender.trim()) problems.push(`"${m.id}": sender is empty`);
    for (const path of [m.video.src, m.poster, m.captions]) {
      if (path !== undefined && !path.startsWith(MEDIA_ROOT))
        problems.push(`"${m.id}": "${path}" must live under ${MEDIA_ROOT}`);
    }
  }
  return problems;
}
