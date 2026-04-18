# Changelog

All notable changes to TeamForge are documented in this file.

## v0.1.20 - 2026-04-18

This milestone closeout release finishes the Ops Fabric v0.3.0 execution track by clearing the remaining TeamForge and Paperclip integration issues, tightening the ops-event contract, and exposing the remaining operator controls needed to run the sync fabric safely.

### Changed

- Added operator-facing Huly cadence controls and identity review / manual override controls in `src/pages/Settings.tsx`.
- Moved the remaining Slack analytics paths onto durable SQLite-backed activity reads in the TeamForge command/query layer.
- Made background Huly issue, presence, and team-cache polling cadences configurable through scheduler settings.
- Added `docs/runbooks/huly-sync-cadence.md` and tightened `docs/architecture/contracts/ops-event-schema-contract.md` with explicit backward-compatibility and collision-handling rules.
- Closed the full `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification` milestone issue set (`#20`–`#39`) with evidence comments.
- Bumped release metadata to `0.1.20` across the frontend package, sidecar package, Tauri config, and Rust crate.

### Verification

- `pnpm build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml identity -- --nocapture` currently fails before compilation because the local Cargo environment reports a checksum mismatch for `hyper-util v0.1.19`

## v0.1.19 - 2026-04-17

This patch release hardens the Projects page so execution data no longer appears hung when the control-plane fetch path is unavailable during first load.

### Changed

- Updated `src/pages/Projects.tsx` so TeamForge registry/control-plane data loads only when `CONTROL PLANE` is opened, keeping the legacy `EXECUTION` mode independent of the Worker-backed fetch path during initial page load.
- Added a visible retrying error state for execution-data failures instead of leaving the page in a permanent skeleton while background retries continue.
- Bumped release metadata to `0.1.19` across the frontend package, sidecar package, Tauri config, and Rust crate.

### Verification

- `pnpm build`

## v0.1.18 - 2026-04-17

This release completes the first TeamForge Cloudflare control-plane tranche on top of the Worker-canonical project registry, adding live GitHub/Huly issue and milestone propagation, sync journal/conflict tracking, and an operator-facing control-plane UI.

### Added

- Added `cloudflare/worker/migrations/0003_sync_control_plane.sql` to extend the canonical D1 schema with:
  - runtime sync-state fields on `project_sync_policies`
  - `sync_entity_mappings`
  - `sync_conflicts`
  - `sync_journal`
- Added Worker control-plane services for:
  - GitHub milestone propagation and Huly drift review
  - Huly-owned execution/admin issue propagation
  - GitHub-owned engineering issue propagation
  - classification override persistence
  - journal and conflict recording
- Added Worker control-plane routes:
  - `GET /v1/project-mappings/:projectId/control-plane`
  - `POST /v1/project-mappings/:projectId/actions`
- Added Tauri bridge commands plus shared TypeScript models for TeamForge control-plane detail, entity mappings, conflicts, journal rows, and operator actions.

### Changed

- The Projects page now has `EXECUTION` and `CONTROL PLANE` modes so operators can manage registry state, review conflicts, override issue classification, and trigger sync actions from the desktop app.
- Updated the Worker route and D1 schema contracts to reflect the new control-plane endpoints, sync mapping tables, and policy-state fields.
- Refreshed `README.md` so `0.1.18` describes the full control-plane tranche instead of the earlier partial registry slice.
- Release metadata remains at `0.1.18` across the frontend package, sidecar package, Tauri config, and Rust crate.

### Verification

- `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
- `cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph`
- `pnpm build`

## v0.1.17 - 2026-04-17

This release keeps the OTA workflow green while restoring optional fine-grained PAT support for GitHub release publication.

### Changed

- Updated `.github/workflows/release.yml` so tagged releases prefer `GH_RELEASE_PAT` when present and fall back to the default `GITHUB_TOKEN` otherwise.
- Bumped release metadata to `0.1.17` across the frontend package, sidecar package, Tauri config, and Rust crate so the next tagged build produces a real new release.

### Verification

- `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "release.yml: OK"'`

## v0.1.16 - 2026-04-16

This release wires the OTA publication path end to end so a tagged macOS build can publish signed updater bundles to Cloudflare and register them with the Worker manifest service.

### Changed

- Added `scripts/publish-ota-release.mjs` plus a root `release:ota:publish` script to:
  - upload the updater artifact, signature, and release notes to the `teamforge-artifacts` R2 bucket
  - call `/internal/releases/publish` with the signed artifact metadata
- Updated `.github/workflows/release.yml` so tagged releases now:
  - require the Tauri updater signing key in CI
  - build updater artifacts for both Apple Silicon and Intel macOS targets
  - publish both OTA targets to Cloudflare after the GitHub release assets are built
- Bumped release metadata to `0.1.16` across the frontend package, sidecar package, Tauri config, and Rust crate so the manual OTA hop can target a real new version.

### Verification

