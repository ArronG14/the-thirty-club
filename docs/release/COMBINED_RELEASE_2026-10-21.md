# Complete birthday release: story + media + independent acceptance

## Candidate and scope

Local candidate branch: `codex/combined-birthday-2026-10-21`, in `/Users/ag14/Documents/ChatGPT/30club/combined-birthday-2026-10-21`. The delivered commit is `git rev-parse HEAD` here. Both histories are retained:

- Story: `3db4d08d236889e8d38753818571d8b8f26b58d1`.
- Media and independent acceptance: `0f11dda76568d11bb42ef9513a70af1d69a1f036`, including `7e676d9` and **R2 implementation `5d4efe3`**.
- Common base: `2b328722154279410dba66266fdc64559c2ce8cd`.

The source story branch and Opus's worktree are unchanged. This is a new local integration candidate, not a push, main merge, hosted migration, upload, SMS or deployment. Release scope is **all of 22–25 October, including nine spins**. A departure-only release is not acceptable. Local tests and synthetic configuration do not make LIVE ready.

## 1. Independent findings compared with the actual story branch

Opus's `0f11dda` harness was copied to a temporary audit directory and run unchanged with `ACCEPT_ROOT` pointing at **exactly `3db4d08`**. It passed **32/38**, versus Opus's recorded baseline **16/38 on `2b32872`**. The 60 checklist rows are broader than the 38 automatic tests; neither count is a claim of 60 production acceptances.

| Finding                                                | `3db4d08` evidence                                                                                                                                                                                                        | Combined candidate                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrance eligibility mistaken for a card action        | Fixed: explicit signed `cardPresentedAt`; stale scope/local recognition cannot authorize animation. Completed admission is preserved. SB-01 only checks the schedule; the browser and backend regressions prove the gate. | Preserved during merge; protected-media route added alongside the card route.                                                                                                                                                                |
| Casino third-session time / total allocation           | Fixed: 3 + 3 + 3 at **09:00 / 14:30 / 20:30 Jamaica**, prizes on global spins 3/6/9. SB-20–23 pass.                                                                                                                       | Same schedule and allocations; protected Nyla tickets additionally checked before/after her third spin.                                                                                                                                      |
| Missing third-session prize                            | Still configuration: `evening-jackpot` deliberately has no guessed physical Vault mapping. SB-24/27 fail as seeded.                                                                                                       | Owner configuration sequence below; synthetic PGlite setup proves these checks can pass without changing migrations or real state.                                                                                                           |
| Flight / arrival times                                 | Fixed: **22 Oct 16:50 UK = 15:50Z**, **22 Oct 21:30 Jamaica = 23 Oct 02:30Z**; SMS-only. SB-04/05 pass.                                                                                                                   | Preserved.                                                                                                                                                                                                                                   |
| Stale midnight Vault invitation / birthday-card letter | Fixed: superseded scenes disabled/held, midnight is one optional Screening Room invitation. SB-08/10 pass.                                                                                                                | Preserved.                                                                                                                                                                                                                                   |
| Broad missing-copy baseline finding                    | Recovered bodies, original SMS, post-film text and closing already restored; most copy checks pass. Four failures identified omitted title checks: SB-38, SB-39, SB-44, SB-46.                                            | Corrected actual prize-snapshot titles to **A Rather Personal Delivery** / **A Most Extraordinary Victory!**, and farewell letter title to **One Last Engagement, Madam**. No unused strings were added merely to satisfy the corpus search. |

**After these title corrections:** unconfigured candidate **36/38**; only the two catalogue-configuration checks remain. `npm run test:acceptance:configured` applies synthetic settings **only to disposable PGlite**, then all unchanged assertions pass **38/38**. It also proves configuration does not admit Alise, spend a spin, create an entitlement, publish a letter, queue an SMS or approve/fire a chapter. The synthetic personal message deliberately fails the LIVE-readiness query.

Additional integration repair: the Vault owner form now offers **Evening Mystery Jackpot — third session, 23 October**, technical binding `casino.evening-jackpot`. Do not use the old `casino.vault-key-one`: an old generic Casino outcome must not release the breakfast drawer. A backend regression proves that separation.

## 2. What the hosted read-only recheck actually established

On 21 October, during this integration:

- Exactly **15 migrations** through `20261022140000_journey_completion`; the new story version is **not applied**.
- Alise's Lounge is **admitted**, `admitted_at = 2026-10-21T18:04:27.352437Z`.
- **SMS mode LIVE; hold released.** Preserve both. Do not run old handovers that assume OFF/ON HOLD, resend a teaser or replay admission.
- **Zero Vault compartments; personal birthday-card text empty**.
- `jamaica-drinks`: active, three Jamaica drinks. `nyla-film`: inactive, no protected media reference. `evening-jackpot`: absent.

