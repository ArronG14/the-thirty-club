# Protected films: the birthday film and Nyla's film (ADR-026)

Branch `feature/final-media-integration`, cut from the deployed release `2b32872` (`origin/main`). No migration. Storage: Cloudflare R2 (ADR-027, §2). The approval-gated steps are the owner's Cloudflare set-up and upload, three Netlify environment variables, and the deploy of the integrated release. None has been done.

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

## 2. Hosting decision (ADR-027 supersedes ADR-026's storage choice)

**Cloudflare R2, in a private bucket `ttc-media`, reached through R2's S3-compatible API with presigned URLs.** Netlify serves only the application; the films never enter Git or the build. The ticket endpoint, the gates, the players and the object names are unchanged from ADR-026; only the signer changed.

**Why not the ADR-026 plan.** The Supabase project is on the Free plan: 50 MB per file, so the 344 MB and 168 MB prints cannot be uploaded (an upgrade, or cutting the film into chunks, was ruled out).

**Options checked (briefly):**

| Option                       | Verdict                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Netlify static files         | Rejected. Netlify builds from GitHub, which refuses files over 100 MB and would keep the film in history forever; a static file is a public address (no birthday gate); Netlify publishes no per-file limit and staff advise against large media.                                                                   |
| Netlify Blobs via a function | Rejected. A function cannot stream 344 MB with byte ranges (response limits; no range reads), so iPhone seeking would break.                                                                                                                                                                                        |
| Supabase Pro                 | Excluded by the brief (no upgrade).                                                                                                                                                                                                                                                                                 |
| Backblaze B2                 | Works with the same code (S3-compatible), but the free account caps downloads at 1 GB a day until billing is added: two viewings and an owner check would hit it.                                                                                                                                                   |
| **Cloudflare R2**            | **Chosen.** 5 GB single objects, multipart uploads, byte ranges, presigned URLs up to 7 days, **no egress charge**, 10 GB-month free. Private by default. Same ticket architecture; no SDK, no new dependency (SigV4 in Web Crypto, `netlify/backend/s3Presign.ts`, tested against AWS's own published signatures). |

- **Access.** The bucket has no public access (no r2.dev address, no custom domain); R2's S3 API refuses any request without a valid signature. The page holds only `/api/v1/media/<id>`. `GET /api/v1/media/<id>` (Netlify Function) checks the session and the gate, asks R2 whether the object is there (a 60-second signed HEAD; a missing object reads "being prepared"; an unanswered check still issues the ticket), and returns a presigned GET URL valid for 4 hours for that one object, plus the lighter print. Signing happens inside the function with the secret key; the key never leaves it (tested; the built `dist/` contains no key, object path or film).
- **Who gets a ticket.** Unchanged (ADR-026): owner at any time; the birthday film only to her member session with the Screening Room ADMITTED and the server clock at or after `2026-10-24T05:00:00Z` (UK midnight refused); Nyla's film only with her `nyla-film` entitlement. Before then nothing is signed and R2 is not even asked.
- **Delivery.** Presigned URLs sign only the host, so the iPhone's own `Range` and playback headers pass untouched: 206 partial content, seeking, `video/mp4` (stored with each object at upload). `preload="metadata"` with fast start fetches only the header until she presses play (measured: Chromium 0.8–1.1 MB per print, WebKit ≤ 6.6 MB, against 26–344 MB films). No service-worker caching of video (ADR-019). Presigned URLs are served from the bucket's region (R2's S3 endpoint is not CDN-cached), so **create the bucket with the location hint Eastern North America** (closest to Jamaica).
- **Expiry and renewal.** Unchanged client behaviour: ticket fetched as the film appears (never inside her tap), renewed 15 minutes before expiry, on return, `online` and `focus`, and after a failure; a renewal never interrupts a film in progress. R2 refuses an expired URL with 403; the player then offers Retry with a fresh ticket.
- **Configuration.** Three Netlify environment variables (Functions): `MEDIA_S3_ENDPOINT` (`https://<account id>.r2.cloudflarestorage.com`), `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` (secret). Optional `MEDIA_S3_REGION` (default `auto`). Without them the function falls back to the ADR-026 Supabase signer, which on the Free plan can only ever hold Nyla's film.
- **Cost and limits.** Stored: 538 MB (5 % of the free 10 GB-month). Reads are Class B operations (10 million a month free; a viewing is hundreds to a few thousand range requests). Egress free. Expected bill: £0. Cloudflare asks for a payment method when R2 is first enabled; charges arise only above the free tier.
- **Bandwidth.** The standard print needs a sustained ~3.2 Mbit/s, the lighter ~1.5 Mbit/s. In WebKit at 2.5 Mbit/s the lighter print played steadily (≥ 9 s of film per 12 s). `npm run media:verify` reports throughput from wherever it runs; the decisive check is the Films desk on the iPhone on the hotel Wi-Fi.

### Owner set-up (about 15 minutes, before the flight)

**A. Cloudflare** (dash.cloudflare.com, sign in or create the account):

1. **R2 Object Storage** → if asked, add a payment method / activate R2 (free tier).
2. **Create bucket**: name `ttc-media`; Location: **Provide a location hint → Eastern North America (ENAM)**; storage class Standard. Leave **Public access off** (no r2.dev, no custom domain). No CORS rule is needed.
3. **R2 → Overview → API Tokens → Manage → Create Account API token**: name `thirty-club-films`; Permissions **Object Read & Write**; **Apply to specific buckets only → `ttc-media`**; TTL Forever → Create. Copy the **Access Key ID**, the **Secret Access Key** (shown once) and the **S3 endpoint** `https://<account id>.r2.cloudflarestorage.com` (without `/ttc-media`).

**B. Upload** (this checkout, on the Mac; 538 MB, resumable per 16 MiB part):

```sh
export MEDIA_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
export MEDIA_S3_ACCESS_KEY_ID=<access key id>
read -rs MEDIA_S3_SECRET_ACCESS_KEY && export MEDIA_S3_SECRET_ACCESS_KEY
npm run media:upload -- ~/Desktop/thirty-club-streaming
npm run media:upload -- ~/Desktop/thirty-club-streaming --confirm
```

The first is a dry run. The second uploads and runs every check; it must end **"All protected-media checks passed."** (Safari probe, 206 ranges at five points identical to the local prints, `video/mp4`, fast start, unsigned/forged/expired refused, throughput.)

**C. Netlify** (Site configuration → Environment variables → Add a variable, each with scope including **Functions**, all deploy contexts): `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, and `MEDIA_S3_SECRET_ACCESS_KEY` with **"Contains secret values"** ticked. They take effect at the next deploy (the integrated release); nothing changes on the live site until then.

## 3. The Private Screening Room

Unchanged: the Butler's Letter of Admission, the escort from the Lounge, the theatre, the poster, the Butler's lines and the native fullscreen player (`play()` inside the tap; not `playsinline`). `BIRTHDAY_FILM` now refers to `/api/v1/media/birthday-film` (`src/features/screening/config/screeningFilm.ts`); the five-second test film no longer stands in for LIVE.

Added around playback:

- **Preparing.** While the ticket is on its way, the button reads "Preparing the projector…" and is disabled (it normally arrives during the Butler's introduction). Not uploaded: "Your screening is being prepared." and no button.
- **Loading feedback.** "The film is loading…" on the theatre layout (the iPhone's own player shows its spinner).
- **Nothing loads forever.** No picture 30 s after her tap, or no progress for 45 s mid-film (not counting her own pause): the film stops, her place is kept, and she is back in her seat with an honest notice. Progress means the film's clock moving by half a second; a `playing` event is not progress (WebKit fires `waiting`/`playing` over a frozen picture during an outage; found by the ADR-027 WebKit tests and fixed in both players).
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

1. **Cloudflare account / R2 activation** (owner only: payment method; free tier).
2. **Upload to live storage**: Cloudflare R2, private bucket `ttc-media`, three objects (538 MB). Privacy: no public address; presigned 4-hour URLs only to the owner, and to Alise's session when earned.
3. **Netlify environment variables** (three, above): owner only.
4. **Netlify production deploy** of the integrated release that contains this branch (no migration from this branch).
5. **Owner prize edit** (§4) after the deploy.

## 6. Shortest safe release

The media branch is **not** released on its own: it is merged into Codex's final story release and deployed once, from that verified release (§7).

1. Owner set-up A–C (§2), before the flight on 22 October; step B must end "All protected-media checks passed."
2. After the integrated release is published: `npm run release:smoke`; on the iPhone (owner signed in) Control Centre → **Films** → play the standard print, seek, play the lighter print, play Nyla's film.
3. Control Centre → Casino & rewards → "A message from Nyla": Film URL `/api/v1/media/nyla-film`, Active, Save — before `casino-afternoon-spins` (23 Oct 14:30 Jamaica) fires.
4. In Jamaica, on the hotel Wi-Fi, repeat step 2 (and `npm run media:verify -- ~/Desktop/thirty-club-streaming` from the Mac). Keep the original `.MOV` on the iPhone as the fallback.

Rollback: republish the previous Netlify deploy. The bucket can stay; nothing public points at it. Revoking the R2 token (Cloudflare → API Tokens) stops every ticket at once.

## 7. Integrating into the final story release

- Branch `feature/final-media-integration` descends from the deployed `2b32872` (= `origin/main`). Merge it (do not cherry-pick) into the final release branch; commits `7e676d9` (ADR-026) and the ADR-027 commit.
- Files most likely to meet story work: `BUILD_LOG.md`, `TASKS.md`, `ARCHITECTURE.md`, `PROJECT.md`, `.env.example`, `package.json` (scripts only, no dependency), `playwright.config.ts` (one `testIgnore` line), `netlify/backend/api.ts` (the `/media/<id>` route and `media` dependency), `netlify/functions/api.ts` (injects `media`), `build/butlersOfficeLocalApi.ts` (local stand-in switch), `src/features/screening/ui/ScreeningRoom.tsx` (player only), `src/features/casino/ui/HousePrizeReveal.tsx`, `src/features/lounge/ui/VoucherWallet.tsx`, `src/features/control-centre/ControlCentre.tsx` (Films tab), `src/features/rehearsal/office.ts` and `sim/env.ts` (TEST film). Story text, schedules, letters, SMS, prize allocation and migrations are untouched.
- After merging: `npm run check`, `npm run test:screening`, `npm run test:media` (needs the prints in `~/Desktop/thirty-club-streaming`), and the release's own journey rehearsals.
