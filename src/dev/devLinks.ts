/**
 * DEVELOPMENT ONLY. Shortcut table for the developer menu. Every `?preview=`
 * mode is handled by existing dev-only code (shifted clock, in-memory
 * storage), so none of these touch the real membership record. Reached only
 * through an `import.meta.env.DEV` branch in `src/main.tsx`.
 */
export interface DevLink {
  label: string;
  href: string;
  note?: string;
}

export interface DevLinkGroup {
  title: string;
  links: readonly DevLink[];
}

export const DEV_LINK_GROUPS: readonly DevLinkGroup[] = [
  {
    title: 'Grand Entrance',
    links: [
      { label: 'Real clock (production behaviour)', href: '/' },
      { label: 'Locked countdown', href: '/?preview=locked' },
      { label: 'Final minute', href: '/?preview=final-minute' },
      { label: 'Midnight unlock', href: '/?preview=midnight' },
      { label: 'Late arrival', href: '/?preview=arrival' },
    ],
  },
  {
    title: "Members' Lounge",
    links: [
      { label: 'First visit (induction)', href: '/?preview=induction' },
      { label: 'Member', href: '/?preview=lounge' },
      { label: 'Evening, all rooms open', href: '/?preview=evening' },
    ],
  },
  {
    title: 'Private Screening Room',
    links: [
      {
        label: 'Room, unlocked',
        href: '/rooms/screening-room?preview=evening',
      },
      {
        label: 'Room, real gate (production behaviour)',
        href: '/rooms/screening-room',
      },
      { label: 'Cinema arrival', href: '/?preview=screening-arrival' },
      { label: 'Playback demo', href: '/?preview=screening-demo' },
      { label: 'End-of-message preview', href: '/?preview=screening-endframe' },
      { label: 'No messages yet', href: '/?preview=screening' },
    ],
  },
  {
    title: 'Not yet built',
    links: [
      {
        label: 'Grand Casino gate',
        href: '/rooms/casino?preview=evening',
        note: 'shows the honest "not ready" notice',
      },
      { label: 'Unknown route', href: '/missing-room' },
    ],
  },
];
