# Private Screening Room — implementation and handover

Status: **IMPLEMENTED**. Local automated verification and reference captures are recorded in BUILD_LOG.md. Approval of the composition, real messages and physical iPhone rehearsal remain outstanding.

## Rendering decision

Prompt 05 supersedes the earlier scene proposal. This room uses a generated photographic architectural backdrop, a fixed HTML projection surface and a native HTML5 video player. There is no Three.js import, camera simulation or WebGL dependency. The Grand Entrance and Members’ Lounge rendering implementations are unchanged.

The two backgrounds live in `public/images/screening/`. The built-in imagegen tool produced still images only; prompts and provenance are in `docs/screening/ASSET_PROMPTS.md`. A portrait crop provides a nearly full-width screen at 390 × 844. A separate desktop composition preserves the room’s proportions. The cinema is now an intermediate arrival composition. Begin/Resume pushes into the projection surface over 850 ms, then all architecture disappears. Playback starts directly from the tap and never waits for the animation. Reduced motion switches instantly. Portrait playback centres full-width video at its natural aspect ratio above a single compact transport strip and sender line. If a tall clip would push the controls beyond a short phone viewport, it scales down with `object-fit: contain`. Landscape video occupies the viewport; its controls overlay the film, reveal on tap/keyboard activity and fade after 2.8 seconds of playback. Paused/error/end states retain controls, and reduced motion disables fading. Rotation changes CSS layout, preserves the exact same video element and playback time, and scrolls back to the film if a tall portrait clip was scrolled. Fullscreen remains an optional action in Screening options; comfortable viewing does not depend on it.

## Viewing and capturing

Start `npm run dev -- --port 5185 --strictPort` in the project root.

- Clean **final screen-filling** cinematic reference: `http://127.0.0.1:5185/?preview=screening-endframe`
- Separate cinema arrival reference: `http://127.0.0.1:5185/?preview=screening-arrival`
- Interactive technical demonstration: `http://127.0.0.1:5185/?preview=screening-demo`
- Empty collection: `http://127.0.0.1:5185/?preview=screening`
- Real membership-gated room: `/rooms/screening-room`

Previews are behind `import.meta.env.DEV`, removed from production and independent of membership. The real route always uses `RoomGate`. Preview progress uses the same screening storage key on the development origin; clear `thirty-club:screening` there to return to the first-visit title.

With the server running, execute `node tools/capture-screening.mjs`. Captures wait for the backdrop and fonts, use reduced motion, and save:

- `docs/screening/endframe-mobile.png` — 390 × 844.
- `docs/screening/endframe-mobile-3x.png` — 1170 × 2532, the same 390 × 844 CSS composition at device scale 3.
- `docs/screening/endframe-desktop.png` — 1440 × 900.
- `premiere-mobile.png`, `player-mobile.png`, `collection-mobile.png` — technical UI review states.

The final end frame is the blank illuminated projection surface filling the display, with no architecture. `arrival-mobile.png`, `arrival-mobile-3x.png`, `arrival-desktop.png` and `arrival-landscape.png` preserve the architectural journey separately. `endframe-landscape.png` captures 844 × 390. Additional playback references cover both landscape and portrait source clips in both device orientations. `message-ended-mobile.png` and `message-ended-landscape.png` capture the dedicated end overlay. The high-resolution capture is a 3× browser render. Use the **endframe** captures for the final film frame; use the **arrival** captures only for the intermediate seated composition. No text, controls, cursor, PWA footer or development overlay appears in that preview.

## Architecture and navigation

- `domain/videoMessages.ts`: existing typed metadata, sorting, placeholder exclusion and validation, extended only with an optional transcript.
- `domain/progress.ts`: versioned local record, parsing, selection, position, watched tracking and completion helpers; no React.
- `ui/ScreeningRoom.tsx`: premiere/welcome, selection, collection and closing states.
- `ui/ScreenPlayer.tsx`: native media API lifecycle, one custom control system, options and end overlays.
- `ui/premiere.css`: dedicated viewport-fitting player presentation; the arrival artwork styles remain separate.
- `ui/MessageList.tsx`: native modal dialog with focus containment, Escape and focus restoration.
- `ui/CinemaBackdrop.tsx`, `cinemaConfig.ts`, `screening.css`: replaceable visual environment.
- `ui/EntranceFilm.tsx`: optional future entrance only.

`RoomGate` lazy-loads the room and still requires the existing membership/unlock rules. `rooms.ts` marks it built. Directory, guided continuation and butler doorway navigation use that registry automatically. Direct eligible visits are stamped. `useClub.complete` stamps completion only after **all current real messages** have ended. A visit, skip, or reaching the last clip without watching the others does not complete the room. Completion never removes access.

Inline playback uses **one custom control system** around an HTML5 video with `playsInline` and native `controls` disabled. Previous/play-pause/next, one scrubber and elapsed/duration sit in the first compact row; sender, Messages and Screening options occupy the second. Replay, fullscreen, mute, captions/transcript and return-to-lounge are in a native modal options dialog. iOS native fullscreen is preferred when exposed; its browser-owned controls replace inline chrome. Other browsers use the Fullscreen API, with a viewport presentation fallback. Routine PWA status remains in the lounge rather than adding a footer below the film; the existing worker/status state stays mounted.

Playback is invoked synchronously in the user’s tap, including selection changes, before presentation effects. Rejected play requests expose a Play/Retry recovery. An ended clip leaves its source selected and replaces the transport strip with one end-of-message overlay: sender, Watch Next, Replay and Browse Messages. It never automatically advances. The final message instead offers the closing line, rewatch, replay, browsing and return to the lounge. Hidden-tab playback pauses. Unmount pauses, releases the source and cancels waiting timers. The StrictMode setup restores a source removed by its cleanup rehearsal.

