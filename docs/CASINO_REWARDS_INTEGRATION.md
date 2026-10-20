# Casino and rewards integration

> **Integrated 20 October 2026** on `feature/birthday-final-integration` with the birthday journey (see `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`). The "not-configured until integrated" limitation below no longer applies: the journey migration precedes this one, the real `ttc_journey_publish`/`ttc_room_admitted` are used, the milestone key mismatch is fixed (`MilestoneInput.key`), `vault.gift.unlocked` now earns the full Butler journey, the scheduling form uses Jamaica time and arms its milestone, owner times display in Jamaica, the Lounge wallet appears only once the Casino is admitted, and every Butler reaction waits while the communication hold is active (Casino state still commits). Original isolated-branch notes follow.

**Branch:** `feature/casino-rewards-vault` from verified production `54b9cf2`. **Contract:** exact files from Opus commit `586191b` (`docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`, `src/shared/journey/{contract,templates}.ts`). No production database write or deployment was performed.

## Implemented and tested locally

- Additive migration `20261022100000_casino_rewards.sql` creates `ttc_prize_catalogue`, `ttc_casino_batches`, `ttc_casino_allocations`, `ttc_casino_spins`, `ttc_reward_entitlements`, and `ttc_voucher_requests`. It changes no existing Shopping Privilege, older drink balance, slot play, or Vault record. Every table has service-only RLS and browser roles have no grant.
- Owner creates/edits/disables catalogue items. A spin allocation stores a snapshot of the item's member-facing details. Editing or disabling the item later does not change past entitlements. `VOUCHER` and `VAULT_GIFT` are the first two kinds. A Vault gift must point to an existing `trigger='casino'` compartment.
- Owner issues 1–50 spins with 0–N selected prizes. PostgreSQL chooses distinct random positions, persists them, and locks the member row during issuance. Multiple batches are independent and consumed oldest first. An unplayed batch can be cancelled. Owner-only batch reads show allocations; member reads show played results and remaining count only.
- Member spin is one PostgreSQL RPC transaction under the member row lock. It checks Journey room admission, checks the idempotency key before availability, consumes one position, writes one result and, for wins, one immutable entitlement. Retrying a key returns the same result. The browser's animation follows the result. A pending key is kept in session storage until acknowledged; a reload reconciles with server history.
- Voucher entitlement moves `AVAILABLE → REQUESTED → FULFILLED`. Repeated requests return the standing request. Owner cancellation returns it to `AVAILABLE`; a later request may be made. Fulfilment is only marked after the owner acts. Optional validity is checked when a request is made. The owner's Control Centre lists all requests and fulfilments.
- Gift entitlement starts `UNLOCKED`. Its configured Vault compartment moves to `ready` in the same transaction as the award. The existing NFC/code route still opens it. Reading the wallet reconciles an opened compartment to `REVEALED`; the owner explicitly marks physical delivery `FULFILLED`. No gift is physically fulfilled by merely opening the Vault.
- The member Casino room uses a single premium reel presentation. The older roulette/slots experience remains in development previews and old component tests, but it is not used for production outcomes. A reusable Voucher Wallet is available from the Members' Lounge. The existing Butler can use the same `/vouchers` and `/vouchers/request` APIs; it does not independently grant or fulfil anything.

## HTTP API

All paths are under `/api/v1`, use the existing secure session cookie, mutation origin and `x-concierge-request` checks, and return the existing error envelope. Owner paths require the owner role, member paths the member role. IDs are UUIDs.

| Role   | Method and path                                                             | Purpose                                                                                                               |
| ------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Member | `GET /casino`                                                               | Remaining spins and committed history; no future allocations                                                          |
| Member | `POST /casino/spins` `{idempotencyKey}`                                     | Commit and return one spin                                                                                            |
| Member | `GET /vouchers`                                                             | Casino entitlements and request history                                                                               |
| Member | `POST /vouchers/request` `{id}`                                             | Request a voucher                                                                                                     |
| Owner  | `GET /owner/casino/prizes`                                                  | Catalogue                                                                                                             |
| Owner  | `POST /owner/casino/prizes`                                                 | Create prize                                                                                                          |
| Owner  | `PATCH /owner/casino/prizes/:id`                                            | Edit/disable prize                                                                                                    |
| Owner  | `POST /owner/casino/batches` `{quantity,prizeIds,idempotencyKey,announce?}` | Issue a batch                                                                                                         |
| Owner  | `GET /owner/casino/batches`                                                 | Allocations, results, counts and status                                                                               |
| Owner  | `POST /owner/casino/batches/:id/cancel`                                     | Cancel only an unplayed batch whose spins no delivered letter still promises (`spins-promised`); idempotent (ADR-023) |
| Owner  | `GET /owner/vouchers`                                                       | All entitlements and redemption requests                                                                              |
| Owner  | `POST /owner/vouchers/:id/fulfil`                                           | Record actual voucher fulfilment                                                                                      |
| Owner  | `POST /owner/vouchers/:id/cancel`                                           | Return requested voucher to available                                                                                 |
| Owner  | `POST /owner/casino/gifts/:id/fulfil`                                       | Record physical gift fulfilment after reveal                                                                          |

