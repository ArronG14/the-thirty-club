/**
 * The birthday film is protected (ADR-026): the room fetches a short-lived
 * ticket as she sits down, plays the signed print inside her tap, never
 * loads forever, offers Retry and a lighter print, and lets the evening go
 * on without the player (the offline fallback), which is never a viewing.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BIRTHDAY_FILM } from '../config/screeningFilm';
import { loadRecord } from '../domain/screeningRecord';
import { SCREENING_LINES } from '../domain/screeningScript';
import ScreeningRoom, {
  START_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
} from './ScreeningRoom';

const SIGNED =
  'https://project.supabase.co/storage/v1/object/sign/ttc-media/films/x/thirty-club-birthday-film-1080p.mp4?token=a';
const LIGHTER =
  'https://project.supabase.co/storage/v1/object/sign/ttc-media/films/x/thirty-club-birthday-film-720p.mp4?token=a';
const ticket = (extra: Record<string, unknown> = {}) => ({
  id: 'birthday-film',
  url: SIGNED,
  lighterUrl: LIGHTER,
  expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
  simulated: false,
  ...extra,
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let answer: () => Promise<Response>;
const fetchMock = vi.fn((input: RequestInfo | URL) => {
  void input;
  return answer();
});

function mount(complete = vi.fn()) {
  render(
    <MemoryRouter>
      <ScreeningRoom film={BIRTHDAY_FILM} onComplete={complete} />
    </MemoryRouter>,
  );
  return complete;
}
/** Lets the ticket request settle. */
async function settle() {
  for (let i = 0; i < 6; i++) await act(() => Promise.resolve());
}
const video = () => document.querySelector('video') as HTMLVideoElement;
const phase = () =>
  document.querySelector('.cinema')?.getAttribute('data-phase');
const primary = () =>
  document.querySelector('.cinema__primary') as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  answer = () => Promise.resolve(json(ticket()));
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => false,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
    Promise.resolve(),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the protected birthday film (ADR-026)', () => {
  it('the projector is prepared as she sits down; Watch Movie plays the signed print in her tap', async () => {
    mount();
    expect(primary()).toBeDisabled();
    expect(primary()).toHaveTextContent('Preparing the projector…');
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      '/api/v1/media/birthday-film',
    );
    await settle();
    expect(primary()).toBeEnabled();
    expect(primary()).toHaveTextContent('Watch Movie');
    // Only metadata is fetched until she presses play.
    expect(video()).toHaveAttribute('src', SIGNED);
    expect(video()).toHaveAttribute('preload', 'metadata');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.queryByText(/test film/)).toBeNull();
    fireEvent.click(primary());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(phase()).toBe('film');
    expect(screen.getByText('The film is loading…')).toBeInTheDocument();
    fireEvent.playing(video());
    expect(screen.queryByText('The film is loading…')).toBeNull();
  });

  it('not uploaded yet: the honest "being prepared", no button, no video request', async () => {
    answer = () =>
      Promise.resolve(json({ error: 'not-configured', message: '' }, 503));
    mount();
    await settle();
    expect(screen.getByText('Your screening is being prepared.')).toBeVisible();
    expect(document.querySelector('.cinema__primary')).toBeNull();
    expect(video()).not.toHaveAttribute('src');
  });

  it('no connection: Retry fetches a fresh ticket; the fallback is recorded as exactly that', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    const complete = mount();
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film could not be fetched just now.',
    );
    expect(primary()).toHaveTextContent('Try again');

    // The evening goes on without the player.
    fireEvent.click(
      screen.getByRole('button', { name: 'Watch it another way' }),
    );
    expect(screen.getByText(SCREENING_LINES.elsewhere)).toBeInTheDocument();
    const record = loadRecord();
    expect(record.elsewhereAt).not.toBeNull();
    expect(record.elsewhere).toBe(1);
    expect(record.completedAt).toBeNull();
    expect(record.completions).toBe(0);
    expect(record.plays).toBe(0);
    expect(complete).toHaveBeenCalledTimes(1);

    // The Wi-Fi returns: Retry, then the film is here after all.
    answer = () => Promise.resolve(json(ticket()));
    fireEvent.click(primary());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(primary()).toHaveTextContent('Watch Movie');
  });

  it('never loads forever: no picture within the start limit → her seat, Retry, the lighter print', async () => {
    mount();
    await settle();
    fireEvent.click(primary());
    expect(phase()).toBe('film');
    act(() => vi.advanceTimersByTime(START_TIMEOUT_MS - 1));
    expect(phase()).toBe('film');
    act(() => vi.advanceTimersByTime(1));
    expect(phase()).toBe('seated');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film is arriving too slowly over this connection.',
    );
    expect(primary()).toHaveTextContent('Try again');
    await settle();
    // A fresh ticket is fetched for the retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadRecord().completedAt).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Try the lighter print' }),
    );
    expect(video()).toHaveAttribute('src', LIGHTER);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(phase()).toBe('film');
  });

  it('a long stall mid-film stops and keeps her place; her own pause is never a stall', async () => {
    mount();
    await settle();
    fireEvent.click(primary());
    fireEvent.playing(video());
    Object.defineProperty(video(), 'readyState', { value: 4 });
    Object.defineProperty(video(), 'duration', { value: 880 });
    Object.defineProperty(video(), 'currentTime', {
      value: 312,
      writable: true,
    });

    // She pauses for a long while: nothing happens.
    fireEvent.waiting(video());
    fireEvent.pause(video());
    act(() => vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2));
    expect(phase()).toBe('film');

    // Playing again, then the connection stalls for good.
    fireEvent.playing(video());
    fireEvent.waiting(video());
    act(() => vi.advanceTimersByTime(STALL_TIMEOUT_MS));
    expect(phase()).toBe('seated');
    expect(loadRecord().resume).toEqual({
      filmId: BIRTHDAY_FILM!.id,
      seconds: 312,
    });
    expect(screen.getByText(/Your place is kept at 5:12/)).toBeInTheDocument();
    expect(loadRecord().completedAt).toBeNull();
  });

  it('storage unreachable but the club reachable: one renewal per failure, never a loop', async () => {
    let n = 0;
    answer = () => Promise.resolve(json(ticket({ url: `${SIGNED}&n=${++n}` })));
    mount();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Her seat: the film's address keeps failing to load. Nothing is asked.
    fireEvent.error(video());
    fireEvent.error(video());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A failure during playback renews once, for her Retry…
    fireEvent.click(primary());
    fireEvent.error(video());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(video().getAttribute('src')).toContain('&n=2');
    // …and the renewed address failing in her seat asks nothing more.
    fireEvent.error(video());
    act(() => vi.advanceTimersByTime(5 * 60_000));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an expired ticket in her seat is renewed quietly', async () => {
    answer = () =>
      Promise.resolve(
        json(
          ticket({ expiresAt: new Date(Date.now() + 30_000).toISOString() }),
        ),
      );
    mount();
    await settle();
    fireEvent.error(video());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a TEST rehearsal ticket (the test film) is labelled as such', async () => {
    answer = () =>
      Promise.resolve(
        json(
          ticket({
            url: '/media/screening/screening-test-5s.mp4',
            lighterUrl: null,
            simulated: true,
          }),
        ),
      );
    mount();
    await settle();
    expect(
      screen.getByText('Rehearsal · temporary five-second test film'),
    ).toBeInTheDocument();
  });
});
