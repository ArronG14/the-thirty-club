# Private owner access

On the Grand Entrance, tap the brass countdown clock **five times within three seconds**, then enter **1414**. There is no visible hint. The same gesture works on the SVG fallback and on the clock in the Three.js entrance. The transparent HTML hit area follows the projected clock plate and uses completed touch-generated clicks with `touch-action: manipulation`, avoiding Safari double-tap zoom and duplicate event counting. Activation waits for the completed click so WebKit cannot send the same tap through to a newly opened dialog control.

After authentication, the **Owner · test mode** button opens the private office from every implemented room. The panel is a scrollable native modal with keyboard focus containment and Escape/Close support.

- **Enter Club** skips the door and membership ceremonies and opens the lounge.
- **Visit a room** offers the lounge, screening room and casino. Unimplemented rooms are omitted.
- **Preview birthday unlock** starts five seconds before local midnight and runs the existing door opening and membership presentation. It does not change the actual 24 October 2026 release date or the phone clock.
- **Return to locked entrance** clears the test entrance/membership unlock latches and simulates the day before the birthday. It preserves test casino prizes and screening progress.
- **Casino test controls**, inside the casino, reuse reset, completed state, next jackpot, chip top-up, forced outcomes, reward awards and record inspection. These operate exclusively on owner test data.
- **Reset test progress** clears all owner records (including screening, casino, prizes and the optional film marker), then returns to the locked rehearsal. Alise’s records are untouched.
- **Exit owner mode** clears the owner authorization and test records and returns to the real guest entrance and real clock. Use this before handing over your phone.

## Session and storage

Authorization and test records use `sessionStorage`, never a persistent login or guest `localStorage`. Refreshes and navigation in the same tab preserve the owner session. Closing that tab and opening a fresh tab ends authorization; an independent visitor tab has no owner access. Browser “restore closed tab/session” features can restore browser session storage, so explicitly use **Exit owner mode** before handing over a device rather than relying on force-quitting Safari or backgrounding the app. Closing/backgrounding Safari is not necessarily the end of its page session.

Test keys begin `thirty-club:owner:`. Entrance, membership, screening, casino and prizes retain their existing serializers and parsers. Owner mode never reads, copies, consumes or deletes the guest’s rewards. Storage selection is fixed for a document’s lifetime; changing modes reloads the document, so late room cleanup cannot accidentally write into guest storage. If session storage cannot be written, authentication fails closed.

No backend or external authentication is used. The hardcoded PIN is a discreet convenience gate, not encryption or protection for the public JavaScript bundle, media or reward codes. Existing limitations on client-side rewards remain unchanged.

## Configure the PIN

Edit `OWNER_PIN` in `src/features/owner/session.ts`, keeping it four numeric digits, then commit and push so Netlify rebuilds. The current value is `1414`, intentionally included at the owner’s request. Update the test PINs in `session.test.ts` and `tests/owner.spec.ts` when changing it. Do not place private server credentials in this configuration.

## Verification

Run `npm run check`, then `npm run test:pwa -- --workers=1`. The owner browser cases are in `tests/owner.spec.ts`; run them independently with `npx playwright test tests/owner.spec.ts --workers=1`. These run against the production build, including the normal guest gate and ignored development preview parameters. WebKit can be exercised with `--browser=webkit` when installed. A physical iPhone Safari and Home Screen rehearsal remains necessary for real-device rendering, safe areas and GPU performance.

The screening room currently has no real birthday messages, and casino content still includes existing placeholders. Owner access does not fabricate or replace that content.
