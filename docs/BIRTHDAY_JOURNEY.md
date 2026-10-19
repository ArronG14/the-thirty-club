# The Birthday Journey — operations and rehearsal (ADR-020)

The club now reveals itself through the Butler. Every exclusive room is **LOCKED → INVITED → ADMITTED**. The owner's milestones (or a manual action) invite a room. The Butler writes to Alise, and a **Letter of Admission** waits in the Members' Lounge. Accepting it admits her permanently, the room appears in the Members' Directory, and the Butler escorts her in. Later invitations (for example new Casino spins) are Butler letters with **RETURN TO THE …**, which open the room directly.

- Integration contract for the Casino, rewards and Gift Vault: [`BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`](BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md).
- Branch `feature/birthday-journey`; worktree `../the-thirty-club-journey`. Not merged or deployed.

## What exists

| Concern | Where |
| --- | --- |
| Schema, RPC `ttc_journey_action`, `ttc_journey_publish`, `ttc_room_admitted`, hook point, default milestones | `supabase/migrations/20261022090000_birthday_journey.sql` |
| HTTP routes, event publishing, the round | `netlify/backend/journey.ts` (routes wired in `api.ts`; round in `scheduledRound.ts` → `netlify/functions/concierge-dispatch.ts`) |
| Shared types and the Butler's words (PROVISIONAL) | `src/shared/journey/contract.ts`, `src/shared/journey/templates.ts` |
| Device: admissions for every page, offline memory | `src/features/journey/JourneyProvider.tsx`, `journeyContext.ts`, `domain/access.ts` |
| Routing enforcement | `src/features/journey/ui/AdmissionGate.tsx` (used by `club/ui/RoomGate.tsx` and the keyless `/vault`) |
| Letter of Admission | `src/features/journey/ui/AdmissionLetter.tsx`, presented by `lounge/ui/Lounge.tsx` |
| Letter buttons (ENTER / RETURN) | `src/features/journey/ui/LetterActionButton.tsx`, in `correspondence/ui/LetterPresentation.tsx` |
| The Lounge before the birthday doors | `/lounge` → `src/features/lounge/ui/LoungeRoute.tsx` |
| Owner controls | Control Centre → Butler's Office → **journey** (`src/features/butlers-office/JourneyOffice.tsx`) |
| Rehearsal | `src/features/rehearsal/engine.ts` (scenarios and launches), `office.ts` (`rehearseAdmissions`, `fireRehearsalMilestone`) |
| Tests | `netlify/backend/journey.test.ts` (PGlite with every migration), `src/features/journey/journey.test.tsx` |

## Rooms

