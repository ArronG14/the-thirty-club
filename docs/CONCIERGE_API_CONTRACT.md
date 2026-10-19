# Concierge API contract — v1

Status: Phase A contract. Backend implementation follows in the next commit. The shared source of truth is `src/shared/concierge/types.ts`; import its types directly. Production origin: `https://30.ag14.co`. Base path: `/api/v1`. All bodies and responses are JSON, except the Twilio callback. All API responses use `Cache-Control: no-store`. Require an online server confirmation before displaying a claim as successful.

## Authentication and browser requests

Use `fetch(url, { credentials: 'same-origin', ... })`. Every POST/PATCH requires `Content-Type: application/json` and `X-Concierge-Request: 1`. Requests from a different Origin are rejected. Authentication is an opaque, revocable, database-backed HttpOnly, Secure, SameSite=Strict cookie named `__Host-thirty-session` (localhost development uses `thirty-session`). Never store passwords, invitation tokens or session authority in localStorage. The theatrical identity verification, existing owner PIN and legacy rehearsal tokens grant no v1 access.

| Method | Endpoint                        | Access               | Request                | Success response                               |
| ------ | ------------------------------- | -------------------- | ---------------------- | ---------------------------------------------- |
| POST   | `/auth/owner`                   | Public, rate limited | `{ password: string }` | `200 { session: Session }` + cookie            |
| POST   | `/auth/member`                  | Public, rate limited | `{ token: string }`    | `200 { session: Session }` + cookie            |
| GET    | `/auth/session`                 | Member or owner      | —                      | `200 { session: Session }`                     |
| POST   | `/auth/logout`                  | Member or owner      | `{}`                   | `200 { ok: true }`, revokes session and cookie |
| POST   | `/owner/invitations`            | Owner                | `{}`                   | `201 { token: string, expiresAt: string }`     |
| POST   | `/owner/revoke-member-sessions` | Owner                | `{}`                   | `200 { ok: true }`                             |

Owner login uses a server-side scrypt password hash, persistent rate limits and an eight-hour session. The password/hash never enters the bundle. Alise receives an owner-generated high-entropy invitation token through the existing physical invitation/NFC process; she pastes it into the Concierge Desk once (or the frontend consumes an explicitly provided URL fragment). Exchange consumes the token atomically, issues a 30-day session and removes it from the address bar. It expires after seven days if unused. A lost session is recovered with a fresh owner-issued invitation. Never send invitation tokens through activity logs. Future NFC assignments use separately revocable hashed tokens. Existing cinematic verification and low-entropy printed codes cannot mint v1 sessions.

## Member APIs

| Method | Endpoint                | Request                      | Success response                                         |
| ------ | ----------------------- | ---------------------------- | -------------------------------------------------------- |
| GET    | `/privileges`           | —                            | `200 { privileges: Privilege[] }`                        |
| POST   | `/redemptions`          | `RedeemInput`                | `201 RedeemResult`; identical replay: `200 RedeemResult` |
| GET    | `/redemptions`          | —                            | `200 { redemptions: Redemption[] }`                      |
| GET    | `/redemptions/:id`      | —                            | `200 { redemption: Redemption }`                         |
| GET    | `/rewards/balances`     | —                            | `200 { balances: RewardBalance[] }`                      |
| GET    | `/rewards/transactions` | —                            | `200 { transactions: RewardTransaction[] }` (latest 100) |
| POST   | `/casino/slots/play`    | `{ idempotencyKey: string }` | `201 SlotPlayResult`; replay `200`                       |

These endpoints require a member session. Member IDs are derived from the verified session; do not send one. Owner reads use the owner overview.

Beauty example:

```ts
import type {
  RedeemInput,
  RedeemResult,
  ApiError,
} from '../shared/concierge/types';
const payload: RedeemInput = {
  privilegeId: nailPrivilege.id,
  amountPence: 4250,
  idempotencyKey: crypto.randomUUID(),
};
const response = await fetch('/api/v1/redemptions', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-Concierge-Request': '1' },
  body: JSON.stringify(payload),
});
const result = (await response.json()) as RedeemResult | ApiError;
```

Keep the same idempotency key and exact payload when retrying a timed-out request. UUIDs are recommended; accepted keys match `[A-Za-z0-9_-]{8,80}`. A reused key with different payload returns `409 idempotency-conflict`. A different key claiming an already-claimed beauty privilege returns `409 already-redeemed` with its standing redemption. Concurrent submissions cannot create two claims. Fetch the server record to reconcile; never stamp a claim based on an optimistic update.

## Privileges and money

Nail Appointment (`nail-appointment`) and Brow Appointment (`brow-appointment`) are independent, single-use beauty privileges for Alise. Both open immediately and close **exclusively at 2026-10-22T00:00:00+01:00** (before Thursday, Europe/London). Owner can edit these times. The initial allowed amount is 1–100000 pence (£0.01–£1000), editable by the owner. No final cash amount is assumed. All monetary values are integer GBP pence: `4250` means £42.50. Reject zero, negative, fractional, nonnumeric and out-of-range amounts. Beauty requests require `amountPence` and forbid `quantity`.

