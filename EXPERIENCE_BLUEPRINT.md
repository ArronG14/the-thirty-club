# THE THIRTY CLUB — Experience Blueprint

**Product source of truth · 18 October 2026 · Documentation only**

**Member:** Alise · **Occasion:** 30th birthday, 24 October 2026 · **Location:** Jamaica  
**Primary platform:** iPhone Safari and Add-to-Home-Screen PWA  
**Departure:** 22 October 2026 · **Birthday scheduling zone:** `America/Jamaica`

## 1. Executive vision and authority

THE THIRTY CLUB is an invitation-only luxury private members' club with exactly one distinguished member: Alise. The birthday present is the establishment itself: a coherent, cinematic place that welcomes her, celebrates the people who love her, entertains her and connects her to real presents and experiences throughout her birthday.

Its visual language combines premium cinematic video-game environments, Mayfair private clubs, Soho House, Monaco casino interiors and Art Deco architecture. Dark walnut, deep oxblood burgundy, antique champagne brass, marble, velvet and warm atmospheric light establish a shared material world. Each room has its own purpose within that establishment. Spatial transitions, restrained typography, tactile mechanisms and the butler's voice maintain continuity.

The result must feel personal, luxurious, playful and emotionally meaningful. It must not become a conventional website, SaaS dashboard or disconnected collection of minigames. Luxury comes from composition, pacing and reliable detail; it does not require real-time 3D in every room.

### Authority, scope and evidence

This blueprint defines the intended complete experience. It does not certify implementation. It was prepared from the birthday brief and a read-only review of `AGENTS.md`, `PROJECT.md`, `ARCHITECTURE.md`, `TASKS.md` and `BUILD_LOG.md` in `/Users/ag14/Documents/Projects/the-thirty-club`.

For product scope and priorities, the decisions below replace conflicting earlier proposals: there are six core spaces; foyer and lounge are combined; screening is P0 and first after membership; the Secret Chamber is optional. Earlier backlog entries that place screening late or secret content on the critical path are historical planning, not this product's delivery order. The earlier CSS/SVG-only statement is also superseded by the documented production 3D entrance. Existing architecture remains the implementation baseline unless explicitly changed through its normal process. This document does not authorise another agent to edit files it does not own.

**Status vocabulary:** CONFIRMED DECISION describes product intent; PROPOSED describes an option; OPEN describes a decision still required. NOT STARTED, IN PROGRESS, IMPLEMENTED and VERIFIED describe implementation only when supported by evidence. VERIFIED always names the checks performed; desktop Chromium verification is not iPhone certification.

| Area                                      | Evidence at this document's creation                                                                              | Remaining boundary                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Grand Entrance                            | Production 3D entrance and SVG fallback documented as implemented; automated and desktop Chromium checks recorded | Substantially complete; actual iPhone, Safari and standalone rehearsal pending; minor upper-detail shimmer/flicker deferred |
| Members' Lounge and navigation            | Concurrent implementation by Claude Code, per owner brief                                                         | IN PROGRESS by brief; completion and acceptance are not assumed, despite older NOT STARTED backlog rows                     |
| Screening Room, Casino, Vault, Privileges | Future product requirements in this blueprint; reviewed docs do not establish completion                          | Treat as planned until implementation and checks are recorded                                                               |
| Backend and notifications                 | No member/reward backend established in reviewed architecture                                                     | Provider, authentication and notification delivery remain open; nothing here implies working notifications                  |
| PWA and hosting                           | Shell precache and local production-worker checks documented; Netlify configuration exists                        | Video caching, hosted deployment validation and real-device behaviour remain separate release gates                         |

No application code, tests, assets, configuration or other project documentation are changed by this task. No dependency installation, build, deployment or repository-mutating Git operation is part of it.

## 2. Core design principles

1. **Guide Alise.** Every scene supplies a clear purpose and a meaningful next step.
2. **The butler hosts the journey.** His recommendations connect rooms, time and personal context.
3. **The Members' Lounge is the central hub.** Foyer and lounge are one combined environment.
4. **Unfold the birthday over the day.** Avoid presenting every activity at midnight.
5. **Midnight prioritises emotional impact over complexity.** Keep ceremony and controls concise.
6. **The Private Screening Room is the first major destination.** Birthday messages are never game rewards.
7. **The Grand Casino is the principal interactive entertainment.** Give its materials, motion and feedback substantial refinement.
8. **Casino prizes, vault unlocks and physical gifts form one reward system.** Each valuable award has a known fulfilment path.
9. **Every promised real-world interaction must be executable.** Confirm inventory, bookings and a responsible person.
10. **Unlocked rooms remain available.** Returning and replaying are supported without repeating one-time rewards.
11. **The Secret Chamber is optional.** No core path depends on it.
12. **Balance ambition with iPhone performance, offline reliability and the deadline.** Reduce spectacle before sacrificing completion.
13. **Integrate controls into the environment.** Brass plates, registers and physical mechanisms replace generic application chrome where usable.
14. **Accessibility and usability are non-negotiable.** Accessible controls and reduced-motion alternatives retain every essential action.
15. **Never describe planned features as implemented.** Distinguish local presentation, submitted requests, confirmed entitlements and physical fulfilment.

## 3. Official room directory

These are the **six core spaces**. Membership ceremony, directory and butler are shared experiences, not additional rooms.