No R2 account, uploaded object, Netlify secret/deployment or physical phone is certified by those database reads. The production Netlify commit is not independently authenticated here; verify it in the approved release window.

## 3. Exactly one database migration; configuration is separate

Apply **only `supabase/migrations/20261022150000_story_sequence.sql`**, after explicit owner approval of the delivered candidate. This is the same pending story version with the candidate's title corrections. The fifteen hosted versions must not be replayed. The media/R2 branch adds **no database migration** and requires **no Supabase Storage bucket**. Do not use the superseded Supabase-media upload path for these large films.

The migration preserves completed admission, card history, fired milestone contents, messages, balances and rewards; only unfired story definitions are updated/held. It does not populate real gifts, write the personal card, upload media, issue spins, open drawers, release a hold or send anything. `npm run verify:story-upgrade` rehearses 15 → 16 and compares both the protected records and the operator's snapshot SQL.

**Configuration plan:** `CONTROLLED_CONFIGURATION_2026-10-21.json` is a reviewable **PLAN ONLY**, with exact methods, routes, payload fields and owner-input placeholders. Use the existing authenticated phone Owner Console, or an explicitly approved same-origin owner API session (`x-concierge-request: 1`). Never expose the service-role key in a browser. No operation in that plan has been executed on LIVE.

### Vault / physical keys

1. Read `GET /api/v1/owner/vaults`. Agree actual numbered compartments; do not copy synthetic acceptance numbers **901–903**. Confirm physical keys/presents and earliest opening instants.
2. Create UGG and AirPods compartments using `POST /api/v1/owner/vaults`: `displayNumber`, non-spoiler `clue`, exact approved `giftLocation`, `trigger: manual`, `availableAt: null`, `casinoRewardId: null`, explicit `opensAt`. Without this early-opening override they wait until birthday midnight.
3. The server generates each unique NFC URL and fallback code. Keep these privately, program the corresponding real key, and label the actual mapping. UGG key is by the pillow, item in shoe cupboard; Albert/key is in Arron's bag, present held by husband. Do not generate replacement credentials or choose another drawer on a timeout: re-read the same number/ID. An uncertain create is not permission to duplicate or rotate it.
4. Mark **only UGG and AirPods** ready (`POST /owner/vaults/<id>/ready`) when physically arranged. Bind their actual IDs via `PATCH /owner/journey/milestones/departure-ugg` and `.../departure-airpods`, `{storyVaultId: <id>}`. This clears review but does not fire the clue.
5. Create the breakfast drawer **as `trigger: casino` from the outset** (the prize API requires that), `casinoRewardId: casino.evening-jackpot`, `availableAt: null`, `opensAt: 2026-10-24T01:30:00Z`. Use the actual hiding place consistent with the recovered riddle; no place is guessed here. Its private reveal names the confirmed **24 Oct 10:30 Jamaica breakfast**. Leave the drawer **LOCKED**; never press Ready/Open. The third evening spin readies it through the prize's `vaultId`.
6. Create `evening-jackpot` in Casino & rewards (`POST /owner/casino/prizes`), **VAULT_GIFT**, that breakfast `vaultId`, Active, no spoiler image/instructions, approved title **A Most Extraordinary Victory!**, description **777 Mystery Jackpot**, recovered jackpot presentation. If the slug already exists, edit that ID instead of creating another. This creates no batch or entitlement.

No Chanel timing, compartment or tag mapping is established by the supplied chapter decisions; do not invent one. If it is part of the intended digital release, the owner must provide its approved reveal/mapping before declaring that requirement complete.

### Private card

`POST /api/v1/owner/card` with the owner's actual `message`, `signature`, `opensAt: 2026-10-24T05:00:00Z`. Preserve any existing first-open record. Program the physical card with **`https://30.ag14.co/birthdaycard`**. It is not a Vault key, has no Butler preamble, and does not issue a notification. The current unfolding card code exists; the personal words do not.

### Media and Nyla

