# Implementation backlog

Statuses: **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **IMPLEMENTED**, **VERIFIED**.
Priority P0 is deadline/critical-path; P1 supports the experience; P2 is optional. Phase names/dates are proposed, not an externally confirmed agreement. VERIFIED applies only to each task's recorded checks.

| Phase / ID | Priority | Status      | Task / acceptance                                                             | Dependencies                | Critical path |
| ---------- | -------- | ----------- | ----------------------------------------------------------------------------- | --------------------------- | ------------- |
| 1 / F01    | P0       | VERIFIED    | Product, architecture, agent instructions, backlog and journal                | Brief                       | Yes           |
| 1 / F02    | P0       | VERIFIED    | Strict React shell, routes, Tailwind, Zustand, lint and tests                 | F01                         | Yes           |
| 1 / F03    | P0       | VERIFIED    | Manifest, icons, worker, readiness/update UI; offline browser check           | F02                         | Yes           |
| 1 / F04    | P0       | VERIFIED    | All foundation checks and handoff                                             | F03                         | Yes           |
| 2 / D01    | P0       | NOT STARTED | Approve creative direction and iPhone interaction prototype                   | F04, owner input            | Yes           |
| 2 / D02    | P0       | NOT STARTED | Confirm butler script, media inventory, prizes, member number, phone/iOS      | Owner input                 | Yes           |
| 2 / D03    | P1       | NOT STARTED | Define motion/accessibility/performance budgets                               | D01                         | No            |
| 3 / I01    | P0       | NOT STARTED | Invitation and scripted butler initiation                                     | D01, D02                    | Yes           |
| 3 / I02    | P0       | NOT STARTED | iPhone install guidance and membership card                                   | I01                         | Yes           |
| 4 / L01    | P0       | NOT STARTED | Members' Lounge navigation and butler event integration                       | I02, D01                    | Yes           |
| 4 / L02    | P1       | NOT STARTED | Cross-feature transition and accessible navigation checks                     | L01                         | No            |
| 5 / C01    | P0       | NOT STARTED | Define game/reward contracts and server validation model                      | D02, backend design         | Yes           |
| 5 / C02    | P1       | NOT STARTED | Implement selected casino games with deterministic rule tests                 | L01, C01                    | No            |
| 6 / B01    | P0       | NOT STARTED | Choose backend/auth/hosting; threat model and recovery design                 | D02, owner decisions        | Yes           |
| 6 / B02    | P0       | NOT STARTED | Authoritative entitlements/unlocks/idempotent redemption + integration tests  | B01, C01                    | Yes           |
| 6 / B03    | P0       | NOT STARTED | Vault and privileges UI with pending/offline handling                         | L01, B02                    | Yes           |
| 6 / B04    | P1       | NOT STARTED | Notification delivery, fallback, organiser tracking                           | B02                         | No            |
| 6 / B05    | P0       | NOT STARTED | Versioned IndexedDB and tested reconciliation/storage failures                | B02, agreed offline policy  | Yes           |
| 7 / S01    | P1       | NOT STARTED | Screening room, authorised videos and explicit download readiness             | L01, D02, B05               | No            |
| 7 / S02    | P0       | NOT STARTED | Secret clues/NFC/QR and physical surprise rehearsal                           | B02, D02, holiday logistics | Yes           |
| 8 / R01    | P0       | NOT STARTED | Real iPhone Safari + standalone online/offline/update/accessibility rehearsal | All selected experiences    | Yes           |
| 8 / R02    | P0       | NOT STARTED | HTTPS deploy, backup/recovery and Jamaica contingency rehearsal               | R01, B01                    | Yes           |
| 8 / R03    | P0       | NOT STARTED | Final content/security checks and reveal before 24 October presentation       | R02, confirmed reveal time  | Yes           |

Next recommended task after foundation: D01 creative direction, alongside D02 content/device confirmation. Start B01 design early because authoritative rewards depend on it; no backend implementation is needed for phase 1. Optional games/3D are first candidates for scope reduction.

## Handover and migration gate (before phase 2)

| ID  | Priority | Status      | Task / acceptance                                                                                                                             | Dependencies            |
| --- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| H01 | P0       | VERIFIED    | Audit existing foundation; provide migration/GitHub/Netlify instructions; rerun six application tests and one production offline browser test | F04                     |
| H02 | P0       | NOT STARTED | Copy to ~/Developer/the-thirty-club; verify content parity, Git metadata and checks                                                           | H01, user execution     |
| H03 | P0       | NOT STARTED | Review files, create first commit and connect empty private GitHub repository the-thirty-club                                                 | H02, user authorisation |
| H04 | P0       | NOT STARTED | Add/review Netlify routing and headers, configure build, preview and production workflow                                                      | H03, user authorisation |

Phase 2 remains NOT STARTED. Complete relocation and repository setup before resuming creative-direction development. Netlify deployment remains pending; H04 preparation does not imply a deployment occurred. See MIGRATION_HANDOVER.md.
