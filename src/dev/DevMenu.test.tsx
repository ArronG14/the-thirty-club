import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DevMenu from './DevMenu';
import { DEV_LINK_GROUPS } from './devLinks';

describe('developer menu', () => {
  it('is collapsed until opened, then lists every shortcut', () => {
    render(<DevMenu />);
    const toggle = screen.getByRole('button', { name: 'Dev' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.click(toggle);
    const nav = screen.getByRole('navigation', {
      name: 'Developer navigation',
    });
    for (const link of DEV_LINK_GROUPS.flatMap((g) => g.links)) {
      expect(
        within(nav)
          .getAllByRole('link')
          .some((a) => a.getAttribute('href') === link.href),
      ).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('offers the Screening Room states and a real-gate link', () => {
    const hrefs = DEV_LINK_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/?preview=screening-arrival',
        '/?preview=screening-demo',
        '/?preview=screening-endframe',
        '/rooms/screening-room',
        '/rooms/screening-room?preview=evening',
      ]),
    );
  });

  it('only ever bypasses locks through the existing dev preview param', () => {
    for (const { href } of DEV_LINK_GROUPS.flatMap((g) => g.links)) {
      expect(href).toMatch(
        /^\/(?:[a-z-]+(?:\/[a-z-]+)*)?(?:\?preview=[a-z-]+)?$/,
      );
    }
  });
});
