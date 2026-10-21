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
  resolveProgramme,
  SCREENING_POSTER,
  type ScreeningFilm,
} from '../config/screeningFilm';
import { progressStorage } from '../../owner/session';
import {
  filmProblemText,
  useFilmSource,
} from '../../../shared/media/filmSource';
import { protectedMediaId } from '../../../shared/media/contract';
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
 * No picture this long after her tap, or no progress this long mid-film:
 * stop, keep her place and offer Retry rather than load forever (ADR-026).
 * The iPhone's own player shows its spinner meanwhile.
 */
export const START_TIMEOUT_MS = 30_000;
export const STALL_TIMEOUT_MS = 45_000;
const SLOW =
  'The film is arriving too slowly over this connection. Your place is kept.';

/**
 * Dev Mode / TEST rehearsals and the local dev server may use the test
 * film. Unit tests ('test' mode) and production guests get LIVE behaviour.
 */
const rehearsalPage = () =>
  simulationActive || import.meta.env.MODE === 'development';

const iso = () => new Date(appClock.now()).toISOString();

/** Which reel of a programme she is on, kept across visits (ADR-024). */
const REEL_KEY = 'thirty-club:screening-reel';
const programmeId = (reels: readonly ScreeningFilm[]) =>
  reels.map((reel) => reel.id).join('|');
