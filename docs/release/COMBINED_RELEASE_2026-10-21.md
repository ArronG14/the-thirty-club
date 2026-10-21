# Combined release candidate — 21 October 2026

Branch `release/story-media-2026-10-21` (worktree `../the-thirty-club-release`), prepared by Claude (media / acceptance). Not pushed, merged to `main`, migrated or deployed.

## Composition

| Part                                      | Source                                                                                                                       | Commit                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Base                                      | `origin/main` (deployed)                                                                                                     | `2b32872`                                 |
| Story Bible implementation                | Codex, `codex/story-integration-2026-10-21` (`/Users/ag14/Documents/ChatGPT/30club/story-integration-2026-10-21`, read only) | `3db4d08`                                 |
| Protected films (R2) + acceptance harness | `feature/final-media-integration`                                                                                            | `0f11dda` (includes `7e676d9`, `5d4efe3`) |
| Merge                                     | this branch                                                                                                                  | `036da99`                                 |
| Integration test fixes                    | this branch                                                                                                                  | see `git log`                             |

Both parents descend from `2b32872`. Hosted migration plan is Codex's, unchanged: only `20261022150000_story_sequence.sql` is pending (`docs/release/STORY_INTEGRATION_2026-10-21.md`). The media work adds **no migration**.

## Conflicts and how they were resolved

| File                                          | Resolution                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ARCHITECTURE.md`, `BUILD_LOG.md`, `TASKS.md` | Both sides kept (Codex's entries, then the media/acceptance entries)                                                                             |
| `package.json` (scripts only, no dependency)  | Codex's `release:preflight` (with `verify:story-upgrade`), `verify:story-upgrade`, `test:story`; plus `media:*`, `test:media`, `test:acceptance` |
| Code                                          | No textual conflicts                                                                                                                             |

Semantic integration fixes (tests only; no story logic changed):

1. `netlify/backend/media.test.ts` fired milestones directly; the story sequence now requires owner approval, prior scenes and an approved SMS, and ships `birthday-screening` held. The tests now do what the owner does (approve, resume) before firing. Afternoon-session assertion follows Codex's effects (`announce: false` + `story.sms`).
2. `tests/screening-film.spec.ts` expected the provisional closing line; Codex installed the owner-approved post-film words (`STORY_COPY.postFilm`). Updated.
3. `tests/owner.spec.ts` looked for the TEST scenario "Early admission: 19:00 UK, card already presented"; Codex renamed and re-timed it ("card presented after invitation", 19:00:05, explicit TEST scan) as part of the NFC-before-door fix. Updated; still reaches the foyer and a reset returns to locked doors.
4. `playwright.config.ts` ignores `tests/acceptance/**` (a Vitest suite).

## Verification on the combined candidate

Final run, 21 Oct 22:30 BST:

| Check                                                                                    | Result                                                                       |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run check`                                                                          | PASS (types, lint, format, 814 tests / 64 files, build)                      |
| `verify:story-upgrade` (15 hosted → story migration)                                     | PASS: protected state unchanged, browser roles denied, story milestones held |
| `verify:final-migrations` (full chain)                                                   | PASS: 17 release tables, 67 functions closed to browser roles                |
| `functions:build` (Netlify bundle)                                                       | PASS                                                                         |
| `test:story` Chromium + WebKit (continuous 22–25 Oct recipient journey incl. nine spins) | 6/6 PASS                                                                     |
| `test:media` Chromium / WebKit (real prints, presigned URLs, local R2 stand-in)          | 7/7 / 7/7 PASS                                                               |
| `test:screening` Chromium / WebKit                                                       | 5/5 / 4 PASS + 1 skipped (as before)                                         |
| Rehearsal `release.spec` + `integration.spec` Chromium / WebKit                          | 10/10 / 10/10 PASS                                                           |
| Default Playwright suite                                                                 | 34/34 PASS (33/34 before fix 3)                                              |
| `test:acceptance` (Story Bible, 38 machine checks)                                       | 32/38 (same on Codex's checkout); the 6 are listed below                     |

## Acceptance failures that remain (not code defects to guess at)

| Check        | Finding                                                                                                                                                                                         | Owner of the fix                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SB-24, SB-27 | Prize `evening-jackpot` is not in the catalogue. By design it is a VAULT_GIFT tied to the real breakfast compartment, created in the Owner Console. **Without it the 20:30 session fails.**     | Owner (configuration, before 23 Oct 20:30 Jamaica)                                            |
| SB-38, SB-39 | Nyla and jackpot letter bodies are verbatim, but the Bible's titles "A Rather Personal Delivery" and "A Most Extraordinary Victory!" are not shown                                              | Copy decision; a fix needs a story migration change (Codex)                                   |
| SB-44, SB-46 | Farewell ships the locked closing only ("Your devoted Butler"), manual-only. The full "One Last Engagement, Madam" letter contains the excursion; no approved farewell-only introduction exists | Owner decision: excursion booked → full letter; otherwise approve a no-excursion introduction |

## Release conditions (unchanged from Codex's report, plus media)

Owner configuration: real Vault compartments and NFC mappings (UGG, AirPods, jackpot/breakfast), `evening-jackpot` prize, personal birthday-card message, Nyla prize Film URL `/api/v1/media/nyla-film` + Active (the 14:30 session refuses to fire otherwise), review/approve each story scene and resume the held ones (incl. `birthday-screening`).

Media: R2 upload + real-bucket verification, three Netlify variables `MEDIA_S3_*` (a read-only token is sufficient for the runtime), then the Films desk on the iPhone.

Copy: the approved revisions for Chapters 4/5/6/8/10 and the missing SMS texts are not in the Bible; Codex's desk requires an approved SMS for those scenes before they fire.

Deploy: one hosted migration (`20261022150000_story_sequence.sql`) and one Netlify deploy of **this** branch's head — not Codex's branch alone (it lacks the protected films) and not the media branch alone (it lacks the story).
