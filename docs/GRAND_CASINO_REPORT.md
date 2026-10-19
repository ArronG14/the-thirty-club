# THE GRAND CASINO — OVERNIGHT BUILD REPORT

> Historical report for the browser-ledger Casino. The production Casino on `feature/casino-rewards-vault` now uses authoritative PostgreSQL spins and a single reel presentation. See `docs/CASINO_REWARDS_INTEGRATION.md` for the current implementation and its Journey integration dependency.

Built unattended on the night of 17–18 October 2026 (BST). Everything below
was implemented in this run; anything not verified is said so.

## What was built

- **The Grand Casino**, a new room at `/rooms/casino`, reached from the
  Members' Lounge directory and the butler's "Continue your evening" guidance
  (it was already scheduled to open at 2 pm Jamaica time on 24 October).
- **A real-time 3D lobby** (Three.js): marble floor with a brass compass
  inlay, oxblood velvet damask walls with walnut dado and brass panelling,
  pilasters, curtains, picture frames, an Art Deco ceiling, a tiered crystal
  chandelier, banquette, tub chairs and a champagne table. Two focal points:
  the roulette table and the slot machine. Tapping either (or its button)
  sends the camera along a deliberate path to it, and the game panel opens
  on arrival.
- **Roulette**: a 3D European wheel (37 pockets in the true order, frets,
  cone, turret, ivory ball) on a felt table with a padded rail; bets on red,
  black, odd, even, 1–18, 19–36, the three dozens and any single number;
  chips of 10/50/100/500; undo and clear; a stack of chips on the felt.
- **Slots**: an antique machine in burgundy enamel and brass with three
  textured reels, a lever, a marquee, a bulb chase and amber backlit panels;
  seven vector symbols (diamond, crown, golden key, champagne, rose, Thirty
  Club emblem, 30), a paytable, a staggered stop and a payline highlight.
- **The prize engine** (`src/features/prizes/`), game-agnostic, plus six
  casino rewards across all five reward types, a skippable reveal, a
  collection sheet and the Gift Vault contract.
- **The butler** speaking in the casino, rationed and never repeating.
- **Sound** synthesised with Web Audio (wheel, ball ticks, chips, reels,
  wins, reveal, a quiet room tone), off until a tap, with a mute switch.
- **A flat fallback** that keeps both games fully playable without WebGL.
- **Dev tools** (reset, force an outcome, award a reward, completed state,
  inspect) and dev previews; absent from production.

## Visual design

Monte Carlo × Mayfair × Art Deco: oxblood velvet, polished walnut, black
marble, antique brass and champagne gold, green felt, warm amber light.
Layered materials (clearcoat marble, sheen velvet, brushed and polished
brass), a single shadow-casting house light, a spot on each station, bloom
and grain. The interface is engraved-brass plaques in the club's own type
(Bodoni Moda, Cormorant Garamond, Jost), with the game in the upper half of a
portrait iPhone and the controls in the lower half. Captures of every state
are in `docs/casino/` (portrait 390×844 and landscape 844×390).

## Architecture

- `src/features/prizes/`: `rewards.ts` (types, `validateCatalog`), `ledger.ts`
  (counters, eligibility, `awardEligible`, `claim`, views, reveal queue),
  `ledgerStorage.ts` (versioned persistence, `migrate`), `vaultContract.ts`
  (`createPrizeReader`), `clubRewards.ts` (the aggregate catalogue).
- `src/features/casino/domain/`: `roulette.ts`, `slots.ts`, `casinoState.ts`
  (`playRoulette`, `playSlots`, `claimReward`), `casinoRecord.ts`, `butler.ts`.
- `src/features/casino/config/`: `casinoRewards.ts` (prizes and progression),
  `casinoRules.ts` (chips, limits, scripts), `casinoAssets.ts` (asset
  registry).
- `src/features/casino/scene/`: `casinoMath.ts` (pure camera, wheel and reel
  motion), `CasinoScene.ts`, `casinoArchitecture.ts`, `casinoStations.ts`,
  `casinoTextures.ts`, `symbolArt.ts`, `CasinoCanvas.tsx` (lazy).
- `src/features/casino/ui/`: `Casino.tsx` (orchestration), `RoulettePanel`,
  `SlotsPanel`, `RewardReveal`, `CollectionSheet`, `FallbackStage`,
  `EntranceFilm`, `useButler`, `casino.css`. `audio/casinoAudio.ts`.
  `dev/` (development only).
- Decisions (full text in ARCHITECTURE.md, ADR-010):
  1. One scene, one WebGL context. The wheel and reels live in the lobby and
     the camera travels to them: no second heavy scene, nothing to leak.
  2. Outcome first, animation second. Every play is resolved and saved before
     it animates, so a refresh mid-spin is safe.
  3. Animation is derived from the result by pure maths that is unit-tested
     to end on the engine's answer.
  4. Prizes depend on no game; the casino depends on prizes.
  5. No backend, no client-authoritative value: this is a ceremonial layer.
