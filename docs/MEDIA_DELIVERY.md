# Protected films: the birthday film and Nyla's film (ADR-026)

Branch `feature/final-media-integration`, cut from the deployed release `2b32872` (`origin/main`). No migration. The two approval-gated steps are an upload to private storage and a Netlify deploy. Neither has been done.

## 1. The films

| Source (Desktop, unchanged)     | Duration        | Size     | Video                                                       | Audio                                                                             | Notes                                                                                     |
| ------------------------------- | --------------- | -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `thirty-club-birthday-film.MOV` | 880.1 s (14:40) | 370.5 MB | HEVC (hvc1) 1920×1080, 29.98 fps, 3.24 Mbit/s, 8-bit, P3    | AAC stereo 44.1 kHz, 123 kbit/s                                                   | CapCut export; 26,386 frames                                                              |
| `nyla-casino-surprise.MOV`      | 33.3 s          | 189.8 MB | H.264 3840×2160 (portrait, 90° rotation), 30 fps, 45 Mbit/s | AAC stereo 48 kHz 190 kbit/s; Apple spatial audio (APAC, 4 ch); 5 metadata tracks | **Carries the GPS location where it was filmed** (`com.apple.quicktime.location.ISO6709`) |

Streaming prints, in `~/Desktop/thirty-club-streaming/` (not in Git, not in the build):

| Print                                 | Size     | Video                                     | Audio                                  | SHA-256 (first 16) |
| ------------------------------------- | -------- | ----------------------------------------- | -------------------------------------- | ------------------ |
| `thirty-club-birthday-film-1080p.mp4` | 344.0 MB | H.264 High, 1920×1080, 3.0 Mbit/s, BT.709 | AAC stereo 123 kbit/s (passed through) | `a06befa25262522c` |
| `thirty-club-birthday-film-720p.mp4`  | 168.1 MB | H.264 High, 1280×720, 1.4 Mbit/s, BT.709  | AAC stereo 123 kbit/s                  | `f49ce4836923095b` |
| `nyla-casino-surprise-1080x1920.mp4`  | 25.8 MB  | H.264 High, 1080×1920 upright, 6.0 Mbit/s | AAC stereo 190 kbit/s                  | `65120d9ab6c5323f` |

All three: 8-bit 4:2:0 (yuv420p), every source frame kept at its own time (26,386/26,386 and 1,000/1,000), a key frame every 2 s (quick seeking), `ftyp moov mdat` (fast start), **no metadata at all** (no location, device or software tags), the spatial-audio and metadata tracks dropped. Encoded with Apple's hardware H.264 encoder (`tools/transcode-streaming-film.swift`), checked with `tools/verify-streaming-film.swift`:

```sh
xcrun swift tools/transcode-streaming-film.swift ~/Desktop/thirty-club-birthday-film.MOV ~/Desktop/thirty-club-streaming/thirty-club-birthday-film-1080p.mp4 1920 1080 3000
xcrun swift tools/transcode-streaming-film.swift ~/Desktop/thirty-club-birthday-film.MOV ~/Desktop/thirty-club-streaming/thirty-club-birthday-film-720p.mp4 1280 720 1400
xcrun swift tools/transcode-streaming-film.swift ~/Desktop/nyla-casino-surprise.MOV ~/Desktop/thirty-club-streaming/nyla-casino-surprise-1080x1920.mp4 1080 1920 6000
xcrun swift tools/verify-streaming-film.swift <source.MOV> <print.mp4>
```

A first encode dropped a quarter of the birthday film's frames (the compositor resampled CapCut's 29.97 fps); the tool now follows the source's own frame timing, and the verifier fails any print that loses frames.

## 2. Hosting decision

**Supabase Storage, the project's existing backend (`fzndcjzenodcixmuvfsb`), in a new PRIVATE bucket `ttc-media`.** Netlify serves only the application; the films never enter Git or the build.

- **Access.** The bucket has no public access. The page holds only a reference, `/api/v1/media/<id>`. `GET /api/v1/media/<id>` (Netlify Function) checks the session and returns a URL signed by the service role, valid for 4 hours, with a lighter print for the birthday film. The object names are in `netlify/backend/mediaObjects.ts`, which only the Netlify function imports (a test fails if anything the browser bundles imports it; the built `dist/` was checked to contain none of them). Unguessable folders are a second line of defence, not the protection.
- **Who gets a ticket.**
  - Owner session: both films at any time (Control Centre → **Films** plays each print, to check them on the iPhone and the hotel Wi-Fi).
  - Birthday film: her member session, the Screening Room ADMITTED (`birthday-screening` milestone, `2026-10-24T05:00Z` = 00:00 Jamaica), and the server's clock at or after `2026-10-24T05:00:00Z`. UK midnight (`2026-10-23T23:00Z`) is refused (`not-open`) even if the room were admitted early.
  - Nyla's film: her member session and a Casino entitlement whose prize snapshot carries `/api/v1/media/nyla-film`. Before the third spin of the afternoon session no such entitlement exists, so the ticket is refused.
  - Anyone else: 401/403. An unknown id: 404. Not uploaded: 503, which the room shows as "being prepared".