1. With separate owner approval, activate/configure the **private R2 `ttc-media` bucket** as in `docs/MEDIA_DELIVERY.md`. Public access remains off. Owner enters the three `MEDIA_S3_*` values privately; no secrets go into Git, chat, public build or this plan.
2. From this combined checkout, review `npm run media:upload -- ~/Desktop/thirty-club-streaming` (dry run), then approve `npm run media:upload -- ~/Desktop/thirty-club-streaming --confirm`. Upload only the three final MP4 prints, not the MOV originals or temporary `.sb-*` files. It must end **All protected-media checks passed**. `npm run media:verify -- ~/Desktop/thirty-club-streaming` is the repeatable real-bucket read check.
3. Owner sets `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` in the approved Netlify deploy context with Functions scope and secret handling. Preserve all existing concierge/Supabase/Twilio values. **Do not put `MEDIA_SIMULATED` or local-API flags into production.** Media variables take effect with the reviewed combined deploy.
4. After real storage is verified, edit existing prize slug `nyla-film`, preserving its ID and short catalogue fields, set **Film URL `/api/v1/media/nyla-film`**, Active. Use `PATCH /owner/casino/prizes/<existing-id>` or the existing desk. Do not paste an expiring signed R2 URL into the prize. The candidate serves canonical references and signs only after the entitlement/time/admission gates.
5. Configure **before issuing** the afternoon batch: snapshots freeze at issue. The migration supplies the exact long Nyla presentation/title (longer than the catalogue's 1,000-character field); do not truncate it into the editor. No extra CLAIM/fulfilment is required for the film or mystery key. Jamaica drinks alone require explicit CLAIM.
6. Birthday film uses `/api/v1/media/birthday-film`: one continuous 14:40 film, separate standard/lighter encodings, same timeline. R2 signing, range delivery and failure handling are already implemented; no reimplementation is required.

## 4. Owner content / review still required

The owner supplied the current working DOCX and confirmed its approved wording is the source. We are not requesting another export. Its recovered originals are integrated. Later LOCKED notes refer to shortened/revised variants without reproducing the preceding reply; the original text is retained and the precise variants are review items, not newly invented approved dialogue.

- Departure ending/short escort SMS; airport introduction/menu wording and short summons; AirPods post-key handover; shortened arrival; short morning drinks pop-up; return summons for the Casino and farewell. Review the exact text in the desk; current browser examples prefixed **TEST** are not LIVE content.
- Midnight original lacked a link; current candidate appends the club link under the global summons rule. Review that concrete suffix.
- Personal birthday-card message/signature; physical gift numbers, actual key placements, AirPods handover text; breakfast/suite/dinner bookings and any Chanel plan.
- Farewell has no approved time: **manual**, recovered closing/title, no unbooked excursion. No 26 October promise is configured.
- The dinner's proposed **Acknowledge Evening Arrangements** action has no defined owner-notification semantics. The exact letter/timing are implemented; a separate acknowledgement action is **not** claimed complete. Clarify that action before accepting B09 in full.

Other questions in Opus's checklist are resolved by existing decisions/code: NFC opens the early Vault directly; only the drinks need CLAIM; breakfast is an informational earned reveal with a separate manual food-arrived notice, never automatic fulfilment; roulette uses the existing 1,000 fictional tokens; `/birthdaycard` is implemented. Physical/native-player and real-transport checks remain real checks, not missing source code.

## 5. Complete ordered release procedure (not executed)

1. **Close the full 22–25 scope.** Review this candidate, the 60-row matrix, owner content/actions above, physical arrangements, the controlled configuration JSON and media instructions. No departure-only approval. Do not arm a chapter with TEST text or unresolved real prerequisites.
2. **Verify the exact code/deployment base.** Record this candidate SHA, published Netlify deploy ID/SHA for rollback and current `origin/main`. Expected base is `2b32872`; if main or production changed, stop and reconcile. Lock auto-publishing before updating main. Original story/media worktrees remain untouched.
3. **Run local gates in this clean candidate:** `npm run check`, `npm run test:acceptance` (36/38 until physical catalogue configuration; explain the two expected failures), `npm run test:acceptance:configured` (38/38 in disposable PostgreSQL), `npm run verify:story-upgrade`, the story/entrance/screening/media rehearsals, Functions build and `npm run release:preflight`. These do not certify LIVE setup.
4. **Prepare private media**, with separate approval for R2 account/bucket/upload and Netlify variables. Complete real-bucket verification; do not use a development stand-in as R2 proof. This may precede the application deployment. Preserve the original MOVs as an owner-held fallback.
5. **Capture current progress**, read-only, using `docs/release/progress-snapshot.sql`; store its JSON privately outside Git. It contains IDs/hashes, no bodies, credentials or phones. Record pending messages and actual policies. Observed policies were LIVE/released, not OFF/held. Do not reset them to old runbook defaults.
6. **Approve/apply the one migration.** Review the exact file from this candidate. `supabase migration list` and `supabase db push --dry-run` must show only **20261022150000** pending, then owner explicitly approves `supabase db push`. Never reapply the old fifteen versions. Re-run the progress snapshot immediately. Completed Lounge admission/time, original card history, fired milestones, sent/opened records, claims/spins/balances must be preserved. New schema/held definitions/audit rows are expected; investigate any existing-row regression. If Alise acted during the window, distinguish her legitimate new progress from a migration change; never restore an older snapshot over her progress.
7. **Publish once, from the combined commit.** Only after owner deployment approval, publish the reviewed combined code through the existing Netlify project/process, with the new R2 variables. Verify the published SHA equals the approved candidate, run `npm run release:smoke`, verify the phone receives the new application version without clearing site data, and check existing membership/Lounge access. Never deploy the media branch or story branch separately.
8. **Perform controlled LIVE configuration**, separately approved, through the existing owner desks or the reviewed API plan: actual Vaults/keys, card text, Nyla reference, evening prize, exact story SMS/copy and physical mappings. Create/read back each record before continuing. No test spin, prize claim or Alise gift-open is needed to configure. Verify the real NFC payloads with an owner readback; never open Alise's LIVE gift URLs as a rehearsal.
9. **Validate actual configuration**, read-only: run `configuration-readiness.sql` after setup; all eleven rows must pass. It rejects TEST placeholders and missing reviews. Verify private media from the owner Films desk on the physical iPhone, with audio/seek/retry/lighter print. Native fullscreen, actual R2 edge, mobile data/hotel network and real SMS are not certified by Playwright. TEST records simulate owner messages; **no phone SMS is sent from TEST**. Any owner-only REHEARSAL/real delivery check needs separate explicit SMS approval and the verified owner's number; it must not consume Alise's spins or replay her ceremony.
10. **Approve exact scene review and future arming.** All configuration/content must be ready before the flight. Approval (`storyApproved: true`) alone sends nothing. Keep physical scenes manual. Resume future scheduled scenes in source order: flight/arrival; Casino opening-spins **before** opening invitation, afternoon, evening; birthday-screening; birthday-dinner. Check each future timestamp before Resume, since overdue Resume may send immediately. Do not issue manual duplicate Casino batches. Leave superseded Vault/card/midnight/evening notices disabled, and do not resume/trigger `early-membership` or resend the teaser.
11. **Day-of execution is the planned story, not emergency setup.** UGG → Departure → airport drinks after security → Albert at gate. Automatic future events use server zones. Breakfast-arrived only when food is physically present; farewell manually on 25 October, no excursion. Owner sees failures and retries one existing operation, not a replacement ID.
12. **Go/no-go:** release only after all real setup, owner review/actions and target-device/transport/media checks are accepted. If any remains unresolved, the full release remains BLOCKED even when local code tests pass.

### Commands for the explicitly approved window

These are instructions, not operations performed by this task. Use existing CLI authentication; do not paste credentials into commands/chat.

```sh
cd /Users/ag14/Documents/ChatGPT/30club/combined-birthday-2026-10-21
npm run release:preflight
supabase link --project-ref fzndcjzenodcixmuvfsb
supabase migration list
supabase db push --dry-run
# STOP unless only 20261022150000_story_sequence.sql is pending.
# After explicit owner approval of this exact file/commit:
supabase db push
supabase migration list
# Compare the private progress snapshots and complete the hosted checks.
git fetch origin main
test "$(git rev-parse origin/main)" = 2b328722154279410dba66266fdc64559c2ce8cd
git merge-base --is-ancestor origin/main HEAD
# With auto-publishing controlled and explicit publication approval:
git push origin HEAD:main
# Publish/verify the approved Netlify deploy; this guide does not auto-publish.
npm run release:smoke
```

## 6. Rollback / stop conditions

At any failed gate, stop before the next irreversible action. Keep unfired future scenes held; retain all completed progress. If the migration succeeded but deployment fails, leave the additive migration in place: it preserves completed admission and holds the new story. If code was published, the owner can republish the recorded previous Netlify deploy; **do not roll back/delete database rows, rerun seeds, cancel earned promises or restore an old progress snapshot**. An old code rollback may not play the new protected media, so it is containment, not a complete birthday release. If a protected-media credential is compromised, owner-authorized R2 token revocation stops new tickets; do not rotate credentials as a routine retry. Reconcile any frozen prize snapshot before changing configuration; do not spend/replace a real spin to test it.

## 7. Acceptance evidence and limits

`COMBINED_ACCEPTANCE_MATRIX.csv` lists all **60 unique row IDs**, implementation/evidence, TEST configuration, LIVE state and owner input. It is not a blanket VERIFIED stamp. Source `docs/acceptance/STORY_ACCEPTANCE.md` is retained; two operator corrections apply: membership cards use **`/c/<token>`**, gift keys use `/v/<token>`; TEST never delivers a real SMS, and source currency was resolved by the owner's supplied DOCX.

Final check counts, retries and any skips are in the combined entry in BUILD_LOG. The default gate excludes independent acceptance by design; run both acceptance profiles explicitly. A local R2 stand-in proves signer/range/player behavior on the real local prints, not actual R2 deployment or physical iPhone behavior.
