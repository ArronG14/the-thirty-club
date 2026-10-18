import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CASINO_ASSETS } from '../config/casinoAssets';
import { CasinoEntranceFilm } from './EntranceFilm';
import { shouldPlayEntranceFilm } from './entranceFilmRule';

const film = CASINO_ASSETS.entranceVideo;
const original = film.src;

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  film.src = original;
  vi.useRealTimers();
});

describe('the optional casino entrance film', () => {
  it('ships disabled, so the lobby never waits for a film that does not exist', () => {
    expect(original).toBeNull();
    expect(shouldPlayEntranceFilm(false)).toBe(false);
  });

  it('plays once per session, and never under reduced motion', () => {
    film.src = '/images/casino/entrance.mp4';
    expect(shouldPlayEntranceFilm(false)).toBe(true);
    expect(shouldPlayEntranceFilm(true)).toBe(false);
    window.sessionStorage.setItem('thirty-club:casino-film-seen', '1');
    expect(shouldPlayEntranceFilm(false)).toBe(false);
  });

  it('can always be skipped, and remembers that it has been seen', () => {
    film.src = '/images/casino/entrance.mp4';
    const onDone = vi.fn();
    render(<CasinoEntranceFilm onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('thirty-club:casino-film-seen')).toBe(
      '1',
    );
  });

  it('hands over to the lobby when it ends, once', () => {
    film.src = '/images/casino/entrance.mp4';
    const onDone = vi.fn();
    const { container } = render(<CasinoEntranceFilm onDone={onDone} />);
    const video = container.querySelector('video')!;
    fireEvent.ended(video);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('falls back to the lobby when the video fails to load', () => {
    film.src = '/images/casino/entrance.mp4';
    const onDone = vi.fn();
    const { container } = render(<CasinoEntranceFilm onDone={onDone} />);
    fireEvent.error(container.querySelector('video')!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly if the video never starts', () => {
    film.src = '/images/casino/entrance.mp4';
    const onDone = vi.fn();
    render(<CasinoEntranceFilm onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lets a film that has started play to its end, however long', () => {
    film.src = '/images/casino/entrance.mp4';
    const onDone = vi.fn();
    const { container } = render(<CasinoEntranceFilm onDone={onDone} />);
    fireEvent.playing(container.querySelector('video')!);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.ended(container.querySelector('video')!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders nothing with no film registered', () => {
    const { container } = render(
      <CasinoEntranceFilm onDone={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
