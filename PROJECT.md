# The Thirty Club

## Vision and audience

An invitation-only digital private members' club with exactly one member: Alise Khera. Created for her 30th birthday on **24 October 2026**, experienced primarily on an iPhone during a holiday in Jamaica. The atmosphere combines Soho House, an elegant private casino and a bespoke luxury concierge: sophisticated, playful, deeply personal and visually extraordinary.

This is an interactive bridge between digital entertainment, physical presents, personalised surprises and real-world holiday activities. It must feel like entering an impossibly exclusive establishment, with a lifetime membership, rather than visiting a conventional birthday website.

## Experience principles

- Mobile first: iPhone Safari and Home Screen standalone operation are primary targets.
- Deliberate luxury: restrained typography, exceptional details, cinematic pacing and tactile interactions. Final creative direction belongs to phase 2.
- One member, personal content: no generic dashboards or fabricated personal details.
- Honest functionality: locked, unavailable, offline and pending states must be explicit.
- Resilient travel use: the installed shell can work offline after successful caching; media and authoritative actions have separate readiness requirements.
- Accessible by design: semantic controls, adequate contrast and touch targets, safe areas, reduced motion, and no essential audio-only instructions.
- Protect the surprise: an invitation gate is not sufficient to secure secret assets or redemption authority.

## Core experiences (future unless explicitly recorded in TASKS.md)

1. **Invitation & Initiation:** cinematic introduction by a fictional British butler; lifetime membership welcome and iPhone Home Screen installation guidance.
2. **Membership Card:** exquisite digital card with Alise's name, membership number and exclusive status. Number and copy require approval.
3. **Members' Lounge:** spatial primary navigation suggesting a real private establishment, rather than an application dashboard.
4. **Grand Casino:** premium interactive games awarding personalised prizes, privileges and surprises. Mechanics and prize rules remain to be designed.
5. **Gift Vault:** secure, persistent discovery and unlocking of physical birthday presents.
6. **Privileges Collection:** redeemable membership benefits, redemption tracking and notifications.
7. **Private Screening Room:** interactive environment for personalised video messages; selective downloads must respect storage and connectivity.
8. **Secret Experience:** hidden interactions, physical clues, NFC/QR integrations and at least one significant real-world surprise. Keep unrevealed content out of public bundles.
9. **Butler:** recurring guidance and event reactions; impeccably polite, dry-witted, slightly sarcastic and fiercely loyal to Alise. Scripted content, no live AI.

## Delivery milestones

The following eight phases are a **proposed sequence**, since the brief references eight agreed phases without supplying their names. Deadline is fixed; scope beyond foundation is unconfirmed. Dates are planning targets, not completion claims. Work after phase 1 may overlap with content preparation.

| Phase                                  | Target (2026, Europe/London)      | Exit condition                                                     |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 1. Foundation & blueprint              | 17 October                        | Documented, linted, tested, buildable shell and PWA strategy       |
| 2. Creative direction                  | 18 October                        | Approved typography, palette, motion language and iPhone layouts   |
| 3. Invitation, initiation & membership | 19 October                        | Scripted welcome, installation guidance and card on device         |
| 4. Lounge & butler integration         | 20 October                        | Approved navigation and shared event/copy model                    |
| 5. Casino & reward rules               | 21 October                        | Tested game rules and reward issuance contracts                    |
| 6. Vault, privileges & backend         | 22 October                        | Authoritative, idempotent unlock/redemption flow and notifications |
| 7. Screening & secret experience       | 23 October                        | Content, clues and physical integrations rehearsed                 |
| 8. Hardening & launch                  | Before presentation on 24 October | iPhone/offline rehearsal, production deploy and recovery plan      |

A seven-day schedule is tight. Confirm content, backend ownership and physical logistics early; reduce optional game/3D scope before sacrificing persistence or the final device rehearsal. Exact reveal time and Jamaica/London timing remain open.

## Phase 2 — The Grand Entrance (implemented, awaiting owner approval)

The opening screen is the street-side entrance to the club, closed until **00:00 on 24 October 2026 in the viewer's device-local time zone**.

