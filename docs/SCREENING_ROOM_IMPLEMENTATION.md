# Private Screening Room — the birthday screening (ADR-019)

Status: **IMPLEMENTED**, verified in Playwright Chromium and WebKit on an iPhone 13 profile (see BUILD_LOG.md). **The birthday film itself is not configured**: LIVE shows "Your screening is being prepared." until the owner sets `BIRTHDAY_FILM`. Native iPhone fullscreen has **not** been verified on a physical iPhone; the manual steps are below.

This supersedes the earlier multi-message collection (ADR-009). The room now shows **one continuous film**, which the owner assembles separately in CapCut: the AI-generated introduction, the friends' and family's messages, and the AI-generated ending. This code does not generate the film or any animation.

## The experience

| Stage           | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Escort       | In the Members' Lounge, "Continue your evening", the Directory's Enter or the 3D doorway. The Butler says "This way, Madam. Your seat is ready." The 3D camera walks towards the screening-room doorway (new `escort` shot), the picture fades to black from 0.9 s, the room's code was prefetched, and at 2.3 s the room loads in the dark and fades in (1.1 s) with her already seated before the screen: about 3.5 s door to seat. In the poster lounge (no WebGL) there is no camera move, only the fade. Reduced motion: a 0.3 s fade.                                                                                                                                     |
| B. Seated       | The existing photographic cinema. The screen carries the poster: THE THIRTY CLUB PRESENTS · THIRTY YEARS OF ALISE · _A Private Birthday Screening_ · **WATCH MOVIE** (48 px tall, 176 px wide). Beneath it the Butler: first visit "Madam, a number of distinguished guests…"; later visits "Welcome back, Madam. Your private screening is ready whenever you wish."                                                                                                                                                                                                                                                                                                           |
| C. Watch Movie  | Within the tap, synchronously: `video.play()`, then fullscreen. The `<video>` is deliberately **not** `playsinline`, so on iPhone `play()` itself opens Safari's native fullscreen player (pause/resume, scrubbing, volume, rotation, Done). Elsewhere `video.requestFullscreen()` gives the browser's player; if fullscreen is unavailable or refused the film fills the viewport (the theatre layout) with native controls and a centred "Leave the screening". The CSS push-in (architecture scales towards the screen, the screen's clip expands to the viewport over 0.9 s) only follows the tap; nothing asynchronous precedes the requests. Orientation is never forced. |
| D. End          | On `ended`: exit fullscreen where permitted, restore the room (camera settles back, poster returns), and the Butler: first natural end "I trust you enjoyed your private screening, Madam…"; later ends "An encore, Madam…". Completion is counted once per playback and stamps the club record's `completedAt` (idempotent). Watch Movie is available again immediately; there is no limit.                                                                                                                                                                                                                                                                                    |
| Early exit      | Done on iPhone (`webkitendfullscreen`), Escape / exiting browser fullscreen (`fullscreenchange`), or "Leave the screening": pause, keep her place, back to the seat, "Of course, Madam. I have kept your place." The poster says **Resume Movie**, with "Your place is kept at 0:02. Watch from the beginning". No completion is recorded. If iOS closes its player in the last 0.25 s before `ended` arrives, that counts as the natural end (once).                                                                                                                                                                                                                           |
| E. Later visits | The short welcome (or "Welcome back, Madam. I have kept your place, should you wish to continue." when interrupted). The film is never single-use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Other cases: a refresh, backgrounding or navigating away mid-film keeps the place (saved every 2 s, on pause, `visibilitychange`, `pagehide` and unmount); a long pause changes nothing; a load error or lost connection returns her to the seat with an honest notice ("The screening needs a connection. The film is not kept on this device.") and Watch Movie retries; a refused `play()` says "The projector did not start. Tap Watch Movie once more." No state leaves her on a black screen: every exit path restores the seated room.

## Files

| Concern                                                         | Where                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The film configuration (the only file to edit for the film)** | `src/features/screening/config/screeningFilm.ts`                                                                                                            |
| Record, reducer, status (no React)                              | `src/features/screening/domain/screeningRecord.ts`                                                                                                          |
| The Butler's lines (PROVISIONAL)                                | `src/features/screening/domain/screeningScript.ts`; escort line in `club/domain/loungeScript.ts`                                                            |
| Fullscreen per browser                                          | `src/features/screening/ui/filmPresentation.ts`                                                                                                             |
| The room                                                        | `src/features/screening/ui/ScreeningRoom.tsx`, `screening.css`                                                                                              |
| Escort                                                          | `src/features/lounge/ui/Lounge.tsx` (+ `lounge.css`), `lounge/scene/loungeMath.ts` (`escort` shot), `club/ui/roomViews.ts` (`preloadRoom`)                  |
| Temporary test film and its generator                           | `public/media/screening/screening-test-5s.mp4`, `tools/create-screening-test-film.swift`                                                                    |
| Rehearsal launch and reset                                      | `src/features/rehearsal/engine.ts` (`screening-journey`, `resetRoom('screening-room')`)                                                                     |
| Tests                                                           | `domain/screeningRecord.test.ts`, `ui/ScreeningRoom.test.tsx`, `tests/screening-film.spec.ts` (`playwright.screening.config.ts`), `tests/screening.spec.ts` |

Retired with the message collection: `ScreenPlayer`, `MessageList`, `EntranceFilm`, `videoMessages`, `progress`, `premiere.css`, the synthetic fixtures and their development middleware.

## State

`thirty-club:screening`, version 2: `enteredAt`, `introducedAt`, `plays`, `completedAt` (first natural end), `completions`, `resume: {filmId, seconds} | null`. Status: never entered → entered → started (stopped too early to keep a place) → interrupted (place kept) → completed. A returning visitor is one whose record already had `enteredAt` when the page loaded. A resume point within 1 s of either end is not kept. Replacing the film (new `id`) starts resume positions afresh but keeps her history. Version 1 records (the empty message collection) read as a fresh room.

Guests store it in `localStorage`; Dev Mode / TEST rehearsals store it in the tab's session storage under `thirty-club:owner:` (the existing `progressStorage`), so rehearsals never touch Alise's record. Local and non-authoritative (ADR-003); it unlocks nothing.

## Access (unchanged)

The room still opens with the membership presented after 24 October 2026 00:00 Jamaica (`unlock: membership`, ADR-012), through `RoomGate`, on direct navigation, reloads and from the Directory. Nothing in this change alters the gate. LIVE before midnight: "This room is not open yet." LIVE after midnight with no configured film: the poster and "Your screening is being prepared.", no Watch Movie, no `<video>`, no test-film label. Rehearsals and the local dev server use the test film, labelled "Rehearsal · temporary five-second test film" beneath the screen.

## Rehearse the complete experience

1. On the Grand Entrance, tap the clock five times within three seconds, enter **1414** (Dev Mode).
2. **Open Dev Mode → The Screening Room journey (first visit).** It moves the rehearsal clock past midnight, presents the card, inducts the membership, clears this rehearsal's screening progress and the room's completion, and opens the Members' Lounge.
3. Tap **Continue your evening** → the escort → seated → the Butler's introduction → **Watch Movie** → the five-second test film plays in the native player → it ends → back in the seat → closing words.
4. Watch again as often as you like; leave part-way (Done on iPhone) to see Resume Movie; reload to check the kept place; return to the Lounge and come back for the short welcome.
5. Repeat from step 2 at any time. **The Private Screening Room** launch goes straight to the seat keeping progress (returning visitor); **Reset room → Screening Room** clears it. The same launches are in TEST (`/concierge/owner/test` → Rehearsal). **Exit Dev Mode** before handing the phone over.

Locally: `npm run dev`, then `/?preview=screening-demo` (seated, test film), `/?preview=screening` (LIVE, unconfigured), `/?preview=screening-arrival`, `/?preview=screening-endframe`; these previews do not exist in production.

## Replace the temporary film with the birthday film

1. Export from CapCut with the settings below.
2. Choose where it lives:
   - **Same origin (simplest):** copy it to `public/media/screening/thirty-years-of-alise-v1.mp4`. Only if the file is under **95 MB** (GitHub rejects files over 100 MB) and you have decided the film may be committed to the private repository: AGENTS.md forbids committing private content without that decision.
   - **External HTTPS host (needed above ~95 MB):** a host that serves `Content-Type: video/mp4` and HTTP byte ranges (`206 Partial Content`; iPhone Safari requires them), e.g. a public bucket. Use the `https://` URL.
     Either way the URL is visible in the public JavaScript bundle; an unguessable filename helps, but this is not access control (ADR-003).
3. In `src/features/screening/config/screeningFilm.ts`, replace `export const BIRTHDAY_FILM: ScreeningFilm | null = null;` with:
   ```ts
   export const BIRTHDAY_FILM: ScreeningFilm | null = {
     id: 'thirty-years-of-alise-v1',
     title: 'Thirty Years of Alise',
     src: '/media/screening/thirty-years-of-alise-v1.mp4', // or the https:// URL
     type: 'video/mp4',
     kind: 'birthday',
     // poster: '/media/screening/thirty-years-of-alise.jpg',  (optional)
     // captions: '/media/screening/thirty-years-of-alise.vtt', (optional)
   };
   ```
   Change the `id` (e.g. `-v2`) whenever you replace the file, so a kept place from the old cut is not applied to the new one. Nothing else changes: the room plays whatever this entry names.
4. Update the unit test that asserts `BIRTHDAY_FILM` is `null` (`screeningRecord.test.ts`, "keeps LIVE safely unconfigured…") to expect the new entry, run `npm run check` and `npm run test:screening`, commit and push. Netlify builds `main`.
5. Rehearse on the iPhone (below) with Dev Mode **and** once as a guest after midnight (or with a rehearsal account), watching the whole film with sound.

To keep the five-second film in rehearsal after the real one exists, nothing is needed: once `BIRTHDAY_FILM` is valid, rehearsals use it too. To regenerate the test film on a Mac: `xcrun swift tools/create-screening-test-film.swift public/media/screening/screening-test-5s.mp4`.

## Recommended CapCut export

- **Format:** MP4. **Codec:** H.264 (not HEVC; H.264 plays everywhere, including older iPhones and any desktop rehearsal). **Audio:** AAC, stereo, 48 kHz (CapCut's default).
- **Resolution:** 1080p. **Frame rate:** 30 fps (or 25 if every source clip is 25). **Bitrate:** "Recommended", or about 6–8 Mbps for 1080p; lower to ~4 Mbps (or 720p) if the file is too large for the chosen host or for hotel Wi-Fi.
- **Size estimate:** megabytes ≈ Mbps × minutes × 7.5. A 6-minute film at 6 Mbps is about 270 MB (external hosting); at 4 Mbps and 3 minutes, about 90 MB.
- **Orientation:** 16:9 landscape is the natural choice for a cinema; she can rotate in the native player. 9:16 also works (letterboxed in the room's theatre layout). Keep SDR (switch off HDR export if offered).
- **Fast start:** progressive playback needs the file's index at the start. If playback takes long to begin on the phone, re-wrap without re-encoding using a separately installed ffmpeg: `ffmpeg -i export.mp4 -c copy -movflags +faststart thirty-years-of-alise-v1.mp4`.
- **Loudness:** CapCut's "Normalise loudness" on the whole timeline keeps the guests' messages at an even level.

## Manual iPhone verification (required; not automatable)

On the birthday iPhone, in Safari and again from the Home Screen app, on Wi-Fi and on mobile data:

1. Dev Mode → The Screening Room journey: the escort's camera walk and fade feel smooth; the room appears seated with no white flash.
2. Watch Movie opens the **native fullscreen player at once**, with sound (ringer switch on and off: video sound should play either way).
3. Pause/resume, scrub back and forward, volume buttons, rotate to landscape and back, AirPlay icon visible (not required).
4. Let it end: the player closes by itself (or tap Done if iOS leaves it open on the last frame); the room returns seated with the closing words; no black screen.
5. Watch again; then tap Done part-way: Resume Movie appears with the kept time; Resume continues from there.
6. Mid-film, lock the phone / switch apps, return: no stuck black screen; Done returns to the seat.
7. Reload mid-film: the room offers Resume.
8. Airplane mode, Watch Movie: an honest notice, no crash; reconnect and Watch Movie works.
9. Exit Dev Mode; as a guest before midnight the room is locked; after midnight with no film configured it says "Your screening is being prepared."

Record the iOS version, results and any deviation in BUILD_LOG.md.

## Checks and limitations

- `npm run check` (unit tests include the record, script, film configuration, fullscreen order within the tap, iPhone/element/theatre presentation, natural end, encore, early exit, iOS end-race, unmount, error and LIVE-unconfigured cases).
- `npm run test:screening`: production build, iPhone 13 profile, Chromium then WebKit: the full journey with the real MP4 (escort timing, introduction, Watch Movie geometry, real playback of the 1280×720 film with sound unmuted and native controls, natural end, closing words, club completion, encore, returning welcome, zero `/api/` requests, Alise's localStorage untouched), early exit + refresh + resume + restart, LIVE gate and unconfigured state, phone landscape. Screenshots: `docs/screening/journey/`.
- `npm run test:pwa` includes `tests/screening.spec.ts`: LIVE gate, unconfigured state, Directory → escort round trip, previews stripped, MP4 served with byte ranges and absent from the precache.
- Playwright WebKit is desktop WebKit with an iPhone viewport: it has the element Fullscreen API (and in headless runs used the theatre layout), not the iPhone's native player. **Native iPhone fullscreen, its Done button, auto-close at the end, audio routing and rotation are unverified until the manual steps above are run.**
- The 3D camera walk was checked by eye once, in software-rendered Chromium (dev preview `?preview=lounge&lookdev`): the view moves towards the curtained doorway while the Butler speaks. The automated journeys use the poster lounge (fade only); frame rate on the phone is unmeasured.
- Video is never cached offline (no `mp4` in the precache, no runtime caching).
