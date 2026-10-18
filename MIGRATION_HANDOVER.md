# The Thirty Club — audit and migration handover

> Current-state note (17 October 2026): the active project is now `/Users/ag14/Documents/Projects/the-thirty-club`, on main with existing commit c02dd3e and an origin remote. The audit, original paths and migration commands below are a historical snapshot; do not run those old copy commands for the current project. Netlify repository configuration is now implemented locally (see ARCHITECTURE.md ADR-005 and README.md), but no deployment has been performed by this task. Hosting/iPhone verification remains pending.

Audit: 17 October 2026, Europe/London. No relocation, new repository initialisation, commit, remote creation, push, Netlify connection/deployment or phase 2 development was performed. Existing application source/configuration is unchanged. Requested test runs regenerated ignored build/test outputs. Only .gitignore additions, journal/backlog appendices and this new report were written.

## 1. CURRENT PROJECT LOCATION

- Absolute project root: `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club`.
- Chat working directory: `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt`.
- OS: macOS 26.5.1, build 25F80; Darwin 25.5.0, arm64 Apple Silicon.
- Environment: local Codex desktop shell with restricted filesystem/network permissions. This is a persistent ordinary Mac directory under Documents, not a container, temporary remote checkout or isolated cloud workspace. Export/download is unnecessary. The generated chat folder is still an awkward permanent development home.
- Requested destination: `/Users/ag14/Developer/the-thirty-club` (`~/Developer/the-thirty-club`). It did not exist at audit time; commands below recheck safely by exclusive directory creation.

## 2. PROJECT STATUS

Foundation only. React 19.3.1, React DOM 19.3.1, React Router 7.18.4, Zustand 5.0.15. Toolchain: TypeScript 6.0.3, Vite 8.3.4, React Vite plugin 6.1.2, Tailwind 4.3.3, Vite PWA 2.0.0, Workbox build/window 7.4.1, ESLint 10.13.0, typescript-eslint 8.71.2, Prettier 3.9.10, Vitest 5.0.5, jsdom 29.1.1, Testing Library React 16.3.3/jest-dom 7.0.1 and Playwright 1.64.1. Supporting type/lint packages are listed in package.json; package-lock.json records exact dependency resolution. No animation/3D/IndexedDB/backend packages are present.

Node **22.13.1**, npm **10.9.2**. `.nvmrc` pins 22.13.1; package engines allow `^22.13.0 || >=24.0.0`. Match the tested pin for relocation/initial build; evaluate upgrades as a separate tested change.

Directory tree, excluding dependencies, build/test output, caches and Git internals (`.git/` also exists):