| ID  | Official name              | Purpose                                              | Intended availability                               | Priority |
| --- | -------------------------- | ---------------------------------------------------- | --------------------------------------------------- | -------- |
| 01  | The Grand Entrance         | Anticipation, time-lock and entry ceremony           | Before midnight; entry once its existing gate opens | P0       |
| 02  | The Members' Lounge        | Combined foyer/lounge, membership and navigation hub | After entry; always available thereafter            | P0       |
| 03  | The Private Screening Room | Emotional midnight premiere of birthday messages     | Immediately after welcome; no game/code requirement | P0       |
| 04  | The Grand Casino           | Premium theatrical games and shared rewards          | Later birthday release; exact time OPEN             | P1       |
| 05  | The Gift Vault             | Deposit boxes, clues and physical gift reveals       | Later birthday release; exact time OPEN             | P1       |
| 06  | The Privileges Collection  | Real-world requests, reservations and privileges     | Later birthday release; exact time OPEN             | P1       |

**The Secret Chamber is a P2 stretch goal, outside this directory.** An unavailable implementation must not masquerade as a locked, finished room with a promised opening time.

## 4. Detailed room specifications

### 01 — The Grand Entrance

**Role:** Build anticipation and make crossing the threshold feel like an event. The existing entrance is substantially complete, subject to real-device testing and deferred polish.

Preserve its cinematic 3D Art Deco architecture, imposing double doors, midnight countdown, mechanical time-lock, premium scanned materials, interactive butler bell, midnight opening ceremony and camera passage into the establishment. Keep the SVG poster/fallback and reduced-motion path fully functional. Existing self-hosted typography and entrance materials establish the visual baseline for subsequent rooms.

The countdown retains its **device-local midnight on 24 October 2026** behaviour. It recomputes from the current clock on return from background/sleep. The existing persisted entry state prevents ceremonial relocking after an already completed entry. This is a theatrical time gate, not security or prize authority.

Late arrivals receive an obvious entry action; nobody must wait through a missed live ceremony. Returning members reach the lounge without mandatory replay. Revisit controls may replay presentation without clearing progress or issuing rewards.

**Known minor issue:** shimmering/flickering in upper architectural details. Defer it unless it materially affects usability, comfort or performance. Do not reopen visual development merely to chase polish before screening readiness.

**Acceptance:** rehearse before, across and after midnight; late entry; background/resume; zone change; reload; persisted return; reduced motion; no WebGL; renderer/context failure; and accessible bell/entry actions on the actual iPhone. No such device acceptance is claimed here.

### 02 — The Members' Lounge

**Role:** The club's combined foyer and lounge, its narrative anchor and central navigation hub. Claude Code is implementing it concurrently; this specification supplies product requirements, not a completion claim or competing implementation.

The space contains a luxurious architectural setting, the butler's welcome, personalised lifetime membership ceremony, exclusive membership card, one recommended next destination and a members' directory. The card should feel like an artefact of the establishment. Its number and final wording require owner confirmation; do not invent them.

First entry follows a short sequence: establish the room, welcome Alise, present membership, offer the Screening Room. Permit skipping presentation and resuming later. Store ceremony acknowledgement separately from access so a skipped animation cannot trap her or block the videos.

Return visits replace the full ceremony with a brief varied greeting. Show available rooms, elegantly indicate scheduled rooms and direct attention to newly available content or unclaimed rewards. Do not expose hidden gifts in directory labels. Progress survives normal reload/relaunch; storage failure must not block room access.

**Acceptance:** first and returning visits differ; membership presentation can be skipped; screening is the clear first recommendation at midnight; directory and return-to-lounge work; locked/unavailable states are honest; reload preserves progress where storage is available; completion is confirmed with Claude's actual implementation evidence.

### 03 — The Private Screening Room

**Role:** Emotional centrepiece of midnight and first major destination after membership. **Must be ready for midnight.** Access requires neither casino play, clues, codes nor prize entitlements.

A luxurious private home cinema uses burgundy velvet seating, warm wall sconces, dark timber, brass and a large projection screen. Establish a private-premiere atmosphere, then move attention towards the screen. The screen becomes the video interface. A restrained camera move is desirable; an immediate or short-fade transition provides the accessible/performance fallback.

Minimum deliverable: approved birthday messages from friends and family, a deliberate Play action, pause/resume, seek/replay, clear playback errors and return to lounge. Keep native accessible media controls available where custom controls are incomplete. Nothing essential depends on autoplay with sound. Respect aspect ratios; do not crop faces to fill a cinematic frame.

**Proposed enhancements:** personalised opening title, elegant transitions, individual message chapters, butler introduction/closing and resume at the last watched chapter. Select a compiled film or separate clips after the inventory and editing effort are known. Neither chapter architecture nor a full edit is assumed complete.

Track viewing progress locally and define completion from the selected playlist; visiting the room alone does not mean the videos were watched. Completion only informs recommendations. She may leave early, replay favourites or skip a message without losing access.

**Acceptance:** every approved video plays on the actual iPhone in Safari and standalone; audio is intelligible; pause/return works; captions or an accessible transcript are provided; interrupted playback recovers; verified downloads play in airplane mode. A separately prepared local video copy is the operational fallback if browser media storage fails; it is not evidence that PWA offline video works.

### 04 — The Grand Casino

