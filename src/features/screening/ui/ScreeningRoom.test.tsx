import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveProgramme,
  TEST_FILM,
  type ScreeningFilm,
} from '../config/screeningFilm';
import { freshRecord, loadRecord, saveRecord } from '../domain/screeningRecord';
import { SCREENING_LINES } from '../domain/screeningScript';
import ScreeningRoom from './ScreeningRoom';

function mount(film: ScreeningFilm | null = TEST_FILM, complete = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <ScreeningRoom film={film} onComplete={complete} />
    </MemoryRouter>,
  );
  return { ...view, complete };
}
const video = () =>
  document.querySelector('video') as HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
  };
const watchButton = () =>
  screen.getByRole('button', { name: /^(Watch|Resume) Movie$/ });
const phase = () =>
  document.querySelector('.cinema')?.getAttribute('data-phase');
/** Puts the element where a real browser would be. */
function at(
  element: HTMLVideoElement,
  state: Partial<Record<'currentTime' | 'duration' | 'readyState', number>> & {
    ended?: boolean;
  },
) {
  for (const [key, value] of Object.entries(state))
    Object.defineProperty(element, key, {
      configurable: true,
      writable: true,
      value,
    });
}
const speak = () => act(() => vi.advanceTimersByTime(1300));

let fullscreenEnabled = true;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fullscreenEnabled = true;
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => fullscreenEnabled,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
    Promise.resolve(),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the Private Screening Room', () => {
  it('seats her before the poster; the Butler introduces the film once', () => {
    mount();
    expect(
      screen.getByRole('heading', { name: 'Thirty Years of Alise' }),
    ).toBeInTheDocument();
    expect(screen.getByText('The Thirty Club presents')).toBeInTheDocument();
    expect(
      screen.getByText('A Private Birthday Screening'),
    ).toBeInTheDocument();
    expect(watchButton()).toHaveTextContent('Watch Movie');
    expect(
      screen.getByText('Rehearsal · temporary five-second test film'),
    ).toBeInTheDocument();
    // A normal MP4 with native controls; never autoplay, never playsinline,
    // so the iPhone opens its own fullscreen player.
    expect(video()).toHaveAttribute('src', TEST_FILM.src);
    expect(video()).toHaveAttribute('controls');
    expect(video()).not.toHaveAttribute('autoplay');
    expect(video()).not.toHaveAttribute('playsinline');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    speak();
    expect(screen.getByText(SCREENING_LINES.introduction)).toBeInTheDocument();
    expect(loadRecord().introducedAt).not.toBeNull();
    expect(loadRecord().enteredAt).not.toBeNull();
  });

  it('a returning visitor gets the short welcome', () => {
    saveRecord({
      ...freshRecord(),
      enteredAt: '2026-10-24T05:10:00.000Z',
      introducedAt: '2026-10-24T05:10:00.000Z',
    });
    mount();
    speak();
    expect(
      screen.getByText(
        'Welcome back, Madam. Your private screening is ready whenever you wish.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(SCREENING_LINES.introduction)).toBeNull();
  });

  it('Watch Movie plays and requests fullscreen inside the same tap', () => {
    mount();
    const order: string[] = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => {
      order.push('play');
      return Promise.resolve();
    });
    vi.mocked(HTMLElement.prototype.requestFullscreen).mockImplementation(
      () => {
        order.push('fullscreen');
        return Promise.resolve();
      },
    );
    fireEvent.click(watchButton());
    // Both happened synchronously, before any timer or animation.
    expect(order).toEqual(['play', 'fullscreen']);
    expect(phase()).toBe('film');
    expect(loadRecord().plays).toBe(1);
  });

  it('on iPhone (no element fullscreen) uses the native video player', () => {
    fullscreenEnabled = false;
    mount();
    const enter = vi.fn();
    video().webkitEnterFullscreen = enter;
    at(video(), { readyState: 1 });
    fireEvent.click(watchButton());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.cinema')).toHaveAttribute(
      'data-presentation',
      'native',
    );
  });

  it('falls back to the theatre layout where fullscreen is unavailable', () => {
    fullscreenEnabled = false;
    mount();
    fireEvent.click(watchButton());
    expect(document.querySelector('.cinema')).toHaveAttribute(
      'data-presentation',
      'theatre',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave the screening' }),
    );
    expect(phase()).toBe('seated');
  });

  it('natural end: back to the seat, closing words, one completion; replay is unlimited', () => {
    const { complete } = mount();
    speak();
    fireEvent.click(watchButton());
    at(video(), { readyState: 4, duration: 5, currentTime: 5, ended: true });
    fireEvent.ended(video());
    fireEvent.ended(video());
    expect(phase()).toBe('seated');
    expect(screen.getByText(SCREENING_LINES.closing)).toBeInTheDocument();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(loadRecord()).toMatchObject({ completions: 1, resume: null });
    const firstCompletion = loadRecord().completedAt;

    // Again, from the beginning.
    expect(watchButton()).toHaveTextContent('Watch Movie');
    fireEvent.click(watchButton());
    expect(video().currentTime).toBe(0);
    at(video(), { currentTime: 5, ended: true });
    fireEvent.ended(video());
    expect(screen.getByText(SCREENING_LINES.encore)).toBeInTheDocument();
    expect(loadRecord()).toMatchObject({
      completions: 2,
      plays: 2,
      completedAt: firstCompletion,
    });
  });

  it('leaving the native player early keeps her place and records no completion', () => {
    fullscreenEnabled = false;
    const { complete } = mount();
    video().webkitEnterFullscreen = vi.fn();
    fireEvent.click(watchButton());
    at(video(), { readyState: 4, duration: 5, currentTime: 2.4 });
    fireEvent(video(), new Event('webkitbeginfullscreen'));
    fireEvent(video(), new Event('webkitendfullscreen'));
    expect(phase()).toBe('seated');
    expect(screen.getByText(SCREENING_LINES.paused)).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();
    expect(loadRecord()).toMatchObject({
      completedAt: null,
      resume: { filmId: TEST_FILM.id, seconds: 2.4 },
    });
    expect(watchButton()).toHaveTextContent('Resume Movie');
    expect(screen.getByText(/Your place is kept at 0:02/)).toBeInTheDocument();

    // Resume continues from the kept place; "from the beginning" restarts.
    fireEvent.click(watchButton());
    expect(video().currentTime).toBe(2.4);
    at(video(), { currentTime: 3 });
    fireEvent(video(), new Event('webkitendfullscreen'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Watch from the beginning' }),
    );
    expect(video().currentTime).toBe(0);
  });

  it('iOS closing its player at the very end still counts as the end, once', () => {
    fullscreenEnabled = false;
    const { complete } = mount();
    fireEvent.click(watchButton());
    at(video(), { readyState: 4, duration: 5, currentTime: 4.9 });
    fireEvent(video(), new Event('webkitendfullscreen'));
    at(video(), { currentTime: 5, ended: true });
    fireEvent.ended(video());
    expect(complete).toHaveBeenCalledTimes(1);
    expect(loadRecord().completions).toBe(1);
  });

  it('exiting element fullscreen part-way is an early exit', () => {
    mount();
    fireEvent.click(watchButton());
    const element = video();
    at(element, { readyState: 4, duration: 5, currentTime: 3 });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: element,
    });
    fireEvent(document, new Event('fullscreenchange'));
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    fireEvent(document, new Event('fullscreenchange'));
    expect(screen.getByText(SCREENING_LINES.paused)).toBeInTheDocument();
    expect(loadRecord().completedAt).toBeNull();
  });

  it('leaving the room mid-film (or refreshing) keeps her place', () => {
    const { unmount } = mount();
    fireEvent.click(watchButton());
    at(video(), { readyState: 4, duration: 5, currentTime: 3.1 });
    unmount();
    expect(loadRecord().resume).toEqual({
      filmId: TEST_FILM.id,
      seconds: 3.1,
    });
    expect(loadRecord().completedAt).toBeNull();
  });

  it('a failed load returns her to the room with an honest notice', () => {
    mount();
    fireEvent.click(watchButton());
    fireEvent.error(video());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film could not be loaded just now.',
    );
    // Retry (ADR-026), and the way to carry on without the player.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Watch it another way' }),
    ).toBeInTheDocument();
  });

  it('LIVE without a configured film: no Watch Movie, no video, honest words', () => {
    mount(null);
    speak();
    expect(screen.getByText('Your screening is being prepared.')).toBeVisible();
    expect(screen.getByText(SCREENING_LINES.preparing)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Movie/ })).toBeNull();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByText(/test film/)).toBeNull();
  });

  it('a birthday film carries no rehearsal label', () => {
    mount({ ...TEST_FILM, id: 'final', kind: 'birthday' });
    expect(screen.queryByText(/test film/)).toBeNull();
  });
});

