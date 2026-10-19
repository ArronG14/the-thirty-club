import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { Link } from 'react-router';
import { speechDuration } from '../../entrance/domain/butlerScript';
import { appClock } from '../../rehearsal/clock';
import { simulationActive } from '../../rehearsal/mode';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import {
  resolveFilm,
  SCREENING_POSTER,
  type ScreeningFilm,
} from '../config/screeningFilm';
import {
  loadRecord,
  resumeSeconds,
  saveRecord,
  screeningReducer,
  screeningStatus,
  type ScreeningAction,
  type ScreeningRecord,
} from '../domain/screeningRecord';
import {
  arrivalLine,
  endLine,
  SCREENING_LINES,
} from '../domain/screeningScript';
import { CinemaBackdrop } from './CinemaBackdrop';
import {
  inFullscreen,
  leaveFullscreen,
  presentFilm,
  type FullscreenVideo,
  type Presentation,
} from './filmPresentation';
import './screening.css';

/** The seated composition with a blank screen (reference captures). */
export function ArrivalFrame() {
  return (
    <section
      className="cinema cinema--endframe"
      aria-label="Private Screening Room arrival"
    >
      <CinemaBackdrop />
      <div className="cinema__screen">
        <div className="cinema__poster cinema__poster--blank" />
      </div>
    </section>
  );
}
/** The screen filling the display: where the film appears to begin. */
export function EndFrame() {
  return (
    <section
      className="screening-endframe"
      aria-label="Screening Playback end frame"
    />
  );
}

/** The room fades in from the Butler's escort before he speaks. */
const ARRIVAL_SPEECH_MS = 1200;
/** How long the screen takes to settle back after the film. */
const RETURN_MS = 900;
const SAVE_EVERY_SECONDS = 2;
const LOAD_FAILED = 'The film could not be loaded just now. Please try again.';
const OFFLINE =
  'The screening needs a connection. The film is not kept on this device.';

/**
 * Dev Mode / TEST rehearsals and the local dev server may use the test
 * film. Unit tests ('test' mode) and production guests get LIVE behaviour.
 */
const rehearsalPage = () =>
  simulationActive || import.meta.env.MODE === 'development';

const iso = () => new Date(appClock.now()).toISOString();

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

type Phase = 'seated' | 'film';
interface Speech {
  text: string;
  turn: number;
  visible: boolean;
}

/**
 * The Private Screening Room: Alise is seated before the screen, the
 * Butler introduces the film, and Watch Movie opens one continuous MP4 in
 * the native player. At its natural end the room returns, he closes the
 * screening, and she may watch again as often as she likes.
 */