**Role:** Principal interactive entertainment and the largest planned investment in interaction design, animation and visual refinement. It should feel like a premium game casino inside the same club, with convincing physical attractions rather than basic web widgets.

**Confirmed product scope:** roulette and slot machines are the planned principal attractions. Their implementation and final mechanics are not confirmed. Prioritise midnight readiness before this room, then refine complete game loops before adding attractions.

**Roulette:** dimensional wheel, spinning animation, ball movement and believable settling, premium lighting/materials, cinematic results and short butler commentary. The authoritative award/result must be chosen or recovered before the animation commits to a result. The final pocket, written result and reward must agree. Reduced motion uses a brief resolved result instead of a prolonged spin.

**Slots:** physical-looking cabinets, mechanically convincing reels, personalised symbols, satisfying movement/feedback, win celebration and prize reveal. Candidate symbols include diamonds, champagne, crowns, Nyla the family dog and presents. Obtain approved imagery rather than inventing personal assets. Lock repeat activations while a spin resolves; restore unresolved results after reload.

**Proposed game loop:** approach an attraction → choose Play → create or recover a round → resolve its configured theatrical outcome → animate → present the award or non-award result → offer a useful next action. No deposit, stake, betting balance or cash payout. These are controlled birthday performances, not real-money gambling. Do not claim random fairness when outcomes are curated.

Potential awards include vault tokens, gift codes, NFC clues, concierge privileges, physical present reveals and special surprises. Exact odds, number of rounds, guaranteed wins, repeat behaviour, prize inventory and allocations remain OPEN. Separate replay entertainment from valuable issuance: exhausted inventory may produce an honest replay outcome, never another promise of the same physical present.

An additional prize wheel or other game is P2 and must wait until roulette/slots and reward recovery work. If delivery pressure forces a reduction, explicitly agree the attraction cut; do not silently claim the full casino is complete.

**Acceptance:** touch controls, coherent animation/result, reduced motion, resume during a round, retry after unknown network outcome, exhausted inventory and duplicate play are covered. The same round cannot issue two physical prizes. A failed award claim cannot display a confirmed win. Device performance and visual refinement require real review, beyond rule tests.

### 05 — The Gift Vault

**Role:** A mysterious but enjoyable physical-present system: numbered deposit boxes, mechanical-looking locks, code entry, unlock animations and personal reveals. Not every present should require a difficult puzzle.

Example journey: casino awards a clue → Alise searches a confirmed hotel-room location → finds a discreet Thirty Club NFC card → scans its URL → receives a verified code or entitlement → returns to the vault → enters the code or uses the entitlement → the associated box opens → the present is revealed → her husband hands it to her. A reveal and a physical handover are separate events.

Potential unlock types are casino reward, NFC discovery, QR discovery, relationship clue, manual code, scheduled reveal and butler-directed discovery. They are options, not a requirement to implement all seven. Use accessible code input, forgiving formatting and a helpful response to an invalid, already-used or not-yet-eligible code. Never expose the correct answer in an error.

Each box has a stable identifier and an owner-approved relationship to a real gift. Multiple clues may lead to one entitlement; they cannot multiply that gift. Once opened, a box can be revisited without consuming another reward or implying another handover. Provide optional hints and an organiser-assisted recovery path if a card is lost, a scan fails or a clue becomes impractical.

NFC/QR discovery must preserve the intended destination through authentication, handle repeats idempotently and return Alise to the relevant box or lounge. Discovery links must not reveal gift names in their URLs or public previews. A copied URL is not proof of physical discovery and cannot independently authorise a valuable award.

**Acceptance:** valid/invalid/repeated codes, repeated NFC and QR visits, Safari-versus-standalone handoff, offline discovery, interrupted opening, returning to an open box, missing cards and physical handover are rehearsed. If authority is unavailable, show a pending discovery or use the agreed husband-assisted procedure; do not fabricate a confirmed entitlement.

### 06 — The Privileges Collection

**Role:** Make club membership tangible through real-world service. The intended loop is selection/request → confirmed submission → husband notified → acknowledgement → real fulfilment → accurate status.

| Candidate privilege | Member interaction                    | Required preparation/fulfilment                                                    |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Cocktail Service    | Enter the desired cocktail and submit | Husband receives the order and obtains it from an available bar                    |
| Snack Service       | Enter food/snack request              | Confirm availability and who obtains it                                            |
| Personal Concierge  | Type a custom request                 | Husband receives it and acknowledges what is feasible                              |
| Spa Experience      | Redeem and view reservation           | A real advance booking with approved date, time, place and details; never invented |
| Champagne Treatment | Redeem a celebratory drink/experience | Confirm supply, venue and arrangement                                              |
| Royal Decree        | Issue a humorous special request      | Configure practical limits and acknowledgement                                     |
| Undivided Attention | Redeem personal time together         | Confirm feasible duration and availability                                         |
| Mystery Privilege   | Redeem to reveal the surprise         | Owner prepares an executable surprise before activation                            |

These are candidates. Configuration determines which appear, limits, use count, availability window, required input, fulfilment instructions and any booking details. Do not publish a spa booking or mystery promise before it exists. An unavailable privilege must explain availability honestly without exposing unnecessary surprise details.