describe('a programme of reels (ADR-024)', () => {
  const reel = (n: number): ScreeningFilm => ({
    id: `reel-${n}`,
    title: `Reel ${n}`,
    src: `/media/screening/reel-${n}.mp4`,
    type: 'video/mp4',
    kind: 'birthday',
  });
  const REELS = [reel(1), reel(2), reel(3)];
  const mountProgramme = (complete = vi.fn()) => {
    render(
      <MemoryRouter>
        <ScreeningRoom programme={REELS} onComplete={complete} />
      </MemoryRouter>,
    );
    return complete;
  };
  const end = () => {
    at(video(), { readyState: 4, duration: 10, currentTime: 10, ended: true });
    fireEvent.ended(video());
  };

  it('plays the reels in order, each started by her tap; the end is counted once', () => {
    const complete = mountProgramme();
    expect(video()).toHaveAttribute('src', REELS[0]!.src);
    expect(screen.getByText('1 of 3 · Reel 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Watch Movie' }));
    expect(phase()).toBe('film');
    end();
    // Between reels: back in her seat, the next reel offered.
    expect(phase()).toBe('seated');
    expect(screen.getByText('Next — Reel 2')).toBeInTheDocument();
    expect(screen.getByText(SCREENING_LINES.nextReel)).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();
    const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue the screening' }),
    );
    // The source changed and play() ran inside that same tap.
    expect(video()).toHaveAttribute('src', REELS[1]!.src);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(
      plays + 1,
    );
    end();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue the screening' }),
    );
    expect(video()).toHaveAttribute('src', REELS[2]!.src);
    end();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(loadRecord().completions).toBe(1);
    expect(screen.getByText(SCREENING_LINES.closing)).toBeInTheDocument();
    // Watch again starts from the first reel.
    expect(screen.getByRole('button', { name: 'Watch Movie' })).toBeVisible();
    expect(screen.getByText('1 of 3 · Reel 1')).toBeInTheDocument();
  });

  it('a reload between reels continues with the next one', () => {
    mountProgramme();
    fireEvent.click(screen.getByRole('button', { name: 'Watch Movie' }));
    end();
    cleanup();
    mountProgramme();
    expect(video()).toHaveAttribute('src', REELS[1]!.src);
    expect(screen.getByText('2 of 3 · Reel 2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue the screening' }),
    ).toBeInTheDocument();
  });

  it('a reel that will not load offers the next instead of stopping', () => {
    mountProgramme();
    fireEvent.click(screen.getByRole('button', { name: 'Watch Movie' }));
    fireEvent.error(video());
    expect(phase()).toBe('seated');
    expect(screen.getByText('Next — Reel 2')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue the screening' }),
    );
    expect(video()).toHaveAttribute('src', REELS[1]!.src);
    expect(phase()).toBe('film');
  });
});

describe('resolveProgramme', () => {
  const good: ScreeningFilm = {
    id: 'r1',
    title: 'One',
    src: '/media/screening/one.mp4',
    type: 'video/mp4',
    kind: 'birthday',
  };
  it('keeps valid birthday reels in order and skips unsafe ones', () => {
    const bad = { ...good, id: 'r2', src: 'http://insecure/two.mp4' };
    const test = { ...good, id: 'r3', kind: 'test' as const };
    expect(
      resolveProgramme(false, [good, bad, test], null).map((r) => r.id),
    ).toEqual(['r1']);
  });
  it('falls back to the single film, then (rehearsal only) the test film', () => {
    expect(resolveProgramme(false, [], good)).toEqual([good]);
    expect(resolveProgramme(true, [], null)).toEqual([TEST_FILM]);
    expect(resolveProgramme(false, [], null)).toEqual([]);
  });
});