export default function ScreeningRoom({
  film: filmProp,
  onComplete,
}: {
  /** Defaults to the configured film for this page (LIVE or rehearsal). */
  film?: ScreeningFilm | null;
  onComplete?: () => void;
}) {
  const [film] = useState(() =>
    filmProp === undefined ? resolveFilm(rehearsalPage()) : filmProp,
  );
  const reducedMotion = useReducedMotion();
  const [record, dispatchRecord] = useReducer(
    screeningReducer,
    undefined,
    loadRecord,
  );
  const [atLoad] = useState(record);
  const [phase, setPhase] = useState<Phase>('seated');
  const [settling, setSettling] = useState(false);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [notice, setNotice] = useState('');
  const [storageOk, setStorageOk] = useState(true);
  const [presentation, setPresentation] = useState<Presentation | null>(null);

  const video = useRef<FullscreenVideo>(null);
  const primary = useRef<HTMLButtonElement>(null);
  // Native listeners and unmount outlive renders: they read the latest
  // state through refs.
  const recordRef = useRef(record);
  const phaseRef = useRef<Phase>('seated');
  /** True once the current playback has been resolved (ended, left, failed). */
  const settled = useRef(true);
  const wasFullscreen = useRef(false);
  const pendingSeek = useRef(0);
  const lastSaved = useRef(-1);

  /** Applies and saves at once, so a page being frozen keeps the change. */
  const commit = useCallback((action: ScreeningAction): ScreeningRecord => {
    const next = screeningReducer(recordRef.current, action);
    recordRef.current = next;
    setStorageOk(saveRecord(next));
    dispatchRecord(action);
    return next;
  }, []);

  const say = useCallback((text: string) => {
    setSpeech((s) => ({ text, turn: (s?.turn ?? 0) + 1, visible: true }));
  }, []);

  // He withdraws after a comfortable reading time.
  useEffect(() => {
    if (!speech?.visible) return;
    const timer = setTimeout(
      () => setSpeech((s) => (s ? { ...s, visible: false } : s)),
      speechDuration(speech.text),
    );
    return () => clearTimeout(timer);
  }, [speech]);

  // Seated: the visit is recorded, and the Butler speaks once the room has
  // faded in from the escort.
  useEffect(() => {
    commit({ type: 'enter', at: iso() });
    const timer = setTimeout(
      () => {
        say(
          arrivalLine({
            hasFilm: film !== null,
            introduced: atLoad.introducedAt !== null,
            status: film ? screeningStatus(atLoad, film.id) : 'never-entered',
          }),
        );
        if (film) commit({ type: 'introduced', at: iso() });
      },
      reducedMotion ? 0 : ARRIVAL_SPEECH_MS,
    );
    return () => clearTimeout(timer);
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** `element` is passed on unmount, when the ref is already detached. */
  const savePosition = useCallback(
    (element: HTMLVideoElement | null = video.current) => {
      if (!film || !element || element.readyState < 1) return;
      commit({
        type: 'position',
        filmId: film.id,
        seconds: element.ended ? 0 : element.currentTime,
        duration: element.duration,
      });
    },
    [commit, film],
  );

  /** Back in her seat, facing the screen. */
  const backToSeat = useCallback(
    (line: string | null, problem = '') => {
      phaseRef.current = 'seated';
      setPhase('seated');
      setPresentation(null);
      setNotice(problem);
      if (!reducedMotion) setSettling(true);
      if (line) say(line);
      requestAnimationFrame(() =>
        primary.current?.focus({ preventScroll: true }),
      );
    },
    [reducedMotion, say],
  );

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), RETURN_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  /** The film reached its natural end. Counted once per playback. */
  const finish = useCallback(() => {
    if (settled.current || phaseRef.current !== 'film') return;
    settled.current = true;
    const first = recordRef.current.completedAt === null;
    commit({ type: 'complete', at: iso() });
    leaveFullscreen(video.current);
    backToSeat(endLine(first));
    onComplete?.();
  }, [backToSeat, commit, onComplete]);

  /** She closed the player before the end: keep her place, no completion. */
  const leaveEarly = useCallback(() => {
    if (settled.current || phaseRef.current !== 'film') return;
    const element = video.current;
    // iOS may close its own player as the film ends, before `ended`.
    if (
      element &&
      (element.ended ||
        (element.duration > 0 &&
          element.currentTime >= element.duration - 0.25))
    ) {
      finish();
      return;
    }
    settled.current = true;
    element?.pause();
    savePosition();
    leaveFullscreen(element);
    backToSeat(SCREENING_LINES.paused);
  }, [backToSeat, finish, savePosition]);

  const fail = useCallback(
    (problem: string) => {
      if (settled.current) return;
      settled.current = true;
      video.current?.pause();
      savePosition();
      leaveFullscreen(video.current);
      backToSeat(null, problem);
    },
    [backToSeat, savePosition],
  );

  // Browser-owned fullscreen closing is the user leaving the film.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const onDocument = () => {
      if (document.fullscreenElement === element) wasFullscreen.current = true;
      else if (wasFullscreen.current) {
        wasFullscreen.current = false;
        leaveEarly();
      }
    };
    const onBegin = () => {
      wasFullscreen.current = true;
    };
    const onEnd = () => {
      wasFullscreen.current = false;
      leaveEarly();
    };
    document.addEventListener('fullscreenchange', onDocument);
    element.addEventListener('webkitbeginfullscreen', onBegin);
    element.addEventListener('webkitendfullscreen', onEnd);
    return () => {
      document.removeEventListener('fullscreenchange', onDocument);
      element.removeEventListener('webkitbeginfullscreen', onBegin);
      element.removeEventListener('webkitendfullscreen', onEnd);
    };
  }, [leaveEarly]);

  // Refreshing, backgrounding and leaving the room keep her place.
  useEffect(() => {
    const element = video.current;
    const hide = () => {
      if (document.visibilityState === 'hidden' && phaseRef.current === 'film')
        savePosition();
    };
    const pagehide = () => {
      if (phaseRef.current === 'film') savePosition();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
      if (element && phaseRef.current === 'film' && !settled.current)
        savePosition(element);
      if (element) {
        element.pause();
        // Release the connection and decoder. StrictMode re-runs effects;
        // the source is restored below.
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [savePosition]);
  useEffect(() => {
    const element = video.current;
    if (film && element && !element.getAttribute('src')) {
      element.src = film.src;
      element.load();
    }
  }, [film]);

  const status = film ? screeningStatus(record, film.id) : 'never-entered';
  const resumeAt = film ? resumeSeconds(record, film.id) : null;

  /**
   * Watch Movie. Everything iOS needs (play, fullscreen) happens here,
   * synchronously inside the tap; the camera move is CSS that follows.
   */
  function watch(from: 'resume' | 'beginning') {
    const element = video.current;
    if (!film || !element || phaseRef.current === 'film') return;
    const start = from === 'resume' ? (resumeAt ?? 0) : 0;
    if (element.error) element.load();
    pendingSeek.current = start;
    if (element.readyState >= 1) element.currentTime = start;
    settled.current = false;
    wasFullscreen.current = false;
    lastSaved.current = -1;
    phaseRef.current = 'film';
    const playing = element.play() as Promise<void> | undefined;
    const shown = presentFilm(element, () => setPresentation('theatre'));
    playing?.catch((error: unknown) => {
      // A pause or source change interrupting play() is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      fail(
        element.error
          ? navigator.onLine
            ? LOAD_FAILED
            : OFFLINE
          : 'The projector did not start. Tap Watch Movie once more.',
      );
    });
    commit({ type: 'start', at: iso() });
    setNotice('');
    setSpeech((s) => (s ? { ...s, visible: false } : s));
    setSettling(false);
    setPresentation(shown);
    setPhase('film');
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const element = event.currentTarget;
    if (pendingSeek.current > 0 && element.currentTime < 0.5)
      element.currentTime = Math.min(
        pendingSeek.current,
        Math.max(0, element.duration - 0.5),
      );
  }

  function onTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    if (phaseRef.current !== 'film') return;
    const tick = Math.floor(event.currentTarget.currentTime);
    if (tick !== lastSaved.current && tick % SAVE_EVERY_SECONDS === 0) {
      lastSaved.current = tick;
      savePosition();
    }
  }

  const inFilm = phase === 'film';
  const isTest = film?.kind === 'test';

  return (
    <section
      className="cinema"
      data-phase={phase}
      data-settling={settling}
      data-presentation={presentation ?? 'none'}
      data-status={status}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      aria-labelledby="cinema-title"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          inFilm &&
          video.current &&
          !inFullscreen(video.current)
        )
          leaveEarly();
      }}
    >
      <CinemaBackdrop />
      <div className="cinema__dimmer" aria-hidden="true" />
      <header className="cinema__masthead" inert={inFilm}>
        <p className="cinema__eyebrow">The Thirty Club</p>
        <h1 id="cinema-title">The Private Screening Room</h1>
        <span aria-hidden="true">◆</span>
      </header>

      <div className="cinema__screen" inert={inFilm}>
        <div className="cinema__poster">
          <p className="cinema__eyebrow">{SCREENING_POSTER.presenter}</p>
          <h2>{SCREENING_POSTER.title}</h2>
          <p className="cinema__subtitle">{SCREENING_POSTER.subtitle}</p>
          {film ? (
            <button
              ref={primary}
              type="button"
              className="cinema__primary"
              onClick={() => watch('resume')}
            >
              {status === 'interrupted' ? 'Resume Movie' : 'Watch Movie'}
            </button>
          ) : (
            <p className="cinema__empty" role="status">
              Your screening is being prepared.
            </p>
          )}
        </div>

        <div className="cinema__below">
          <div
            className="cinema__butler"
            data-speaking={speech?.visible ? 'true' : 'false'}
            aria-live="polite"
          >
            {speech && (
              <figure key={speech.turn} className="cinema__words">
                <blockquote>
                  <p>{speech.text}</p>
                </blockquote>
                <figcaption>The Butler</figcaption>
              </figure>
            )}
          </div>
          {status === 'interrupted' && resumeAt !== null && (
            <p className="cinema__resume">
              Your place is kept at {timestamp(resumeAt)}.{' '}
              <button
                type="button"
                className="cinema__text-button"
                onClick={() => watch('beginning')}
              >
                Watch from the beginning
              </button>
            </p>
          )}
          {notice && (
            <p className="cinema__notice" role="alert">
              {notice}
            </p>
          )}
          {film && <p className="cinema__sound">Turn your sound on, Madam.</p>}
          {isTest && (
            <p className="cinema__rehearsal">
              Rehearsal · temporary five-second test film
            </p>
          )}
          {!storageOk && (
            <p className="cinema__storage" role="status">
              Your place can be kept for this visit only. Device storage is
              unavailable.
            </p>
          )}
          <Link className="cinema__exit" to="/">
            Return to the Members’ Lounge
          </Link>
        </div>
      </div>

      {film && (
        <div className="cinema__film" aria-hidden={!inFilm}>
          <video
            ref={video}
            src={film.src}
            poster={film.poster}
            // Deliberately not playsinline: on iPhone, play() opens the
            // native fullscreen player with its own controls.
            controls
            preload="metadata"
            tabIndex={inFilm ? 0 : -1}
            aria-label={film.title}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPause={() => {
              if (phaseRef.current === 'film' && !settled.current)
                savePosition();
            }}
            onEnded={finish}
            onError={() => {
              if (phaseRef.current === 'film')
                fail(navigator.onLine ? LOAD_FAILED : OFFLINE);
            }}
          >
            {film.captions && (
              <track
                kind="captions"
                src={film.captions}
                srcLang="en"
                label="English"
                default
              />
            )}
          </video>
          {inFilm && (
            <button
              type="button"
              className="cinema__leave"
              onClick={leaveEarly}
            >
              Leave the screening
            </button>
          )}
        </div>
      )}
      <div className="cinema__veil" aria-hidden="true" />
    </section>
  );
}