- No new dependencies. The casino chunk is about 18 KB gzip and the scene
  about 16 KB gzip, sharing the existing three.js chunk.

## Game mechanics

**Roulette.** European single-zero wheel; standard odds (35:1 straight, 2:1
dozen, 1:1 outside, zero loses outside bets). Table minimum 10, maximum 1,000
chips. Scripted outcomes (`casinoRules.ts`): spin 1 win, 2 lose, 3 win, 4 lose,
5 win, then fair random. A scripted win picks a number that wins the slip; a
scripted loss one that loses every bet; a step that cannot be honoured falls
back to random. Limit 80 spins per device; chips top up to 500 if she cannot
cover the minimum.
**Ball and wheel.** The wheel turns counter-clockwise, the ball runs clockwise
on the track, both decelerate, the ball drops and hops into the winning
pocket and rides it while the wheel coasts to rest. About 8 seconds
(about 2 under reduced motion).

**Slots.** Three reels of twelve; one payline. A pair from the left pays 2×, a
triple pays by symbol (6× to 40×), three Thirties pay 100× (the jackpot). Stake
10 chips. The outcome is chosen as a class, converted to stops and
re-evaluated from them. Script: pair, miss, miss, triple, miss, miss, then the
jackpot on spin 7; after that random (62% miss, 28% pair, 10% triple), and the
jackpot is never offered by chance once it has paid. Limit 80 spins.

## Prize system

- **Rewards** (`casinoRewards.ts`): The First Fortune (collectible, first
  roulette win); The Croupier's Clue (clue, third roulette win); The Lucky
  Number (mystery, a straight-up win); The Gilded Reel (collectible, first
  slot win); Vault Key I (vault code, the slot jackpot); The House Favour
  (privilege, once both the clue and the vault key are claimed).
- **Winning vs receiving.** Games bump counters; only `awardEligible` awards,
  once, ever. Awarded rewards stay `unclaimed` until she claims them.
- **Persistence.** `thirty-club:prizes` (shared ledger) and
  `thirty-club:casino` (chips, spins, sound), both versioned with defensive
  parsing and a one-step migration mechanism. Unreadable data degrades to a
  fresh record; a "claimed" with no timestamp reads as unclaimed.
- **Gift Vault.** `createPrizeReader(storage, catalog)` exposes
  `vaultGrants()`, `isVaultUnlocked()`, `matchCode()`, `claimed()`,
  `rewards()`. Example and notes: `docs/PRIZE_SYSTEM.md`.
- **Caveat.** Unlock codes ship in the client bundle: not secure. Fine for a
  ceremony, not for anything of value (ADR-003).

## Testing

