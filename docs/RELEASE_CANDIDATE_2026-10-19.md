# Consolidated local release candidate — 19 October 2026

## Scope and ancestry

- Production `main`: `277eaa75692492117d3cde5b80dae5d0b049e236`, reconfirmed via read-only GitHub branch lookup on 19 October.
- Completed backend and Gift Vault integration: `bccce307abac043f9cc9ebbf9778fa6ffc00aed9`, an ancestor of the prior release candidate.
- Prior candidate: `codex/release-candidate-2026-10-18` at `9bea495391fb375df3926a31fe82077b583339d6`; its only extra change was release documentation.
- Correspondence: `feature/correspondence-desk` at `a3f8a1b2f6918179418e8cf2bd75092856c3b350`. Its merge base with both the integration and prior candidate is exactly `bccce30`; it contributes one commit on that base. The source worktree was clean. The divergent local `main` desk schema and uncommitted work were excluded.
- New isolated worktree: `/Users/ag14/Documents/ChatGPT/30club/release-candidate-correspondence-2026-10-19`; branch `codex/release-candidate-correspondence-2026-10-19`. The feature merge had documentation conflicts only. `ARCHITECTURE.md`, `TASKS.md`, and `BUILD_LOG.md` retain both prior release notes and Opus's Correspondence notes, with stale status wording corrected.

The Correspondence commit changes 38 files (5,114 additions, 17 deletions). It adds a separate correspondence RPC/migration, owner and member views, tests, and extends the existing dispatch. It does not change Shopping implementation, the legacy concierge API, the Blobs adapter, or the legacy PostgreSQL store. No production checkout, hosted environment, provider, or feature worktree was changed.

## Migration and storage review

The hosted project `fzndcjzenodcixmuvfsb` still has exactly the six backend migrations through `20261018162436_reset_edited_message_attempts` (read-only check, 19 October); its security advisor returned no findings. Neither release migration is hosted. Apply **Vault `20261019090000_gift_vault.sql` before Correspondence `20261020090000_correspondence_desk.sql`**, both before deploying code that invokes their RPCs.

On a disposable PGlite database, `tools/verify-release-migrations.mjs` applied the six baseline migrations, seeded another pre-existing outbox row, then applied Vault and Correspondence in filename order. All five pre-existing outbox rows retained their IDs, categories, states, and bodies. Vault and Correspondence RPC smoke calls passed as `service_role`; an anonymous RPC call was denied. `ttc_vaults`, `ttc_letters`, and `ttc_letter_replies` all have RLS enabled, a `service_only` policy, no `anon`/`authenticated` SELECT grants, and service-role access. All 13 new functions have execution revoked from browser roles and granted to `service_role`. The only existing constraint changed is `ttc_messages_category_check`, widened to retain both old categories and add the two Correspondence categories. `ttc_action` and `ttc_vault_action` are unchanged by the Correspondence migration. The two migrations are not safely reversible after data is written; retain their tables on code rollback.

Shopping's implementation and storage files have identical content to production `277eaa7`: `netlify/concierge/{api,blobStore,shopping}.ts`, `src/features/concierge/client/shoppingApi.ts`, `src/features/concierge/ui/{ShoppingPrivilege.tsx,shoppingPrivilege.css}`, and `tools/butler-shopping.mjs`. The `/api/concierge/*` entrypoint still chooses Netlify Blobs unless `CONCIERGE_LEGACY_STORAGE=postgres`. **Leave that variable blank** until a separately authorised and verified Blobs migration. The existing `live/shopping/privilege` redemption was not read, reset, copied, or claimed in this task.

`SMS_SENDING_ENABLED` is compared to the literal string `true` before the new PostgreSQL outbox claims or contacts Twilio. The release candidate does not set or enable the flag. The existing synchronous Shopping and explicit legacy Send now paths are separate; do not exercise those during a smoke test. The updated scheduler publishes due letters, then handles the approved outbox and legacy notification retries independently. Legacy scheduled travel messages remain manual; Arron must choose one delivery path for each announcement.

## Local verification

| Gate                                                          | Result                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `node tools/verify-release-migrations.mjs`                    | PASS; upgrade, data, grant, RLS, policy, and RPC checks above                   |
| `npm run check`                                               | PASS; TypeScript, ESLint, Prettier, 578 tests in 46 files, production/PWA build |
| Correspondence browser, `playwright.correspondence.config.ts` | PASS 3/3; owner/member roundtrip, entrance notice, one-time introduction        |
| Owner/Vault browser, `playwright.office.config.ts`            | PASS 5/5                                                                        |
| Production regressions, `playwright test --workers=1`         | PASS 32/32, including offline PWA                                               |
| `npm run test:pwa` after setting `workers: 1`                 | PASS 32/32, including offline PWA                                               |
| iPhone-profile WebKit, `playwright.webkit.config.ts`          | PASS 6/6                                                                        |
| Correspondence browser with `--browser=webkit`                | PASS 3/3 in the iPhone profile                                                  |
| Pinned Netlify 27.13.0 `zipFunctions` bundler                 | PASS; `api.zip` and `concierge-dispatch.zip`, `* * * * *` schedule              |