## Adding real messages

No genuine messages have been supplied. Production currently filters both existing placeholders and shows “The messages are not ready yet.” The technical films never become production birthday content.

1. Prepare MP4 files with H.264 video and AAC audio, fast-start metadata, and sensible mobile bitrates. Verify sound and orientation on the actual iPhone. Preserve the complete image; the player uses `object-fit: contain`.
2. Put authorised files at `public/media/screening/<stable-id>.mp4` for same-origin delivery, or arrange a same-origin media endpoint. Existing validation requires sources, posters and captions under `/media/screening/`; external URLs require a deliberate hosting/validation change.
3. Add an entry to `VIDEO_MESSAGES` in `src/features/screening/domain/videoMessages.ts`. Use a unique lowercase ID and unique numeric `order`. Remove `placeholder` only for real, approved content.
4. Provide captions (`.vtt`) or an accurate transcript. Posters and introductions are optional.
5. Run the checks and rehearse every file on the actual phone. Never commit private videos without the owner’s explicit decision. Same-origin public static delivery does not provide private-media authentication.

Example metadata (illustrative fields, not content to publish):

```ts
{
  id: 'approved-message-id',
  sender: 'Approved sender name',
  order: 1,
  video: { src: '/media/screening/approved-message-id.mp4', type: 'video/mp4' },
  poster: '/media/screening/approved-message-id.jpg',
  captions: '/media/screening/approved-message-id.vtt',
  // transcript: 'Accurate approved transcript, if captions are unavailable.',
}
```

Conversion example with an independently installed ffmpeg:

```sh
ffmpeg -i input.mov -vf "scale=-2:720" -c:v libx264 -profile:v high -crf 23 -preset slow -c:a aac -b:a 128k -movflags +faststart output.mp4
```

Do not reuse an ID for a different person’s message: viewing history is keyed by ID. New IDs are initially unwatched. Curated order comes solely from `order`; browsing and restarting do not erase watched history.

## Persistence and offline boundary

`thirty-club:screening` stores version 1, `started`, `lastId`, `watched`, per-message `positions` and `entranceSeen`. Positions save periodically and on pause/visibility changes. Corrupt records, unknown IDs, invalid values, blocked storage and quota errors recover safely. A storage-failure notice explains that progress will only last for this visit. This is local, non-authoritative convenience state; storage eviction or changing devices can lose it.

The service worker precaches the shell and architectural WebP assets, **not video files**. Failed offline playback explains the need for a connection. There is no offline-download claim or implementation. Private hosting, reliable travel connectivity and a separately prepared video backup remain owner/content decisions.

## Replacing architecture

Replace the portrait and desktop WebP assets, or update `cinemaConfig.background` and the desktop CSS background URL. Keep the screen blank and frontal. Align `--screen-left`, `--screen-width`, `--screen-top` and `--screen-height` in `screening.css` to the new surface. Current portrait background crop is 114% × 125%, centred horizontally and at 48% vertically; the screen uses 6.1% left, 87.8% width, 29.25svh top, 27.5svh height. Landscape anchors are calculated from the proportionally covered 1586 × 992 artwork: 19.4% left, 61.4% width, 17.5% top and 43.8% height of the scaled image, adjusted for its centred crop. These anchors apply only to arrival, never playback. Landscape artwork uses cover rather than stretching. Regenerate arrival captures after changing artwork or anchors. Playback and the final screen-filling end frame are independent of the background.

## Adding the future entrance cinematic

No entrance film has been generated or embedded. In `ui/cinemaConfig.ts`, set `entrance.enabled`, `entrance.src` and optional `entrance.poster` when an approved film exists. Use a muted inline MP4 ending on the captured composition; keep the film and player separate.

`EntranceFilm` provides Skip, completion callback, error/autoplay rejection fallback and a 12-second safety timeout. End/Skip/failure releases the screen-filling premiere destination, not the seated arrival. Reduced motion bypasses it, and a locally recorded prior entrance bypasses subsequent playback. It never controls membership or media availability. Verify the final matched frame and inline/autoplay behaviour on the phone when adding the real film.

## Checks and limitations

- `npm run check`: TypeScript, ESLint, Prettier, Vitest and production build.
- `npm run test:pwa`: production browser checks including membership gating, no-WebGL rendering, directory/return navigation, exclusion of previews and media from the worker.
- `npx playwright test --config playwright.screening.config.ts`: development browser tests using real synthetic H.264 media, including playback, pause, seek, portrait enlargement, resume, completion, errors, reduced motion and screen-filling end frames, portrait/landscape layout, same-element rotation and the push-in transition.
- `node tools/create-screening-fixtures.mjs`: regenerates two six-second **silent technical test films** with Chromium’s H.264 MediaRecorder. They live in `tests/fixtures/`, served only by a Vite development middleware with byte ranges. No dependencies were added.

No actual iPhone, Safari/WebKit, sound, interruption, standalone-mode or poor-network rehearsal has occurred. Playwright WebKit is not installed locally. Unit tests verify the inline attributes and gesture-triggered iPhone fullscreen API path; Chromium tests verify real H.264 playback and source/time continuity. Synthetic clips verify browser video mechanics, not the final messages’ audio/codec quality. Real content, captions/transcripts, private hosting decisions, composition approval and physical-device rehearsal remain necessary before birthday release.