Required service capability: real submission, durable receipt, duplicate prevention, request status, delivery evidence, fulfilment status, recoverable failures, reliable notification and basic member/organiser access control. The husband needs a practical authenticated way to acknowledge and mark fulfilment; a decorative notification alone is insufficient.

An explicit submit action follows the request text. Show pending states without encouraging duplicate taps. Provide an accessible status history and clear retry/help actions. A notification provider accepting a message does not establish that the husband has read it; distinguish those states.

**Acceptance:** an actual phone-to-husband request is delivered, acknowledged and fulfilled; offline submission and unknown response do not show false success; retries do not duplicate orders; provider failure is visible and recoverable; privileged status changes require organiser authority. Test the chosen channel with the husband's actual receiving device before enabling the privilege.

### Optional — The Secret Chamber

A hidden finale, personalised mystery, final reveal or special surprise may be added **last**, as P2. It is not one of the six mandatory spaces. No membership, screening, prize, gift or privilege depends on it. Hide its existence until relevant; omit it entirely if time runs out. Do not leave a broken teaser or a core gift stranded behind an unfinished room.

## 5. Narrative journey and pacing

### Midnight, 24 October

1. The entrance time-lock releases and the doors open.
2. Alise enters the combined Members' Lounge.
3. The butler welcomes her and presents membership.
4. He introduces the Private Screening Room with one clear action.
5. She watches the birthday messages at her own pace.
6. She may replay, return to the lounge or leave to enjoy her evening.

The ceremony should be concise, beautiful and emotionally rewarding. A **proposed pacing target** is roughly one to two minutes from entry to an available Play action, excluding her choices and video duration. Confirm through rehearsal; do not lengthen the sequence to meet a timer. Allow skipping, interruption and late arrival.

She may want drinks, conversation, messages and celebration. No midnight treasure hunt, casino obligation, installation tutorial or long directory explanation should compete with the videos. Prepare installation and downloads before presentation where possible.

### Later on 24 October

Additional rooms become available gradually. A possible sequence is Privileges Collection → Grand Casino → Gift Vault; exact order and times are OPEN. Casino clues must have a useful destination: if the vault is still scheduled, explain when the award can be used without implying it is lost. Avoid dangling clues until physical cards and gifts are ready.

An unlock announcement invites rather than interrupts. Completed experiences remain revisitable. The guide suggests the next meaningful experience while the directory preserves freedom. A late start should reveal all rooms whose gates have passed, without forcing a backlog of ceremonies.

## 6. Navigation and the butler

### Two complementary modes

**Guided journey:** present one primary action, in the butler's voice, chosen from current time, room availability, acknowledged introductions, viewing/completion progress, unclaimed prizes and newly unlocked content. Avoid changing the action while Alise is reading or interacting.

**Members' directory:** an in-world brass directory, leather-bound register or architectural wayfinding object. The precise form is PROPOSED. It lists the six core spaces with understandable availability, allows free visits to open rooms and marks locked rooms elegantly. Hidden surprises stay hidden. Provide a semantic list fallback for accessibility rather than requiring spatial interpretation.

Every room answers **Where am I? What can I do? Where should I go next?** Display a readable room name, a discoverable primary interaction and an always-available return-to-lounge control. Browser Back, direct URLs, refresh and reopening should resolve predictably. Leaving a video pauses it; leaving an unresolved game/request retains its record and explains recovery rather than silently discarding it.

**Proposed recommendation order:** unfinished midnight welcome (dismissible) → screening until watched or deliberately deferred → actionable unclaimed reward → newly unlocked content → remaining available experiences → replay/free exploration. A member's explicit choice wins over the guide. Never auto-route her away from a room. Recovery/help takes precedence during an error; recommendations never bypass access rules.

### Butler personality and dialogue

British, dry-humoured, slightly sarcastic, warm, attentive, impeccably professional and occasionally cheeky. Address the member as **Alise**. **Never address her as “Mrs Khera”.** Humour should make her feel cared for, never belittled or pressured to continue.

Use authored scripted dialogue: welcome, room introductions, suggestions, unlock announcements, prize commentary, concierge acknowledgements, return greetings and occasional observations. No external AI model or connection is required for dialogue. Audio is optional; readable text carries all essential meaning.

Use event/context keys and small variants with recent-line suppression. Keep interruptions brief, allow skip/dismiss, avoid stacking messages and never obscure media controls. Do not repeat the whole welcome after every return. Important status information must remain available after a decorative line disappears. Screen-reader announcements should not narrate every countdown tick.

**Illustrative copy, pending approval:**

- Welcome: “Alise. Your membership has been approved. The committee was unusually unanimous.”
- Screening: “Your private premiere awaits. A few people insisted on saying something.”
- Casino: “The house has prepared a rather suspicious number of birthday surprises.”
- Saved request: “Your request is recorded. I am awaiting confirmation from your personal staff.”
- Husband acknowledged: “Your personal staff has acknowledged the request. Standards remain under review.”

Use acknowledgement copy only for the state actually known. A witty line cannot substitute for an accurate status label.

## 7. Unlock and progression model

Keep room availability, local completion and valuable entitlements separate.