- **Delivery.** Signed URLs are served by Supabase's CDN with HTTP byte ranges, so the iPhone downloads only what it plays and seeking works. `preload="metadata"` with fast start fetches only the header until she presses play. No service-worker caching of video (unchanged, ADR-019).
- **Expiry and renewal.** The page fetches a ticket as soon as the film is on screen (never inside her tap, which must call `play()` synchronously for the iPhone's player), renews it 15 minutes before expiry, on returning to the page, on `online` and `focus`, and after any playback failure. A renewed ticket never interrupts a film in progress; it is used from her seat.
- **Why not elsewhere.** Netlify's build or Blobs (no byte-range video delivery through a function; the build would expose the film); GitHub (100 MB limit, permanent history); a new CDN/media service (a new account, credentials and owner set-up on the day he flies). Supabase is already configured in Netlify (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), so **no new environment variable** is needed.
- **Limits to check before upload (owner, in the Supabase dashboard, not verified by the engineer).** The plan's per-file upload limit must allow 344 MB: the Free plan cannot exceed 50 MB; on Pro the global limit is a project setting (Storage → Settings) that must be at least 400 MB. The bucket itself is created with a 600 MB per-file limit and `video/mp4` only. Expected egress: about 344 MB per full viewing of the standard print (168 MB lighter), 26 MB per Nyla viewing; owner checks plus a few viewings are well under 3 GB.
- **Jamaica.** The CDN serves from its nearest edge after the first fetch. The standard print needs a sustained ~3.2 Mbit/s; the lighter one ~1.5 Mbit/s. `npm run media:verify` reports the measured throughput from wherever it is run; the decisive check is the Films desk on the iPhone on the hotel Wi-Fi.

## 3. The Private Screening Room

Unchanged: the Butler's Letter of Admission, the escort from the Lounge, the theatre, the poster, the Butler's lines and the native fullscreen player (`play()` inside the tap; not `playsinline`). `BIRTHDAY_FILM` now refers to `/api/v1/media/birthday-film` (`src/features/screening/config/screeningFilm.ts`); the five-second test film no longer stands in for LIVE.

Added around playback:

- **Preparing.** While the ticket is on its way, the button reads "Preparing the projector…" and is disabled (it normally arrives during the Butler's introduction). Not uploaded: "Your screening is being prepared." and no button.
- **Loading feedback.** "The film is loading…" on the theatre layout (the iPhone's own player shows its spinner).
- **Nothing loads forever.** No picture 30 s after her tap, or no progress for 45 s mid-film (not counting her own pause): the film stops, her place is kept, and she is back in her seat with an honest notice.
- **Recovery.** "Try again" (with a fresh ticket, from her place); "Try the lighter print" (720p, same place); "Watch it another way" (the offline fallback).
- **Interrupted and returning.** Leaving, refreshing or backgrounding keeps her place (unchanged); a ticket that expired meanwhile is renewed before she can press play.

### Milestone-completion semantics (inspected and amended)

| Event                                         | Screening record (`thirty-club:screening`, device)       | Club record (`completedAt` for the room)                                | Anything else                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Admission                                     | —                                                        | —                                                                       | Server: `ttc_room_admissions` ADMITTED (`birthday-screening` milestone at 00:00 Jamaica, then her acceptance) |
| Entering the room                             | `enteredAt`                                              | `visitedAt` (unchanged)                                                 | —                                                                                                             |
| Pressing play                                 | `plays + 1`                                              | —                                                                       | —                                                                                                             |
| Leaving early / failure                       | `resume {filmId, seconds}`                               | —                                                                       | —                                                                                                             |
| Natural end                                   | `completedAt`, `completions + 1`                         | stamped (once)                                                          | the Butler's closing line                                                                                     |
| **Offline fallback** ("Watch it another way") | **`elsewhereAt`, `elsewhere + 1`** — never `completedAt` | stamped, so the Lounge's guidance moves on ("Visited" in the Directory) | the Butler: "…The film shall be shown by other means this evening…" (PROPOSED)                                |

**Before this change:** nothing on the server depended on the screening. The club's `completedAt` for the room only steers the Lounge's "Your evening continues" guidance (`recommendedRoom`), and every later chapter (Gift Vault, breakfast, birthday card, farewell) is a server milestone of its own, so a streaming failure could not block them. It could, however, leave the Lounge recommending the Screening Room all evening. The fallback now resolves that without pretending she watched it: the room still offers the film, her place is kept, and the Butler welcomes her back as someone who has not yet seen it. All of this is device-local and non-authoritative (ADR-003); it unlocks nothing.

## 4. Nyla's film: the second Casino session

Identified from the deployed migrations (not assumed by position):

- **First session:** milestone `casino-opening-spins` (23 Oct 09:00 Jamaica, held): 3 spins, prize slug `jamaica-drinks` (`7a1e5c2e-0d3b-4b8e-9f10-000000000301`) on the third.
- **Second session:** milestone **`casino-afternoon-spins`** (23 Oct 14:30 Jamaica = 19:30 UTC, held, `America/Jamaica`): hook `casino.spins.issue {quantity: 3, prizeSlugs: ["nyla-film"], prizePositions: [3], announce: true}`.
- **Reward:** prize slug **`nyla-film`**, id `7a1e5c2e-0d3b-4b8e-9f10-000000000302`, "A message from Nyla", VOUCHER, seeded **inactive with no Film URL**.
- **Third session:** `casino-evening-spins` (`evening-jackpot` on the third), untouched.

The prize's snapshot (including its Film URL) is frozen when the batch is issued, and an inactive prize fails the milestone. So, **after the deploy and before `casino-afternoon-spins` fires**, the owner sets, in Control Centre → Casino & rewards → "A message from Nyla": **Film URL `/api/v1/media/nyla-film`**, **Active**, Save. This is an owner edit through the existing desk, not a migration. Prize economics, quantities, positions and drinks are unchanged.

What she sees: spins one and two as before; the third spin's reveal (the existing card, wording and eyebrow unchanged) now plays the film through the protected ticket with loading feedback, Retry and a 30 s start limit; "Kept in your Casino vouchers in the Lounge, to watch again." The Lounge's Casino vouchers play it again without a spin. The entitlement is created once by the spin (idempotency key; a repeated spin returns the same entitlement), is set FULFILLED (nothing to redeem; `voucher-request` refuses it), and the ticket requires it.

## 5. Approval boundaries (nothing below has been done)

1. **Upload to live storage** — destination: Supabase project `fzndcjzenodcixmuvfsb`, new private bucket `ttc-media`, three objects (538 MB). Privacy: no public URL; signed 4-hour URLs only to the owner, to Alise's session when earned. Implication: storage and egress on the existing plan; the plan's file-size limit must allow 344 MB.
2. **Netlify production deploy** of this branch's commit (application code only, no migration, no environment change).
3. **Owner prize edit** (§4) after the deploy.

## 6. Shortest safe release

Not before the 19:00 UK ceremony on 21 October has completed, and not during it. The upload is best done from the UK before the flight on 22 October.

1. Supabase dashboard: confirm the per-file upload limit allows 344 MB (raise to 400 MB if needed).
2. In this checkout, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exported privately (never committed):
   ```sh
   npm run media:upload -- ~/Desktop/thirty-club-streaming
   npm run media:upload -- ~/Desktop/thirty-club-streaming --confirm
   ```
   The first is a dry run. The second creates the private bucket, uploads (resumable), and runs every check; it must end "All protected-media checks passed."
3. Netlify: lock auto publishing. Confirm `origin/main` is still `2b328722154279410dba66266fdc64559c2ce8cd`, then fast-forward it to this branch (it descends from it) and push. Publish that deploy once its preview builds; confirm the published commit.
4. `npm run release:smoke`. On the iPhone (owner signed in): Control Centre → **Films** → play the standard print, seek, play the lighter print, play Nyla's film.
5. Control Centre → Casino & rewards → "A message from Nyla": Film URL `/api/v1/media/nyla-film`, Active, Save. Check in the journey tab that `casino-afternoon-spins` still lists `nyla-film` on the third spin; leave it held until the moment you choose, then resume or trigger it.
6. In Jamaica, on the hotel Wi-Fi, repeat step 4 (and `npm run media:verify` from the Mac). Keep the original `.MOV` on the iPhone as the fallback.

Rollback: republish the previous Netlify deploy (`2b32872`). The bucket can stay; nothing public points at it.