| Command                                                            | Result                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run check` (typecheck, lint, format, unit tests, build)       | PASS: 310 tests in 28 files (131 in the casino and prize suites) |
| `npm run test:pwa -- --workers=1` (production-build browser tests) | PASS: 17 (14 existing, 3 casino)                                 |
| `npm run capture:casino` (full-quality 3D capture)                 | PASS: 2 tests, 14 screenshots                                    |

- Unit: wheel order and colours; every bet type; settlement; outcome
  generation and scripts including unhonourable steps and exhausted scripts;
  slot strips, evaluation and class-to-stops; the reward catalogue;
  eligibility, one-time awards, claiming and duplicate prevention; chained
  claims; persistence, repair, migration and refusal of newer versions; the
  vault contract; ball-ends-in-pocket for all 37 pockets × start angles; reel
  plans for every start and stop; camera paths; the optional entrance film;
  optional-texture fallbacks; dev seeds.
- Component (jsdom, flat fallback): entering, betting, spinning, results,
  reveal, claim, skip and "keep for later", refresh mid-reveal, rapid taps,
  switching games, collection, completion, spin limit, sound, reduced motion,
  focus return, corrupt storage.
- Browser (production build): the same journey in a real browser, reload with
  progress, corrupt storage, no dev tools; plus all existing entrance, lounge,
  screening and PWA tests, unmodified.
- Two existing unit tests were updated, not weakened: the "built rooms" list
  now includes the casino, and the "still being prepared" case now uses the
  Gift Vault (the casino is built).
- **Not tested:** a physical iPhone; audio by ear; the 3D lever tap; the dev
  tools panel and `?preview=casino-*` URLs in a browser (a dev server could not
  be started in this run); the optional entrance film with a real video.
- During this run the Browser pane's dev server was declined, so the room was
  verified through Playwright against a production build and a look-dev build
  (`VITE_CASINO_LOOKDEV`, software rendering at full quality).

## Performance

- Optimisations: lazy chunk; one scene and one WebGL context, fully disposed
  on exit with forced context loss; static geometry merged per material; one
  shadow-casting light, switched off on the lower tiers; pixel ratio and bloom
  tiers with an automatic downgrade and a fallback to the flat stage; 30 fps
  idle throttle; canvas textures sized for need; instanced bulbs, frets and
  chips; synthesised audio (no files).
- Measured (software-rendered, slots view, look-dev build): 81 draw calls,
  about 51,500 triangles, 50 textures, 79 geometries.
- **Concerns:** the scene has not been run on an iPhone. Sheen velvet, clearcoat
  floor and wheel, bloom and one shadowed spot are the likely costs; the tier
  system should shed them, but this needs a real-device pass (task C06).

## Git

- Branch `main`. Commits this run: `f0eb44c` (prize and game domain),
  `a6da56e` (lobby, games, reveal, integration), `0368753` (landscape framing,
  focus return, optional-asset tests, capture tooling, docs), then the commit
  that adds the dev-seed tests, this report and the build log.
- Push status: pushed to `origin/main` (fast-forward from `073645b`, nothing
  overwritten) with head `3159b23`. A last docs-only commit records this
  paragraph; its hash is in the final message of the run.

## Outstanding issues

1. Never run on a real iPhone (frame rate, memory, WebGL context, safe areas).
2. Placeholders awaiting the owner: clue text, Vault Key code `TC-0000` and
   vault id, House Favour privilege, the emblem art. Reward names, chip
   economy, scripts and spin limits are provisional creative choices.
3. Unlock codes in the bundle are discoverable (not secure).
4. The 3D lever tap, the dev panel and the dev preview URLs are unexercised in
   a browser; the entrance film has never played a real video.
5. The ball resting on the printed number was not confirmed pixel for pixel
   (the maths is proved by tests; one slot spin was confirmed by eye).
6. Wheel numbers are small on a phone; the real wheel is for atmosphere and the
   result is also shown large in the panel.
7. The brass cove light along the cornice is bright and may need softening;
   the walls read quite dark in the lobby.
8. Landscape was reviewed for the lobby and roulette only; the slot machine in
   landscape was not captured.
9. There are no app-wide audio controls in the club to respect; the casino has
   its own mute, persisted.
10. A newer-version prize record is read as empty (not overwritten until the
    next save): acceptable for one user.

## Tomorrow's review

1. Open `docs/casino/` and look at every picture before anything else.
2. On the iPhone: lobby, camera moves, roulette spin, slot pull, reveal; note
   frame rate, heat and any blank or black canvas. Rotate the phone.
3. Play the scripted run: roulette win, lose, win, lose, win (clue on the third
   win); slots pair, miss, miss, triple, miss, miss, jackpot (vault key on the
   seventh).
4. Decide the real clue, vault code and id, and House Favour; replace the
   placeholders (`casinoRewards.ts`).
5. Read the butler lines (`domain/butler.ts`) for tone.
6. Check sound with the phone's ringer on and off.
7. Review the asset list below and commission what you want.
8. Dev: `npm run dev`, open the dev menu, try the Casino group and the panel.

## AI asset requirements

All optional; every one has a procedural stand-in. Drop files under
`public/images/casino/` and set `src` in `src/features/casino/config/casinoAssets.ts`.

| Key             | Size                                          | Where                                                                                                                  |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `wallArtCentre` | 1536 × 2048 (3:4)                             | Large frame on the back wall between the curtains                                                                      |
| `wallArtLeft`   | 1024 × 1536 (2:3)                             | Left wall, beside the roulette table                                                                                   |
| `wallArtRight`  | 1024 × 1536 (2:3)                             | Right wall, above the banquette                                                                                        |
| `slotMarquee`   | 1536 × 384 (4:1)                              | Backlit marquee at the top of the slot machine                                                                         |
| `ceilingMural`  | 2048 × 2048                                   | Ceiling medallion around the chandelier                                                                                |
| `reward*` (six) | 768 × 768                                     | Reveal cards: First Fortune, Croupier's Clue, Lucky Number, Gilded Reel, Vault Key I, House Favour                     |
| `entranceVideo` | 1080 × 1920 (9:16), 6–10 s, H.264, under 8 MB | Optional cinematic before the lobby (skippable; once per session; skipped under reduced motion; falls back on failure) |

Also worth commissioning: the real Thirty Club emblem for the reels and
marquee (a stand-in star in a ring is used), and the croupier's card and
vault-key artwork for the reveal.

## Sleep prevention

The sleep-prevention process (PID 58438, `caffeinate -dimsu -t 43200`) is
released as the very last action of the run, after this report is committed, so
its outcome is stated in the final message of the run (the report file cannot
contain an event that happens after it is written).