| State dimension        | Meaning                                                         | Rules                                                        |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Room availability      | Hidden, scheduled/locked, available, or temporarily unavailable | Once released, access remains; an outage is not a relock     |
| Member progress        | Introduction seen/skipped, content started, content completed   | Affects guidance, not entitlement authority                  |
| Reward entitlement     | Issued, claimed/redeemed, fulfilled, or explicitly cancelled    | Server-confirmed for valuable actions; replay never reissues |
| Presentation readiness | Loaded, downloading, offline-ready, missing/error               | Independent of whether time has unlocked a room              |

**Timezone contract:** use `America/Jamaica` for newly configured birthday room schedules and bookings. Store explicit instants with the intended zone for human review; avoid browser-parsed ambiguous date strings. Preserve the entrance's existing device-local unlock until the owner explicitly authorises a change. If the phone remains in another zone, entry may occur at a different instant from Jamaica room releases; this known distinction must be rehearsed and explained rather than silently “fixed”. Screening follows membership access and must not acquire a separate later gate.

Evaluate schedules on launch, room entry, focus, visibility resume and relevant clock changes. Do not depend on timers continuing while iOS suspends the app. Remember available-room releases locally for continuity, with a defined restoration path after storage loss. Device-clock manipulation may affect ceremonial availability; valuable scheduled rewards still require authoritative validation.

Loading a deep link must apply the same room/access rules as directory navigation. Preserve a pending destination through entry/authentication, then return to it when permitted. Distinguish a future release from content that has not been implemented or downloaded.

## 8. Lightweight shared experience engine

Extend the documented React, strict TypeScript, Vite, React Router and Zustand baseline. Three.js is confirmed for the entrance; use it elsewhere only when justified. Keep feature domain logic separate from presentation, use stable identifiers and introduce shared contracts when consumed. Do not build a speculative platform or a second navigation system alongside Claude's work.

The following are **proposed logical records**, not existing APIs, tables, routes or a mandated database schema:

| Record/service boundary   | Minimum responsibility                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Room registry             | Stable ID, name, presentation entry point, visibility, availability rule and accessible fallback  |
| Schedule evaluator        | Explicit birthday instants/zones, eligibility and permanent release semantics                     |
| Membership/progress       | Membership presentation, introductions, video progress, completion and recommendation inputs      |
| Reward catalogue          | Approved reward ID, kind, inventory limit, gift/box/privilege mapping and fulfilment requirements |
| Round/award ledger        | Stable round ID, resolved theatrical outcome and unique associated award                          |
| Entitlement/unlock ledger | Issued rights, claim status, vault-code validation and physical-gift uniqueness                   |
| Discovery record          | NFC/QR/manual discovery identifier, pending or confirmed state and deduplication                  |
| Privilege request         | Member, privilege, approved input, stable operation key and lifecycle                             |
| Notification attempt      | Request reference, channel, attempts, provider outcome and acknowledgement evidence               |

### State authority

**Local presentation state:** current room, seen or skipped introduction, completed animation, dismissed dialogue, selected settings and media position. Persist only what is useful, with a versioned format and graceful recovery. Zustand remains suitable for in-memory presentation; reviewed architecture proposes IndexedDB for richer local records/downloads. Do not migrate existing entrance records merely to match a new abstraction.

**Server-authoritative state:** physical prize entitlement, limited privilege redemption, confirmed concierge request, validated code/discovery claim, notification delivery and organiser fulfilment. Local copies are snapshots, not permission to mint another gift. Authentication and organiser access must precede release of these actions.

A minimal backend is appropriate once requirements are confirmed. Supabase or another lightweight service is a candidate, not an adopted dependency. Do not select a provider, add a backend or invent working endpoints through this specification.

**Local failure policy:** reading corrupt/missing state falls back safely; quota/write errors do not trap navigation. Explain that progress/downloads may be unavailable. Losing a local record must never recreate server-owned inventory. Updates and schema changes must preserve pending operation keys; defer user-triggered reload prompts during playback, ceremony, game resolution and request submission until safe.

## 9. Shared reward system and integrity

One catalogue connects casino outcomes, vault boxes, clues, codes and privileges. Every valuable reward must map to a prepared real-world item or service. Before enabling it, confirm quantity, recipient, location, availability, prerequisites and who fulfils it. Keep the private inventory out of this public-facing product narrative.

**Proposed transaction flow:**

1. The client creates a stable operation/round identifier before submitting.
2. An authenticated server validates eligibility, availability and remaining inventory.
3. A single atomic operation resolves the award, reserves the inventory and records the entitlement with uniqueness constraints.
4. Retries return the recorded result for the same operation. An unknown network outcome is recovered before allowing a new attempt.
5. The client animates the confirmed result. Claim/reveal updates the same entitlement; physical handover is recorded separately by the organiser.

A repeat scan, refreshed reveal, double tap, second browser context or replayed game must not create another physical present. Enforce uniqueness on the valuable action itself, not only on a client-provided request key. Where more than one game can award a gift, they must consume the same inventory record. Failed animations do not erase awards; failed requests do not manufacture them.

Clues may be repeatable presentation while an entitlement is single-use. A vault code resolves to a specific entitlement/rule; use server validation and reasonable attempt limits for valuable claims. Codes in client bundles, obfuscated JavaScript and hidden routes are not secure secrets. URL identifiers are inputs, not authorisation.