- **Composition:** a stepped Art Deco portal in walnut and brass with a sunburst fanlight, flanked by fan sconces, framing a pair of mahogany doors. Brass rising-sun marquetry spans both leaves; a medallion on the meeting stiles carries a "30" that splits into "3" and "0" as the doors part. Above: EST. MMXXVI, THE THIRTY CLUB, PRIVATE MEMBERSHIP ◆ BY INVITATION ONLY.
- **Timepiece:** an engine-turned dial with brass bezels and rolling number drums for days, hours, minutes and seconds, beneath the line "Alise, your table is being prepared."
- **Butler:** a brass bell-push ("Ring for service") with a speaker grille that glows while he answers. Scripted lines, greeting by local time of day; separate repertoires for locked, final-minute, unlocked-door and foyer states. He addresses her as Alise. No live AI.
- **Final minute:** the fanlight, door seam, threshold, sconces, wall wash and brass sheen warm continuously from 0 to 1. No flashing.
- **Midnight:** the lock dial turns, light floods the seams, the doors swing inward, the view travels through into warm light, and the butler says: "Ah, Alise. There you are. We've been expecting you for thirty years."
- **Late arrival:** opening after midnight shows unlocked, glowing doors and an "Enter the club" control rather than auto-playing.
- **Foyer:** an oxblood room with chandelier light, an arch and a marble floor; the Members' Register (Alise, lifetime, effective 24 October MMXXVI); an honest notice that the lounge and rooms are still being prepared; the bell; and "Revisit the entrance". There is no navigation to rooms that do not exist.
- **Typography:** self-hosted Bodoni Moda (display and figures), Cormorant Garamond (voice) and Jost (engraved capitals), with iOS fallbacks Bodoni 72, Didot and Futura.

## Phase 2B — Cinematic entrance (implemented; device rehearsal pending)

The entrance is now a real-time 3D environment, approved from a lookdev prototype (docs/ENTRANCE_ART_DIRECTION.md):

- **Architecture:** a recessed Art Deco doorway in black granite, walnut and brass, with a reeded amber fanlight and fan sconces.
- **Doors:** lacquered sapele-mahogany leaves 75 mm thick, with brass sunburst marquetry and the splitting "30" medallion.
- **Countdown:** a brass time-lock with rolling number drums across both leaves, whose bolt withdraws at midnight.
- **Butler:** a nacre bell-push on the jamb with a glowing speaker grille.
- **Ground:** a polished black marble floor with reflections.
- **Atmosphere:** filmic grading, bloom, grain, fog and dust.
- **Midnight:** the doors swing inward and the camera passes through into the foyer.

The SVG entrance remains as the instant poster and the fallback. Textures are CC0 scans from Poly Haven.

## Phase 4 — The Members' Lounge (implemented; device rehearsal pending)

Beyond the doors is the Members' Lounge, which replaces the foyer holding room. It is a real-time room: walnut panelling, oxblood velvet sofas, a marble fireplace beneath a brass "30" sunburst, a Deco chandelier, a brass directory board, and a curtained doorway to the Private Screening Room.

- **First arrival:** the butler welcomes Alise and presents her membership card. She accepts it once; it never replays. She can revisit it from the lounge.
- **After that:** a short greeting and one guided destination ("Your evening continues"), the Members' Directory, her card and the bell.
- **Rooms:** they open with the membership (Screening Room) or at provisional Jamaica times (Privileges 10:00, Casino 14:00); the Gift Vault opens with the birthday membership (ADR-015), and stay open. Rooms not yet built are listed honestly as "Being prepared" and cannot be entered.

See ADR-008 and `docs/lounge/`.

## The Private Screening Room (implemented; birthday film and device rehearsal pending)

One continuous birthday film, assembled by the owner in CapCut: an AI-generated cinematic introduction, the guests' video messages, and an AI-generated ending. The room is its cinematic wrapper (ADR-019, `docs/SCREENING_ROOM_IMPLEMENTATION.md`).

