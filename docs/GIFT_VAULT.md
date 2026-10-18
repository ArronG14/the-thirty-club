# The Private Gift Vault

The vault connects a cinematic room with a real treasure hunt. Alise receives a clue, finds a physical NFC tag in the hotel room, scans it, watches her compartment open, and reads where a wrapped present is hidden.

**The vault never reveals what a present is.** No table, field, API response, bundle, log or Butler line names or describes a gift. The only information stored about a present is a free-text **gift location**. The member API returns it only after the server has recorded the compartment as OPENED.

Decision record: ADR-015 in `ARCHITECTURE.md`. Status: tasks GV01–GV08 in `TASKS.md`.

## The journey

1. **Becomes READY.** In the Butler's Office (`/owner` → _vault_), the owner creates a compartment with an engraved number, an **NFC clue** (where to look for the tag) and a **gift location** (where the present is). It becomes READY manually, at a scheduled instant, or (once wired, see Casino) when a casino reward is released.
2. **The clue.** Alise opens the Gift Vault from the Members' Lounge (`/rooms/gift-vault`) or directly (`/vault`). Prepared compartments glow. Selecting one moves the camera to it, and the Butler presents the clue on a card.
3. **The tag.** The tag holds `https://30.ag14.co/v/<token>`. iPhones open it in Safari with no app and no Web NFC.
4. **Verification.** `/v/<token>` keeps the token in `localStorage` (`thirty-club:vault-key`, expires after 6 h) and in the history entry. It then replaces the address with `/vault`, so the token does not linger in the URL bar. Alise lands straight in the vault, without the entrance, the midnight ceremony or the lounge. If this browser has no membership, the Butler asks for the card: she can tap the membership NFC card or type its number. The key waits meanwhile, including across reloads. Presenting the card through `/c/<token>` also returns her to `/vault` while a key is held.
5. **Opening.** The server opens the compartment (atomically) **before** any animation plays. The Butler says the key fits, and Alise taps **Turn the key**. This tap also unlocks iOS audio. The ceremony follows: the camera travels to the box, the combination dial spins with detent clicks, three bolts withdraw, a pause, the seam light rises, the door swings open, and the camera leans in to the envelope.
6. **The letter.** "A gift awaits you, Madam", the owner's location text, and "With the compliments of The Thirty Club."
7. **Revisit.** An opened compartment stays visibly different (door open, lit leather interior, envelope inside). Selecting it re-reads the letter, and scanning the tag again answers with the standing record.

Because the opening is committed first, a reload, closed tab, lost connection or 3D failure mid-ceremony never undoes or repeats it: the compartment simply reads OPENED.

## State model

```
LOCKED ──(manual / scheduled instant passes / casino reward released)──▶ READY
READY  ──(valid NFC token or backup code + member session + birthday open)──▶ OPENED
```

- **LOCKED:** listed by number only. No clue, no location, and its key is refused (`vault-locked`).
- **READY:** the clue is returned. The location is still withheld.
- **OPENED:** permanent. The location is returned (always the latest wording, so the owner can correct it after opening). Repeat scans return `alreadyOpened: true` and create no second event.
- The owner may return a READY compartment to LOCKED, except when it is scheduled and its time has passed. Nothing can leave OPENED. There are deliberately no "collected" or "fulfilled" states: the system cannot know whether the present has been found.

**Birthday time-lock.** `ttc_vault_opens_at()` = 24 Oct 2026 00:00 America/Jamaica. Until then the member list reports `open: false` and shows every compartment as LOCKED. Any key or code is refused with `not-open`, whatever the device clock says.

**Room access.** The Gift Vault room uses the club's existing `membership` unlock rule, like the Screening Room. It opens when the birthday induction completes, which itself requires the birthday (ADR-012), and stays open all day. There is no separate room-opening hour. Compartments keep their own availability.

## Backend

PostgreSQL (Supabase project `fzndcjzenodcixmuvfsb`) through the existing Netlify `api` function, using the established pattern of a service-role-only RPC behind verified server sessions. The migration is `supabase/migrations/20261019090000_gift_vault.sql`. **It is not applied to the hosted project.**

- Table `ttc_vaults`: `slug` (`vault-001`, stable), `display_number`, `clue`, `gift_location`, `trigger` (`manual|scheduled|casino`), `available_at`, `casino_reward_id`, `state`, `nfc_token` + `nfc_token_hash`, `backup_code` + `backup_code_hash`, `ready_at`, `opened_at`, `opened_via` (`nfc|code|owner`), timestamps. RLS is on with service-only policies, and browser roles have no grants.
- RPC `ttc_vault_action(actor, role, action, input)` is separate from `ttc_action`, so privilege, slots and SMS code is untouched. `database.ts` routes vault actions to it via `rpcFor()`.
- Scheduled compartments become READY lazily, inside every vault read or write (`ttc_vault_promote`). This needs no cron and is correct to the second on the server clock.
- Opening takes a row lock (`select … for update`): concurrent scans serialise, and the second sees OPENED.
- Activity events (`vault.created|saved|ready|locked|opened|credential-rotated`) record ids, numbers and the method, never a location.