**Offline boundary:** viewing downloaded content and previously confirmed reveal snapshots may work locally. New valuable awards/redemptions require online confirmation unless a separately approved authoritative design exists. If offline casino play is offered, explicitly distinguish rehearsal/entertainment from a pending award; do not show a physical prize as confirmed. For deadline contingencies, the husband can check a prepared private inventory and fulfil manually, then reconcile once online. This is a human fallback with explicit status, not client-authoritative issuance.

## 10. Real-world integration and request lifecycle

### Concierge delivery

Provider choice is OPEN: Telegram, email, push or another reliable service. Prefer the simplest tested channel the husband will actually monitor. Secret provider credentials stay server-side. The selected design must durably save a request before scheduling its notification, retain retry state and let the organiser inspect unresolved requests.

Use independent state dimensions so delivery failure cannot erase a saved request:

| Dimension             | States/meaning                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Client intent         | Draft → waiting to send → submitting → confirmed saved, or unknown/failure                                   |
| Request fulfilment    | Submitted → acknowledged → fulfilling → fulfilled; declined/cancelled as explicit alternatives               |
| Notification delivery | Not attempted → queued → provider accepted → delivered if evidence exists; retrying/failed where appropriate |

“Sent” must identify whether it means saved to the server or accepted by a provider. “Received by your husband” requires an acknowledgement or suitable receipt; “fulfilled” requires organiser confirmation. Do not infer any of these from `navigator.onLine`, a successful animation or a button tap.

**Proposed minimal offline policy:** retain a clearly labelled unsent draft and require an explicit retry after reconnection. Automatic replay is optional and requires persisted idempotency, member-visible cancellation and stale-request handling; a cocktail request must not silently arrive hours later. After a timeout, look up the original request before creating another. An available human fallback should say to speak to her husband directly and leave the digital status honest.

### NFC, QR and physical gifts

Use standard URL-bearing NFC tags with an HTTPS discovery URL and a QR code encoding the same destination. The selected tag type, encoding, phone model and actual placed cards require rehearsal. No native app or browser NFC reader is assumed.

Apple documents background URL tag reading on supported iPhones and Safari opening where no associated app handles the link. Do not promise an automatic handoff into the installed PWA. See [Apple: background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading).

Safari and the Home Screen app must be treated as potentially separate sessions/storage. WebKit documents that post-install website data is not shared between those contexts. Therefore recover discoveries through authenticated server records or an explicit short-code transfer, rather than assuming local storage follows the scan. See [WebKit: Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/). These are integration requirements to verify on the actual iPhone, not a claim about its installed OS.

A new NFC URL opened in Safari may have no cached shell or authentication, even if the PWA works offline. QR resolves the same URL and does not fix missing connectivity. Supply a discreet human-readable reference and an organiser-assisted fallback. An offline pending discovery is not a confirmed unlock. Route public-input identifiers through validation and preserve them through login.

Physical preparation includes programmed and tested cards, safe hiding locations, hotel access constraints, matching box labels, gift transport/storage, a private mapping sheet, spare cards and QR/manual alternatives. Never hide an essential item somewhere staff may remove it, access is restricted or the member must take a risk. Confirm that each gift is present and the husband can hand it over.

### Bookings, privacy and access

Only publish confirmed spa/experience details supplied by the owner. Confirm local date/time, venue, reservation contact and any practical arrival instructions. If no booking exists, omit or honestly mark the candidate unavailable; do not invent a reservation.

Protect private videos, request text, gift mappings and organiser functions through the chosen access model. An invitation gate is not sufficient protection for publicly bundled assets. Authenticate member and organiser with separate authority, provide a tested recovery path, validate input server-side and avoid personal text or redeemable secrets in logs/URLs/analytics. Cache only intentionally approved private content on the intended device. Confirm permissions, retention/deletion and device-loss recovery before launch. No public member signup or payments are needed.

## 11. Technical, offline and accessibility requirements

### iPhone and PWA contract

The reviewed foundation targets iOS/Safari 16.4 and later; confirm Alise's actual model and OS before treating this as tested compatibility. Check Safari and Add-to-Home-Screen separately: safe areas, portrait/landscape, keyboard, address bar changes, history, return from lock/sleep and audio interruptions.

The existing production worker precaches the public shell, fonts and entrance assets; this does not establish offline videos, private content, backend reachability or offline entitlements. The reviewed build log reports approximately 1.47 MB of precache, a main bundle around 91 KB gzip and a lazy 3D chunk around 167 KB gzip. These are historical reported measurements, not checks rerun for this document.

Use a successful download/worker result to report readiness. First use needs network. Hotel Wi-Fi can be slow, captive or intermittent; show actionable failures and avoid forcing a new download at midnight. Keep hosted API/asset failures distinct from SPA navigation fallbacks. Hosted HTTPS routing and private media access still need release verification.

### Video and offline preparation

Maintain an approved media manifest: stable ID, approved title/person, duration, encoded size, version, playback URL, caption/transcript reference and download state. Decide compiled film versus chapters, codec/resolution and final storage size after inventory. A broadly compatible MP4 rendition is a candidate; test the actual encodes rather than assuming container alone ensures playback.

Provide explicit Download for offline use, total sizes/progress, cancellation, retry and removal. Mark ready only after a complete usable copy has been verified. The chosen implementation must handle seek/range playback from local media, interrupted downloads, changed versions and quota errors. Do not route private large media through an indiscriminate precache. Check all selected clips in airplane mode after closing/reopening the app.

