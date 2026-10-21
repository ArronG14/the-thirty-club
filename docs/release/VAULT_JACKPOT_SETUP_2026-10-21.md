# Gift Vault, Mystery Jackpot and Nyla: owner setup (21 Oct 2026)

Operator steps for the release blockers in `COMBINED_ACCEPTANCE_MATRIX.csv` (D01, D02, D08, C02, C08, C09). The machine-readable plan is `CONTROLLED_CONFIGURATION_2026-10-21.json`; `configuration-readiness.sql` checks the result read-only. Everything below is **LIVE configuration done by the owner in the Owner Console**. Nothing here has been run against production, and nothing in it sends a message, spends a spin or opens a drawer.

Verified locally by `netlify/backend/vaultJackpotSetup.test.ts` (the exact request shapes through the real owner routes into a disposable database) and by Codex's `storySequence.test.ts` (the 9 spins, the riddle-only reveal and the NFC-opened drawer).

## Order matters

1. **Not before the release is deployed.** The Vault desk's "Evening Mystery Jackpot" reward option and the milestones' "Physical gift compartment" mapping come with the story migration and code. Before that the live Console cannot bind them.
2. **The NFC tags cannot be written until their drawers exist**: each drawer's NFC address and backup code are minted by the server when the drawer is created.
3. Within the Console: **drawers first, then the jackpot prize (it needs the breakfast drawer), then the milestone mappings, then Nyla.**
4. Never press **Make ready** or **Open** on the breakfast drawer. The third evening spin readies it.

## What the code enforces (so a mistake fails safely)

- A Casino prize of kind **Gift Vault** must point at a drawer whose trigger is **Won in the Grand Casino** and which is still **Locked**; otherwise the save is refused and nothing is created (test 3).
- Issuing the evening batch fails (the milestone shows an error, nothing is issued) if `evening-jackpot` is missing or inactive or its drawer is not locked.
- The 14:30 session refuses to fire unless `nyla-film` is Active with a Film URL.
- UGG and AirPods scenes refuse to fire unless their mapped drawer is **Ready** and its opening time has passed.

## Schedule (unchanged, do not edit)

| Session | Jamaica                         | Spins | Prize on spin 3   |
| ------- | ------------------------------- | ----- | ----------------- |
| 1       | 23 Oct 09:00                    | 3     | `jamaica-drinks`  |
| 2       | 23 Oct 14:30                    | 3     | `nyla-film`       |
| 3       | 23 Oct 20:30 (24 Oct 01:30 UTC) | 3     | `evening-jackpot` |

## Owner decisions needed first (not invented here)

