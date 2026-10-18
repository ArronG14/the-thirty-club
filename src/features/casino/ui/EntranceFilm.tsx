import { sessionProgressStorage } from '../../owner/session';
import { useEffect, useRef, useState } from 'react';
import { CASINO_ASSETS } from '../config/casinoAssets';

import { SEEN_KEY } from './entranceFilmRule';

/**
 * The optional 9:16 entrance cinematic, played once per session before the
 * lobby. Never required: with no film registered, or if it fails to load or
 * play, the lobby simply appears. A Skip control is always present.
 */
export function CasinoEntranceFilm({ onDone }: { onDone(): void }) {
  const asset = CASINO_ASSETS.entranceVideo;
  const [failed, setFailed] = useState(false);
  const done = useRef(false);
  const started = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    try {
      sessionProgressStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Seen-state is a convenience only.
    }
    onDone();
  };

  useEffect(() => {
    // If it has not started within a few seconds, give up quietly.
    const timer = setTimeout(() => {
      if (!done.current && !started.current) setFailed(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (failed) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  if (!asset.src || failed) return null;
  return (
    <div
      className="film"
      role="dialog"
      aria-label="The Grand Casino, an introduction"
    >
      <video
        className="film__video"
        src={asset.src}
        poster={asset.poster ?? undefined}
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlaying={() => {
          started.current = true;
        }}
        onEnded={finish}
        onError={() => setFailed(true)}
      />
      <button type="button" className="film__skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