function loadReel(reels: readonly ScreeningFilm[]): number {
  try {
    const raw = progressStorage.getItem(REEL_KEY);
    const saved = raw
      ? (JSON.parse(raw) as { programme?: string; index?: number })
      : null;
    if (
      saved?.programme === programmeId(reels) &&
      Number.isInteger(saved.index) &&
      saved.index! >= 0 &&
      saved.index! < reels.length
    )
      return saved.index!;
  } catch {
    // A fresh programme.
  }
  return 0;
}
function saveReel(reels: readonly ScreeningFilm[], index: number) {
  try {
    progressStorage.setItem(
      REEL_KEY,
      JSON.stringify({ programme: programmeId(reels), index }),
    );
  } catch {
    // Storage unavailable: the reel is kept for this visit only.
  }
}

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
  programme,
  onComplete,
}: {
  /** Defaults to the configured film for this page (LIVE or rehearsal). */
  film?: ScreeningFilm | null;
  /** Reels in order (tests); defaults to the configured programme. */
  programme?: readonly ScreeningFilm[];
  onComplete?: () => void;
}) {
  const [reels] = useState<readonly ScreeningFilm[]>(
    () =>
      programme ??
      (filmProp === undefined
        ? resolveProgramme(rehearsalPage())
        : filmProp
          ? [filmProp]
          : []),
  );
  const [reelIndex, setReelIndex] = useState(() => loadReel(reels));
  const reelRef = useRef(reelIndex);
  const film = reels[reelIndex] ?? null;
  /** The reel the native listeners and saves refer to. */
  const filmRef = useRef(film);
  /** Between reels (or after a reel failed): the reel offered next. */
  const [intermission, setIntermission] = useState<{ next: number } | null>(
    null,
  );
  const chooseReel = useCallback(
    (index: number) => {
      reelRef.current = index;
      filmRef.current = reels[index] ?? null;
      saveReel(reels, index);
      setReelIndex(index);
    },
    [reels],
  );
  /**
   * Where the current reel plays from. The birthday film is protected
   * (ADR-026): its signed URL is fetched as the room fades in, never inside
   * her tap, so Watch Movie can still open the iPhone's player.
   */
  const source = useFilmSource(film?.src);
  const { renew, renewIfExpiring } = source;
  /** The lighter print, once she has chosen it after a struggle. */
  const [print, setPrint] = useState<'standard' | 'lighter'>('standard');
  const playable =
    print === 'lighter' && source.lighterUrl ? source.lighterUrl : source.url;
  const [buffering, setBuffering] = useState(false);
  const watchdog = useRef<number | null>(null);
  /**
   * Where the film was when the stall watch was last re-armed: it counts
   * progress (half a second of film), not events, which WebKit reports
   * over a frozen picture during an outage (ADR-027).
   */
  const mark = useRef(-1);
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
      const current = filmRef.current;
      if (!current || !element || element.readyState < 1) return;
      commit({
        type: 'position',
        filmId: current.id,
        seconds: element.ended ? 0 : element.currentTime,
        duration: element.duration,
      });
    },
    [commit],
  );

  const clearWatchdog = useCallback(() => {
    if (watchdog.current !== null) window.clearTimeout(watchdog.current);
    watchdog.current = null;
  }, []);
  useEffect(() => clearWatchdog, [clearWatchdog]);

  /** Back in her seat, facing the screen. */
  const backToSeat = useCallback(
    (line: string | null, problem = '') => {
      clearWatchdog();
      setBuffering(false);
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
    [clearWatchdog, reducedMotion, say],
  );

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), RETURN_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  /**
   * The film reached its natural end. Counted once per playback, at the end
   * of the last reel; between reels the next is offered (her tap starts it).
   */
  const finish = useCallback(() => {
    if (settled.current || phaseRef.current !== 'film') return;
    settled.current = true;
    const next = reelRef.current + 1;
    if (next < reels.length) {
      leaveFullscreen(video.current);
      chooseReel(next);
      setIntermission({ next });
      backToSeat(SCREENING_LINES.nextReel);
      return;
    }
    const first = recordRef.current.completedAt === null;
    commit({ type: 'complete', at: iso() });
    leaveFullscreen(video.current);
    if (reels.length > 1) chooseReel(0);
    backToSeat(endLine(first));
    onComplete?.();
  }, [backToSeat, chooseReel, commit, onComplete, reels.length]);

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
      // A fresh ticket is ready for Retry (an expired URL is one cause).
      void renew();
      // A reel that will not load never blocks the rest of the programme.
      const next = reelRef.current + 1;
      if (next < reels.length) {
        setIntermission({ next });
        backToSeat(SCREENING_LINES.reelUnavailable, problem);
        return;
      }
      backToSeat(null, problem);
    },
    [backToSeat, reels.length, renew, savePosition],
  );

  /** Loading always ends: too slow to start or stalled too long → Retry. */
  const arm = useCallback(
    (ms: number) => {
      clearWatchdog();
      watchdog.current = window.setTimeout(() => {
        watchdog.current = null;
        if (phaseRef.current === 'film') fail(SLOW);
      }, ms);
    },
    [clearWatchdog, fail],
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
  // The source is set here, never as a rendered attribute: re-rendering the
  // same src would restart a reel she is watching. A renewed ticket waits
  // until she is back in her seat.
  useEffect(() => {
    const element = video.current;
    if (!film || !element || !playable || phaseRef.current === 'film') return;
    if (element.getAttribute('src') !== playable) {
      element.src = playable;
      element.load();
    }
  }, [film, playable]);

  const status = film ? screeningStatus(record, film.id) : 'never-entered';
  const resumeAt = film ? resumeSeconds(record, film.id) : null;

  /**
   * Watch Movie. Everything iOS needs (play, fullscreen) happens here,
   * synchronously inside the tap; the camera move is CSS that follows.
   */
  function watch(
    from: 'resume' | 'beginning',
    index = reelRef.current,
    url: string | null = index === reelRef.current ? playable : null,
  ) {
    const element = video.current;
    const target = reels[index];
    if (!target || !element || phaseRef.current === 'film') return;
    // An ordinary reel plays from its own address; a protected one only
    // once its ticket is in hand (fetched as the reel comes up).
    const address = protectedMediaId(target.src) ? url : target.src;
    if (index !== reelRef.current) chooseReel(index);
    if (!address) return;
    filmRef.current = target;
    // Another reel: its source is set inside the tap, so play() below is
    // still the gesture iPhone requires.
    if (element.getAttribute('src') !== address) {
      element.src = address;
      element.load();
    }
    const start =
      from === 'resume'
        ? (resumeSeconds(recordRef.current, target.id) ?? 0)
        : 0;
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
    arm(START_TIMEOUT_MS);
    setBuffering(true);
    setIntermission(null);
    setNotice('');
    setSpeech((s) => (s ? { ...s, visible: false } : s));
    setSettling(false);
    setPresentation(shown);
    setPhase('film');
  }

  /** After a struggle: the smaller print, from her place, in the same tap. */
  function watchLighter() {
    if (!source.lighterUrl) return;
    setPrint('lighter');
    watch('resume', reelRef.current, source.lighterUrl);
  }

  /**
   * The offline fallback (ADR-026): the film is shown another way (the
   * owner's own copy). Recorded as exactly that, never as watched; the
   * evening's guidance moves on, and the film stays here, place kept.
   */
  function watchElsewhere() {
    commit({ type: 'elsewhere', at: iso() });
    setNotice('');
    setIntermission(null);
    say(SCREENING_LINES.elsewhere);
    onComplete?.();
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
    const t = event.currentTarget.currentTime;
    if (
      watchdog.current !== null &&
      !settled.current &&
      Math.abs(t - mark.current) >= 0.5
    ) {
      mark.current = t;
      arm(STALL_TIMEOUT_MS);
    }
    const tick = Math.floor(t);
    if (tick !== lastSaved.current && tick % SAVE_EVERY_SECONDS === 0) {
      lastSaved.current = tick;
      savePosition();
    }
  }

  const inFilm = phase === 'film';
  const isTest = film?.kind === 'test' || source.simulated;
  /** The ticket was refused or could not be fetched. */
  const unreachable = film !== null && source.status === 'unavailable';
  /** Not uploaded, or not yet: the honest "being prepared". */
  const preparing =
    !film ||
    (unreachable &&
      (source.problem === 'preparing' || source.problem === 'not-open'));
  const problem =
    notice ||
    (unreachable && !preparing && source.problem
      ? filmProblemText(source.problem)
      : '');

  return (
    <section
      className="cinema"
      data-phase={phase}
      data-settling={settling}
      data-presentation={presentation ?? 'none'}
      data-status={status}
      data-problem={problem ? 'true' : 'false'}
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
          {film && reels.length > 1 && (
            <p className="cinema__reel">
              {intermission
                ? `Next — ${reels[intermission.next]?.title ?? ''}`
                : `${reelIndex + 1} of ${reels.length} · ${film.title}`}
            </p>
          )}
          {film && !preparing ? (
            <button
              ref={primary}
              type="button"
              className="cinema__primary"
              // While the projector's ticket is on its way there is nothing
              // to play yet; it is fetched as she sits down.
              disabled={!playable && !unreachable}
              onClick={() =>
                !playable
                  ? void renew()
                  : intermission
                    ? watch('beginning', intermission.next)
                    : watch('resume')
              }
            >
              {!playable
                ? unreachable
                  ? 'Try again'
                  : 'Preparing the projector…'
                : intermission
                  ? 'Continue the screening'
                  : notice
                    ? 'Try again'
                    : reelIndex > 0 && status !== 'interrupted'
                      ? 'Continue the screening'
                      : status === 'interrupted'
                        ? 'Resume Movie'
                        : 'Watch Movie'}
            </button>
          ) : (
            <p className="cinema__empty" role="status">
              Your screening is being prepared.
            </p>
          )}
        </div>

        <div
          className="cinema__below"
          data-problem={problem ? 'true' : 'false'}
        >
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
                // Ready only once the projector's ticket is in hand.
                disabled={!playable}
                onClick={() => watch('beginning', 0)}
              >
                Watch from the beginning
              </button>
            </p>
          )}
          {problem && (
            <p className="cinema__notice" role="alert">
              {problem}
            </p>
          )}
          {problem && film && (
            <p className="cinema__recovery">
              {source.lighterUrl && print === 'standard' && playable && (
                <button
                  type="button"
                  className="cinema__text-button"
                  onClick={watchLighter}
                >
                  Try the lighter print
                </button>
              )}
              <button
                type="button"
                className="cinema__text-button"
                onClick={watchElsewhere}
              >
                Watch it another way
              </button>
            </p>
          )}
          {film && !preparing && !problem && (
            <p className="cinema__sound">Turn your sound on, Madam.</p>
          )}
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
            poster={film.poster}
            // Deliberately not playsinline: on iPhone, play() opens the
            // native fullscreen player with its own controls.
            controls
            preload="metadata"
            tabIndex={inFilm ? 0 : -1}
            aria-label={film.title}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlaying={(event) => {
              setBuffering(false);
              // "Playing" is not progress: an event only arms the watch
              // when nothing is armed; progress re-arms it (onTimeUpdate).
              if (
                phaseRef.current === 'film' &&
                !settled.current &&
                watchdog.current === null
              ) {
                mark.current = event.currentTarget.currentTime;
                arm(STALL_TIMEOUT_MS);
              }
            }}
            onWaiting={(event) => {
              if (phaseRef.current !== 'film' || settled.current) return;
              setBuffering(true);
              if (watchdog.current === null) {
                mark.current = event.currentTarget.currentTime;
                arm(STALL_TIMEOUT_MS);
              }
            }}
            onPause={() => {
              if (phaseRef.current === 'film' && !settled.current) {
                // Her pause: no stall to watch for until she plays again.
                clearWatchdog();
                setBuffering(false);
                savePosition();
              }
            }}
            onEnded={finish}
            onError={() => {
              if (phaseRef.current === 'film')
                fail(navigator.onLine ? LOAD_FAILED : OFFLINE);
              // In her seat: a new ticket only if this one has expired
              // (otherwise her Retry decides; never a renewal loop).
              else void renewIfExpiring();
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
          {inFilm && buffering && (
            <p className="cinema__buffering" role="status">
              The film is loading…
            </p>
          )}
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
