# A Note from Doja — release candidate

**Branch:** `codex/fromdoja-2026-10-22`, based on production `2bacacfeedb0f6067cdb92723a61902b50bfe6ba`. This candidate is local only.

## Experience

The NFC card carries `https://30.ag14.co/fromdoja`. Direct navigation and refresh start with the Butler's short introduction and the single **See Note** action. The letter then occupies the document without club navigation, membership checks or birthday timing. The small `d` seal opens Doja's writing desk. Its password is checked by the Netlify Function before the fields appear; saving checks it again. Closing the editor returns to the letter.

The stationery uses the club's ivory, walnut, oxblood and champagne palette and its shared type families. On Apple platforms, the salutation and signature prefer Snell Roundhand with local fallbacks; Cormorant Garamond remains a legible final fallback. React renders text nodes, not HTML. The message uses `white-space: pre-wrap` so authored punctuation, paragraphs and line breaks survive. The page grows vertically for long letters.

## Storage and configuration

- Function: `/.netlify/functions/fromdoja`.
- Store: Netlify Blobs `fromdoja`, key `letter`, strong consistency. Only `addressedTo`, `message`, `from` are persisted.
- `GET` is public, uncached, and returns `null` until Doja saves. `POST` accepts only a correct `Authorization: Bearer` shared password. `POST ?verify=1` checks the password without writing.
- Set `DOJA_LETTER_PASSWORD` in Netlify's Functions environment to the owner-approved value **before** publishing the page. Do not prefix it with `VITE_`, put it in Git, or reuse Owner Console credentials.
- No Supabase migration, existing Blob key, or production record change is required. Doja's saved words survive deployments and appear on another device through the public read.
- This password deters casual visitors. It is intentionally simple and does not offer account-level security. The write scope is one fixed key in a separate store.

## Review and integration

1. Review this branch's diff and local screenshots in `review/fromdoja/` (sample words are only in the screenshots; the screenshots are untracked and not part of the site).
2. Set the Functions-only variable. Integrate this single feature commit onto the then-current release branch. Since the branch starts at the approved production SHA, inspect the merge diff against that release head before merging. Keep all existing story and vault work.
3. Run `npm run check` and a Netlify Functions bundle on the integrated candidate. Confirm the final deploy's SPA edge rule serves `/fromdoja` and leaves `/.netlify/functions/fromdoja` outside the SPA fallback.
4. After explicit owner approval, deploy the integrated candidate. Doja opens the private seal and saves her actual three fields. Until then, Alise sees the intentional empty paper.
5. On two devices or separate browser sessions, verify the saved letter and line breaks; refresh to confirm the introduction returns. Reopen the editor with a wrong password to confirm rejection. Test the programmed NTAG215 card on Alise's iPhone Safari. Do not enter the real letter during a test or create a fabricated production message.

**Rollback:** redeploy the preceding site build. The dedicated Blob remains intact for a later forward release. No migration rollback or change to concierge records is involved.
