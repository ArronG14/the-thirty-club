import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cinemaConfig } from './cinemaConfig';
import { EntranceFilm } from './EntranceFilm';
import ScreeningRoom from './ScreeningRoom';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  cinemaConfig.entrance.enabled = true;
  cinemaConfig.entrance.src = '/media/screening/future-entrance.mp4';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cinemaConfig.entrance.enabled = false;
  cinemaConfig.entrance.src = '';
});
it('releases the room on Skip, errors and the bounded safety timeout', () => {
  vi.useFakeTimers();
  const done = vi.fn();
  const { container } = render(<EntranceFilm onDone={done} />);
  expect(container.querySelector('video')).toHaveAttribute('playsinline');
  expect(container.querySelector('video')!.muted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Skip entrance' }));
  expect(done).toHaveBeenCalledTimes(1);
  fireEvent.error(container.querySelector('video')!);
  expect(done).toHaveBeenCalledTimes(2);
  act(() => {
    vi.advanceTimersByTime(12000);
  });
  expect(done).toHaveBeenCalledTimes(3);
});
it('falls back when muted inline autoplay is rejected', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
    new Error('blocked'),
  );
  const done = vi.fn();
  render(<EntranceFilm onDone={done} />);
  await act(async () => {});
  expect(done).toHaveBeenCalled();
});
it('bypasses the entrance completely for reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <MemoryRouter>
      <ScreeningRoom messages={[]} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Skip entrance' })).toBeNull();
  expect(screen.getByText('The messages are not ready yet.')).toBeVisible();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it('remembers a skipped entrance and shortens the next visit', () => {
  const first = render(
    <MemoryRouter>
      <ScreeningRoom messages={[]} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Skip entrance' }));
  first.unmount();
  render(
    <MemoryRouter>
      <ScreeningRoom messages={[]} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Skip entrance' })).toBeNull();
});