## Journey contract and dependency

The migration is intentionally numbered **after** Opus's `20261022090000_birthday_journey.sql`. Issue/play/request/fulfil RPCs publish the contract's `casino.spins.issued`, `casino.prize.awarded`, `reward.voucher.issued`, `reward.voucher.redemption_requested`, `reward.voucher.fulfilled`, and `vault.gift.unlocked` through `ttc_journey_publish` in the same transaction. Event keys contain stable batch, spin, entitlement or request IDs. A publish failure rolls back the corresponding state change. Casino play requires `ttc_room_admitted(member,'casino')`; issue does not. Opus's processor sends or defers Butler letters according to admission. This branch does not implement room admission, Butler delivery or the event inbox.

`ttc_journey_hook('casino.spins.issue', params, milestoneKey)` is implemented for the Journey milestone runner. `params` accepts `{quantity,prizeIds?,announce?}`. The Control Centre's scheduling form posts the Journey milestone with that hook; Journey owns its clock and retries. In Opus's committed implementation, creation also requires a stable `key`; the form provides one. The shared `MilestoneInput` type does not currently show that key, so this is an integration contract inconsistency to reconcile before shipping.

## LIVE and TEST

LIVE calls the existing Netlify API and hosted Supabase. TEST uses the existing ADR-018 in-browser PGlite simulation, which loads the actual migrations and fake providers. The owner and member APIs do not accept a realm identifier, so a client cannot select LIVE through a payload. Tests use fresh in-memory PGlite and an exact-signature Journey publish/admission fixture because Opus's committed Journey migration is not copied into this branch. Until the branches are integrated, owner issue and member spin deliberately fail `not-configured` in TEST and LIVE; do not treat this isolated branch as deployable end to end.

## Integration run

1. In an integration worktree, start from current production `main`, incorporate Opus's completed Birthday Journey branch and this branch. Resolve the known `Lounge.tsx`, `ControlCentre.tsx`, `api.ts`, `database.ts`, `TASKS.md`, `ARCHITECTURE.md`, `BUILD_LOG.md`, and contract-file overlaps by preserving Journey ownership of admissions/events and Casino ownership of rewards. Do not overwrite either agent's worktree.
2. Verify the migration order: Journey `20261022090000` then Casino `20261022100000`. Confirm `ttc_journey_publish(text,text,text,jsonb)` and `ttc_room_admitted(uuid,text)` exist, and `ttc_journey_hook(text,jsonb,text)` resolves to this branch's implementation. Check the milestone create `key` mismatch with Opus and update the shared type/documentation.
3. Run `npm run check`, the PGlite Casino/Journey/Vault/privilege suites, both owner/member mobile browser flows, the Screening Room browser tests and the existing privilege tests. In TEST, create a voucher prize, issue three spins, play all three, request the voucher, fulfil it in the owner Control Centre; then create a casino-linked Vault prize, win it, open by NFC/code and mark physically fulfilled. Verify no TEST request reaches the network.
4. Rehearse on the actual iPhone with LIVE credentials only after the integrated build and migrations are reviewed. Confirm first admission through the Lounge, later direct Casino return, interrupted-spin recovery, owner request/fulfilment wording and Vault admission. Do not deploy or send real messages from this branch.

## Remaining limitations

- The Casino's production interface prioritises one reliable reel over the old 3D roulette/slots. Both legacy modes are preview-only until they can consume the same authoritative spin RPC.
- The member Lounge Wallet is wired, but the Butler's conversational offer and the Journey admission UI must be reconciled with Opus's branch. The existing Owner Control Centre provides an actionable request list; no separate owner SMS is sent for a voucher request.
- The committed Journey contract records `vault.gift.unlocked` without a Butler letter. The Casino result links to the Vault, whose room gate must enforce first admission. A later Butler invitation to the Vault requires an explicit Journey contract extension; this branch does not invent a competing letter.
- No production migration, production spin, real notification, physical NFC/iPhone rehearsal or end-to-end integrated Journey browser run has occurred on this branch.

## Final release consistency (20 October evening, ADR-022)

- Opening spins (`casino-opening-spins`, sort 49) are issued before the Letter of Admission (`casino-opening`, 50); the letter promises spins only when a batch with spins left exists.
- The journey tab warns while the Casino is armed but its spins are held.
- Cancelling a batch asks first, withdraws an undelivered announcement and reports one already delivered.
- The member Casino refreshes its spins on focus, visibility and every 30 seconds.
