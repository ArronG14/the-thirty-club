# Story Bible acceptance: 22–25 October 2026

Independent acceptance checklist for the integrated release candidate (Codex's Story Bible branch + `feature/final-media-integration`). Prepared 21 Oct 2026 by Claude (media / acceptance). It does not implement the story; it states what must be observably true, and how each row is proven.

**Source.** `Thirty Club Story Bible - 21 October 2026 working edition.docx` (local copy in `~/Downloads`, saved 21 Oct 19:19 BST). The Google Doc could not be read (Drive connector not authenticated); **the owner must confirm this copy is current.** Precedence inside the Bible: "LOCKED REVISIONS" (21 Oct) > "OWNER-RECOVERED ORIGINAL STORY COPY" > "DETAILED OWNER DECISIONS" > earlier chapters. "PROPOSED" copy is never accepted as approved.

**Every event is checked as a chain**, never as "the page is reachable" (the 21 Oct Grand Entrance opened before the card was scanned although every page "worked"):

> Scheduled/manual trigger → Butler invitation (SMS and/or letter) → Alise's action → reveal → persisted server result → recovery (refresh, repeat, offline, late, retry)

**How rows are proven.** `AUTO` = `npm run test:acceptance` (`tests/acceptance/storyBible.acceptance.test.ts`, read-only, `ACCEPT_ROOT=<candidate>`); `E2E` = Playwright on the candidate (TEST world / local API); `MEDIA` = `npm run test:media`, `media:verify`; `PHONE` = the owner's iPhone rehearsal (§10); `OWNER` = a physical/real-world fact only the owner can confirm. A row is VERIFIED only when every listed proof passed on the **combined candidate**.

**Baseline.** The `AUTO` column was run against the deployed base `2b32872` (= `origin/main`, this branch's parent): **16 pass / 22 fail of 38.** That is the expected starting point, not Codex's work.

## 0. Global contract (applies to every row)

| ID  | Requirement                                                                                                                                                                                                                                                                   | Proof                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| G01 | Every timed chapter fires at its named zone (UK: Europe/London; Jamaica: America/Jamaica), independent of the iPhone's timezone; the UK clock change on 25 Oct does not shift Jamaica events                                                                                  | AUTO SB-13, E2E clock                                                          |
| G02 | A Butler SMS summons is short, spoiler-free, links to `https://30.ag14.co` and points to a Lounge letter (exceptions: flight farewell, Jamaica arrival, breakfast-arrived: text only)                                                                                         | E2E render, PHONE                                                              |
| G03 | Letters stay readable; a pending invitation persists until she deliberately opens it; she never has to wait inside the app                                                                                                                                                    | E2E refresh/relogin                                                            |
| G04 | Every send needs approved copy, owner controls and server idempotency; a retry never sends twice; a manual Send Now cancels the matching scheduled duplicate                                                                                                                  | E2E (outbox), owner console                                                    |
| G05 | **Every request she submits (A Word with the Butler, airport drink, Jamaica drink, other concierge) produces exactly one REAL SMS to the owner's phone with type and content; failure is visible to the owner; balance decrements on successful request, no fulfilment step** | E2E (fake provider count = 1 per request, retry = 1), PHONE (real SMS arrives) |
| G06 | TEST rehearsal never writes LIVE state or sends to Alise; rehearsal SMS go only to the owner, marked as rehearsal                                                                                                                                                             | E2E, owner console                                                             |
| G07 | No gift identity (UGGs, AirPods, breakfast) in any SMS, letter title, notice or log she can see before its reveal                                                                                                                                                             | AUTO SB-45, E2E                                                                |
| G08 | Locked rooms are concealed from the Directory and notices until admitted; once admitted they stay                                                                                                                                                                             | E2E                                                                            |
| G09 | Device timezone change, logout/login, other device: progress never rewinds or replays a ceremony                                                                                                                                                                              | E2E, PHONE                                                                     |
| G10 | Communications hold is server-side and fail-closed for every send path (scheduler, legacy, owner direct)                                                                                                                                                                      | E2E (existing hold tests on the candidate)                                     |

## 1. 21 October regression: the one Grand Entrance (precondition for every later chapter)

| ID  | Chain                                                                                                                                                                                                | Proof                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Exactly one entrance: 21 Oct 19:00 Europe/London; no entrance or second ceremony on 24 Oct                                                                                                           | AUTO SB-01                                                                                                                                                |
| E02 | After 19:00 the doors **do not open** until the membership card (NFC `/v/<token>`) or the fallback code has been verified by the server for this member; `eligible` alone must not animate the doors | E2E: fire `early-membership`, member without card → doors closed, letter visible; present card → 10-s ceremony once; refresh → Lounge, no ceremony. PHONE |
| E03 | The membership letter is readable at the doors before admission; it never mentions later rooms or prizes                                                                                             | E2E, AUTO SB-31                                                                                                                                           |
| E04 | Repeated card scan after admission: goes to the Lounge, no second ceremony, no error                                                                                                                 | E2E, PHONE                                                                                                                                                |

Base observation (not a diagnosis of Codex's fix): on `2b32872` the server's `journey-enter` requires the card (`card-required`), but `GET /api/v1/entrance` returns `eligible: true` as soon as the milestone fires; a client that opens the doors on `eligible` reproduces the incident. E02 must be proven in the browser, not only on the server.

## 2. 22 October: departure (all owner-triggered, in this order)

Order (LOCKED editorial note): UGG → Departure Lounge → airport security drinks → Albert/AirPods at the gate → 16:50 UK flight SMS → 21:30 Jamaica arrival SMS.

| ID  | Chain                                                                                                                                                                                                                                                                                                                               | Proof                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D01 | UGG: owner trigger (no clock) → Butler message (owner original; "no app link needed") → NFC key by the pillow → scan → Gift Vault drawer opens for the first time → exact pop-up "Excellent work, Madam…" (item in shoe cupboard) → drawer stays opened                                                                             | AUTO SB-02, SB-32; E2E scan → drawer; PHONE + OWNER (key placed, gift in cupboard) |
| D02 | UGG: a second scan of the key reopens the same drawer, never a second reveal or error; any other key opens only its own drawer                                                                                                                                                                                                      | E2E                                                                                |
| D03 | Departure Lounge: owner trigger → short SMS linking to the Departure Lounge, offering escort → first visit: Butler escort and letter "Your Departure Lounge Awaits" (+ approved revised ending) → guided first use of bell → A Word with the Butler → **real owner SMS** → "no further action needed" → room stays in the Directory | AUTO SB-02, SB-33; E2E; PHONE (owner SMS received)                                 |
| D04 | The Departure Lounge is reachable while later rooms stay hidden; its credential scan/fallback grants only this room                                                                                                                                                                                                                 | E2E                                                                                |
| D05 | Airport drinks: owner trigger after security → short SMS → Lounge letter "A Rather Generous Benefactor" → **2** airport drink vouchers in Privileges → Club Menu › Privileges › airport drinks › request → owner SMS with her order → balance 2→1 on success; no fulfilment marking                                                 | AUTO SB-03, SB-35; E2E (balance, one SMS per request, retry no double); PHONE      |
| D06 | Airport and Jamaica drink balances are distinct entitlements with distinct wording                                                                                                                                                                                                                                                  | E2E                                                                                |
| D07 | Owner console can add/refund drink vouchers and see requests                                                                                                                                                                                                                                                                        | E2E owner                                                                          |
| D08 | Albert/AirPods: owner trigger at the gate (after drinks) → short SMS (no spoiler) → letter "A Rather Concerning Development" → Albert in Arron's bag with a distinct NFC key → scan → AirPods drawer → approved message: her husband holds the present, ask him                                                                     | AUTO SB-34; E2E; PHONE + OWNER                                                     |
| D09 | Flight farewell: 22 Oct 16:50 Europe/London, SMS only, no app link, sent once                                                                                                                                                                                                                                                       | AUTO SB-04, SB-36; E2E outbox                                                      |
| D10 | Jamaica arrival: 22 Oct 21:30 America/Jamaica, approved shortened SMS only, no app link, no placeholder                                                                                                                                                                                                                             | AUTO SB-05; E2E outbox                                                             |
| D11 | Weak airport network: a drink request that times out is either recorded once or not at all (never twice, never lost silently); the UI says which                                                                                                                                                                                    | E2E (offline/retry)                                                                |

## 3. 23 October: the Grand Casino, nine spins in three fixed sessions

**Confirmed allocation (Bible "23 OCTOBER — THREE FIXED CASINO SESSIONS", superseding "five spins", "random wins" and "evening 20:00"):**

| Session | Trigger (America/Jamaica)                                                                                                       | UTC          | Spins | Spins 1–2 | Spin 3 (guaranteed)        | Reveal path                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----- | --------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1       | 23 Oct **09:00**: SMS → Lounge letter "An Invitation of Considerable Importance" → Casino admission; **+1,000 roulette tokens** | 14:00        | 3     | no win    | **3 × "Bring Me a Drink"** | Butler pop-up → **explicit Claim Prize** → vouchers credited only after Claim; claim pending survives browser close      |
| 2       | 23 Oct **14:30**: SMS invites to the Casino                                                                                     | 19:30        | 3     | no win    | **Nyla's video**           | "A Rather Personal Delivery" → [Watch Your Special Delivery] → replayable                                                |
| 3       | 23 Oct **20:30**: SMS → "One Final Roll of the Dice"                                                                            | 01:30 (24th) | 3     | no win    | **777 Mystery Jackpot**    | "A Most Extraordinary Victory!" + riddle → distinct NFC key → Vault drawer → **Birthday Breakfast in Bed, 24 Oct 10:30** |

Total: **9 spins, 3 prizes, all on spin 3.** Base `2b32872` seeds session 3 at **20:00** (wrong) with prize `evening-jackpot` that **does not exist** in the catalogue (the milestone would fail).

| ID  | Chain                                                                                                                                                                                                                         | Proof                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C01 | Exactly three spin issues of three, at 09:00 / 14:30 / 20:30 Jamaica, prize position [3] each; no other spin issue anywhere                                                                                                   | AUTO SB-20–23                                                                |
| C02 | Every promised prize exists and is active by its session's fire time (Nyla: owner sets Film URL `/api/v1/media/nyla-film` + Active before 14:30, MD09)                                                                        | AUTO SB-24, SB-26; E2E fire each milestone                                   |
| C03 | Session 1 letter grants 1,000 fictional tokens (roulette) and 3 spins; Casino appears in the Directory only after she accepts the letter                                                                                      | AUTO SB-37; E2E                                                              |
| C04 | Spins 1–2 of each session never win; spin 3 always wins its session's prize; the server decides; client cannot choose                                                                                                         | E2E (play 9, assert sequence)                                                |
| C05 | A repeated play with the same idempotency key returns the same result; double-tap/refresh mid-spin never consumes two spins or awards twice                                                                                   | E2E                                                                          |
| C06 | Session 1: win → Butler pop-up → Claim Prize → 3 Jamaica drink vouchers in Privileges (none before Claim); closing the browser before Claim keeps the claim pending                                                           | E2E                                                                          |
| C07 | Jamaica drink request: choose drink (no location field) → owner SMS → balance 3→2; no fulfilment marking                                                                                                                      | E2E, PHONE                                                                   |
| C08 | Session 2: win → Nyla letter → protected film plays (1080×1920, audio), replay from Casino vouchers without a spin; no ticket before spin 3                                                                                   | MEDIA (MD13, media.test), E2E, PHONE                                         |
| C09 | Session 3: win → jackpot letter does not reveal the prize → riddle (exact) → Vault entitlement READY before the letter → only the right NFC key opens the drawer → breakfast voucher revealed; a different key never opens it | AUTO SB-27, SB-39; E2E; OWNER (key in the hiding place the riddle describes) |
| C10 | An unplayed session carries over: spins granted at 14:30 remain available if she plays at 20:30; balance never reduces a delivered promise                                                                                    | E2E                                                                          |
| C11 | Each session's SMS goes once, links to the club, no prize spoiler                                                                                                                                                             | E2E outbox                                                                   |

## 4. 24 October: birthday

| ID  | Chain                                                                                                                                                                                                                     | Proof                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| B01 | 00:00 America/Jamaica (05:00 UTC; never UK midnight 23:00 UTC): SMS "The clock has struck twelve…" (no link in the owner original; confirm) → Lounge letter "The Reason for It All" → [Enter the Private Screening Room]  | AUTO SB-07, SB-40; E2E clock at 04:59 and 05:00 UTC |
| B02 | No forced viewing: the invitation persists until she presses Enter, across browser close and next-day visits                                                                                                              | E2E                                                 |
| B03 | Screening: escort → seat → native fullscreen film (14:40, audio) → exit/resume/restart/replay; not "watched" before the end; post-film words exactly as owner original                                                    | MEDIA, E2E, AUTO SB-41, PHONE                       |
| B04 | Film failure: honest notice, Retry from her place, lighter print, admission intact                                                                                                                                        | MEDIA (MD13/MD14)                                   |
| B05 | Gift Vault is not auto-invited at midnight (superseded); it is reached through NFC keys                                                                                                                                   | AUTO SB-08                                          |
| B06 | Breakfast: no scheduled send; owner's manual "Breakfast has arrived" sends the exact message once, only when pressed                                                                                                      | AUTO SB-09, SB-42; E2E                              |
| B07 | Birthday card: no Butler SMS or letter; NFC card → `/birthdaycard` → 3D card with owner-editable message; card works offline-ish (cached) or says it needs a connection                                                   | AUTO SB-10; E2E; PHONE                              |
| B08 | 13:00–15:00 suite decoration: no automatic claim of fulfilment anywhere                                                                                                                                                   | review                                              |
| B09 | 16:00 America/Jamaica: SMS "I regret to inform you…" → letter "A Matter of Considerable Importance" (19:30 dinner, 17:00, 19:00) → [Acknowledge Evening Arrangements]; manual Send Now suppresses the scheduled duplicate | AUTO SB-11, SB-43; E2E                              |

## 5. 25 October: farewell

| ID  | Chain                                                                                                                                               | Proof                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| F01 | 25 Oct (Jamaica) SMS → letter "One Last Engagement, Madam" with the locked closing exactly (bold/italic as specified)                               | AUTO SB-12, SB-44; E2E render |
| F02 | Default OFF/held; the excursion paragraphs appear only if the owner marks the excursion booked; otherwise a farewell-only letter, no 26 Oct promise | AUTO SB-12; E2E both branches |
| F03 | After the farewell: every room, letter, film, voucher and gift state persists through logout, refresh and the 25 Oct UK clock change                | E2E                           |

## 6. Owner console (mobile) and TEST/LIVE

| ID  | Requirement                                                                                                                                                            | Proof                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| O01 | Each manual chapter (UGG, Departure, drinks, Albert, breakfast-arrived, farewell, excursion) has one obvious trigger on the phone, with preview, and cannot fire twice | E2E (iPhone profile), PHONE |
| O02 | Each timed chapter shows local + UTC time, hold/resume (warns when overdue), edit, Send Now                                                                            | E2E                         |
| O03 | Request log and owner-SMS delivery status visible; failures shown                                                                                                      | E2E                         |
| O04 | Films desk plays the three prints from R2                                                                                                                              | MEDIA, PHONE                |
| O05 | TEST rehearsal runs the whole 22–25 Oct story on a simulated clock with no LIVE write and no SMS to Alise                                                              | E2E                         |

## 7. Resilience (applies to every chapter)

| ID  | Case                                                         | Expected                                                                                |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| R01 | Missed event (she ignores an SMS for hours)                  | letter and invitation still waiting; later chapters still fire on time; nothing replays |
| R02 | Repeated NFC scan (any key, any time)                        | same destination; no second reveal, no duplicate entitlement                            |
| R03 | Delayed or failed SMS                                        | owner sees the failure; one retry path; never two SMS                                   |
| R04 | Refresh / app switch / phone locked mid-action               | committed action shown as committed; uncommitted one can be retried once                |
| R05 | Offline / poor connection                                    | honest notice; nothing pretends to succeed; recovery when back online                   |
| R06 | Interrupted playback (film / Nyla)                           | place kept, Retry, lighter print (film) — MEDIA MD13/MD14                               |
| R07 | Late arrival at a chapter (e.g. plays session 1 after 14:30) | sessions queue correctly, prizes still on each batch's third spin                       |

## 8. Requirements count

| Chapter                      | Rows   | AUTO-covered | Verbatim copy checks                        |
| ---------------------------- | ------ | ------------ | ------------------------------------------- |
| Global                       | 10     | 2            | —                                           |
| 21 Oct entrance (regression) | 4      | 2            | 1                                           |
| 22 Oct departure             | 11     | 6            | 5                                           |
| 23 Oct Casino                | 11     | 6            | 3                                           |
| 24 Oct birthday              | 9      | 7            | 4                                           |
| 25 Oct farewell              | 3      | 2            | 1                                           |
| Owner console / TEST         | 5      | 0            | —                                           |
| Resilience                   | 7      | 0            | —                                           |
| **Total**                    | **60** | **25**       | **14** (+2 structural: titles, no spoilers) |

## 9. Missing or ambiguous in the Bible (owner decisions needed)

1. **Approved revised copy for Chapters 4, 5, 6, 8, 10 is not in the Bible.** It says the owner approved "the assistant's immediately preceding proposed revisions" (Departure Lounge ending, AirPods post-Vault message, airport-drinks introduction, shortened Jamaica arrival SMS, shorter first-prize message), but the text itself was never saved. Codex cannot implement it verbatim and nobody can verify it.
2. **SMS copy missing** for: Departure Lounge, airport drinks, Albert/AirPods, 09:00, 14:30 and 20:30 Casino sessions (only "short SMS announces a letter"). Only the PROPOSED drafts exist.
3. **Midnight SMS link.** The owner-original midnight SMS has no URL, against the global rule that summonses link to the club.
4. **Gift Vault admission.** The UGG chapter opens the Vault "for the first time" by NFC on 22 Oct; the global rule says first admission goes through a Lounge letter. Which wins for the Vault?
5. **Claim Prize** is explicit for session 1; unspecified for Nyla (session 2) and the jackpot (session 3).
6. **Breakfast voucher**: revealed in the Vault, but is it requested from Privileges (with an owner SMS) or purely informational?
7. **[Acknowledge Evening Arrangements]**: what happens on press (owner SMS? nothing?).
8. **Farewell time** on 25 Oct is not given; the excursion is unbooked (default OFF).
9. **1,000 roulette tokens**: is the roulette table part of this release?
10. **Birthday card**: the Bible says "not yet implemented"; ADR-024 implemented `/birthdaycard`. Confirm the current card is the approved one.
11. **Source currency**: the local `.docx` must be confirmed as the latest Google Doc.

## 10. iPhone rehearsal script (owner, TEST world, about 45 minutes)

Use Alise's real phone model if possible, Safari, the installed app, mobile data for at least steps 3 and 6. **TEST only**: Control Centre → Rehearsal. Note pass/fail per step against the IDs.

1. **Entrance (E02–E04).** Rehearse 19:00 with the card NOT presented: doors must stay closed, letter readable. Scan the TEST card: 10-s ceremony, Lounge. Refresh, rescan: Lounge, no ceremony.
2. **UGG (D01–D02).** Trigger UGG; scan the pillow key: drawer opens, exact pop-up. Scan again: no second reveal.
3. **Departure + drinks (D03, D05, G05).** Trigger Departure: SMS link opens the Departure Lounge with escort; send a Word with the Butler → **your phone receives the SMS**. Trigger drinks: request one → owner SMS, balance 2→1. Turn on Airplane Mode, request again → honest failure; back online → exactly one SMS.
4. **Albert (D08).** Trigger Albert; scan the bag key: AirPods drawer, "ask your husband".
5. **Flight / arrival (D09–D10).** Preview both texts; confirm no link.
6. **Casino (C01–C10).** Advance to 09:00 Jamaica: letter → Casino; spins 1–2 lose, 3 wins drinks → Claim → 3 vouchers. Close Safari before Claim once: claim still pending. 14:30: 3 spins, third → Nyla letter → film plays with sound; replay from vouchers. 20:30: 3 spins, third → jackpot letter + riddle → scan the mystery key → breakfast voucher. Double-tap a spin: one result.
7. **Midnight (B01–B04).** Advance to 23:59 Jamaica: nothing. 00:00: SMS, letter; leave without entering, reopen tomorrow: invitation still there. Enter: film fullscreen, exit at 2 min, return: resume; finish: post-film words.
8. **Breakfast / card / dinner (B06, B07, B09).** Press "Breakfast has arrived" once. Scan the birthday card: 3D card. Advance to 16:00: dinner SMS + letter; Send Now earlier, then confirm no duplicate at 16:00.
9. **Farewell (F01–F02).** Preview OFF branch (no excursion) and ON branch; check the closing's exact wording and formatting.
10. **LIVE check without touching LIVE.** Owner console LIVE: every 22–25 Oct milestone shows the right local time and is held/armed as intended; nothing pending that should be manual.
