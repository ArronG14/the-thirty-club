import { useCallback, useEffect, useRef, useState } from 'react';
import { filmProblemText, useFilmSource } from './filmSource';

/** No picture within this long of her tap: offer Retry rather than wait on. */
export const START_TIMEOUT_MS = 30_000;
/** Stalled mid-film (no progress) for this long: stop and keep her place. */
export const STALL_TIMEOUT_MS = 45_000;

const SLOW =
  'The film is taking too long to arrive over this connection. Your place is kept; please try again.';
const FAILED =
  'The film was interrupted. Your place is kept; please try again.';
const OFFLINE =
  'The connection has dropped. Your place is kept; please try again once it returns.';

type Phase = 'idle' | 'starting' | 'playing' | 'buffering' | 'failed';
type FullscreenVideo = HTMLVideoElement & { webkitExitFullscreen?(): void };

function leaveFullscreen(element: FullscreenVideo | null) {
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    element?.webkitExitFullscreen?.();
  } catch {
    // Already out of fullscreen.
  }
}

/**
 * A short film she has been given (Nyla's film, ADR-026), watched as often
 * as she likes. Not `playsInline`: on iPhone, play() inside her tap opens
 * the native fullscreen player (ADR-019). The source may be protected; its
 * ticket is fetched before she taps. Loading is always visible and always
 * ends: a slow start or a long stall stops with Retry, keeping her place.
 */
export function FilmPlayer({
  src,
  title,
  watchLabel = 'Watch',
  print = 'standard',
  buttonClassName,
  noteClassName,
}: {
  src: string;
  title: string;
  watchLabel?: string;
  /** The owner's check of a film's smaller print. */
  print?: 'standard' | 'lighter';
  buttonClassName?: string;
  noteClassName?: string;
}) {
  const source = useFilmSource(src);
  const { renew, renewIfExpiring } = source;
  const url = print === 'lighter' ? source.lighterUrl : source.url;
  const video = useRef<FullscreenVideo>(null);
  const [phase, setPhaseState] = useState<Phase>('idle');
  // Native events outlive renders: they read the phase through a ref.
  const phaseRef = useRef<Phase>('idle');
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [message, setMessage] = useState('');
  const resumeAt = useRef(0);
  const watchdog = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdog.current !== null) window.clearTimeout(watchdog.current);
    watchdog.current = null;
  }, []);

  const fail = useCallback(
    (text: string) => {
      clearWatchdog();
      const element = video.current;
      if (element) {
        if (element.currentTime > 0) resumeAt.current = element.currentTime;
        element.pause();
      }
      leaveFullscreen(element);
      setPhase('failed');
      setMessage(text);
      // A fresh ticket for Retry (an expired signed URL is one cause).
      void renew();
    },
    [clearWatchdog, renew, setPhase],
  );

  const arm = useCallback(
    (ms: number, text: string) => {
      clearWatchdog();
      watchdog.current = window.setTimeout(() => fail(text), ms);
    },
    [clearWatchdog, fail],
  );

  useEffect(() => clearWatchdog, [clearWatchdog]);

  // The source is set here, never as a rendered attribute, and never while
  // the film plays (a renewed ticket must not restart it).
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    if (phase === 'playing' || phase === 'buffering' || phase === 'starting')
      return;
    if (element.getAttribute('src') !== url) {
      element.src = url;
      element.load();
    }
  }, [phase, url]);

  function watch() {
    const element = video.current;
    if (!element || !url) return;
    if (element.getAttribute('src') !== url || element.error) {
      element.src = url;
      element.load();
    }
    if (resumeAt.current > 0 && element.readyState >= 1)
      element.currentTime = resumeAt.current;
    setMessage('');
    setPhase('starting');
    arm(START_TIMEOUT_MS, SLOW);
    // Synchronously inside the tap: iPhone opens its own player.
    void element.play()?.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      fail(
        navigator.onLine
          ? 'The film could not start. Please try again.'
          : OFFLINE,
      );
    });
  }

  const ready = source.status === 'ready' && url;
  const busy = phase === 'starting' || phase === 'buffering';

  return (
    <>
      <video
        ref={video}
        controls
        preload="metadata"
        aria-label={title}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          if (resumeAt.current > 0 && element.currentTime < 0.5)
            element.currentTime = Math.min(
              resumeAt.current,
              Math.max(0, element.duration - 0.5),
            );
        }}
        onPlaying={() => {
          clearWatchdog();
          setPhase('playing');
        }}
        onWaiting={() => {
          if (phaseRef.current === 'idle' || phaseRef.current === 'failed')
            return;
          setPhase('buffering');
          arm(STALL_TIMEOUT_MS, SLOW);
        }}
        onTimeUpdate={(event) => {
          const t = event.currentTarget.currentTime;
          if (t > 0) resumeAt.current = t;
        }}
        onPause={(event) => {
          // Her own pause (or the native player closing) is not a failure.
          if (phaseRef.current === 'failed') return;
          const element = event.currentTarget;
          clearWatchdog();
          if (!element.ended) setPhase('idle');
        }}
        onEnded={() => {
          clearWatchdog();
          resumeAt.current = 0;
          setPhase('idle');
        }}
        onError={() => {
          if (phaseRef.current === 'idle' || phaseRef.current === 'failed') {
            // Failed while nothing plays: a new ticket only if this one
            // has expired (otherwise her Retry decides; never a loop).
            void renewIfExpiring();
            return;
          }
          fail(navigator.onLine ? FAILED : OFFLINE);
        }}
      />
      {ready ? (
        <button
          type="button"
          className={buttonClassName}
          disabled={busy}
          onClick={watch}
        >
          {busy
            ? 'Loading the film…'
            : phase === 'failed'
              ? 'Try again'
              : watchLabel}
        </button>
      ) : source.status === 'unavailable' ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={() => void renew()}
          hidden={
            source.problem === 'preparing' || source.problem === 'not-open'
          }
        >
          Try again
        </button>
      ) : (
        <button type="button" className={buttonClassName} disabled>
          One moment…
        </button>
      )}
      <p className={noteClassName} role="status" aria-live="polite">
        {busy
          ? 'Loading the film. On a slow connection this can take a moment.'
          : source.status === 'unavailable' && source.problem
            ? filmProblemText(source.problem)
            : ''}
      </p>
      {source.simulated && (
        <p className={noteClassName}>
          Rehearsal · the five-second test film stands in for this film.
        </p>
      )}
      {message && <p role="alert">{message}</p>}
    </>
  );
}