`Privilege.available` uses server time, enabled state and the existing claim; `unavailableReason` explains a lock. Dates are ISO 8601 instants. The frontend may format them for display but cannot grant access by changing its clock. A drink privilege requires a positive base-10 integer **string** quantity and forbids `amountPence`. Both types create a pending claim; owner fulfilment is an idempotent transition to fulfilled. There is no member cancellation/refund endpoint. SMS failures do not reverse claims.

```json
{
  "redemption": {
    "id": "uuid",
    "privilegeId": "uuid",
    "memberId": "uuid",
    "state": "pending",
    "amountPence": 4250,
    "currency": "GBP",
    "quantity": null,
    "createdAt": "2026-10-19T10:00:00Z",
    "fulfilledAt": null,
    "notificationState": "draft"
  },
  "duplicate": false
}
```

## Rewards and Casino integration

```json
{
  "balances": [
    { "reward": "drink-voucher", "unit": "voucher", "quantity": "10" }
  ]
}
```

Quantities and transaction deltas are decimal strings to preserve precision; use `BigInt` for integer arithmetic. There is no application maximum balance. Redemptions deduct atomically in PostgreSQL and cannot overdraw. No client endpoint accepts arbitrary grants, counters, winnings or reel stops.

The existing Casino frontend is preserved. Its integration point is the actual slots play action in `src/features/casino/useCasino.ts`, before committing an outcome or starting animation. Call `/casino/slots/play` with a new stable key per actual play and animate the returned `stops`. Merely opening the Casino, collecting a prize or replaying animation must never call it. The server owns the spin count and uses the existing slot engine/script; repeated keys return the original outcome. First play grants exactly 10 introductory vouchers once; **only subsequent plays** grant 1 for a pair, 3 for a triple or 10 for a jackpot, zero for a miss. These are explicit initial backend rules. Existing chips and ceremonial prizes remain in the existing UI. Integrating server outcomes into that UI is a separate frontend change; local outcomes are never accepted as evidence for grants. Plays require the Casino opening at 24 October 2026 14:00 America/Jamaica (19:00 UTC), with a two-second server cooldown. An owner can credit/debit vouchers with an audited adjustment API below.

## Butler's Office

All routes below require owner authentication server-side. `/owner` is the mobile office. The older `/concierge/owner` remains a separate legacy rehearsal console.

