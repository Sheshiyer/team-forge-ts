# Command Cortex Verification

## Phase 1 Foundation Gate

### Build Gate

- Command: `pnpm build`
- Expected: TypeScript and Vite build complete with exit code 0.
- Evidence: Paste command output under the build log section after running.

### Static Contract Gate

- `docs/design/command-cortex-visual-contract.md` exists.
- `docs/design/command-cortex-token-map.md` exists.
- `docs/design/command-cortex-shell-contract.md` exists.
- `src/lib/commandCortex/types.ts` exports graph contracts.
- `src/lib/commandCortex/lensTypes.ts` exports the lens contract.
- `src/lib/commandCortex/sampleGraph.ts` exports a sample graph.
- `src/components/cortex/index.ts` exports placeholder component boundaries.
- `src/styles/command-cortex.css` is imported by `src/styles/globals.css`.

### Baseline Screenshot Plan

Screenshots should be captured before Phase 2 route integration because Phase 1 does not run a new visual surface.

Required baseline states:

- Classic overview at desktop width, ideally 1440px or wider.
- Classic agents runtime page at desktop width.
- Classic overview at compact desktop width around 1024px.
- Current command palette open with `⌘K`.

Suggested output folder:

- `docs/qa/screenshots/command-cortex-baseline/overview-desktop.png`
- `docs/qa/screenshots/command-cortex-baseline/agents-desktop.png`
- `docs/qa/screenshots/command-cortex-baseline/overview-compact.png`
- `docs/qa/screenshots/command-cortex-baseline/command-palette.png`

### Reduced-Motion Plan

Future Mission Cortex QA must verify:

- Agent pulses stop or become static markers.
- Risk/inflammation state remains visible without animation.
- Command ring and membrane remain keyboard reachable.
- Lens rail state is still visible without glow animation.

### Keyboard Plan

Future Mission Cortex QA must verify:

- `Tab` reaches lens rail controls.
- `Tab` reaches command ring actions.
- `Escape` closes selected-node overlays.
- `⌘K` focuses the intent command field inside Mission Cortex.
- Existing command palette behavior remains available outside Mission Cortex.

## Build Log

### 2026-06-12 Phase 1 Foundation

Command: `pnpm build`

Result: passed with exit code 0.

Output summary:

```text
> team-forge-ts@0.3.0 build /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts
> tsc && vite build

vite v6.4.1 building for production...
transforming...
✓ 80 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-DtZD4RXf.css    6.13 kB │ gzip:   2.14 kB
dist/assets/index-TVyxYoGw.js   691.64 kB │ gzip: 172.60 kB
✓ built in 1.26s
```

Warnings observed:

- Upstream/root `tsconfig.json` warns that `astro/tsconfigs/strict` cannot be found.
- Vite reports a large JS chunk over 500 kB.

Both warnings predate Command Cortex Phase 1 and do not block the foundation gate.

### 2026-06-12 Phase 2 Mission Cortex MVP

Command: `pnpm build`

Result: passed with exit code 0.

Output summary:

```text
vite v6.4.1 building for production...
transforming...
✓ 88 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-CQrHhoiK.css   14.88 kB │ gzip:   3.97 kB
dist/assets/index-stpwR4N6.js   705.37 kB │ gzip: 176.68 kB
✓ built in 1.02s
```

Local web server:

- Command: `pnpm dev --host 127.0.0.1`
- URL: `http://127.0.0.1:1420/`
- Cortex route: `http://127.0.0.1:1420/mission-cortex`

Screenshot evidence:

- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase2.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-root-phase2.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase2-fidelity.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase2-final.png`

Phase 2 changed local non-Tauri web preview behavior so `/` renders Mission Cortex outside Tauri. This avoids landing on classic pages that call Tauri-only `invoke` APIs in a normal browser.

Visual caveat:

- Phase 2 now includes a higher-fidelity neural field, distinct node glyphs, path sheaths, field strata, tactical membrane traces, lens rail, command ring, intent bar, and runtime strip.
- Phase 2 is complete as an implementation milestone, but it still does not fully match the generated V3 moodboard quality bar.
- The current gap register is `docs/design/command-cortex-visual-gap-register.md`.
- A later fidelity/polish wave is recommended before treating the surface as final brand-quality UI.

### 2026-06-12 Phase 3 Data, Lenses, and Command Semantics

Command: `pnpm build`

Result: passed with exit code 0.

Output summary:

```text
vite v6.4.1 building for production...
transforming...
✓ 90 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-CQbe7eGj.css   18.33 kB │ gzip:   4.52 kB
dist/assets/index-Cz482UqZ.js   718.18 kB │ gzip: 180.24 kB
✓ built in 641ms
```

Warnings observed:

- Upstream/root `tsconfig.json` still warns that `astro/tsconfigs/strict` cannot be found.
- Vite still reports a large JS chunk over 500 kB.

Implementation evidence:

- `src/lib/commandCortex/buildMissionGraph.ts` maps Team Forge data into Cortex nodes, paths, and signals.
- `src/lib/commandCortex/commandRules.ts` centralizes safe command availability and command feedback text.
- `src/pages/MissionCortexPage.tsx` loads live Tauri data only when the Tauri runtime exists.
- Browser preview keeps using `sampleCortexGraph` as a safe fallback.
- `src/components/cortex/NeuralField.tsx` applies lens emphasis classes so non-primary graph elements recede.
- `docs/design/command-cortex-tauri-command-requirements.md` records future mutation and security requirements.

Screenshot evidence:

- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase3.png`

Known limitation:

- Browser preview cannot prove live Tauri `invoke` responses. Live graph synthesis still needs verification inside the Tauri shell or a mocked invoke harness.

### 2026-06-12 Phase 3 Tauri Runtime Smoke

Command: `pnpm tauri dev`

Result: Tauri dev runtime compiled and launched before the bounded terminal command was stopped at 60 seconds.

Output summary:

```text
Running BeforeDevCommand (`pnpm dev`)
Running DevCommand (`cargo  run --no-default-features --color always --`)
VITE v6.4.1 ready in 251 ms
Compiling team-forge-ts v0.3.0
Finished `dev` profile [unoptimized + debuginfo] target(s) in 41.38s
Running `target/debug/team-forge-ts`
[teamforge] database initialized
[huly] connected: endpoint=https://europe-tr5.huly.app, workspace=46352c1b-9c0a-4562-b204-d39e47ff0b1b
[scheduler] background sync started
```

Warnings observed:

- Upstream/root `tsconfig.json` still warns that `astro/tsconfigs/strict` cannot be found.
- Rust emits pre-existing warnings for unused `crate::onboarding`, `ProjectCode`, and `TypeCode`.
- The terminal command ended with timeout metadata because Tauri dev is a long-running process.

Runtime path evidence:

- `src-tauri/src/lib.rs` registers every read command Mission Cortex calls: `get_founder_command_center`, `get_paperclip_org_view`, `get_clients`, `get_active_project_issues`, `get_activity_feed`, and `get_presence_status`.
- `src-tauri/src/commands/mod.rs` defines all six commands as `#[tauri::command]` functions backed by the local database and integrations.
- Tauri startup reached database initialization, Huly connection, and scheduler startup, so the Rust app boot path was exercised.

Verification boundary:

- Native UI screenshot/control could not be completed because `peekaboo permissions` reported `Screen Recording (Required): Not Granted` and `Accessibility (Required): Not Granted`.
- The live Mission Cortex visual state and the `Live graph synthesized from Team Forge signals` UI message remain unverified until native UI capture is permitted or a test harness exposes webview state.

### 2026-06-12 Phase 4 Core Route Migration

Command: `pnpm build`

Result: passed with exit code 0.

Output summary:

```text
vite v6.4.1 building for production...
transforming...
✓ 90 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-CQbe7eGj.css   18.33 kB │ gzip:   4.52 kB
dist/assets/index-DVj1oR4U.js   719.35 kB │ gzip: 180.52 kB
✓ built in 783ms
```

Implementation evidence:

- `src/App.tsx` now treats `/`, `/mission-cortex`, `/agents`, `/projects`, `/clients`, `/issues`, and `/activity` as Command Cortex routes.
- Core legacy surfaces remain reachable through `/classic/overview`, `/classic/agents`, `/classic/projects`, `/classic/clients`, `/classic/issues`, and `/classic/activity`.
- `src/pages/MissionCortexPage.tsx` derives the initial active lens from the route, so `/agents` opens the Agents lens, `/projects` opens Work, `/clients` opens Clients, `/issues` opens Risk, and `/activity` opens Signals.
- Command palette entries include classic fallback routes for reversible access.

Browser screenshot evidence:

- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase4-root.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase4-agents-lens.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-phase4-classic-overview.png`

Warnings observed:

- Upstream/root `tsconfig.json` still warns that `astro/tsconfigs/strict` cannot be found.
- Vite still reports a large JS chunk over 500 kB.
- Headless Chrome still emits non-blocking GPU/allocator warnings while writing screenshots.

Known limitation:

- The `/classic/overview` browser screenshot proves the fallback route is reachable, but the classic page still shows the pre-existing non-Tauri browser error: `Cannot read properties of undefined (reading 'invoke')`. Classic fallback should be verified in Tauri after native UI capture permissions are available.
- There is no package-level React route test script in `package.json`; this Phase 4 slice is verified by TypeScript/Vite build plus browser route screenshots.

### 2026-06-12 v0.3.1 OTA Release Candidate

Command: `pnpm build`

Result: passed with exit code 0.

Output summary:

```text
> team-forge-ts@0.3.1 build /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts
> tsc && vite build

vite v6.4.1 building for production...
transforming...
✓ 90 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-CQbe7eGj.css   18.33 kB │ gzip:   4.52 kB
dist/assets/index-DC1l4gpV.js   721.32 kB │ gzip: 180.78 kB
✓ built in 1.66s
```

Command: `cargo check --manifest-path src-tauri/Cargo.toml`

Result: passed with exit code 0.

Output summary:

```text
Compiling team-forge-ts v0.3.1
warning: unused import: `crate::onboarding`
warning: enum `ProjectCode` is never used
warning: enum `TypeCode` is never used
Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.57s
```

Command: `git diff --check`

Result: passed with exit code 0 and no output.

Command: `pnpm release:ota:publish -- --dry-run --version v0.3.1 --platform darwin --arch aarch64 --artifact package.json --signature src-tauri/Cargo.toml`

Result: passed with exit code 0.

Output summary:

```text
[ota-release] Preparing OTA release v0.3.1 for darwin-aarch64 on channel 'stable'.
[ota-release] Release notes source: CHANGELOG.md
[ota-release] dry-run: pnpm dlx wrangler r2 object put teamforge-artifacts/ota/releases/0.3.1/darwin-aarch64/package.json ...
[ota-release] dry-run: pnpm dlx wrangler r2 object put teamforge-artifacts/ota/releases/0.3.1/darwin-aarch64/Cargo.toml ...
[ota-release] dry-run: pnpm dlx wrangler r2 object put teamforge-artifacts/ota/releases/0.3.1/darwin-aarch64/release-notes.md ...
```

Dry-run note:

- The dry-run intentionally used readable placeholder files for `--artifact` and `--signature` to verify script argument parsing, release-note extraction, object-key construction, and publish-payload construction without mutating Cloudflare or the release API.
- The corrected payload included only the `v0.3.1` changelog section with `Codename: Calliope`, not the `Unreleased` Worker notes.

Release metadata evidence:

- `package.json` version is `0.3.1`.
- `src-tauri/tauri.conf.json` version is `0.3.1`.
- `src-tauri/Cargo.toml` package version is `0.3.1`.
- `src-tauri/Cargo.lock` records `team-forge-ts` as `0.3.1`.
- `CHANGELOG.md` contains `## v0.3.1 - 2026-06-12` release notes.

Route inventory evidence:

- Normal app routes now enter Command Cortex: `/`, `/mission-cortex`, `/agents`, `/inbox`, `/projects`, `/clients`, `/issues`, `/onboarding`, `/activity`, `/team`, `/timesheet`, `/sprints`, `/insights`, `/calendar`, `/comms`, `/boards`, `/routines`, `/goals`, `/knowledge`, and `/settings`.
- Redirect-only routes `/devices`, `/planner`, and `/live` now redirect inside the Cortex branch.
- Classic fallback routes are retained under `/classic/...` for the old React pages.

Browser screenshot evidence:

- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-v031-root.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-v031-knowledge-memory.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-v031-settings-risk.png`
- `docs/qa/screenshots/command-cortex-baseline/mission-cortex-v031-classic-settings.png`

Release / OTA boundary:

- No signed updater artifact exists locally under `src-tauri/target/*/release/bundle/macos/TeamForge.app.tar.gz*`.
- OTA publish requires a signed `TeamForge.app.tar.gz`, its `.sig`, Cloudflare R2 credentials, and `TF_RELEASE_PUBLISH_TOKEN`.
- The GitHub release workflow builds both Apple Silicon and Intel artifacts, then calls `pnpm release:ota:publish` for each architecture on tag pushes matching `v*`.

Warnings observed:

- Upstream/root `tsconfig.json` still warns that `astro/tsconfigs/strict` cannot be found.
- Vite still reports a large JS chunk over 500 kB.
- Headless Chrome still emits non-blocking allocator / web-app install warnings while writing screenshots.
