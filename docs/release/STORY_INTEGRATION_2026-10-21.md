# Story integration — 21 October 2026

**Combined release handover:** use [COMBINED_RELEASE_2026-10-21.md](COMBINED_RELEASE_2026-10-21.md) for the integrated candidate, current hosted state and ordered approval gates. This source-branch record is retained for history.

This is the delivery record for `codex/story-integration-2026-10-21`, based on `2b328722154279410dba66266fdc64559c2ce8cd`. The exact delivered commit is `git rev-parse HEAD` in this checkout. This report does not authorize a hosted migration, deploy, real SMS or communication-hold change.

## Sources and observed state

The local **Thirty Club Story Bible — 21 October 2026 working edition.docx**, including its recovered original copy and later owner approvals, is the narrative source. Its later appendices supersede the older summary tables. The owner confirmed that the approved wording is in this document. Recovered scripts are loaded; later notes reference some shortened variants without reproducing the preceding assistant reply. Those variants are editorial review items, not a request for another export. The current execution brief supersedes the early automatic-door design. No Google Doc or browser integration was used.

GitHub `main` was fetched and verified at `2b32872`. The public site returned HTTP 200. Hosted Supabase contains **15 migrations**, through `20261022140000_journey_completion`; older runbooks saying those six migrations are absent are obsolete. The Netlify published SHA was not independently authenticated through a deployment API; the supplied production SHA and GitHub main agree.

Read-only hosted configuration showed **zero Vault compartments**, Jamaica drinks active, Nyla film prize inactive without a film reference, no evening-jackpot prize, and an empty birthday-card message. No secrets or physical NFC credentials were retrieved or changed.

The media worktree was inspected read-only at `feature/final-media-integration`, `7e676d905061ad7e648b958c79ac133954b5e33c`, with no local changes. That branch was not merged or modified. Its documented streaming exports exist as a separate workstream; this story branch does not claim to deliver or verify their playback.

## Entrance incident

Observed database timestamps (UTC / BST):

| Event                                                   | UTC             | UK       |
| ------------------------------------------------------- | --------------- | -------- |
| `early-membership` fired; entrance eligibility recorded | 18:00:06.554554 | 19:00:06 |
| First SQL `journey.card.presented`                      | 18:04:26.801574 | 19:04:26 |
| Lounge admitted via entrance                            | 18:04:27.352437 | 19:04:27 |
| Membership letter first opened                          | 18:04:34.127803 | 19:04:34 |

The ceremony and server admission were different operations. At the base revision, `createEntranceEnvironment()` used `hasMembership()` for `card.isPresented()`. That accepted **either a retained membership scope or an old `membershipAt` recognition**. `useEntrance()` passed this boolean to `shouldStartFinal()` once the scheduled eligibility became true. The physical action was therefore not independently proved for this ceremony. Later `JourneyProvider.flushEnter()` could present the retained scope to the backend while reconciling Lounge acceptance. The backend card API itself accepted that scope without an explicit scan timestamp.

This is a concrete, reproduced authorization/sequence defect. The database records do not contain Alise's pre-incident browser storage, so they cannot establish which retained flag or session was present on her phone, nor the exact client-side moment the animation began. Do not turn that inference into a claim of recovered device telemetry.

Existing `EarlyAdmission` tests used a manually assigned `carded` boolean, usually true. Release browser presets supplied a card or tested a completely absent one. The membership-card backend tests proved that the API refused a missing SQL card row, but did not prove that the UI waited for a fresh physical action. Those checks could pass together with this defect.

Implemented correction: only a successful explicit NFC/code activation issues a signed `cardPresentedAt` claim. A legacy scope/recognition cannot start the ceremony or be silently upgraded into a new card presentation. The backend records that proof separately and requires a presentation at/after the admission window for an unadmitted member. Existing completed admissions and device ceremony records are preserved. The regression covers an authenticated stale session, time reaching 19:00, available letter, continued closed doors, a new presentation, the final ten seconds, Lounge and refresh without replay.

## Reconciliation and readiness

