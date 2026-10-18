import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import {
  adjacentIndex,
  collectionComplete,
  loadProgress,
  progressReducer,
  resumeIndex,
  saveProgress,
} from '../domain/progress';
import {
  realMessages,
  validateMessages,
  VIDEO_MESSAGES,
  type VideoMessage,
} from '../domain/videoMessages';
import { CinemaBackdrop } from './CinemaBackdrop';
import { cinemaConfig } from './cinemaConfig';
import { EntranceFilm } from './EntranceFilm';
import { MessageList } from './MessageList';
import { ScreenPlayer, type PlayerHandle } from './ScreenPlayer';
import './screening.css';
import './premiere.css';

export function ArrivalFrame() {
  return (
    <section
      className="cinema cinema--endframe"
      aria-label="Private Screening Room arrival"
    >
      <CinemaBackdrop />
      <div className="cinema__screen cinema__screen--blank" />
    </section>
  );
}
/** The future film ends inside the projection surface, with no architecture. */
export function EndFrame() {
  return (
    <section
      className="screening-endframe"
      aria-label="Screening Playback end frame"
    />
  );
}
export default function ScreeningRoom({
  messages = VIDEO_MESSAGES,
  onComplete,
}: {
  messages?: readonly VideoMessage[];
  onComplete?: () => void;
}) {
  const playlist = useMemo(() => realMessages(messages), [messages]);
  const problems = useMemo(() => validateMessages(messages), [messages]);
  const [progress, dispatch] = useReducer(
    progressReducer,
    playlist,
    loadProgress,
  );
  const [index, setIndex] = useState(() => resumeIndex(playlist, progress));
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [collection, setCollection] = useState(false);
  const reducedMotion = useReducedMotion();
  const [entranceDone, setEntranceDone] = useState(
    () =>
      progress.entranceSeen ||
      !cinemaConfig.entrance.enabled ||
      !cinemaConfig.entrance.src,
  );
  const [destination, setDestination] = useState(
    () =>
      cinemaConfig.entrance.enabled &&
      Boolean(cinemaConfig.entrance.src) &&
      (progress.entranceSeen || reducedMotion),
  );
  const [pushIn, setPushIn] = useState(false);
  useEffect(() => {
    if (!destination || typeof window.matchMedia !== 'function') return;
    const orientation = window.matchMedia('(orientation: landscape)');
    // A portrait clip can make the page tall. Rotation returns to the film,
    // without touching its source, playback position or playback state.
    const returnToFilm = () => window.scrollTo({ top: 0, behavior: 'instant' });
    orientation.addEventListener('change', returnToFilm);
    return () => orientation.removeEventListener('change', returnToFilm);
  }, [destination]);
  const player = useRef<PlayerHandle>(null);
  const storageNotice = useRef<HTMLParagraphElement>(null);
  const current = problems.length ? undefined : playlist[index];
  useEffect(() => {
    const saved = saveProgress(progress);
    if (storageNotice.current) storageNotice.current.hidden = saved;
  }, [progress]);
  useEffect(() => {
    if (!problems.length && collectionComplete(playlist, progress))
      onComplete?.();
  }, [playlist, progress, onComplete, problems.length]);
  const finishEntrance = useCallback(() => {
    setEntranceDone(true);
    setDestination(true);
    dispatch({ type: 'entrance-seen' });
  }, []);
  function select(nextIndex: number, position = 0) {
    const message = playlist[nextIndex];
    if (!message) return;
    player.current?.pause();
    flushSync(() => {
      if (!destination) {
        setPushIn(!reducedMotion);
        setDestination(true);
      }
      setIndex(nextIndex);
      setActive(true);
      setCollection(false);
      setPlaying(false);
      dispatch({ type: 'select', id: message.id });
    });
    player.current?.play(position);
  }
  function browse() {
    player.current?.pause();
    setCollection(true);
  }
  const showEntrance = !entranceDone && !reducedMotion;
  return (
    <section
      className={`cinema${destination ? ' cinema--playback' : ''}`}
      data-view={destination ? 'playback' : 'arrival'}
      data-playing={playing}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      aria-labelledby="cinema-title"
    >
      <CinemaBackdrop />
      <div className="cinema__dimmer" aria-hidden="true" />
      <header className="cinema__masthead" inert={showEntrance}>
        <p className="cinema__eyebrow">The Thirty Club</p>
        <h1 id="cinema-title">The Private Screening Room</h1>
        <span aria-hidden="true">◆</span>
      </header>
      <div className="cinema__screen" inert={showEntrance}>
        {current && !problems.length && (
          <ScreenPlayer
            key={current.id}
            ref={player}
            message={current}
            active={active}
            initialPosition={progress.positions[current.id] ?? 0}
            onPosition={(seconds) =>
              dispatch({ type: 'position', id: current.id, seconds })
            }
            onEnded={() => {
              dispatch({ type: 'ended', id: current.id });
            }}
            nextSender={playlist[index + 1]?.sender}
            onRewatch={() => select(0)}
            onPlaying={setPlaying}
            onBrowse={browse}
            previous={
              index > 0
                ? () => select(adjacentIndex(index, -1, playlist.length))
                : undefined
            }
            next={
              index < playlist.length - 1
                ? () => select(adjacentIndex(index, 1, playlist.length))
                : undefined
            }
          />
        )}
        {!active && (
          <div className="cinema__title-card">
            <p className="cinema__eyebrow">Private Screening No. 001</p>
            {progress.started && current ? (
              <>
                <h2>
                  Welcome back to your
                  <br />
                  private screening
                </h2>
                <button
                  className="cinema__primary"
                  onClick={() =>
                    select(index, progress.positions[current.id] ?? 0)
                  }
                >
                  Resume screening
                </button>
                <div className="cinema__welcome-actions">
                  <button onClick={browse}>Browse messages</button>
                  <button onClick={() => select(0)}>
                    Start from beginning
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Alise</h2>
                <p className="cinema__subtitle">Thirty years in the making</p>
                <p className="cinema__invitation">
                  Your private premiere awaits.
                </p>
                {current && !problems.length ? (
                  <button className="cinema__primary" onClick={() => select(0)}>
                    Begin screening
                  </button>
                ) : (
                  <p className="cinema__empty" role="status">
                    {problems.length
                      ? 'The collection needs a little attention. Please return shortly.'
                      : 'The messages are not ready yet.'}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {!active && (
          <div className="cinema__below">
            <p className="cinema__seat">
              One member. The best seat in the house.
            </p>
            {current && (
              <p className="cinema__sound">
                Turn your sound on. This evening is for you.
              </p>
            )}
            <Link
              className="cinema__exit"
              to="/"
              onClick={() => player.current?.pause()}
            >
              Return to the Members’ Lounge
            </Link>
          </div>
        )}
        <p ref={storageNotice} className="cinema__storage" hidden role="status">
          Progress can be kept for this visit only. Device storage is
          unavailable.
        </p>
      </div>
      {pushIn && <div className="cinema__push-surface" aria-hidden="true" />}
      {collection && (
        <MessageList
          messages={playlist}
          selected={index}
          watched={progress.watched}
          onClose={() => setCollection(false)}
          onSelect={(i) => select(i)}
        />
      )}
      {showEntrance && <EntranceFilm onDone={finishEntrance} />}
    </section>
  );
}
