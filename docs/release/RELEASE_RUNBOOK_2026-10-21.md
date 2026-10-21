# 21 October release — owner handoff

The release candidate is `codex/release-integration-2026-10-21`; check its exact commit with `git rev-parse HEAD`. The live site is still `main@54b9cf2` (Netlify deploy `6ad6804d45acc8f21add9e47`). Auto publishing is **on**. Six migrations are absent from hosted Supabase: the original five for the 16:00/19:00 release and a newer sixth for held 22–25 October work. No hosted migration, public deploy or real SMS is authorised by this document.

The owner-approved 16:00 teaser and owner-recovered 19:00 Nyla letter are seeded verbatim in the pending migrations. The teaser remains an unapproved draft; `early-membership` remains held. The letter already contains the approved clue about Nyla's private quarters and has no `[[CLUE]]` placeholder. The Story Bible is the copy source: [Thirty Club Story Bible](https://docs.google.com/document/d/1EzD2yQpe-KqO4MUtd7lZGGMD_KXfHUXdUMZOyAHbxEE/edit), final copy and owner-recovered letter near its end.

## 1. Confirm the exact release

Run `npm run release:preflight` in the candidate checkout. It checks the clean commit, production ancestry, migration order and approved copy, then rehearses the complete chain in a disposable PGlite database. The final local gates are `npm run check`, the iPhone-profile WebKit release suite and a Netlify Functions build; see `BUILD_LOG.md` for actual results. If Opus has a newer stable commit, integrate and rerun these checks before approval.

In Netlify, **lock auto publishing before any merge to `main`**. Keep the existing published deploy available for code rollback. The production credentials, phone routing, membership token/code, and SMS transport switch have been narrowed to the Production deploy context. `SMS_SENDING_ENABLED` is currently `false`. The old Twilio auth token still needs owner rotation; the Twilio queue requires an owner sign-in to inspect. `CONCIERGE_LEGACY_STORAGE` remains unset. Do not enable credentials on Deploy Previews or Branch deploys.

## 2. Approve and execute the hosted change

Owner explicitly approves **this exact commit**, the six hosted migrations and the public deploy. Apply these files in filename order only; a migration-history check must show the nine existing versions followed by these six:

1. `20261022090000_birthday_journey.sql`
2. `20261022100000_casino_rewards.sql`
3. `20261022110000_communication_hold.sql`
4. `20261022120000_sms_operations.sql`
5. `20261022130000_membership_card_admission.sql`
6. `20261022140000_journey_completion.sql` — held 22–25 October drinks, Casino and Vault work; no automatic release of those held moments.

Use the linked Supabase CLI from this checkout, if available: `supabase migration list --linked`, `supabase db push --linked --dry-run` (must show exactly these six), then `supabase db push --linked`. The connected Supabase migration tool is an alternative if the CLI is unavailable. Stop at the first error; never mark a failed migration applied manually or replay a partially applied file without diagnosis. These migrations are additive, but the hold cancels approved, unsent Alise SQL messages. The previous Netlify deploy is the code rollback; database rows are not automatically rolled back. The existing Blobs Shopping record is outside these migrations. The owner has explicitly closed further backup investigation.

Immediately verify in hosted SQL: 15 migration versions; hold `active=true`; SMS mode `off`; teaser `draft` at `2026-10-21T15:00:00Z`; early milestone `held` at `2026-10-21T18:00:00Z` in `Europe/London`; the seeded letter has the Nyla clue and no `[[`; zero card presentations; no approved/sending Alise outbox rows. Run the Supabase security advisor. Do not proceed if any check differs.

## 3. Publish and smoke check

Merge the approved release commit to GitHub `main` only after auto publishing is locked. Check the deploy preview's commit and build, then publish that deploy in Netlify. Rotate the Twilio auth token through the owner-controlled Twilio and Netlify credential screens; this credential change requires the owner. Confirm the published commit equals the approved release commit. Run `npm run release:smoke` for the public entrance and unauthenticated API. Verify in the LIVE Control Centre: **ON HOLD**, **SMS OFF**, and the existing £100 Shopping Privilege still fulfilled. Keep the previous deploy available for rollback.

## 4. Rehearse on the physical iPhone

Programme a spare TEST NFC card with `https://30.ag14.co/rehearse?scenario=early-admission-card-scan`; use Safari and the private rehearsal code. Check early scan, 19:00 hold at ten seconds, letter, final countdown, automatic doors, membership acceptance, Lounge and refresh without a second ceremony. Check printed-code fallback, a new tab, a late scan and a device timezone change. Programme the LIVE card with the Control Centre's membership URL and verify it with an NFC **read**; do not open that LIVE URL yourself. Hide the card in Nyla's crate only after physical readback. The WebKit simulator suite is evidence for software behavior, not a substitute for this phone test.

## 5. Activate the two moments deliberately

Before 16:00 UK, inspect Twilio for queued/accepted Alise messages and the legacy Blobs/manual dispatches. Do not send the same occasion from the legacy console and the new outbox. In the Control Centre, rehearse a teaser copy to `SMS_REHEARSAL_TO` only after confirming that number differs from `ALISE_PHONE`. A rehearsal is still a real SMS to the owner and needs separate approval. If all checks pass, explicitly release the hold after 06:00 UK, make transport available, switch SMS mode to LIVE, approve the single teaser draft before 16:00, and resume `early-membership`. The owner authorises each LIVE communication action. The scheduler cannot send the teaser twice through the SQL outbox; the old legacy `Send now` is blocked by the new hold once deployed.

At 16:00 check the single provider SID instead of pressing Send again. At 19:00 the milestone publishes the owner-recovered letter and its invitation SMS once; the server will not admit Alise before the milestone fires and her membership card is presented. The card scan or printed code starts the one-time ceremony and admits her to the Lounge. Birthday midnight cannot open the doors a second time. Leave later held milestones held until their wording and rewards are ready.

If the release misses 16:00, the owner may send the approved teaser **once manually** from their own messaging app, recording that decision; do not later approve the SQL teaser or use legacy `Send now` for it. If any hosted check fails, keep SMS OFF and the hold ON, and publish the saved `54b9cf2` deploy if a code rollback is needed. Never blindly retry a Twilio send marked `uncertain`.