| Method | Endpoint                        | Request                                                       | Response                                                        |
| ------ | ------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/owner/overview`               | —                                                             | `200 OwnerOverview` (latest 100 redemptions, logs and activity) |
| POST   | `/owner/privileges`             | `PrivilegeInput`                                              | `201 { privilege: Privilege }`                                  |
| PATCH  | `/owner/privileges/:id`         | Full `PrivilegeInput`                                         | `200 { privilege: Privilege }`                                  |
| POST   | `/owner/redemptions/:id/fulfil` | `{}`                                                          | `200 { redemption: Redemption }`                                |
| POST   | `/owner/rewards/adjust`         | `{ delta: Quantity, reason: string, idempotencyKey: string }` | `200 { balance: RewardBalance, duplicate: boolean }`            |
| POST   | `/owner/messages`               | `ScheduledMessageInput`                                       | `201 { message: ScheduledMessage }`                             |
| PATCH  | `/owner/messages/:id`           | Full `ScheduledMessageInput`                                  | `200 { message: ScheduledMessage }`                             |
| POST   | `/owner/messages/:id/approve`   | `{}`                                                          | `200 { message: ScheduledMessage }`                             |
| POST   | `/owner/messages/:id/cancel`    | `{}`                                                          | `200 { message: ScheduledMessage }`                             |
| POST   | `/owner/messages/:id/retry`     | `{}`                                                          | `200 { message: ScheduledMessage }`                             |

Privilege slugs are immutable after creation. Kind cannot change after creation. Editing a claimed beauty privilege does not remove its claim. Scheduled SMS is always addressed server-side to Alise; redemption notifications always to Arron. The API never accepts a recipient phone number. Messages start as draft. Approve is the explicit owner approval for that exact body/time; editing resets approval and starts a fresh bounded attempt cycle; previous attempt callbacks remain invalidated. `sendAt` is an ISO instant with Z or an offset and `timezone` is an IANA zone. The owner UI converts the chosen local date/time and timezone into that instant; ambiguous or nonexistent wall times must be rejected. A null time is allowed only for drafts, useful for Friday's undecided welcome. Approval requires a future send time for scheduled messages. Approved messages are processed once due, with a 30-minute catch-up window; older missed messages require review. Retry only requeues a known failed send, requires explicit approval, and does not change `sendAt`. Accepted/delivered/sending/uncertain messages cannot be resent by this API.

Initial draft schedule: 22 October 14:00 Europe/London (13:00 UTC), 23 October Jamaica welcome with no time, 24 October 00:00 America/Jamaica (05:00 UTC), and 24 October 14:00 America/Jamaica (19:00 UTC). No seeded message is approved. Transactional messages start draft by default. An owner may explicitly approve the future transactional category with `POST /owner/notification-policy` and `{ transactionalSmsApproved: true }`; subsequent claim alerts then enter approved state. Setting it to false pauses automatic approval. Existing drafts are unaffected. `OwnerOverview.transactionalSmsApproved` reports this setting. Global `SMS_SENDING_ENABLED=true` is additionally required. Room unlocks use their existing clocks independently of SMS.

Delivery states: draft → approved → sending → accepted → delivered; definite provider rejection → failed with bounded retries; transport timeout, process crash or ambiguous response → uncertain for manual provider reconciliation, without automatic resend. `accepted` means Twilio accepted the API request; only a validated Twilio callback means delivered. Repeated scheduler invocations cannot claim the same send. A valid redemption always remains pending/fulfilled regardless of SMS state.

`POST /twilio/status?messageId=:id&claimId=:attemptId` is provider-only, form-encoded and requires a valid Twilio request signature against the configured canonical site URL. It is not a browser API.

## Error response

```ts
interface ApiError {
  error:
    | 'invalid'
    | 'unauthorised'
    | 'forbidden'
    | 'not-found'
    | 'not-open'
    | 'expired'
    | 'already-redeemed'
    | 'idempotency-conflict'
    | 'insufficient-balance'
    | 'rate-limited'
    | 'conflict'
    | 'not-configured'
    | 'server';
  message: string;
  requestId: string;
  redemption?: Redemption;
}
```

| HTTP | Meaning                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 400  | `invalid`: malformed body, amount, quantity, timezone, timestamp or key                                         |
| 401  | `unauthorised`: login rejected, absent/expired/revoked session                                                  |
| 403  | `forbidden`: wrong role/CSRF, disabled privilege; `not-open` or `expired` for time gates                        |
| 404  | `not-found`: unknown resource, including another member's record                                                |
| 409  | `already-redeemed`, `idempotency-conflict`, `insufficient-balance`, or `conflict` for invalid state transitions |
| 413  | `invalid`: request exceeds 16 KiB                                                                               |
| 429  | `rate-limited`: persistent authentication limit or slots cooldown                                               |
| 503  | `not-configured`: missing backend/server configuration                                                          |
| 500  | `server`: unexpected failure; retain the original idempotency key when retrying                                 |

Do not expose provider errors, secrets, SQL or stack traces to member clients. Show a recoverable connection error on network failure. The additive owner policy endpoint returns `200 { transactionalSmsApproved: boolean }` and requires an owner session and the same mutation headers. Full response types (Session, PrivilegeInput, Privilege, Redemption, RedeemInput, RedeemResult, RewardBalance, RewardTransaction, SlotPlayResult, ScheduledMessageInput, ScheduledMessage, DeliveryLog, ActivityEvent, OwnerOverview) are defined in the shared TypeScript file committed with this contract.

## Gift Vault (additive)

The vault adds `POST /auth/member/concierge`, `GET /vaults`, `POST /vaults/open` and owner routes under `/owner/vaults`, plus error codes `vault-locked` and `credential-invalid`. They are specified in `docs/GIFT_VAULT.md`, with types (MemberVault, MemberVaultList, VaultOpenInput, VaultOpenResult, VaultInput, OwnerVault, OwnerVaultList, VaultPreview, VaultVerifyResult) in the same shared TypeScript file. Existing routes are unchanged.

## Correspondence Desk (additive)

Member routes `GET /correspondence`, `GET /correspondence/summary` and `POST /correspondence/:id/{open,thank,reply}`, and owner routes under `/owner/correspondence`, are specified in `docs/CORRESPONDENCE_DESK.md`. Types (LetterInput, LetterSms, MemberLetter, MemberLetterReply, CorrespondenceSummary, OwnerLetter, OwnerLetterReply, OwnerCorrespondence) are in the same shared TypeScript file. `ScheduledMessage.category` gains `correspondence-alise` and `correspondence-arron`. The frontend now consumes an owner invitation from the fragment `/correspondence#invitation=<token>`, removing it from the address bar before the exchange. Existing routes are unchanged.

## Birthday journey (additive, ADR-020)

Full contract: `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`; types `src/shared/journey/contract.ts`.

- Member: `GET /api/v1/journey` → `{ now, admissions: MemberAdmission[] }` (invited and admitted rooms only); `POST /api/v1/journey/admissions/:roomId/accept` `{}` → `{ admission, duplicate }` (201, then 200 with `duplicate: true`); `403 not-open` when not invited.
- Owner: `GET /api/v1/owner/journey`; `POST /owner/journey/milestones`; `PATCH /owner/journey/milestones/:key`; `POST /owner/journey/milestones/:key/{fire|hold|resume|retry}`; `POST /owner/journey/rooms/:roomId/{invite|withdraw}`; `POST /owner/journey/events/:id/retry`.
- Correspondence letters (`MemberLetter`, `OwnerLetter`) gain an optional `action` `{ kind: 'admission' | 'return', roomId, label }`; owner letters also gain `journeyRef`.