| Date/chapter              | Implemented or corrected                                                                                                                                                                                       | Remaining release conditions                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22 Oct — UGG              | Recovered exact SMS; manual trigger; ready-compartment mapping required; no generic letter/SMS duplicate; NFC/code reveal; early Vault stays open after refresh                                                | Create the real compartment and assign its actual drawer/tag. Key by pillow; gift in shoe cupboard. Review/approve before triggering                                                                              |
| 22 Oct — Departure Lounge | Manual invitation; recovered original letter; required real introductory request; one durable owner SMS outbox record; introduction survives refresh; further requests remain available                        | Recovered original is implemented with the confirmed real introduction flow; review the later ending/short SMS variant in the desk                                                                                |
| 22 Oct — airport drinks   | Manual after-security grant, exactly two; separate airport balance; deduct once on request; owner notification; refund/add controls retained                                                                   | Recovered letter retained; implemented Club Menu > Privileges Collection > airport drinks; review summons text. Airport drinks precede gate gift                                                                  |
| 22 Oct — Albert/AirPods   | Exact recovered investigation letter; prerequisite airport scene; mapped ready physical compartment required; contents remain hidden before NFC                                                                | Create/map the actual tag/drawer; key with Albert in Arron's bag; review the real handover instruction against the later approval note                                                                            |
| 22 Oct — flight           | Corrected **16:50 Europe/London = 15:50Z**; recovered exact SMS only, once; no invitation to reopen the app                                                                                                    | Review/approve/resume; preceding gate chapter must have fired                                                                                                                                                     |
| 22 Oct — arrival          | Corrected **21:30 America/Jamaica = 02:30Z on 23 Oct**; SMS only                                                                                                                                               | Recovered full original loaded; review against the later shortening note before arming                                                                                                                            |
| 23 Oct — morning          | **09:00 Jamaica**; opening spins issue before Casino invitation; exactly 3, prize on third; recovered admission promises 1,000 fictional roulette tokens/3 spins; drinks remain unclaimed until explicit CLAIM | Review the summons and arm both opening milestones. Short prize variant referenced by the approval note remains a review item; current operational presentation is not newly represented as exact recovered prose |
| 23 Oct — afternoon        | **14:30 Jamaica**; exactly 3, Nyla on third; exact recovered Nyla prize narrative; one return SMS; no duplicate reward mail                                                                                    | Media branch upload/deployment and active protected film reference; approved return SMS                                                                                                                           |
| 23 Oct — evening          | Corrected **20:30 Jamaica**; exactly 3, third mystery prize; exact 777 narrative/riddle; snapshot conceals breakfast/title/instructions/image until NFC drawer opens; superseded evening notice disabled       | Actual breakfast arrangement, distinct tag hiding place consistent with riddle, real Casino-linked compartment and `evening-jackpot` catalogue mapping; approved return SMS                                       |
| 24 Oct — midnight         | **00:00 Jamaica = 05:00Z = 06:00 BST**; recovered birthday letter and SMS; invitation persists when ignored; user chooses entry; duplicate midnight letter and unrelated midnight Vault invitation disabled    | Separate final-media release and target-iPhone playback; review outbound app-link suffix                                                                                                                          |
| 24 Oct — post-film        | Exact recovered closing words replace provisional closing prose; paragraph spacing preserved                                                                                                                   | Final film playback/completion and integration with media branch remain separate verification                                                                                                                     |
| 24 Oct — breakfast        | Exact recovered arrival SMS; **manual only**; Resume rejected; no automatic breakfast notification                                                                                                             | Owner confirms food is physically present; do not treat a digital win as delivery                                                                                                                                 |
| 24 Oct — private card     | Existing unfolding `/birthdaycard` preserved; owner editor retained; automatic Butler card correspondence disabled                                                                                             | Write the private personal message; give/program the physical card. Physical iPhone NFC check still required                                                                                                      |
| 24 Oct — dinner           | **16:00 Jamaica**; exact recovered SMS and letter; 19:30 dinner, 17:00 return, 19:00 escort; Send Now/schedule share one idempotent milestone                                                                  | Confirm real dinner/suite arrangements, review and arm                                                                                                                                                            |
| 25 Oct — farewell         | Exact approved closing, required bold/italic emphasis; manual only because no approved time; no excursion promise                                                                                              | Recovered approved closing loaded; review the standalone closing and summons before triggering                                                                                                                    |

**None of 22, 23 or 24 October is certified production-ready while the listed conditions remain.** Persistent club access on 25 October is exercised locally; the farewell stays held. No unbooked 26 October excursion is created or promised. Chanel's drawer/tag/location are not specified in the supplied authoritative material, so no mapping or reveal was invented.

## Nine-spin reconciliation and full release criterion

The authoritative working DOCX explicitly states **“23 OCTOBER — THREE FIXED CASINO SESSIONS”**. The recovered original afternoon/evening narratives and locked morning CLAIM clarification agree. All nine are Machine spins; the 1,000 fictional roulette tokens are separate.