The Netlify CLI wrapper cannot write its global preferences file under this task's sandbox. The pinned CLI's underlying `@netlify/zip-it-and-ship-it` bundler completed the actual Functions packaging in this worktree. ZIP inspection confirms the API contains the Correspondence RPC and Blobs selector, and the dispatcher contains `system-correspondence-publish` and the SMS flag. All browser suites use local/in-memory adapters, fake channels, and SMS disabled; they do not contact Twilio or Telegram.

The first `npm run test:pwa` used Playwright's default five workers and passed 30/32, with timeouts in the 3D entrance-to-lounge handoff and projected clock tap. Both passed in the full 32/32 single-worker run. This candidate sets `workers: 1` in the production Playwright config so the named gate avoids software-rendering contention. This changes test execution only; no product code was altered for those timing failures.

## Exact production sequence

Items labelled **Arron approval/action** are not authorised by this candidate. Do not treat local test results as permission to change hosted state.

1. **Automated/review:** Freeze the candidate commit, review its diff against `277eaa7` and the two migration files, confirm Shopping file equality, clean Git status, and rerun `npm run check`, the disposable migration script, Functions bundling, Correspondence, Owner/Vault, production/PWA, and WebKit suites if the commit changes.
2. **Arron approval:** Approve the release copy and behavior: Vault letter and Butler wording, Correspondence invitations/on-screen lines/default salutation/six-hour expiry/reply limits, legacy scheduled travel announcements becoming manual, and which approved outbox drafts should ever send. Keep SMS disabled for deployment.
3. **Arron action:** In Netlify Functions scope, add or verify `SUPABASE_URL` and the private `SUPABASE_SERVICE_ROLE_KEY`; verify existing `OWNER_PASSWORD_HASH`, `CONCIERGE_SITE_URL=https://30.ag14.co`, `CONCIERGE_SESSION_SECRET`, Twilio credentials and approved phone numbers. Keep `SMS_SENDING_ENABLED=false` and `CONCIERGE_LEGACY_STORAGE` blank. Preserve all current Shopping and Telegram settings. Do not put service keys in Vite variables.
4. **Arron action, with a verified recovery point:** On Alise's existing authenticated session, read `/api/concierge/shopping` before release and record that it is redeemed. Inspect the current hosted migration ledger and database backup. Apply `20261019090000_gift_vault.sql`, then `20261020090000_correspondence_desk.sql` to the dedicated project. Confirm both ledger entries, table RLS/grants/policies and category constraint; rerun the Supabase security advisor. Do not migrate or reset Netlify Blobs.
5. **Arron approval/action:** Push only the clean candidate branch, open/review a GitHub PR against production `main`, verify `main` still descends from `277eaa7` without new commits, then merge the reviewed candidate. Allow Netlify to build and publish that exact commit from `main`; confirm `api` and the every-minute dispatcher are present. Do not deploy `dist` alone.
6. **Read-only production smoke:** Confirm `/api/v1/auth/session` responds with JSON 401 to an unsigned request; sign in to `/owner` and inspect the overview, messages, membership, Vault and Correspondence tabs. On Alise's existing authenticated session, GET `/api/concierge/shopping` and confirm the Shopping Privilege remains redeemed. Do not POST a Shopping claim or run a send command. Inspect the approved SMS queue before enabling anything.
7. **Arron-controlled content and device rehearsal:** Configure Vault compartments, record backup codes privately, program and verify real NFC tags using owner tag test and Preview. Check Alise's actual iPhone Safari and installed PWA: entrance, membership induction, Departure Lounge, Casino, Screening Room, Gift Vault, NFC scan/backup, offline/update recovery, Correspondence collection, envelope/reduced motion, letter keyboard, thanks and reply. Issue Alise's one-time introduction link only when Arron chooses to share it. Verify birthday time-lock at 00:00 Jamaica.
8. **Separate Arron approval for real messaging:** Reconcile all queued/expired/uncertain outbox entries and legacy travel announcements first. Only then, in a controlled window, enable `SMS_SENDING_ENABLED=true` for an explicitly approved invitation/thanks/reply exchange, verify Twilio callback and recipient numbers, and turn it off again if any state is unclear. No real send occurred during local verification.
9. **Rollback if needed:** Turn the new SMS switch off, redeploy the known-good `277eaa7` Netlify deploy, and verify Shopping still reports redeemed from Blobs. Keep both additive PostgreSQL migrations and their data in place for a forward repair; do not run down migrations or reset/copy Blobs. If a later Blobs cutover ever occurs, reconcile writes before changing storage selection.

## Remaining release risks

- The existing Owner/Vault test previously had one unexplained failure in 17 repeated runs. A pass in this candidate reduces but does not eliminate that intermittent risk.
- Software-rendered 3D browser tests timed out with five parallel workers on this host; the release gate now runs one worker, and actual iPhone performance still needs rehearsal.
- Physical iPhone Safari, installed PWA, NFC hardware, Twilio delivery, live owner/member flows, and the production Shopping Blobs readback require controlled post-deploy verification.
- The Casino frontend still does not call the authoritative server slots API; its live reward side effect is not wired to Vault availability.
- Legacy scheduled Departure/Jamaica announcements are no longer automatic. A manual or PostgreSQL outbox path must be chosen per message, never both.
- The current hosted project has only the six baseline migrations, and the Netlify service-role key was outstanding at the previous configuration checkpoint. Verify current environment privately before release.