### Credentials

- **NFC token:** 32 random bytes in base64url (43 characters). The URL is about 64 bytes and fits an NTAG213. A tag is proof that the tag was found, not proof of identity.
- **Backup code:** `XXXX-XXXX-XXXX` from an unambiguous 31-character alphabet (about 59 bits). Any case or spacing is accepted.
- Plain values are stored so the owner can re-read them to program a tag or print a code. Lookups use SHA-256 hashes. Both can be rotated.
- **Rate limiting:** after 20 failed key/code attempts per IP address in 15 minutes, further attempts are refused (`429`). Successful and repeat scans never count.

### Membership

A key alone opens nothing: `POST /api/v1/vaults/open` requires a v1 **member** cookie session. Alise has never been issued v1 invitations, so `POST /api/v1/auth/member/concierge` exchanges her existing concierge session for one. This is the HMAC-signed bearer token issued when she presented her membership card or travel credential, verified server-side with `CONCIERGE_SESSION_SECRET`. The exchange requires `realm: live` and scope `membership` or `departure`. Rehearsal-realm sessions are refused (`403`), and so are forged ones. The cookie is HttpOnly, Secure, SameSite=Strict, 30 days.

### API (all under `/api/v1`, JSON; mutations need `x-concierge-request: 1` and same origin)

| Route                                       | Who    | Purpose                                                                               |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `POST /auth/member/concierge`               | anyone | Bearer concierge session → member cookie                                              |
| `GET /vaults`                               | member | `{ open, opensAt, vaults: MemberVault[] }`                                            |
| `POST /vaults/open`                         | member | `{ credential }` or `{ code }` → `{ vault, alreadyOpened }`                           |
| `GET /owner/vaults`                         | owner  | every field, including `nfcUrl` (built from `CONCIERGE_SITE_URL`) and the backup code |
| `POST /owner/vaults` · `PATCH …/:id`        | owner  | `{ displayNumber, clue, giftLocation, trigger, availableAt, casinoRewardId }`         |
| `POST /owner/vaults/:id/ready\|lock\|open`  | owner  | manual availability; owner unlock (no tag)                                            |
| `POST …/:id/rotate-credential\|rotate-code` | owner  | new tag URL or code; the old one stops working                                        |
| `GET /owner/vaults/:id/preview`             | owner  | read-only `{ vault, ready, opened }` for rehearsal                                    |
| `POST /owner/vaults/verify`                 | owner  | identifies a tag or code without changing anything                                    |

Errors: `credential-invalid` (404, "This key is not recognised by the vault."), `vault-locked` (409), `not-open` (403), `rate-limited` (429), `unauthorised` (401), `forbidden` (403). Types are in `src/shared/concierge/types.ts`.

## Owner controls (Butler's Office → vault)

Signing in uses the existing office password and secure session; the PIN panel grants nothing. For each compartment the office offers:

- edit the number, clue and location, including after opening;
- change the trigger: manual, scheduled (Jamaica or UK wall time, stored as an exact instant), or a casino reward;
- see the state, ready time and opened time in both zones, and the opening method;
- copy the NFC URL, show a QR code for camera testing (encoder in `qr.ts`, no dependency), and copy the backup code;
- make ready, return to locked, or unlock now (with confirmation);
- issue a new NFC URL or backup code (with confirmation);
- open **Preview vault NNN**.

**Preview** (`/owner/vault-preview/:id`) renders the member's room with that compartment READY. It shows the configured clue, a **Simulate finding the key** button, the full ceremony, and the configured location. A ribbon reads "Owner rehearsal · nothing is opened, consumed, recorded or sent". It reads one owner-only GET and makes no member call, so it cannot change state, consume a credential, notify anyone or grant anything. It is repeatable.

**Tag test.** Scanning a tag on a phone signed in to the office identifies its compartment via `/owner/vaults/verify` and rehearses it. Nothing changes.

## The chamber (`src/features/vault/scene/`)

A D-shaped rotunda (`vaultMath.ts`, pure and unit-tested):