| Room | Admission | Notes |
| --- | --- | --- |
| Grand Entrance | none | Midnight doors and membership card unchanged (ADR-006/012). |
| Members' Lounge | `lounge` | Admitted from the Butler's letter (ENTER THE MEMBERS' LOUNGE). `/lounge` opens when the Lounge is admitted, when a Letter of Admission is waiting, or once the membership is presented. After the birthday the doors still lead there. |
| Private Screening Room | `screening-room` | Experience unchanged (ADR-019); only the gate and the letter before the escort are new. |
| Grand Casino | `casino` | Codex owns spins and prizes; the journey only gates and writes letters. |
| Gift Vault | `gift-vault` | `/rooms/gift-vault` and a keyless `/vault` need admission. A physical NFC key (`/v/<token>`, or a key held from a scan) still goes straight in by design (ADR-015); the server decides each compartment. |
| Privileges Collection | `privileges` | Not built; once admitted it reads "Being prepared". |
| Departure Lounge | none | Keeps its own schedule and credential (ADR-012). |

LOCKED rooms are never named to her: not in the Directory, the 3D directory board, the doorway engraving (it reads "Private"), letter room mentions or the gate notice. INVITED rooms stay hidden; a deep link leads to `/lounge?admission=<room>`. ADMITTED rooms behave as before. An admission can never be revoked. Withdrawing an invitation is only possible before she accepts.

## Default milestones (Jamaica time, UTC−5)

Seeded with `on conflict do nothing`, so an owner's edits are never overwritten.

| Key | When (Jamaica) | Does | Seeded |
| --- | --- | --- | --- |
| `early-membership` | Tue 20 Oct 13:00 | Invite the Members' Lounge (founding membership) | **armed** |
| `departure-ugg` | Thu 22 Oct 03:00 | Butler letter (wording provisional) | held |
| `departure-privileges` | Thu 22 Oct 08:00 | Butler note pointing to the Departure Lounge (which releases the privileges itself) | held |
| `departure-airpods` | Thu 22 Oct 09:00 | Butler hint for the hidden NFC tag | held |
| `casino-opening` | Fri 23 Oct 09:00 | Invite the Grand Casino | **armed** |
| `casino-opening-spins` | Fri 23 Oct 09:00 | Hook `casino.spins.issue` {quantity 5, announce false} — needs Codex's hook | held |
| `casino-evening-mystery` | Fri 23 Oct 20:00 | Butler letter with RETURN TO THE GRAND CASINO | held |
| `birthday-screening` | Sat 24 Oct 00:00 | Invite the Private Screening Room | **armed** |
| `birthday-vault` | Sat 24 Oct 00:00 | Invite the Gift Vault | **armed** |
| `birthday-breakfast` | Sat 24 Oct 10:30 | Butler letter "Breakfast is served" | held |

Held milestones carry provisional wording or depend on Codex. Review each one, then **Resume** it. Change times in the journey tab. If the migration is applied after a milestone's time, that milestone fires at the next round.

## Triggering milestones from the Owner Control Centre

`/concierge/owner` (LIVE) or `/concierge/owner/test` (TEST) → Butler's Office → **journey**:

- **Trigger now**: fires immediately, even if held, exactly once. It asks first.
- **Hold**: the round skips it. **Resume**: arms it again; if its time has passed it fires at once (the dialog says so).
- **Change time**: Jamaica wall-clock, stored in UTC. Use it to delay the Casino or introduce a room early.
- **Retry** (failed only): re-runs with the same idempotency keys, so nothing already delivered is repeated.
- **Room admissions**: **Introduce now** (LOCKED → INVITED, letter delivered) and **Withdraw invitation** (INVITED → LOCKED). There is no control to revoke an admitted room.
- **Butler correspondence**: each journey letter, whether it was opened, and its SMS state; **Retry SMS** for failed or cancelled ones.
- **Events**: everything the Casino and reward systems published, with **Retry** for failed ones.
- **History**: every journey action (`journey.*` activity), with time.

Status words: Scheduled, Held, Failed, Triggered, Delivered (in-app), Opened, Completed (every invited room admitted, or every letter opened).

## Delivery honesty

- In-app delivery works: the envelope at the doors and in the Lounge, My Correspondence, unread state, and opened stamps.
- SMS: every journey letter queues the Correspondence Desk's existing invitation SMS in the approved outbox. It is sent only while `SMS_SENDING_ENABLED=true`, which is **false** in LIVE, so no SMS reaches Alise. No real SMS was sent or tested in this work.
- Alise needs a v1 member session to receive journey letters and admissions. Today she gets one from the Correspondence Desk's one-time introduction link (`/correspondence#invitation=…`, task CD06), from her live Departure credential (Thursday), or from the membership card at midnight (concierge bridge). **Before `early-membership` fires on 20 October, send her the introduction link**, or the letter waits until she has a session.

## Rehearsing the admission ceremony (TEST only)

Dev Menu (PIN), or TEST → Rehearsal:

1. **Early membership**: scenario *Early membership* (20 Oct 12:59:30 Jamaica). At 13:00 the Butler's letter arrives at the locked doors. Open it → **ENTER THE MEMBERS' LOUNGE** → the Lounge and the founding-membership induction. Launch *The Members' Lounge before the birthday* to start straight after 13:00.
2. **Casino**: launch *The Grand Casino admission ceremony* (summons at the doors → Lounge → Letter of Admission → **ENTER THE GRAND CASINO** → escort). Alternatively, use scenario *Casino opening*: the milestone fires at 09:00 while you sit in the Lounge.
3. **Screening Room**: launch *The Screening Room journey (first visit)*. The Letter of Admission comes first, then the existing escort, film, return and closing words.
4. **New spins** (until Codex's Casino publishes events): in TEST the event inbox can be exercised from the backend tests. After Codex's work lands, the spins arrive as "Additional spins credited" with **RETURN TO THE GRAND CASINO**.
5. **Milestone controls**: TEST → Office → journey. Hold, move, trigger or resume milestones against the rehearsal clock.

A rehearsal may restart a ceremony (it deletes the simulated admission first). The real office never can.

## Verifying LIVE/TEST isolation

- Rehearsal pages answer every `/api/` call from the simulated office in the tab (ADR-018). The journey uses the same `/api/v1` handlers, so it is isolated by the same mechanism. `tests/rehearsal.spec.ts` asserts zero requests reach the server.
- The device cache (`thirty-club:journey`) uses `deviceStorage()`: tab session storage on rehearsal pages, `localStorage` for Alise.
- In LIVE, no journey code path writes to redemptions, privileges, vouchers, spins or prizes. The migration adds tables and nullable columns and changes no row; `journey.test.ts` asserts that an existing fulfilled redemption and an existing letter are byte-identical across the migration. The £100 Shopping Privilege lives in Netlify Blobs (legacy concierge), which this work does not touch.
- To check LIVE by hand after deployment, read only: Control Centre → journey shows the timeline. Concierge → overview still shows Shopping "awaiting settlement, £100.00".

## Deployment order (owner)

1. Apply migrations in order: `20261019090000` (vault), `20261020090000` (correspondence) and `20261021090000` (service), if not yet applied, then `20261022090000_birthday_journey.sql`. Codex's migrations come after.
2. Deploy the merged branch. The every-minute round now fires due milestones first.
3. In LIVE → journey: review every milestone's time and wording; resume the held ones you want.
4. Send Alise the Correspondence introduction link before 20 Oct 13:00 Jamaica (18:00 UK).

**Deploying the code without the migration closes every exclusive room.** The gate fails closed: no room opens without an admission the server confirms. Apply the migration first.