| #   | Decision                                                                                                                                          | Used in                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Drawer numbers (1–999, unique) for UGG, AirPods, breakfast                                                                                        | all three drawers         |
| 2   | UGG clue: where the key is, **without naming the gift** (Story Bible: by her pillow)                                                              | UGG "NFC clue"            |
| 3   | AirPods clue: where Albert and the key are, without naming the gift (Story Bible: Arron's bag)                                                    | AirPods "NFC clue"        |
| 4   | **AirPods reveal wording** after the key: the Bible approves the idea (her husband holds the present; ask him) but the exact text was never saved | AirPods "Gift location"   |
| 5   | **Breakfast reveal wording** (24 Oct, 10:30 Jamaica, Birthday Breakfast in Bed)                                                                   | breakfast "Gift location" |
| 6   | Where the breakfast key is hidden, consistent with the riddle (examples in the Bible: makeup bag)                                                 | physical placement only   |
| 7   | UGG and AirPods earliest-opening time (suggested: `2026-10-22T00:00:00Z`, so they can open as soon as you trigger them)                           | "May open from"           |

## Exact values, one drawer at a time

All three: **Owner Console → Butler's Office → Vault tab → Create a compartment**.

### A. UGG drawer

| Field               | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engraved number     | your number (decision 1)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| NFC clue            | decision 2                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Gift location       | the approved reveal, verbatim (317 characters, from the Story Bible and `STORY_COPY.uggReveal`):<br>`Excellent work, Madam. Your delivery has been successfully released from the Vault.` blank line `I am informed that the item itself has been placed in your shoe cupboard. Rather unimaginative on your husband's part, but I suppose we must be grateful he remembered where it was.` blank line `Do go and investigate. I shall await your verdict.` |
| Unlock trigger      | **Manual (you make it ready)**                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Before the birthday | tick "This compartment opens before 24 October"; zone as you prefer; "May open from" = decision 7                                                                                                                                                                                                                                                                                                                                                           |

Save. Copy the **NFC URL** and **Backup code** privately for the tag (never into chat). Then press **Make ready** only when the key is by the pillow and the gift is in the shoe cupboard.

### B. AirPods drawer

Same form: **Manual**, tick "opens before 24 October" with decision 7. Number: decision 1. Clue: decision 3. Gift location: decision 4. Save; copy the NFC URL and backup code; **Make ready** only when Albert and the key are in the bag.

### C. Breakfast drawer (the jackpot's drawer)

| Field                          | Value                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engraved number                | decision 1                                                                                                                                                                    |
| NFC clue                       | `Some treasures travel far without ever leaving your side. Seek where the little things you carry like to hide.` (the owner's riddle, verbatim; your placement must match it) |
| Gift location                  | decision 5                                                                                                                                                                    |
| Unlock trigger                 | **Won in the Grand Casino**                                                                                                                                                   |
| Casino reward that releases it | **Evening Mystery Jackpot — third session, 23 October** (`casino.evening-jackpot`)                                                                                            |
| Before the birthday            | tick it; zone **Jamaica**; "May open from" **23 Oct 2026 20:30** (= `2026-10-24T01:30:00Z`)                                                                                   |

Save. **Leave it Locked. Do not press Make ready or Open.** Copy its **Vault ID** (the Copy button on the card) for step D.

### D. The jackpot prize

**Owner Console → Casino & rewards → Add prize:**

| Field                       | Value                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Kind                        | **Gift Vault**                                                                                      |
| Casino Vault compartment ID | the breakfast drawer's Vault ID (step C)                                                            |
| Slug                        | `evening-jackpot`                                                                                   |
| Title                       | `A Most Extraordinary Victory!`                                                                     |
| Description                 | `777 Mystery Jackpot`                                                                               |
| Presentation                | any short text: the story migration shows the exact recovered 777 letter, which hides the breakfast |
| Active                      | on                                                                                                  |
| Owner notes                 | your private arrangement notes                                                                      |

If the save is refused, the ID is wrong or the drawer is not a Locked "Won in the Grand Casino" drawer (test 3).

### E. Map the UGG and AirPods chapters

**Butler's Office → Journey tab → the scene → story setup → "Physical gift compartment":** UGG scene `departure-ugg` ← the UGG drawer; AirPods scene `departure-airpods` ← the AirPods drawer; **Save story setup**. This clears approval and sends nothing. The scenes still need their reviewed SMS and your approval (a separate task).

### F. Nyla's film

**Casino & rewards → "A message from Nyla" → Film URL `/api/v1/media/nyla-film`, Active on → Save.** Change nothing else (the form is pre-filled). Never paste a signed or `r2.cloudflarestorage.com` address.

## Check (read-only)

Run `docs/release/configuration-readiness.sql` in the Supabase SQL editor after A–F: **CFG01** (two real drawers, ready), **CFG02** (jackpot linked, drawer still locked), **CFG03** (Nyla reference) and **CFG08** (nine spins) must be true. CFG04–CFG07 and CFG09–CFG11 belong to the card, copy approval and arming tasks.

## Not done by this document

Real NFC tags and physical placement; the AirPods and breakfast wording; the personal card; SMS review and scene approval; the Netlify deploy and migration; the iPhone rehearsal.