Use a deliberate Play action and `playsinline` for the screen presentation, with usable controls and a fullscreen option where supported. Audible autoplay is not a prerequisite for the experience. [WebKit's iOS video policies](https://webkit.org/blog/6784/new-video-policies-for-ios/) inform this baseline; actual device rehearsal remains required.

Storage quotas and eviction mean a prior download cannot be treated as permanent. Query available capacity where supported, handle failed writes and recheck readiness before departure and presentation. A persistence request is helpful when supported, not a guarantee. [WebKit's storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) explains quota/eviction constraints. Keep an approved independent local video backup and a charger available.

### Proposed performance budgets and degradation

These are initial engineering targets requiring actual-device confirmation, not measured promises or reasons to rewrite the completed entrance:

| Concern               | Initial target / response                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Essential interaction | Provide a usable poster/semantic entry within 3 seconds on the agreed test connection, excluding user-approved media download |
| Touch feedback        | Visible acknowledgement within approximately 100 ms; show pending state during longer work                                    |
| Animation             | Prefer 60 fps for interaction; degrade effects if sustained performance falls below 30 fps or the device overheats            |
| Initial public shell  | Keep near the reported 1.5 MB baseline; review additions above roughly 2 MB before precaching                                 |
| Room loading          | Lazy-load heavy environments and keep only the active scene alive; dispose graphics resources on exit                         |
| Videos                | Separate explicit budget in MB, determined by inventory and phone capacity; no invented universal cap                         |
| Idle/background       | Suspend scene work while hidden; avoid unnecessary continuous rendering and repeated network polling                          |

Reduce reflections, shadows, particles, resolution and camera motion before sacrificing controls or content. A scene/poster fallback must preserve names, navigation and interactions. Use existing adaptive entrance tiers as documented, but tune from device measurements rather than adopting desktop frame rates as proof. Casino polish should focus on convincing objects and a reliable game loop before expensive room-wide rendering.

### Accessibility and recovery

Use semantic buttons/links and labelled fields, readable text, visible focus, sufficient contrast and minimum 44 × 44 CSS-pixel touch targets. Support VoiceOver, text enlargement and safe-area insets. Do not encode room availability, results or request states solely by colour, sound or animation. Avoid flashes and essential gesture-only controls.

Reduced motion removes camera travel, parallax, reel/wheel spectacle and long animated locks while retaining the same result and progression. Provide text for butler speech and captions/transcripts for birthday messages. Focus should move predictably after room changes/dialogues and return to the initiating control when dismissed. Test short screens and the keyboard over code/request fields.

Every loading/failed/offline state needs an intelligible next action: retry, return to lounge, retain draft, inspect request status, use downloaded content or seek organiser help. Technical diagnostic details should not dominate the club experience. Persistent critical status must not disappear with decorative dialogue.

## 12. Delivery priorities and release gates

**Fixed dates:** departure 22 October 2026; birthday 24 October 2026. These priorities govern scope, not the older eight-phase numbering. Complete an end-to-end experience before unlimited visual refinement.

| Priority                  | Required scope                                                                                                                     | Exit condition                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P0 — Midnight essentials  | Entrance, combined lounge, membership ceremony, guided navigation, screening room, approved videos and reliable midnight behaviour | Actual-iPhone rehearsal from locked entry through playable messages, including late/return/offline fallback paths |
| P1 — Birthday experiences | Privileges, concierge delivery, casino, vault, NFC hunt and physical gifts                                                         | Every enabled award/request has tested authority, recovery, real inventory and executable fulfilment              |
| P2 — Optional             | Secret Chamber, additional casino games, extra environmental polish and elaborate transitions                                      | Only after P0 is ready and selected P1 loops are reliable; omit freely under deadline pressure                    |

**Recommended implementation order, not evidence of work performed:**

1. Confirm phone, approved video inventory and midnight content immediately; prepare media in parallel with Claude's lounge/navigation implementation.
2. Complete lounge → screening → return as an uninterrupted P0 path; do not make it depend on the reward backend.
3. Rehearse P0 on the actual device and prepare verified downloads/local backup before departure where feasible.
4. Confirm gifts, privilege availability, booking facts, reward rules and notification channel; establish the smallest authoritative service needed for selected P1 loops.
5. Deliver complete request-to-fulfilment and casino-to-vault loops, then refine casino presentation substantially.
6. Rehearse physical NFC/QR placement and gift handover in the actual setting; recheck connectivity, clock and media before the birthday.
7. Add P2 only if time remains. Freeze optional changes when they endanger the tested path.

**Proposed operational gates:** pre-departure readiness on 21 October, travel-safe build/download check by departure on 22 October, and final Jamaica rehearsal on 23 October. These are planning targets; assign an owner and actual check time. Do not defer all hardening until midnight.

**Scope reduction:** omit the Secret Chamber, extra games and elaborate transitions first. Simplify environment rendering while retaining coherent art direction. If P1 authority or fulfilment is not reliable, disable the affected promise and provide an honest owner-operated alternative. This is a documented scope cut, not successful completion of the originally planned feature.

**Release evidence required:**

- P0: correct clock/zone behaviour, late arrival, resumption, ceremony skipping, unrestricted screening and return; all actual birthday videos checked.
- Device: Safari and standalone, VoiceOver/text scaling, reduced motion, no WebGL, low/variable connectivity, sleep/return and update behaviour.
- Offline: separate proof for cached shell and complete playable media; storage failure/eviction and independent backup covered.
- Rewards: duplicate round/scan/code, race between contexts, unknown response, interrupted reveal and no repeated physical award.
- Concierge: real delivery to husband, acknowledgement, fulfilment, provider outage, duplicate retry and unsent/stale requests.
- Operations: confirmed gifts/bookings, tested placed cards, access recovery, hosted routes, HTTPS and owner-approved content/privacy checks.

This documentation task runs no application checks and grants no deployment approval. Future implementation agents should record actual outcomes in their permitted workflow without converting these acceptance criteria into pass claims.

## 13. Confirmed decisions, proposals and open decisions

### Confirmed product decisions

Six core spaces; combined foyer/lounge; one member, Alise; scripted British butler; lounge as hub; guided journey plus directory; screening first and freely accessible after welcome; concise emotional midnight; persistent access after release; roulette/slots as planned casino attractions; shared casino/vault/physical reward system; executable real-world privileges; mobile-first offline-capable PWA; Secret Chamber optional and last. Birthday schedules use Jamaica time while the entrance retains its existing local-time behaviour.

### Proposals that must remain proposals

Exact environmental rendering outside the entrance; directory object; membership number/copy; film versus chapters; personalised title; camera choreography; prize-wheel/additional game; symbol selection; precise game rules/odds; NFC hunt structure; selection of candidate privileges; later-room order; automatic offline request replay; provider/data-model details; initial performance budgets and intermediate readiness dates.

### Open decision register

| Decision                                                        | Why it matters / safe boundary until resolved                                                              | Responsible role / needed by                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Actual iPhone model, OS and access for rehearsal                | Determines tested performance, storage, NFC and standalone behaviour; no device-certification claim        | Owner + implementer; immediately                          |
| Video inventory, permissions, duration and captions/transcripts | P0 content and offline size; do not show placeholders as the finished birthday film                        | Owner/content editor; before P0 media integration         |
| Final video delivery/download strategy                          | Complete, seekable offline playback and backup; no “offline ready” label for partial media                 | Implementer + owner; before departure rehearsal           |
| Membership number, butler name/copy and final card              | Avoid invented personal facts; keep unapproved fields absent                                               | Owner; before P0 approval                                 |
| Exact room release order/times                                  | Configure Jamaica schedule; do not invent countdowns                                                       | Owner; before later-room release                          |
| Phone timezone and intended midnight presentation               | Existing entrance local time may differ from Jamaica schedules; preserve behaviour pending explicit change | Owner; before device rehearsal                            |
| Physical gifts, quantities and box mapping                      | Prevent impossible awards and duplicates; do not enable unprepared inventory                               | Owner/husband; before reward configuration                |
| Casino prize allocations, repeat rules and outcomes             | Controls coherent animation, entitlement and replay; do not fix odds prematurely                           | Owner + implementer; before reward issuance               |
| NFC count, tag type, URLs and hiding locations                  | Supports real hunt and Safari/PWA recovery; no assumed tag compatibility                                   | Owner/husband + implementer; before programming/placement |
| Enabled privileges, limits and fulfilment availability          | Prevent unenforceable promises and duplicate services                                                      | Owner/husband; before enabling requests                   |
| Confirmed spa or other booking                                  | Only real details may be revealed                                                                          | Owner/husband; before publishing that privilege           |
| Backend, member auth, organiser access and recovery             | Required authority for valuable actions; no client-only redemption workaround                              | Owner + implementer; before live rewards/requests         |
| Notification channel and status evidence                        | Must reach husband's device and distinguish provider acceptance from acknowledgement                       | Owner/husband + implementer; before live privileges       |
| Offline request/award contingency and reconciliation            | Avoid duplicate/stale fulfilment; default to explicit pending/manual assistance                            | Owner + implementer; before P1 rehearsal                  |
| Private media hosting, retention and downloaded-device access   | Protect personal messages without breaking prepared playback                                               | Owner + implementer; before media release                 |
| Hosted deployment and rollback/recovery readiness               | Local production tests do not prove live routing or iPhone operation                                       | Deployment owner; before presentation                     |

Do not silently decide these in UI copy or code defaults. Resolve necessary decisions through the owner and update the responsible implementation records when authorised. Unknown personal content stays unknown.

## 14. Definition of success

Alise enters a place that feels made solely for her, understands its purpose without instruction and reaches the birthday messages with almost no friction. The emotional midnight sequence works even if she arrives late, skips animation or needs a simpler rendering path.

During the day she can explore at her pace, return to unlocked rooms and enjoy a casino that feels crafted. Every confirmed prize has a real gift or service behind it. NFC/QR discoveries lead somewhere useful, gifts are handed over once, and concierge requests have truthful, recoverable status. Her husband can reliably receive, acknowledge and fulfil what the app promises.

Success requires evidence on the actual iPhone, prepared videos and real-world logistics, with graceful offline and failure recovery. It is not measured by room count alone, a desktop screenshot, an installed icon or the presence of an untested notification button. P0 readiness is essential; reduced P1 scope must be stated honestly; omission of P2 is acceptable.

A new agent should be able to use this document to preserve the club's vision, distinguish current evidence from future intent, find unresolved decisions and continue implementation without inventing gifts, bookings, completion or infrastructure.
