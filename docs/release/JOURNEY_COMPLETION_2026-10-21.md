# The holiday journey, completed — handover (21 October 2026)

**Engineer:** Claude (Opus 5.5). **Branch:** `feature/birthday-final-integration`, on top of revision 4 (`b512da1`). Not pushed, merged or deployed. No hosted migration applied, no Netlify setting changed, no SMS sent. Design: ADR-024 in `ARCHITECTURE.md`.

**Copy warning.** The later 22–25 October journey and drinks wording is **PROPOSED**. Replace it with approved Story Bible wording before resuming those milestones (Control Centre → Office → journey → Edit wording), and in `src/shared/drinks/templates.ts` for the drinks pages (a code change). The 16:00 teaser and 19:00 Nyla admission letter are separately approved and seeded in the preceding migrations.

## 1. For Codex — integration

| Item                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New migration (6th) | `supabase/migrations/20261022140000_journey_completion.sql`, after the five release migrations. Additive: 3 tables (`ttc_drink_grants`, `ttc_drink_requests`, `ttc_birthday_card`), catalogue columns (`slug`, `drinks_kind`, `drinks_quantity`, `video_url`), `ttc_vaults.opens_at`, wrappers (originals renamed `*_casino`, `*_promised`, `*_birthday`, `*_live`), two replaced functions (`ttc_casino_issue`, `ttc_casino_prize_snapshot`: supersets, same behaviour without the new inputs), held milestones, two seeded prizes |
| Data changes        | Only seeds: two catalogue prizes, new **held** milestones, the card row; updates the unfired `casino-opening-spins`, `departure-*` and `birthday-breakfast` titles/effects only if unedited. Arms nothing, credits nothing, sends nothing                                                                                                                                                                                                                                                                                           |
| Verifier            | `npm run verify:final-migrations` now applies **six** and checks the new seeds (17 release tables, 67 functions closed to browser roles). Passes                                                                                                                                                                                                                                                                                                                                                                                    |
| Environment         | **No new variables.** `SMS_REHEARSAL_TO` now also receives the owner's own notifications in REHEARSAL mode                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Deploy order        | Code before migration 6 is tolerated: the outbox treats the missing rehearsal claim as empty; drinks, card and early-Vault pages say "cannot be reached"; the Casino plays. Apply migration 6 **before 22 Oct 09:00 UK** (the UGGs)                                                                                                                                                                                                                                                                                                 |
| P0 (tonight) paths  | Entrance, card scan, 19:00 admission code unchanged. Touched shared code: `api.ts` (sends the owner's SMS right after a request), `sms.ts` (REHEARSAL claim), Lounge dock (Drinks entry), Casino. Release specs pass                                                                                                                                                                                                                                                                                                                |
| Playwright          | Configs accept `PW_PORT` (your 4185 run was left alone)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 1b. Tonight, 19:00 — admission wording

The prior `[[CLUE]]` placeholder has been replaced in `20261022130000_membership_card_admission.sql` with the owner-recovered Story Bible letter, **A Most Unfortunate Delivery Incident**. It points to Nyla's private quarters. The owner must verify that the card is hidden there and read back the programmed NFC URL before resuming the held `early-membership` milestone. The server refuses to fire it before 19:00 UK.

## 2. For the owner — set up before you fly (about 30 minutes, after deploy + migration 6)

All in the LIVE Control Centre (`/concierge/owner`).

1. **Birthday card.** _Birthday card_ section → write the message, sign it, keep the time (24 Oct 00:00 Jamaica) → Save. Programme a spare NTAG215 with `https://30.ag14.co/birthdaycard` (NFC Tools → Write → URL). Only her membership session can read it, and only from that time.
2. **UGGs (Thu morning).** Office → Vault → Create a compartment: clue (where the NFC key is), gift location ("in the cupboard…"), trigger **Manual**, tick **opens before 24 October** = Thu 22 Oct, e.g. 08:00 UK → Save → **Make ready**. Programme its NFC URL onto a tag and put it with the shoes. Journey tab → `departure-ugg` → Edit wording (Story Bible) → Resume (or Trigger now).
3. **AirPods (at the gate).** Same, gift location saying her husband has the gift; opens-before time = Thu ~13:00 UK. Journey → `departure-airpods` → wording → Trigger now at the gate.
4. **Departure.** `departure-privileges` (Departure Lounge + A Word with the Butler) → wording → Trigger now when you leave.
5. **Airport drinks.** `airport-drinks` → wording → **Trigger now** once through security. She gets 2; each request texts you her drink.
6. **Flight / arrival.** `flight-departure` and `jamaica-arrival` → wording → Trigger now at take-off / landing.
7. **Casino (Fri).** The opening spins (`casino-opening-spins`) are now three with **Bring Me a Drink ×3 on the third** → **Resume** (still held). Afternoon: Casino & rewards → edit **A message from Nyla** → Film URL (an `https://` MP4) → Active → Save; journey → `casino-afternoon-spins` → Resume. Evening (777 jackpot → breakfast): Vault → create a compartment with trigger **Casino** (any reward), opens-before = Fri 23 Oct 20:00 Jamaica, clue to its NFC key, gift location = the breakfast message; copy its **ID for its Casino prize**; Casino & rewards → new prize, type **Gift Vault**, that ID, **slug `evening-jackpot`**, Active → Save; journey → `casino-evening-spins` → Resume.
8. **Birthday.** `birthday-midnight-letter` → wording → Resume (optional: the armed Screening Room invitation already sends its own midnight letter and SMS, so this makes two). **Breakfast:** `birthday-breakfast` → Trigger now **only after it has arrived**. `birthday-card`, `birthday-dinner`, `farewell` → wording → Trigger when ready.
9. **The film.** Not supplied. Either one MP4 (`BIRTHDAY_FILM`) or separate clips in order (`BIRTHDAY_REELS`) in `src/features/screening/config/screeningFilm.ts`, then deploy. Without it she sees "Your screening is being prepared."

**Rehearse first (TEST, your iPhone):** Dev Mode now has _Airport: two drinks after security_, _Casino afternoon: Nyla's film on the third spin_ and _Birthday: the private card_, alongside the existing Casino launch (Bring Me a Drink on the third spin).

**What you do not need to do:** mark drinks as served. Watch the _Drinks_ section only if an SMS shows FAILED.

## 3. What works, tested

| Flow                                                                                                                     | Evidence                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Two airport drinks via milestone, each request: −1, SMS to owner with type + drink, idempotent retry, third refused      | `netlify/backend/drinks.test.ts`                                                            |
| Jamaica ×3 only after the third spin and her CLAIM; unclaimed survives reload; separate balance; owner restore           | `drinks.test.ts`, `tests/integration.spec.ts` (Chromium/WebKit, TEST)                       |
| REHEARSAL: owner notifications to the test number with banner, never Alise; OFF keeps the request queued, sent once LIVE | `drinks.test.ts`                                                                            |
| A Word with the Butler SMS names itself and carries her words                                                            | `drinks.test.ts`                                                                            |
| 3D Casino: 1,000 tokens, complimentary spins, prize reveal, interrupted spin recovered once                              | `tests/casino.spec.ts`, `tests/owner.spec.ts`, `tests/integration.spec.ts`                  |
| Vault compartment opens on its own earlier date; others stay sealed                                                      | `drinks.test.ts`                                                                            |
| Birthday card: sealed / open / owner-edited / member-only; seal, rise, unfold; reduced motion; offline copy              | `drinks.test.ts`, `tests/birthday-card.spec.ts`                                             |
| Screening programme: order, tap-started reels, failing reel skipped, reload continues, one completion                    | `ScreeningRoom.test.tsx`; single-film journeys `screening-film.spec.ts` (Chromium + WebKit) |

## 4. Not done / not verifiable here

- **Launch-blocking for the copy, not the mechanics:** Story Bible wording (all PROPOSED).
- Physical iPhone + NFC for the new flows; real Twilio delivery; hosted migration 6.
- The birthday film itself (owner media).
- The Machine's jackpot shows three Thirty emblems, not "777" (owner decision).
- Letter buttons come from the words: "drinks" → Your drinks, "birthday card" → Open your card, "Departure Lounge" → Proceed to the Departure Lounge. Keep those words when you replace the wording.
- The legacy Departure Lounge still has its own In-Flight Refreshment privilege (Telegram), separate from the two airport drinks.