- **Escort:** accepting the Butler's invitation in the Lounge, the camera walks towards the doorway, fades to black and she arrives seated (about 3.5 s).
- **Poster:** THE THIRTY CLUB PRESENTS · THIRTY YEARS OF ALISE · _A Private Birthday Screening_ · WATCH MOVIE. The Butler introduces the film on her first visit and welcomes her back on later ones.
- **Film:** Watch Movie opens the MP4 in the iPhone's native fullscreen player. At its natural end the room returns and the Butler closes the screening. She may watch again as often as she likes; leaving early keeps her place.
- **Content:** the final film is not yet supplied. LIVE says "Your screening is being prepared."; rehearsals use a clearly labelled five-second test film.

## Explicit non-goals

Phase 2 builds only the entrance and foyer holding room. Phase 1 does not implement the lounge design, invitation sequence, membership card, casino, vault, privileges, screening room, secret mechanics, backend or final branding. No live AI, public membership, multi-user SaaS, payment processing, real-money gambling, generic luxury dashboards or unnecessary framework layers. Three.js and animation libraries remain deferred: the entrance uses CSS, SVG and compositor-friendly transitions only. Installation does not imply offline readiness.

## Backend foundation and Butler’s Office (2026-10-18)

The owner selected a dedicated Supabase PostgreSQL project, Netlify Functions and the existing Twilio Messaging Service. The v1 API implements secure owner/member sessions, independent nail/brow claims, drink-voucher accounting, approval-based scheduled/transactional SMS and the mobile `/owner` office. The shared frontend contract is `docs/CONCIERGE_API_CONTRACT.md`; deployment and safe legacy-data cutover are in `docs/BACKEND_OPERATIONS.md`. Local checks and hosted database rehearsal are recorded in BUILD_LOG.md. Netlify production verification, real message delivery, frontend Casino integration and physical iPhone rehearsal remain pending. No SMS has been sent during this work.

## The birthday journey (ADR-020, branch `feature/birthday-journey`, not yet deployed)

The club reveals itself through the Butler. The owner's milestones (Jamaica time, controlled from the Owner Control Centre) introduce each exclusive room. The Butler writes to Alise, and a Letter of Admission waits in the Members' Lounge. Accepting it admits her permanently: the room joins the Members' Directory and the Butler escorts her in. Later news, such as Casino spins credited by the owner, arrives as a Butler letter whose button leads straight to the room. Rooms she has not been admitted to are never named. The Members' Lounge can open before the birthday as a founding membership (20 October), so the Casino can be introduced on 23 October. The birthday doors at midnight are unchanged. The Casino's spins, prizes and vouchers belong to a parallel workstream connected through `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`. Operations and rehearsal: `docs/BIRTHDAY_JOURNEY.md`.

## Casino rewards integration (2026-10-19)

An isolated feature branch implements owner-issued spin batches, an editable prize catalogue, server-authoritative results, voucher requests and fulfilment, and Casino-linked Gift Vault entitlements. The member Casino now reveals only server results. This branch depends on the Birthday Journey migration for room admission and Butler event delivery, so it is not an independently deployable release. See `docs/CASINO_REWARDS_INTEGRATION.md` for the handover and remaining integrated rehearsal.

## Final integration and the communication hold (20 October 2026, not yet deployed)

The birthday journey and the Casino/rewards engine are one system on `feature/birthday-final-integration`: the owner controls spins and prizes, the server decides every spin, vouchers and Vault gifts become entitlements, and the Butler presents each new room through its Letter of Admission and each later reward by letter. At the owner's instruction nothing new reaches Alise until he releases communications, which the server refuses before 21 October (Jamaica). Handover: `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`.

## SMS operations and early admission (20 October 2026, not yet deployed)

Every SMS now passes one server-side policy: the owner chooses OFF, REHEARSAL (copies to his own phone only) or LIVE, and the communication hold still decides whether anything may reach Alise. On Wednesday 21 October the Butler may send a teaser at 16:00 UK (only if approved in time), and the doors may open early at 19:00 UK with the full ceremony, if the owner arms it. Handover: `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`.
