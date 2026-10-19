/**
 * Native fullscreen for the birthday film, browser by browser. Everything
 * here runs synchronously inside Alise's tap: iOS Safari only grants video
 * fullscreen (and sound) to a request made within the user gesture, so no
 * animation or promise may come before it.
 *
 * - iPhone: there is no element Fullscreen API. The <video> is not
 *   `playsinline`, so `play()` itself opens the native player;
 *   `webkitEnterFullscreen` is a belt-and-braces request when the
 *   metadata is already loaded.
 * - Desktop, Android, iPad: the standard Fullscreen API on the <video>,
 *   which then shows the browser's own controls.
 * - Anything else (or a refusal): the room's theatre layout, the film
 *   filling the viewport with native controls.
 */
export type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export type Presentation = 'element' | 'native' | 'theatre';

export function presentFilm(
  video: FullscreenVideo,
  onRefused: () => void,
): Presentation {
  if (
    document.fullscreenEnabled &&
    typeof video.requestFullscreen === 'function'
  ) {
    try {
      void video.requestFullscreen().catch(onRefused);
      return 'element';
    } catch {
      onRefused();
      return 'theatre';
    }
  }
  if (typeof video.webkitEnterFullscreen === 'function') {
    try {
      if (!video.webkitDisplayingFullscreen && video.readyState >= 1)
        video.webkitEnterFullscreen();
    } catch {
      // Metadata not loaded yet: play() opens the native player regardless.
    }
    return 'native';
  }
  return 'theatre';
}

/** True while the film is in a browser-owned fullscreen presentation. */
export function inFullscreen(video: FullscreenVideo): boolean {
  return (
    document.fullscreenElement === video ||
    Boolean(video.webkitDisplayingFullscreen)
  );
}

/** Leaves fullscreen where the browser permits. Never throws. */
export function leaveFullscreen(video: FullscreenVideo | null) {
  try {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
  } catch {
    // Not permitted; the room is restored underneath regardless.
  }
  try {
    if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
  } catch {
    // iOS refused; it closes its own player when the user taps Done.
  }
}
