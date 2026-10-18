import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type CSSProperties,
} from 'react';
import { Link } from 'react-router';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import type { VideoMessage } from '../domain/videoMessages';

export interface PlayerHandle {
  play(position?: number): void;
  pause(): void;
}
function timestamp(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function Icon({
  name,
}: {
  name:
    'previous' | 'play' | 'pause' | 'next' | 'collection' | 'more' | 'close';
}) {
  const paths = {
    previous: (
      <>
        <path d="M6 5v14M18 5 8 12l10 7Z" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    next: (
      <>
        <path d="M18 5v14M6 5l10 7-10 7Z" />
      </>
    ),
    collection: (
      <>
        <rect x="5" y="6" width="15" height="14" rx="1" />
        <path d="M2 16V3h14M9 10h7M9 14h7" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function ScreenPlayer({
  message,
  active,
  initialPosition,
  onPosition,
  onEnded,
  onPlaying,
  onBrowse,
  previous,
  next,
  nextSender,
  onRewatch,
  ref,
}: {
  message: VideoMessage;
  active: boolean;
  initialPosition: number;
  onPosition(seconds: number): void;
  onEnded(): void;
  onPlaying(playing: boolean): void;
  onBrowse(): void;
  previous: (() => void) | undefined;
  next: (() => void) | undefined;
  nextSender: string | undefined;
  onRewatch(): void;
  ref: Ref<PlayerHandle>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const endCard = useRef<HTMLDivElement>(null);
  const options = useRef<HTMLDialogElement>(null);
  const menuOpener = useRef<HTMLButtonElement>(null);
  const seekTo = useRef(initialPosition);
  const positionCallback = useRef(onPosition);
  const lastSaved = useRef(-1);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ratio, setRatio] = useState(16 / 9);
  const [enlarged, setEnlarged] = useState(false);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [interaction, setInteraction] = useState(0);
  const reducedMotion = useReducedMotion();
  const reveal = useCallback(() => {
    setChrome(true);
    setInteraction((value) => value + 1);
  }, []);
  useEffect(() => {
    positionCallback.current = onPosition;
  }, [onPosition]);
  useEffect(() => {
    if (!playing || ended || menu || reducedMotion) return;
    const timer = setTimeout(() => {
      // Keyboard users retain the controls while focus is inside them.
      if (!shell.current?.querySelector('.premiere__chrome :focus-visible'))
        setChrome(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, [playing, ended, menu, reducedMotion, interaction]);
  useEffect(() => {
    if (ended) endCard.current?.focus({ preventScroll: true });
  }, [ended]);
  useEffect(() => {
    if (!menu) return;
    const element = options.current;
    const opener = menuOpener.current;
    element?.showModal();
    return () => {
      element?.close();
      opener?.focus({ preventScroll: true });
    };
  }, [menu]);
  const clearStall = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }, []);
  const startStall = () => {
    clearStall();
    stallTimer.current = setTimeout(
      () =>
        setError(
          'Playback is taking longer than expected. Retry or choose another message.',
        ),
      12_000,
    );
  };
  const play = useCallback(
    (position?: number) => {
      const element = video.current;
      if (!element) return;
      setError('');
      setNotice('');
      setEnded(false);
      reveal();
      if (position !== undefined) {
        seekTo.current = position;
        if (element.readyState >= 1)
          element.currentTime = Math.min(
            position,
            Math.max(0, element.duration - 0.2),
          );
      }
      // Stay inside the original tap gesture for iOS Safari sound playback.
      void element.play().catch(() => {
        if (element.error) setError('This message cannot load right now.');
        else
          setNotice(
            'Tap Play to continue. If this message cannot load, try Retry.',
          );
      });
    },
    [reveal],
  );
  useImperativeHandle(
    ref,
    () => ({ play, pause: () => video.current?.pause() }),
    [play],
  );
  useEffect(() => {
    const element = video.current;
    // StrictMode rehearses cleanup/setup; restore the released source.
    if (element && !element.getAttribute('src'))
      element.src = message.video.src;
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        element?.pause();
        if (element?.readyState)
          positionCallback.current(element.ended ? 0 : element.currentTime);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      clearStall();
      if (element) {
        if (element.readyState >= 1)
          positionCallback.current(element.ended ? 0 : element.currentTime);
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [clearStall, message.video.src]);
  useEffect(() => {
    if (!enlarged) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEnlarged(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [enlarged]);
  async function fullscreen() {
    const element = video.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    setMenu(false);
    try {
      // iPhone's native fullscreen supplies its own controls. Inline playback
      // always uses only the custom controls below.
      if (element?.webkitEnterFullscreen) element.webkitEnterFullscreen();
      else if (shell.current?.requestFullscreen)
        await shell.current.requestFullscreen();
      else {
        setEnlarged(true);
        reveal();
      }
    } catch {
      setEnlarged(true);
      reveal();
    }
  }
  function replay() {
    setMenu(false);
    play(0);
  }
  function retry() {
    video.current?.load();
    play(time);
  }
  function toggleCaptions() {
    const enabled = !captions;
    for (const track of Array.from(video.current?.textTracks ?? []))
      track.mode = enabled ? 'showing' : 'hidden';
    setCaptions(enabled);
  }
  return (
    <div
      ref={shell}
      className={`screen-player premiere${enlarged ? ' screen-player--enlarged' : ''}`}
      hidden={!active}
      data-chrome-visible={
        chrome || !playing || ended || Boolean(error || notice)
      }
      data-ended={ended}
      style={{ '--film-ratio': ratio } as CSSProperties}
      onKeyDownCapture={reveal}
      onFocusCapture={reveal}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') reveal();
      }}
    >
      <div className="premiere__picture">
        <video
          ref={video}
          src={message.video.src}
          poster={message.poster}
          playsInline
          controls={false}
          preload="metadata"
          muted={muted}
          aria-label={`A message from ${message.sender}`}
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            setDuration(Number.isFinite(el.duration) ? el.duration : 0);
            if (el.videoWidth && el.videoHeight)
              setRatio(el.videoWidth / el.videoHeight);
            if (seekTo.current > 0)
              el.currentTime = Math.min(
                seekTo.current,
                Math.max(0, el.duration - 0.2),
              );
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget;
            setTime(el.currentTime);
            const tick = Math.floor(el.currentTime);
            if (tick !== lastSaved.current && tick % 2 === 0) {
              lastSaved.current = tick;
              onPosition(el.currentTime);
            }
          }}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
            onPlaying(true);
          }}
          onPlaying={() => {
            clearStall();
            setError('');
            setNotice('');
          }}
          onPause={(event) => {
            clearStall();
            setPlaying(false);
            reveal();
            onPlaying(false);
            onPosition(
              event.currentTarget.ended ? 0 : event.currentTarget.currentTime,
            );
          }}
          onEnded={() => {
            clearStall();
            setPlaying(false);
            setEnded(true);
            setMenu(false);
            onPlaying(false);
            onEnded();
          }}
          onWaiting={startStall}
          onStalled={startStall}
          onCanPlay={clearStall}
          onError={() => {
            clearStall();
            setError(
              navigator.onLine
                ? 'This message cannot load right now.'
                : 'This message needs a connection. Videos are not saved offline.',
            );
          }}
        >
          {message.captions && (
            <track
              kind="captions"
              src={message.captions}
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>
        {!ended && (
          <button
            className="premiere__reveal"
            aria-label="Show playback controls"
            onClick={reveal}
          />
        )}
      </div>
      {!ended && (
        <div className="premiere__chrome" onPointerDown={reveal}>
          <div className="premiere__transport">
            <button
              onClick={previous}
              disabled={!previous}
              aria-label="Previous message"
            >
              <Icon name="previous" />
            </button>
            <button
              className="premiere__play"
              onClick={() => (playing ? video.current?.pause() : play())}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button onClick={next} disabled={!next} aria-label="Next message">
              <Icon name="next" />
            </button>
            <div className="premiere__seek">
              <label className="sr-only" htmlFor="screening-seek">
                Playback position
              </label>
              <input
                id="screening-seek"
                type="range"
                min="0"
                max={duration || 0}
                step=".1"
                value={Math.min(time, duration)}
                disabled={!duration}
                aria-valuetext={`${timestamp(time)} of ${timestamp(duration)}`}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (video.current) video.current.currentTime = value;
                  setTime(value);
                  onPosition(value);
                  reveal();
                }}
              />
              <span aria-hidden="true">
                {timestamp(time)} / {timestamp(duration)}
              </span>
            </div>
          </div>
          <div className="premiere__byline">
            <p aria-live="polite">{message.sender}</p>
            <button onClick={onBrowse} aria-label="Browse messages">
              <Icon name="collection" />
              <span>Messages</span>
            </button>
            <button
              ref={menuOpener}
              onClick={() => {
                setTranscript(false);
                setMenu(true);
              }}
              aria-label="Screening options"
              aria-haspopup="dialog"
            >
              <Icon name="more" />
            </button>
          </div>
        </div>
      )}
      {(error || notice) && !ended && (
        <div className="premiere__recovery" role="status">
          <p>{error || notice}</p>
          <button onClick={retry}>Retry</button>
        </div>
      )}
      {ended && (
        <div
          ref={endCard}
          className="premiere__end"
          tabIndex={-1}
          role="region"
          aria-labelledby="message-ended-title"
        >
          <p className="premiere__eyebrow">
            {next ? 'A message from' : 'The Thirty Club'}
          </p>
          <h2 id="message-ended-title">{next ? message.sender : 'The end'}</h2>
          <p className="premiere__end-note">
            {next
              ? 'A little love, just for you.'
              : 'Of the first thirty years. The best is yet to come.'}
          </p>
          <div className="premiere__end-actions">
            {next && (
              <button
                className="premiere__continue"
                onClick={next}
                aria-label={`Watch next message from ${nextSender}`}
              >
                Watch Next <span aria-hidden="true">→</span>
              </button>
            )}
            {!next && (
              <button className="premiere__continue" onClick={onRewatch}>
                Rewatch the collection
              </button>
            )}
            <button onClick={replay}>Replay</button>
            <button onClick={onBrowse}>Browse Messages</button>
          </div>
          {!next && (
            <Link to="/" onClick={() => video.current?.pause()}>
              Return to the Members’ Lounge
            </Link>
          )}
        </div>
      )}
      {menu && (
        <dialog
          ref={options}
          className="premiere-options"
          aria-labelledby="screening-options-title"
          onCancel={() => setMenu(false)}
        >
          <header>
            <h2 id="screening-options-title">
              {transcript ? 'Your message, in words' : 'Your screening'}
            </h2>
            <button aria-label="Close options" onClick={() => setMenu(false)}>
              <Icon name="close" />
            </button>
          </header>
          {transcript ? (
            <p className="premiere-options__transcript">{message.transcript}</p>
          ) : (
            <nav aria-label="Viewing options">
              <button onClick={replay}>Replay message</button>
              <button onClick={() => void fullscreen()}>Fullscreen</button>
              {enlarged && (
                <button
                  onClick={() => {
                    setEnlarged(false);
                    setMenu(false);
                  }}
                >
                  Return to screening
                </button>
              )}
              <button onClick={() => setMuted(!muted)}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {message.captions && (
                <button onClick={toggleCaptions} aria-pressed={captions}>
                  Captions {captions ? 'on' : 'off'}
                </button>
              )}
              {message.transcript && (
                <button onClick={() => setTranscript(true)}>
                  Read transcript
                </button>
              )}
              <Link to="/" onClick={() => video.current?.pause()}>
                Return to the Members’ Lounge
              </Link>
            </nav>
          )}
        </dialog>
      )}
    </div>
  );
}