| 23 October, Jamaica | UTC           | Global spins | Fixed outcomes and action                                                                                                                                                                                       |
| ------------------- | ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09:00               | 23 Oct 14:00Z | 1–3          | First two: no prize. Third: three Jamaica Bring Me a Drink delivery vouchers. Pending CLAIM survives refresh; only CLAIM credits that balance, once.                                                            |
| 14:30               | 23 Oct 19:30Z | 4–6          | First two: no prize. Third: Nyla film. Persists for replay; replay consumes no spin.                                                                                                                            |
| 20:30               | 24 Oct 01:30Z | 7–9          | First two: no prize. Third: mystery jackpot/riddle. Breakfast stays concealed until its distinct NFC/code opens the compartment. No breakfast-arrived SMS until the owner acts when food is physically present. |

Verification of this correction: default gates **776/776 PASS**; cumulative nine-spin Chromium/WebKit journey **2/2 PASS**; real twice-replayed five-second TEST film **2/2 PASS**, with unchanged spin IDs and a single prize; PostgreSQL story suite **11/11 PASS**. The final birthday/Nyla assets are not certified by that fixture.

The implementation at `3e410bb` already configured these three batches; this correction adds an explicit aggregate nine-spin acceptance check rather than creating or retiming a session. The continuous Chromium/WebKit test now checks zero spins before the first release, 3/6/9 committed spins in three distinct batches, each session’s first two prize-free results and third prize, correct timestamp windows, no future-session credits early, a durable pending CLAIM and exactly one credit, Nyla replay availability after refresh, duplicate spin retry returning the same result, no tenth spin, and all nine persisting through 25 October. The PostgreSQL test separately proves exactly nine issued and played spins, three completed batches, three prize allocations at position three, one return/invitation outbox record per session, and no duplicates after repeated scheduling/retries. If admission is accepted before its SMS is sent, the now-unnecessary morning SMS is cancelled, as asserted. The two return notifications remain queued under existing transport policy.

**Read-only hosted recheck, 21 October:** morning/afternoon grant definitions are three each at 09:00/14:30. Hosted evening remains 20:00, corrected to the document’s 20:30 by the unapplied story migration. Jamaica drinks is active with quantity three; Nyla is inactive without a film reference; `evening-jackpot` is absent. Zero real Vault compartments and an empty personal-card message were also re-confirmed. These are production configuration blockers, not missing session specification. No hosted records were changed.

**The release unit is the complete 22–25 October experience, ready before the flight on 22 October. A departure-only release does not satisfy the gate.** Local story tests do not certify the final media, real gift mappings, personal card message, hotel arrangements, approved communications or production deployment. All listed release conditions must close; keep the full release blocked until they do. The existing production-write/deployment restrictions and separate media boundary remain in force.

## Communications, claims and mobile operation

Story milestones now expose exact SMS, prerequisite scenes, manual-only status, physical Vault mapping, preview and explicit editorial approval in the existing phone-sized journey desk. Editing text/configuration clears approval. Unreviewed scenes fail closed. Trigger failures show an error instead of a false success notice. Disabled and manual-only scenes cannot be resumed. Existing LIVE/TEST separation, hold, SMS modes, outbox and provider idempotency are retained.

Every service/drink request still uses the existing real server/outbox route. The departure introduction uses that same transactional request path. Retry keys and drafts persist through refresh/tab close using the isolated storage adapter. A drink confirmation reports recorded/sent/delayed notification truthfully; it never claims the drink has been delivered. No new routine fulfilment administration was added.

Known story prizes suppress their duplicate generic reward correspondence. SMS-only flight/arrival/UGG/breakfast scenes do not create letters. The midnight Screening Room invitation is a single scene. Opening/reading an invitation does not accept room admission or claim a prize. The user remains in control of those actions.

Standalone legacy TEST presets fast-forward prerequisite scenes explicitly; they are useful feature fixtures. The new continuous story browser test runs the physical/read/request/claim sequence in one persistent recipient record. Neither represents physical NFC hardware, real Twilio delivery or final hotel film playback.

## Verification

Final local results:

| Check                                                            | Result                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`                                                  | PASS: types, lint, formatting, 776 tests / 60 files, production build                     |
| Continuous 22–25 Oct recipient journey and mobile owner controls | 4/4 PASS, iPhone profiles in Chromium and WebKit                                          |
| Release / integration browser regressions                        | Chromium 10/10 overall (7 initial + 3 corrected assertion reruns); WebKit 10/10 final run |
| Production PWA / offline browser checks                          | 3/3 PASS                                                                                  |
| Fifteen hosted-version baseline → single story upgrade           | PASS; protected state unchanged and browser permissions denied                            |
| Historical fifteen-migration chain                               | PASS                                                                                      |
| Netlify Functions bundle                                         | PASS, cached CLI 27.13.0                                                                  |
| Real film, real SMS, final physical configuration                | Not certified; separate release prerequisites                                             |

Actual final check details are recorded in BUILD_LOG.md. SMS rehearsal now selects the same reviewed story SMS as the live outbox, including SMS-only scenes. The slot machine still uses the established Thirty emblems for a jackpot; the exact recovered 777 narrative is presented. A glyph redesign has not been claimed. Commands:

```sh
npm run check
npm run verify:story-upgrade
npm run verify:final-migrations
npm run test:story
npx playwright test -c playwright.rehearsal.config.ts tests/release.spec.ts tests/integration.spec.ts
REHEARSAL_WEBKIT=1 npx playwright test -c playwright.rehearsal.config.ts tests/release.spec.ts tests/integration.spec.ts
npx playwright test tests/pwa.spec.ts
```

The upgrade rehearsal starts from the fifteen currently hosted migrations with a completed membership and delivered message, then applies **only** the new migration. It checks that admission/card history/messages/holds are unchanged, browser roles cannot call new wrappers or read the new table, and new story releases remain held. The original fifteen-file verifier is retained as a historical full-chain check.

## Exact safe release and rollback

1. Review the document-derived copy/variant notes and complete the real physical configuration listed above. Review this branch's concrete diff and final checks. Complete every 22–25 October release condition before treating this candidate as releasable; a departure-only release is not acceptable. Hold future scenes until their intended release, with all content and configuration verified in advance. Do not replay teaser or admission.
2. Obtain owner approval for the **exact story commit**, the one new hosted migration and deployment. Media upload/deploy/configuration has its own approval and verification boundary. This branch does not merge or alter the media branch.
3. Verify `origin/main` still equals the chosen reviewed release base. The observed base is `2b328722154279410dba66266fdc64559c2ce8cd`. Stop and reconcile if another branch has released. Lock Netlify auto-publishing before any main update. Record the current published deploy for rollback.
4. In the clean story checkout run `npm run release:preflight`. It is local and makes no production changes. Confirm the hosted migration history still contains the original fifteen versions. Do **not** reapply those migrations.
5. With the Supabase CLI linked to `fzndcjzenodcixmuvfsb`, inspect `supabase migration list` and `supabase db push --dry-run` using the installed CLI's help. The dry run must contain **only `20261022150000_story_sequence.sql`**. Owner approval is required before `supabase db push`. The original files have future-dated versions; the CLI-created story file was reordered to follow them deliberately.
6. Verify the completed Lounge admission, original card history, already sent/opened letters, holds/SMS settings and spent/claimed balances against the recorded pre-release state. Check new story scenes held, manual-only controls, prerequisite/review failures and security advisors. No migration releases the global hold or changes credentials.
7. Build/publish the owner-approved code through the existing Netlify process, verify the published commit, and run the read-only public smoke script. Configure the actual Vault/NFC mappings, card message and prize film references from the phone Owner Console; each LIVE edit/release requires the owner's existing authorization. Do not use a live card to rehearse.
8. Rehearse with TEST tags and the physical iPhone, then review/approve and arm only the intended future scenes. The earliest manual 22 Oct moments need a few phone taps; scheduled approved flight/Casino/birthday events then use the server clock. Real message delivery and the final film on that phone remain separate required checks.

Rollback: republish the saved `2b32872` code deploy (or the exact immediately preceding approved deploy if it changed). Leave the additive migration in place; do not delete progress, roll back rows or rerun seeds. It leaves completed admission intact and unarmed story content held. Investigate any failed scene in the mobile desk before retrying; the same idempotency keys prevent duplicate spins, letters and SMS. Do not release communications or retransmit the already delivered teaser/entrance as a rollback step.

### Commands for the approved release window

These commands have **not** been executed against production. Start only after the prerequisites and approvals above. If `origin/main` has changed, stop and reconcile instead of forcing the push. Disable Netlify auto-publishing before updating main, then publish the verified build through the existing project.

```sh
cd /Users/ag14/Documents/ChatGPT/30club/story-integration-2026-10-21
npm run release:preflight
supabase link --project-ref fzndcjzenodcixmuvfsb
supabase migration list
supabase db push --dry-run
# Only 20261022150000_story_sequence.sql may be pending.
# Apply only after the owner approves this migration.
supabase db push
supabase migration list
# Perform the protected-state checks in step 6 before publishing.
git fetch origin main
test "$(git rev-parse origin/main)" = 2b328722154279410dba66266fdc64559c2ce8cd
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
# Verify and publish the exact approved commit in the existing Netlify project.
npm run release:smoke
```

The media branch remains a separate release decision. Publishing this branch alone does not deliver its protected film player or uploaded assets. Do not arm Nyla or the final-film event until their real references and playback are verified.