```text
the-thirty-club/
├── public/
│   ├── apple-touch-icon.png
│   ├── favicon.svg
│   ├── pwa-192.png
│   ├── pwa-512.png
│   └── pwa-maskable-512.png
├── src/
│   ├── app/
│   │   ├── App.test.tsx
│   │   └── App.tsx
│   ├── features/
│   │   └── foundation/
│   │       └── FoundationPage.tsx
│   ├── shared/
│   │   ├── pwa/
│   │   │   └── PwaStatus.tsx
│   │   ├── state/
│   │   │   ├── connectivityStore.ts
│   │   │   └── useConnectivity.ts
│   │   └── ui/
│   │       └── AppShell.tsx
│   ├── styles/
│   │   └── global.css
│   ├── test/
│   │   └── setup.ts
│   └── main.tsx
├── tests/
│   └── pwa.spec.ts
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── ARCHITECTURE.md
├── BUILD_LOG.md
├── MIGRATION_HANDOVER.md
├── PROJECT.md
├── README.md
├── TASKS.md
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

Scripts:

| Script       | Action                                     |
| ------------ | ------------------------------------------ |
| dev          | vite --host 127.0.0.1                      |
| build        | tsc -b && vite build                       |
| preview      | vite preview --host 127.0.0.1              |
| typecheck    | tsc -b                                     |
| lint         | eslint .                                   |
| format       | prettier --write .                         |
| format:check | prettier --check .                         |
| test         | vitest run                                 |
| test:watch   | vitest                                     |
| test:pwa     | npm run build && playwright test           |
| check        | typecheck, lint, format:check, test, build |

PWA: generated Workbox service worker in production only; prompt-based updates; precaches local HTML/JS/CSS/SVG/PNG/manifest (16 entries, ~279 KiB). No runtime API/video caching. Standalone manifest uses root scope/start/id, en-GB, 192/512 PNGs including maskable icon, plus Apple touch icon/meta. Offline API navigation is excluded from shell fallback. First successful online visit is required; future media/rewards are not offline-ready by implication. iPhone Safari 16.4 is the stated baseline.

Routing: BrowserRouter with `/` entrance and `*` not-found page; requires a server SPA rewrite for direct navigation. State: ephemeral connectivity hint only, no domain persistence.

Environment variables: **none required**, none read by application/configuration, no .env files or .env.example present. No backend credentials are needed. Never place secrets in VITE_*: client build variables become public.

Deployment configuration: no netlify.toml, public/_redirects, public/_headers, .netlify state, GitHub Actions pipeline or hosting integration. Existing .nvmrc and README contain generic build/deployment guidance.

Tests rerun during audit:

- `npm run check`: **PASS** — strict typecheck, ESLint, Prettier, six tests in src/app/App.test.tsx, and production build/service-worker generation.
- `npm run test:pwa`: **PASS** — one Chromium browser test checks precache readiness, manifest/icons, offline reload under service-worker control, unknown-route recovery and failed offline API fetch. Localhost/browser access used an approved elevated run.
- No test failures in this audit. A harmless NO_COLOR/FORCE_COLOR tooling warning appeared. These results do not certify Netlify, Safari or physical iPhone installation/update behavior. No fresh npm security audit was performed; the previous build log's zero-vulnerability result is historical.

## 3. DOCUMENTATION STATUS

All required files exist:

- `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club/PROJECT.md`
- `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club/ARCHITECTURE.md`
- `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club/BUILD_LOG.md`
- `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club/AGENTS.md`
- `/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club/TASKS.md`

Documentation accurately distinguishes the implemented shell from planned club experiences, backend, IndexedDB and creative direction. Journal results matched rerun tests. Phase 1 verification is local foundation verification only.

Missing information before this audit: permanent-folder copy/verification procedure, GitHub connection procedure, specific Netlify settings and migration tasks. This report and appended journal/backlog entries now provide that preparation. Architecture's “hosting undecided” remains accurate because Netlify is a preferred target, not configured hosting; its exact settings below are proposals. Eight-phase names remain proposed. Phone/iOS, content, authentication, reward rules, reveal time and real-device validation remain open. No existing documentation was rewritten to imply migration/deployment completion.

## 4. GIT STATUS AND GITHUB PREPARATION

Existing `.git/` is an ordinary independent repository; branch **main**, no remotes, no commits and no tracked/staged files. `git log -1` therefore exits 128 with “your current branch 'main' does not have any commits yet”; this is an unborn branch, not damaged history. All source/configuration/docs are currently untracked. No history has been removed, reset or reinitialised.

.gitignore already excluded node_modules, dist, coverage, Playwright output, `.env*` (except intentionally shareable `.env.example`) and .DS_Store. Appended local .cache/.vite/.netlify, TypeScript build info, logs/temp/editor backups and additional OS artefacts. No .env.example exists; if created later it must contain safe placeholders only. Ignoring a file never removes secrets already tracked in an existing repository; there are no tracked files here.

After relocation verification and explicit approval to publish, create an **empty private** GitHub repository named **the-thirty-club**, without README/license/.gitignore auto-creation. Retain copied .git metadata; do not run git init. Review `git status --short`, `.gitignore`, files and staged diff; create the first commit, add the new remote and push main. If any remote/history appears before then, stop and inspect rather than overwrite it. GitHub's [existing local code workflow](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) supports adding a remote to the existing repository.

The following is a **later procedure, not executed**. Replace YOUR_GITHUB_OWNER with your actual user/organisation and first create the empty private repository in GitHub:

```sh
cd "$HOME/Developer/the-thirty-club"
git status --short --branch
git remote -v
git add .
git diff --cached --stat
git diff --cached
# Review staged files for personal/private content before continuing.
git commit -m "Establish The Thirty Club foundation"
git remote add origin https://github.com/YOUR_GITHUB_OWNER/the-thirty-club.git
git remote -v
git push -u origin main
```

Authentication will require your GitHub credentials/credential manager. No force push or history replacement is needed. If any commits are added before migration, copy and preserve them and choose an appropriate subsequent commit message.

## 5. NETLIFY READINESS

The client app is structurally compatible with static Netlify hosting; it has not been built on Netlify. Proposed settings for a repository containing this project at its root:

| Setting                 | Recommendation                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| Base directory          | Repository root (leave blank)                                              |
| Build command           | npm run build                                                              |
| Publish directory       | dist                                                                       |
| Node                    | 22.13.1 via existing .nvmrc                                                |
| npm                     | 10.9.2; optionally pin NPM_VERSION in build settings                       |
| Application environment | None currently                                                             |
| Branch/workflow         | GitHub main for production after review; pull requests for deploy previews |

Netlify installs dependencies before the build. Keep development dependencies available because Vite/TypeScript/Tailwind are build tools. Do not set NODE_ENV=production or omit devDependencies during dependency installation. Keep package-lock.json versioned. Local/CI verification should use npm ci. See [Netlify dependency and Node configuration](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

Before deployment, add and review repository-owned routing/header configuration (netlify.toml, or Vite-copied public/_redirects + public/_headers). **None was added during this audit.** A minimal proposed routing plan is:

```text
# Proposed public/_redirects; add public/404.html alongside it.
# Existing static files take priority; do not force these rewrites.
/api/*     /404.html 404
/assets/*  /404.html 404
/sw.js     /404.html 404
/manifest.webmanifest /404.html 404
/*         /index.html 200
```

The real static public/404.html should return a simple non-application error body. Reserved API and generated JS asset failures must not masquerade as a successful application document. When an API is introduced, replace its 404 rule with the actual backend route before the SPA fallback. Verify other missing static icon/Workbox paths on the deployed preview and add specific guards where needed. See [Netlify SPA guidance](https://docs.netlify.com/build/configure-builds/javascript-spas/) and [redirect behavior](https://docs.netlify.com/manage/routing/redirects/redirect-options/).

Proposed public/_headers policy (this remains text in this handover, not active configuration):

```text
/sw.js
  Cache-Control: public, max-age=0, must-revalidate
/manifest.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Keep root Workbox files revalidated by default or add immutable policy only for verified content-hashed paths. Do not set long-lived immutable caching on sw.js, HTML, manifest or unhashed install icons. HTTP header policy and service-worker Cache Storage are separate layers; retain existing Workbox precache/update logic. Verify response headers on rewritten routes as well as root URLs. Netlify supports these policies in [custom headers](https://docs.netlify.com/manage/routing/headers/).

For future environment settings, enter secrets only in appropriate server-side Netlify/function settings; expose only deliberately public VITE_* configuration to the frontend build. No application env variables need adding now. A root-deployed site matches current `/` manifest scope, URLs and router base; subpath deployment would need review.

Recommended later workflow: verified local copy → reviewed initial commit → private GitHub remote → add reviewed routing/headers → configure Netlify Git integration → deploy preview → verify HTTPS, direct/deep routes, asset/API 404s, manifest and MIME/header behavior → iPhone Safari and Home Screen offline/update rehearsal → approved production deployment. Connecting a Git provider can trigger a first deploy, so do not perform that connection until deployment is authorised. Run full checks including Chromium in CI separately or before merge; plain npm run build on Netlify does not run all tests.

## 6. EXACT MIGRATION COMMANDS

Run in Terminal on this Mac when ready. Close/stop source dev servers and avoid editing the source during copying. These commands **copy**, retain the original and include hidden files plus .git; no git init, remote operation, deletion or --delete flag. Exclusions remove only generated root folders and OS metadata. No .env files currently exist; future ones would be preserved locally by this copy and must remain untracked. If mkdir fails because the destination exists, stop and inspect it; never automatically merge into or remove it.

```sh
bash <<'BASH'
set -euo pipefail
ttc_source='/Users/ag14/Documents/Codex/2026-10-17/files-pasted-by-the-user-prompt/outputs/the-thirty-club'
ttc_dest="$HOME/Developer/the-thirty-club"
test -f "$ttc_source/package.json"
test -d "$ttc_source/.git"
mkdir -p "$HOME/Developer"
# mkdir fails safely if any file, directory or symlink already occupies the destination.
mkdir "$ttc_dest"
ttc_excludes=(
  --exclude='/node_modules/' --exclude='/dist/' --exclude='/coverage/'
  --exclude='/playwright-report/' --exclude='/test-results/'
  --exclude='/.cache/' --exclude='/.vite/' --exclude='/.netlify/'
  --exclude='.DS_Store' --exclude='Thumbs.db'
)
rsync -a "${ttc_excludes[@]}" "$ttc_source/" "$ttc_dest/"
# Content-checksum comparison, including hidden files and .git. Empty output means parity.
ttc_diff="$(rsync -anic "${ttc_excludes[@]}" "$ttc_source/" "$ttc_dest/")"
if [ -n "$ttc_diff" ]; then
  printf '%s\n' "$ttc_diff"
  printf '%s\n' 'Verification differs; keep the source and inspect the copy.' >&2
  exit 1
fi
git -C "$ttc_dest" rev-parse --show-toplevel
git -C "$ttc_dest" status --short --branch
git -C "$ttc_dest" remote -v
git -C "$ttc_dest" fsck --full
printf '%s\n' 'Copy verified. Original project retained.'
BASH

cd "$HOME/Developer/the-thirty-club"
node --version
npm --version
# Use Node 22.13.1 to match .nvmrc. If nvm is installed: nvm install && nvm use
npm ci
npm run check
npx playwright install chromium
npm run test:pwa
open -a "Visual Studio Code" "$HOME/Developer/the-thirty-club"
```

`git fsck` may print notices about the unborn main branch/no references; that is expected until the first commit. The checksum dry-run verifies the copied source, lockfile, documentation and Git metadata **before** npm rebuilds excluded generated output. If rsync verification prints differences, do not retry blindly into that destination: keep the source, inspect the incomplete copy, and choose a fresh destination or resolve manually. npm ci intentionally creates fresh dependencies only in the copied directory. Network access is required for npm dependencies/Playwright downloads. If Node differs, use your Node version manager to select .nvmrc before running checks. `code .` is an alternative to `open -a` if the VS Code shell command is installed.

There is no isolated-environment export requirement here. A Git archive would currently fail or omit all uncommitted material because no commit exists; use the full filesystem copy above instead. Do not delete the original until the copy has passed checks and a reviewed remote backup exists. Open the copied folder in Codex/VS Code for future work to avoid editing two diverging copies.

## 7. RISKS OR BLOCKERS

- All work is uncommitted and has no remote backup; a copy must include untracked files and .git.
- Netlify SPA routing and cache headers are not yet configured or deployment-tested.
- Site is public static content when deployed; private GitHub visibility does not secure the deployed app. No member authentication/private-asset protection exists yet.
- Safari/physical iPhone installation, standalone behavior, worker update lifecycle and storage eviction need a real device rehearsal.
- Hosting account/domain/repo ownership, personal content and future backend policy are undecided. Seven-day birthday timeline remains tight.
- Destination absent now, but may change; guarded commands stop if occupied. Existing source remains available on any copy/test failure.

## 8. RECOMMENDED NEXT ACTION

Run the guarded copy and verification commands first. Then review the relocated files and first commit, connect an empty private GitHub repository, and approve Netlify configuration/preview separately. Phase 2 remains untouched. H01 audit preparation is VERIFIED; H02 relocation, H03 GitHub and H04 Netlify remain NOT STARTED.