- `pnpm build`
- `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
- `pnpm release:ota:publish -- --dry-run --version v0.1.16 --platform darwin --arch aarch64 --artifact <tmp>/TeamForge.app.tar.gz --signature <tmp>/TeamForge.app.tar.gz.sig`
- `cargo test --manifest-path src-tauri/Cargo.toml`

## v0.1.9 - 2026-04-12

This release finalizes post-rollout version alignment so release tags and generated asset filenames match.

### Changed

- Version metadata bumped to `0.1.9` across:
  - frontend `package.json`
  - sidecar `sidecar/package.json`
  - Rust crate `src-tauri/Cargo.toml`
  - Tauri app config `src-tauri/tauri.conf.json`
- Continued using release CI config that disables updater artifact signing in GitHub Actions builds, ensuring `.dmg` and `.app` release assets publish without requiring `TAURI_SIGNING_PRIVATE_KEY`.

### Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm build`

## v0.1.8 - 2026-04-11

This release aligns version metadata with the latest rollout and hardens GitHub release packaging.

### Changed

- Version metadata bumped from `0.1.7` to `0.1.8` across:
  - frontend `package.json`
  - sidecar `sidecar/package.json`
  - Rust crate `src-tauri/Cargo.toml`
  - Tauri app config `src-tauri/tauri.conf.json`
- GitHub release workflow now disables updater artifact generation during CI bundle builds so tagged releases can publish `.dmg` and `.app` artifacts without requiring a signing private key in CI.

### Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm build`

## v0.1.7 - 2026-04-09

This release ships the full P2 dashboard wave — 6 new pages, 3 enhanced pages, role-based dashboard views, and the backend command surface to support them.

### Added

- **Clients page** (#5): Client management dashboard with metric cards (active clients, monthly revenue, projects in flight, at-risk contracts), 2-column client card grid with tier-coded badges, and a slide-in detail panel with linked projects, devices, and resources.
- **Devices page** (#6): Smart home device registry with client/platform/status filter bar, expandable device table with color-coded status pills, technical notes, firmware version, and API docs links.
- **Knowledge page** (#7): Knowledge base with fulltext search, category filter pills (SOP, Technical Guide, Resource Link, Tool Discovery, Training, FAQ, Client Doc), tag filtering, and expandable article cards.
- **Training page** (#11): Training compliance dashboard with 4 training track overview cards, per-employee training status table with status-coded pills, and a skills matrix grid with competency-level heatmap.
- **Onboarding page** (#14): Client onboarding flow tracker with active onboarding metrics, expandable checklist cards per client, progress bars, status badges, and a scenario tracking section.
- **Planner page** (#15): Planner and capacity dashboard with research status banner, per-employee capacity table with inline utilization bars and red/yellow allocation flags, and a weekly capacity summary sidebar.
- **Role-based dashboards** (#12): Executive, PM, and Developer dashboard layouts added to the Overview page via a role selector. Each role shows 5 context-specific cards.
- New "OPS MODULES" navigation section in the LCARS sidebar for all P2 pages.
- 12 new Rust backend command stubs with typed response models and `serde(rename_all = "camelCase")` for all P2 data surfaces.
- `get_monthly_hours` command now returns real data derived from Clockify time entries against employee quotas.

### Changed

- **Sprints page** (#8): Added sprint detail panel with SVG burndown chart, capacity planning table, sprint goal display, retrospective notes section, and sprint comparison metrics.
- **Team page** (#9): Added Monthly Hours and Remote Visibility section with per-employee actual vs expected hours, on-leave badges, remote work indicators, and timezone display.
- **Overview page** (#12): Added role-based dashboard section below existing quota compliance view.
- Fixed pre-existing Rust compilation issues: added missing `text` field to `SlackMessage` struct, fixed `huly_channel_display_name` closure signature for standup channel detection.

### Verification

- `pnpm build` (TypeScript + Vite production build)
- `cargo test --manifest-path src-tauri/Cargo.toml` (14 passed, 0 failed)

## v0.1.2 - 2026-04-08

This release packages the full set of unreleased TeamForge work since the published GitHub release `v0.1.0`, including the earlier local-only `0.1.1` preview cut.

### Added

- Slack connection settings with explicit Bot User OAuth token handling, optional channel filters, and a dedicated connection test flow.
- Slack-backed chat activity enrichment in the Communications dashboard so Slack and Huly motion can be read together.
- Drag-and-drop org chart mapping in the Team page with crew cards, bento department tiles, role drop zones, and an unassigned tray.
- Repo-native rollout documents for Huly system design, phased rollout planning, and workspace normalization runbooks.

### Changed

- Slack scope failures now surface the exact missing scope Slack reports instead of a generic permissions error.
- Ignored Clockify email settings now propagate into org chart retrieval so admin/service accounts do not appear in roster mapping.
- README now documents the Slack setup flow, the dynamic Team workflow, and the current rollout artifacts.
- Release metadata has been aligned to `0.1.2` across the frontend package, sidecar package, Tauri config, and Rust crate.

### Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm build`
- `pnpm tauri build --bundles app`

## v0.1.0 - 2026-04-06

- Initial public TeamForge release with the LCARS shell, Clockify dashboards, Huly integration, tray actions, and macOS packaging baseline.
