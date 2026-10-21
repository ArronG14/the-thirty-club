/**
 * The short-film player (Nyla's film, ADR-026): a protected film's ticket is
 * fetched before her tap, play() runs inside it, loading is visible and
 * always ends, Retry keeps her place and fetches a fresh ticket.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilmPlayer, START_TIMEOUT_MS, STALL_TIMEOUT_MS } from './FilmPlayer';
import { protectedMediaId, mediaReference } from './contract';
import { filmProblemText } from './filmSource';

const SIGNED =
  'https://project.supabase.co/storage/v1/object/sign/ttc-media/films/y/nyla.mp4?token=b';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
let answer: () => Promise<Response>;
const fetchMock = vi.fn((input: RequestInfo | URL) => {
  void input;
  return answer();
});
async function settle() {
  for (let i = 0; i < 6; i++) await act(() => Promise.resolve());
}
const video = () => document.querySelector('video') as HTMLVideoElement;

beforeEach(() => {
  vi.useFakeTimers();
  answer = () =>
    Promise.resolve(
      json({
        id: 'nyla-film',
        url: SIGNED,
        lighterUrl: null,
        expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
        simulated: false,
      }),
    );
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
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

describe('protected references', () => {
  it('only the known films are protected; ordinary addresses pass through', () => {
    expect(mediaReference('nyla-film')).toBe('/api/v1/media/nyla-film');
    expect(protectedMediaId('/api/v1/media/nyla-film')).toBe('nyla-film');
    expect(protectedMediaId('/api/v1/media/other')).toBeNull();
    expect(
      protectedMediaId('/media/screening/screening-test-5s.mp4'),
    ).toBeNull();
    expect(protectedMediaId(null)).toBeNull();
  });
});

describe('FilmPlayer', () => {
  it('fetches the ticket first, then plays the signed film inside her tap', async () => {
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    expect(screen.getByRole('button', { name: 'One moment…' })).toBeDisabled();
    await settle();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/v1/media/nyla-film');
    expect(video()).toHaveAttribute('src', SIGNED);
    expect(video()).not.toHaveAttribute('playsinline');
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Loading the film…' }),
    ).toBeDisabled();
    fireEvent.playing(video());
    fireEvent.ended(video());
    // Again, as often as she likes.
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('an ordinary address plays directly, with no ticket', () => {
    render(
      <FilmPlayer src="/media/screening/screening-test-5s.mp4" title="T" />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Watch' })).toBeEnabled();
  });

  it('never loads forever: a slow start stops with Retry and a fresh ticket', async () => {
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    act(() => vi.advanceTimersByTime(START_TIMEOUT_MS));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film is taking too long to arrive over this connection.',
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('a network error mid-film offers Retry, keeping her place', async () => {
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    fireEvent.playing(video());
    Object.defineProperty(video(), 'currentTime', {
      value: 21,
      writable: true,
    });
    fireEvent.timeUpdate(video());
    fireEvent.error(video());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film was interrupted. Your place is kept',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('a frozen picture that still reports "playing" (WebKit in an outage) ends with Retry', async () => {
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    fireEvent.playing(video());
    Object.defineProperty(video(), 'currentTime', { value: 0, writable: true });
    // A minute of real progress: never a stall, however long the film.
    for (let s = 1; s <= 60; s++) {
      video().currentTime = s;
      fireEvent.timeUpdate(video());
      act(() => vi.advanceTimersByTime(1000));
    }
    expect(screen.queryByRole('alert')).toBeNull();
    // Then the clock stops, while the browser still says it is playing.
    fireEvent.waiting(video());
    fireEvent.playing(video());
    // 45 s from the last real progress (a second before these events).
    act(() => vi.advanceTimersByTime(STALL_TIMEOUT_MS - 2000));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The film is taking too long to arrive over this connection. Your place is kept',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('honest words when the film cannot be had', async () => {
    answer = () => Promise.resolve(json({ error: 'forbidden' }, 403));
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    await settle();
    expect(screen.getByText(filmProblemText('refused'))).toBeInTheDocument();
    answer = () => Promise.resolve(json({ error: 'not-configured' }, 503));
    cleanup();
    render(<FilmPlayer src={mediaReference('nyla-film')} title="Nyla" />);
    await settle();
    expect(
      screen.getByText('This film is still being prepared.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
