import { useEffect, useRef } from 'react';
import { cinemaConfig } from './cinemaConfig';

/** Optional future film; failure, autoplay rejection and timeout all release the room. */
export function EntranceFilm({ onDone }: { onDone(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const timer = setTimeout(onDone, 12_000);
    const element = video.current;
    void element?.play().catch(onDone);
    return () => {
      clearTimeout(timer);
      element?.pause();
    };
  }, [onDone]);
  return (
    <div className="cinema__entrance">
      <video
        ref={video}
        src={cinemaConfig.entrance.src}
        poster={cinemaConfig.entrance.poster || undefined}
        muted
        playsInline
        onEnded={onDone}
        onError={onDone}
      />
      <button onClick={onDone}>Skip entrance</button>
    </div>
  );
}