- **The bank:** a curved wall of deposit boxes, 13 columns × 5 rows on a 3.4 m arc spanning ±66°, in brushed-brass frames. Alise's compartments sit at eye height, centred, with larger engraved oval number plates, combination dials, levers and bolts. The other 60-odd boxes carry small engraved plates (101+) baked into one atlas.
- **Surround:** a marble plinth, a polished brass cornice with a warm cove line, and dark stone walls.
- **The front wall:** 85 cm thick, pierced by a round bore lined in steel. The great door stands swung open outside it, with radial bolts, concentric brass rings and a spoked wheel. The first visit opens with a dolly from outside the door into the chamber.
- **Floor and ceiling:** polished dark stone with a brass compass inlay, a brass oculus with a lantern, and a leather-topped viewing table to one side.
- **Light:** a hemisphere fill, the oculus spot (the only shadow caster), a grazing wash across the bank, a glow at the door, and one small lamp that follows the focused compartment. Prepared compartments breathe through a light leak at the door seam. Open ones glow from their leather lining.
- **Post-processing:** an HDR clamp, gentle bloom (0.3), grain and vignette, shared with the other rooms.
- **Textures:** stone and marble reuse the entrance's CC0 scans. Brass, leather, plates, dial and envelope are drawn at load. There are no new assets or dependencies.
- **Performance:** the same quality tiers, idle 30 fps, context-loss fallback and disposal (forced context loss) as the casino and lounge. Static geometry is merged per material.
- **Sound:** Web Audio synthesis (`audio/vaultSounds.ts`) for detents, bolts, the release and the hinge. It is quiet, silent until "Turn the key", and has a header toggle.
- **Fallback:** without WebGL, or when it is too slow, the CSS chamber (`VaultPoster`) shows the same compartments on a perspective arc and runs a simpler door-swing ceremony. Every action is also available from the brass plaques in the dock.
- **Reduced motion:** no dolly, parallax, breathing or swing; the ceremony cuts in about a second.

## Casino integration (contract only)

**Not functional end to end.** The server side exists:

- After any server slots play (`POST /api/v1/casino/slots/play`) that is, or follows, a recorded jackpot, `releaseCasinoVaults()` releases reward `casino.vault-key-one` (= `CASINO_REWARD_IDS.vaultKeyOne`, asserted by test).
- Every LOCKED compartment with trigger `casino` and that reward id becomes READY. This is idempotent, and members cannot call the release.

**The missing connection.** The Casino screen never calls that endpoint. `useCasino.spinSlots()` calls the local `playSlots()` → `chooseSlotOutcome()`, saves to `localStorage`, and awards the Vault Key in the local prize ledger. Connecting it is not a small change:

- spinning becomes asynchronous and network-dependent;
- the first server play grants ten real drink vouchers (ADR-014);
- the casino's PIN rehearsal mode would consume real server plays;
- it needs session and offline handling.

That belongs with the Casino and desk owners. Until it is done, make casino-promised compartments ready manually, or configure them as manual or scheduled.

## Testing

- `netlify/backend/vault.test.ts` (PGlite with every migration, fake timers driving `now()`), 27 tests covering:
  - the state machine, idempotency and six concurrent scans;
  - invalid, malformed and unrelated credentials; rate limits and cross-site refusal;
  - unauthenticated and owner redemption; time-lock bypass; secrecy of unopened locations;
  - owner-only access; the membership bridge; edits after opening; schedules;
  - rotation; preview immutability (table and activity rows byte-identical); the casino release.
- `vaultMath.test.ts` (layout, camera and ceremony ordering), `pendingKey.test.ts`, `qr.test.ts` (round-trip decode).
- `tests/gift-vault.spec.ts`, under `playwright.office.config.ts` with the local PostgreSQL API, on a phone-sized Chromium:
  - the full journey: office → ready → `/v/<token>` → membership prompt → reload → membership → opening → interrupted reload → revisit → re-scan → location edited after opening;
  - preview immutability;
  - a malformed link.

**Local rehearsal.** `BUTLERS_OFFICE_LOCAL_API=1 npm run dev`, then sign in at `/owner` with `thirty-club-local-rehearsal-only`. Before 24 October, open the local time-lock with `POST /api/v1/__local/vault-gate {"open":true}`. This route exists only in the Vite middleware, never in a migration or function. The local membership code comes from `netlify/concierge/testing.ts`.

## Known limitations and release steps

- Apply the migration to the hosted project (owner approval needed), then deploy the merged branch. No new environment variables are needed: it uses `SUPABASE_*`, `CONCIERGE_SESSION_SECRET` (for the bridge) and `CONCIERGE_SITE_URL` (for NFC URLs).
- Real NFC tags, iPhone Safari and the standalone PWA are untested. iOS opens tag URLs in Safari, which has storage separate from a Home Screen install, so Alise may be asked for her membership once in Safari. That prompt is designed for it.
- 3D performance has only been seen in software-rendered Chromium. Tier tuning on the real iPhone is still needed.
- The Casino trigger awaits the connection above.
- Butler and letter wording is provisional and awaits owner approval.
