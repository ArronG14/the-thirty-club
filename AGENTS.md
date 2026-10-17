# Instructions for every coding agent

1. Read PROJECT.md, ARCHITECTURE.md, TASKS.md and BUILD_LOG.md before changes.
2. Respect confirmed architecture and approved design; label proposals explicitly.
3. Inspect existing implementation and git status before adding competing code.
4. Keep changes scoped. Avoid unrelated refactoring and new dependencies without need.
5. Never overwrite another agent's work without understanding it. Coordinate ownership; preserve unrelated edits.
6. Use strict TypeScript, keep domain/application state separate from presentation, and maintain clear feature boundaries.
7. Run relevant tests, lint, formatting and build checks after implementation. Record actual outcomes; do not imply unrun checks passed.
8. Update BUILD_LOG.md and TASKS.md after every meaningful task. Use only NOT STARTED, IN PROGRESS, BLOCKED, IMPLEMENTED, VERIFIED. IMPLEMENTED means code exists; VERIFIED means the stated acceptance checks passed, not production certification.
9. Document architectural decisions and unresolved questions in ARCHITECTURE.md. Do not quietly introduce a backend or client-authoritative redemptions.
10. Report incomplete, simulated, unavailable and offline functionality plainly. Never ship controls that appear to work but do nothing.
11. Preserve luxury direction and mobile-first requirements: iPhone Safari, standalone PWA, safe areas, accessibility and reduced motion. Do not treat installation as proof of offline support.
12. Do not build the casino, gift vault or screening room as part of foundation work. No live AI unless specifically requested.

Every BUILD_LOG entry must include date/time with timezone, responsible agent, task, summary, created/modified files, checks and results, known issues, remaining work and relevant commit hash (or unavailable). Planned features are never recorded as completed. Do not commit private content, secrets or generated build/dependency folders. Run `npm run check` for the default code gates; `npm run test:pwa` separately checks the production worker with Playwright Chromium installed.
