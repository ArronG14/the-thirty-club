# Proposed synchronisation for the four canonical Google Docs

**20 October 2026, Claude (Opus 5.5).** The Drive connector in this session required authentication, so the four documents in folder `1SHxqxYLVsJxC3ehdl0EDVn3jG5PdgcLb` were **not read and not updated** by this agent. The text below is what should be added or replaced so they match `feature/birthday-final-integration` revision 3. Where the docs say something different from what is assumed here, the repository (ARCHITECTURE ADR-023, `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`) is the reference for implemented behaviour.

## 00 START HERE — Thirty Club AI Handover

Replace the "current release position" paragraph with:

> Release candidate: `feature/birthday-final-integration`, revision 3 (ADR-023), the commit recorded in `BUILD_LOG.md` (20 Oct late evening). Not merged, pushed or deployed. Codex's NO-GO on `e0d3509` (`f7eff13`) answered: Casino cancellation consistency (P1-A) and cross-device membership (P1-B) fixed with regression tests; the original SMS P0 fix preserved. Hosted Supabase still has only the nine baseline migrations; **five** release migrations are pending (`20261022090000` → `…100000` → `…110000` → `…120000` → `20261022130000_membership_card_admission`). LIVE communications remain held. The £100 Shopping Privilege remains in Netlify Blobs. Twilio Auth Token rotation is still required. A fresh Codex audit of the revision-3 commit is required before deployment.

Add to "critical warnings":

> - Do not open the LIVE membership-card URL to test it: it records the card as presented and notifies Arron. Read the tag instead; rehearse with the TEST card URL.
> - The 19:00 letter's clue must be written in the Control Centre before 19:00, or the milestone fails (by design) and the doors stay at 00:00:10 until it is written and retried.

## 01 Product Vision and Decisions

Add a decision:

> **Wednesday 21 October — physical membership card (decided 20 Oct, ADR-023).** At 16:00 UK the Butler's teaser (owner-approved); the entrance counts down to 19:00 UK. At 19:00 the Butler's formal letter: early admission arranged, the membership card has been delivered, and a clue (owner-written) to where it is. The clock holds at 00:00:10 until the card is scanned. The scan opens the final ten seconds, the doors, the welcome and the Lounge — one continuous experience, even if the scan opens a new Safari tab. The card is her member credential on any device thereafter (a second scan on another device goes straight to the Lounge); it is never an owner credential. The printed number on the card is the fallback.

## 02 Build Status and Next Actions

Replace the status lines for early admission and Casino with:

> - Early admission with the NFC membership card: IMPLEMENTED and locally VERIFIED (unit, server and browser tests incl. a new-tab NFC flow and an iPhone-profile run). Not deployed; no physical iPhone/NFC run yet.
> - Casino cancellation consistency (Codex P1-A): fixed; a promised batch cannot be cancelled unless a replacement is issued first.
> - Cross-device membership (Codex P1-B): fixed; the card scan establishes the member session; acceptance retried until recorded.

Next actions (owner, in order): Codex re-audit of revision 3 → owner approval → backup → five migrations → Twilio rotation and Netlify variables (incl. a strong `CREDENTIAL_MEMBERSHIP_TOKEN`) → deploy → post-deploy checks → programme and read back the card; programme a TEST card → physical iPhone rehearsal → 21 Oct: write the clue, release hold, LIVE, approve teaser before 16:00, resume `early-membership`, hide the card.

Storyline (22–24 Oct): see `docs/release/STORYLINE_DEPENDENCY_MAP.md` — first dependency is a per-compartment Vault opening time (the Vault currently refuses all openings before 24 Oct 00:00 Jamaica).

## 03 Copy-Paste New Chat Handover Prompt

Update the repository section:

> Integration worktree `/Users/ag14/Documents/Projects/the-thirty-club-final`, branch `feature/birthday-final-integration`, head = revision 3 (ADR-023; see `BUILD_LOG.md`). Read `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md` §0 first. Five pending release migrations. Codex audit worktree `~/Documents/ChatGPT/30club/independent-p0-audit` (`codex/final-release-verification`, last audit `f7eff13` on `e0d3509`).
