# Changelog

All notable changes to TeamForge are documented in this file.

## Unreleased

### Worker

- **Cloudflare Access JWT verification enabled (WS5,
  [#81](https://github.com/Sheshiyer/team-forge-ts/issues/81))** —
  `TF_ACCESS_TEAM_DOMAIN` + `TF_ACCESS_AUD` set (AUD accepts a comma-separated
  list covering both Access apps); `GET /v1/whoami` is now Access-JWT-only and
  fail-closed (401 instead of `{email: null}`), so Plexus `accessLogin()`
  resolves the real signed-in email. Bearer/internal m2m paths unchanged.

## v0.3.1 - 2026-06-12

Codename: Calliope.

Command Cortex OTA release. This release replaces the default LCARS/dashboard shell with the Mission Cortex neural command surface and preserves every old page behind reversible classic fallback routes.

### Added

- **Command Cortex home** — `/` and `/mission-cortex` now open the tactical neural command field instead of the classic Overview dashboard.
- **Lens-routed legacy surfaces** — normal routes now map to Command Cortex lenses:
  - Mission: `/`, `/mission-cortex`, `/inbox`
  - Agents: `/agents`, `/team`
  - Work: `/projects`, `/sprints`, `/boards`
  - Clients: `/clients`, `/onboarding`
  - Risk: `/issues`, `/settings`
  - Signals: `/activity`, `/timesheet`, `/calendar`, `/comms`, `/insights`
  - Memory: `/knowledge`, `/goals`, `/routines`
- **Classic fallback namespace** — old React pages remain reachable under `/classic/...` for rollback and debugging.
- **Live graph adapter** — Mission Cortex synthesizes TeamForge, Paperclip, GitHub, Huly, Clockify, and activity data through existing read-only Tauri commands.

### Changed

- App metadata and window title now describe the Command Cortex surface.
- Core command actions remain safe UI stubs until dedicated Tauri mutation commands receive security review.

### Verification

- `pnpm build`
- Browser route screenshots for `/`, `/agents`, `/knowledge`, `/settings`, and `/classic/overview`
- Tauri runtime smoke: `pnpm tauri dev` reached database initialization, Huly connection, and scheduler startup

### Known Limitations

- Local native visual verification is still blocked until macOS Screen Recording and Accessibility permissions are granted for the native capture tool.
- Classic fallback routes still require the Tauri runtime for pages that call `invoke` directly.

## v0.3.0 - 2026-06-10

Founder-First Agent Mission Control reorientation. The app is now structured as
an ops console rather than a project-management dashboard, with navigation,
content, and shortcuts optimized for executive decision-making.

### Added

- **Mission Control Navigation** — three-section sidebar:
  - MISSION CONTROL: Overview, Agents, Inbox, Projects
  - PORTFOLIO: Clients, Issues, Onboarding, Activity, Team
  - SYS: Settings
- **Command Palette** — 9 secondary pages (including Boards) demoted to ⌘K-only
  access with remapped keyboard shortcuts (`Cmd+1-9` for priority routes).
- **Role-Driven Overview** — dashboard content adapts to `executive`, `pm`, or
  `developer` role:
  - Executive sees intake console, agent runtime, active streams, standup digest,
    and PAI recent missions
  - PM sees agent runtime, streams, standup, and PAI missions
  - Developer sees streams, standup, research intake, and code-focused surfaces
- **Provenance Badges** — every `SectionFrame` displays `SRC:` and `ERR:` footer
  metadata for traceability.
- **Collapsible Sections** — every Overview panel can be collapsed/expanded,
  with state persisted per session.
- **PAI Recent Missions** — new Tauri command `get_recent_pai_missions` scans
  `~/.claude/MEMORY/WORK` for PRD slugs, returning time-bucketed counts
  (today / 7d / 30d / total) with graceful fallback when the directory is absent.
- **LCARS Decision Ledger** — `DESIGN.md` updated with explicit rationale for
  keeping the LCARS mission-control aesthetic over the Linear spec.

### Changed

- Navigation hierarchy flattened to founder-priority order.
- Keyboard shortcuts remapped to match new nav structure.
- Overview page rebuilt from generic dashboard to executive command center.

### Security

- Phase 1 security audit completed: Tauri capabilities (8 manifests) reviewed
  with no ambient authority or path traversal exposure.
- Worker route safety documented: all `/v1/` routes require Bearer or internal
  shared-secret auth.

## v0.2.6 - 2026-05-06

This release turns TeamForge into a much stronger day-to-day Paperclip control
plane and closes the main workflow gaps that were still forcing context
switches across separate UIs before the next OTA line.

### Added

- TeamForge-native Paperclip workflow parity surfaces:
  - dedicated `Inbox`, `Goals`, and `Routines` routes
  - Hermes live-sync visibility inside `/agents/hermes`
  - direct Paperclip source-file editing for agent `TASKS.md` and
    `MANIFEST.yaml`
- Richer issue workflow controls:
  - live GitHub comments in `Issues`
  - attachment extraction from issue bodies and comments
  - TeamForge-owned sub-issue relationships
  - live GitHub issue property editing for title, body, state, labels, and
    assignees
- Canonical intake expansion:
  - founder intake console on Overview
  - TeamForge-native Inbox triage flow
  - issue-intake composer directly inside the `Issues` route

### Changed

- `Agents` now exposes Hermes delivery health and a `POLL ONCE` action instead
  of treating Hermes as a hidden background bridge.
- `Issues` now behaves like a control surface rather than a cache-only view:
  manual GitHub issue edits immediately refresh TeamForge detail/projection
  state and write local timeline events.
- Intake surfaces now preserve and surface linked GitHub issue provenance more
  clearly:
  - Overview and Inbox show source refs directly
  - Overview and Inbox can open linked issues inside TeamForge
  - `Issues` preserves selected issue context in the URL via `issue=`
- Release metadata is now at `0.2.6` across the frontend package, Tauri config,
  Rust crate, and local Cargo lock.

### Fixed

- Fixed a false-green Paperclip integration class where Settings could show
  healthy while the `Agents` runtime route contract was missing.
- Fixed a Hermes delivery-log parser bug that decoded bracketed channel entries
  as `unknown`.
- Fixed stale active-issue ordering after local issue mutations.
- Fixed issue-follow-up intake autofill so TeamForge no longer invents a
  possibly wrong `projectCode` from a display name.

### Verification

- `pnpm build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml commands::tests -- --nocapture`
- `git diff --check`

## v0.2.0 - 2026-05-05

Closes Phase 1 of v0.2 Foundation Closeout (issue #45). Productizes the
Settings-based founder vault sync so TeamForge.app runs end-to-end on a
clean macOS install with no `node` on PATH. The previous Node script
(~2778 LOC at `scripts/teamforge-vault-parity.mjs`) is replaced as the
default by a native Rust importer at `src-tauri/src/vault/parity.rs`;
the script remains bundled for one release as a `vault_sync_runtime`
setting fallback and goes out at v0.2.1 alongside Phase 2 (#46) closing.

### Added

- **Slack Sync Now button** in Settings — trigger on-demand Slack message
  sync without waiting for the 3-minute background scheduler. Shows
  channels synced and messages scanned/persisted count.
- `trigger_slack_sync` Tauri command (mirrors `trigger_huly_sync` pattern)
- Native Rust founder-sync importer at `src-tauri/src/vault/parity.rs`
  (~2963 LOC including tests; ~835 LOC implementation) covering all four
  note families: project briefs, client profiles, onboarding flows,
  employee KPI notes.
- `vault_sync_runtime` setting (`"rust"` (default) | `"node"`) at the
  `sync_local_vault_to_teamforge` Tauri command. Manual override via SQL
  against the local `settings` table is the documented v0.2.0 escape
  hatch; no Settings UI surface in this release.
- `gray_matter = "0.3"` (YAML feature only) — pure-Rust, MIT, zero C
  deps. Single new dependency.
- 11 inline tests in `vault::parity::tests` (10 unit/integration green
  by default, 1 `#[ignore]`-gated for live real-vault parity diff).
- Wave 0 fixture vault at `src-tauri/tests-fixtures/vault-min/` (7
  minimal markdown files) for the integration test.

### Changed

- `src-tauri/src/vault.rs` (1163 LOC) moved byte-identical to
  `src-tauri/src/vault/mod.rs` to make room for `vault/parity.rs`. No
  public API change. No call-site change.
- `commands/mod.rs::sync_local_vault_to_teamforge` now dispatches via
  `match runtime_choice` between the new Rust path and the existing
  Node shell-out. The downstream JSON parser at `:2708-2805` is
  unchanged — D-04 preserves the on-disk report contract; only the
  producer changes.
- `commands/mod.rs::read_local_workspace_status` no longer surfaces
  Node-specific blockers (`node_runtime_error`, `parity_script_error`)
  when `vault_sync_runtime == "rust"`.
- Bumped release metadata to `0.2.0` across the frontend package, Tauri
  config, and Rust crate.

### Removed

- Nothing in this release. The Node script and the dual-path setting
  remain bundled until v0.2.1 alongside Phase 2 (#46) closing.

### Verification

- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo check --manifest-path src-tauri/Cargo.toml` — 0 errors, 0 warnings
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` — `test result: ok. 57 passed; 0 failed; 4 ignored` (+13 vs v0.1.28 baseline)
- `pnpm build`
- `git diff --check`
- Tier 2: clean-PATH founder-sync run on TeamForge.app — _pending human releaser; recorded in `.planning/phases/01-founder-sync-hardening/01-VERIFICATION.md`_
- Tier 3: Node-vs-Rust parity diff against thoughtseed-labs vault — _pending human releaser; recorded in `.planning/phases/01-founder-sync-hardening/01-VERIFICATION.md`_
- Full audit trail: `.planning/phases/01-founder-sync-hardening/01-VERIFICATION.md`

## v0.1.28 - 2026-05-01

This release closes the remaining normal Paperclip founder loop inside
TeamForge: the Agents shell can now run core Paperclip runtime maintenance and
resolve founder approvals directly, without bouncing out to the separate
Paperclip dashboard for the common daily path.

### Changed

- Added backend-first Paperclip runtime ops through the local adapter and
  TeamForge native command layer:
  - `GET /api/runtime/status`
  - `POST /api/runtime/warm-start`
  - `POST /api/runtime/refresh-stale`
  - `POST /api/runtime/maintain-heartbeat`
- Added first-pass Paperclip approvals support:
  - `GET /api/approvals`
  - `POST /api/approvals/:id/resolve`
  - TeamForge now derives a founder approvals queue from CEO/founder
    task-routing and escalation signals already present in the Paperclip task
    registry, then allows approve / block / defer actions from the app shell
- Expanded the TeamForge `Agents` route:
  - `/agents/runtime` now includes runtime maintenance controls and result
    feedback
  - `/agents/approvals` is now a first-class founder decision queue alongside
    runtime, org, and queue
- Bumped release metadata to `0.1.28` across the frontend package, Tauri
  config, and Rust crate.

### Verification

- `node --check /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip/scripts/forge-aura-adapter/server.mjs`
- `bash -n /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh`
- `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh`
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
- `git diff --check`

## v0.1.27 - 2026-05-01

This release makes the Paperclip daily-shell integration OTA-safe by bundling
TeamForge's own runtime adapter fallback, so installed desktop builds can still
render the Overview runtime band and Agents route even if the sibling
`thoughtseed-paperclip` repo no longer carries the local adapter server file.

### Changed

- Bundled a TeamForge-owned Paperclip runtime adapter fallback:
  - added `scripts/paperclip-runtime-adapter.mjs` to the TeamForge repo and the
    Tauri app resources
  - adapter launch now prefers the sibling Paperclip repo copy when present,
    but falls back to the bundled app resource or TeamForge repo copy when it
    is missing
  - packaged builds now keep the Paperclip `/api/*` contract available without
    requiring the repo checkout to stay structurally unchanged
- Improved local Desktop Workspace defaults:
  - native workspace status now resolves the Paperclip launcher path, working
    directory, local UI/API URLs, and auto-start mode before the user saves
    settings
  - Settings now hydrates those native defaults directly so the page no longer
    comes up looking partially unconfigured
- Bumped release metadata to `0.1.27` across the frontend package, Tauri
  config, and Rust crate.

### Verification

- `node --check scripts/paperclip-runtime-adapter.mjs`
- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo tauri build --bundles app`
- packaged app visual verification of `Overview` and `Agents` with the sibling
  Paperclip adapter removed from the working repo
- `git diff --check`

## v0.1.26 - 2026-04-30

This release brings the Paperclip daily shell fully into TeamForge: the new
Agents route and Overview runtime band now surface Paperclip telemetry,
personal work context, rooms, escalations, and startup controls directly in
the desktop app, while the local companion launcher and release docs are
cleaned up for the next OTA line.

### Changed

- Added the TeamForge-native Paperclip runtime layer:
  - new native commands for Paperclip API readiness, telemetry, roster,
    personal context, rooms, escalations, and boot-time runtime startup
  - new `/agents` route replaces the old `Live` route as the daily runtime
    surface, while `/live` now redirects safely
  - Overview now includes a runtime status band with healthy/stale agent counts
    and drilldowns into Agents
- Expanded desktop workspace controls in Settings:
  - added explicit Paperclip API URL and bearer token settings
  - added API readiness checks and machine-local startup mode control
  - simplified shipped copy from internal sync language toward operator-facing
    labels
- Fixed release-path and launcher drift:
  - corrected the bundled `launch-thoughtseed-paperclip.sh` default sibling
    repo path so auto-launch works without a manual override
  - refreshed README route/release docs so Agents, current release notes, and
    the current app version are accurate
  - fixed the historical `thoughtseed-paperclip` typo in the `v0.1.21`
    changelog/launcher notes
- Bumped release metadata to `0.1.26` across the frontend package, Tauri
  config, and Rust crate.

### Verification

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
- `git diff --check`

## v0.1.25 - 2026-04-30

This release turns TeamForge further into the founder control plane: Overview
now routes into canonical ID-backed work queues, Settings gains a real founder
workspace status + vault sync surface, and the Worker app-auth contract is
aligned so desktop founder sync can write project, client, onboarding, and KPI
state through the same Cloudflare-backed control plane.

### Changed

- Expanded the founder dashboard and canonical identity bridge:
  - Overview now drills into Clients, Issues, and Onboarding by canonical IDs
    instead of name-based heuristics
  - TeamForge project graphs now persist explicit client and Clockify linkage
    through Worker/D1 and the local cache
  - local execution and active-issue loading no longer depend on the older
    name-fallback joins
- Added founder-local workspace control and sync in Settings:
  - surfaced TeamForge workspace id, vault readiness, Node/runtime status, and
    parity-script status in the Local Workspace section
  - added a `Sync Vault to TeamForge` action that reuses the canonical vault
    parity importer from the app contract
  - bundled the parity importer into the Tauri app resources so the sync path
    is no longer repo-checkout-only
- Fixed the Worker route auth gap:
  - aligned the main desktop `/v1/*` project/client/onboarding/control-plane
    routes onto the desktop app bearer token contract
  - stopped requiring the internal webhook secret for normal desktop founder
    sync writes
- Rebased the GitHub backlog on the shipped founder roadmap:
  - closed the stale Huly-first device, knowledge, training, and old rollout
    tracker issues
  - opened canonical follow-ons for founder-sync hardening and vault metadata
    completion
- Bumped release metadata to `0.1.25` across the frontend package, Tauri
  config, and Rust crate.

### Verification

- `node --check scripts/teamforge-vault-parity.mjs`
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
- `pnpm --dir cloudflare/worker run deploy`
- `TEAMFORGE_ACCESS_TOKEN=... node scripts/teamforge-vault-parity.mjs --vault-root /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs --worker-base-url https://teamforge-api.sheshnarayan-iyer.workers.dev --workspace-id ws_thoughtseed --apply --report /tmp/teamforge-founder-sync-proof.json`
- `cargo tauri build --bundles app --config src-tauri/tauri.conf.json`
  - produced the macOS app and updater bundle, then stopped at the expected
    local signing-key check because CI owns updater signing
- `git diff --check`

## v0.1.24 - 2026-04-28

This release hardens the OTA publication path by separating release publish
authorization from the generic internal webhook callback secret.

### Changed

- Introduced a dedicated `TF_RELEASE_PUBLISH_TOKEN` for
  `POST /internal/releases/publish`.
- Updated the Cloudflare Worker so OTA release publication no longer shares the
  same bearer secret as the general `/internal/*` callback surfaces.
- Updated `scripts/publish-ota-release.mjs` and the GitHub Actions release
  workflow to require the dedicated release token for OTA publish callbacks.
- Updated the release/auth contracts and TeamForge release runbook to document
  the new trust boundary.
- Bumped release metadata to `0.1.24` across the frontend package, Tauri config,
  and Rust crate.

### Verification

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
- `TF_RELEASE_PUBLISH_TOKEN=test-token node scripts/publish-ota-release.mjs --dry-run ...`
- `git diff --check`

## v0.1.23 - 2026-04-28

This release removes stale heuristic-first product surfaces, promotes the new
TeamForge icon system into the shipped Tauri bundle, and makes the repo-owned
Tauri skill workflow and CI release path explicit.

### Changed

- Removed stale Settings authorities and legacy product surfaces:
  - GitHub repo scope now resolves from the TeamForge project graph instead of
    the old `github_repos` setting
  - live employee quota editing moved out of Settings into Team capacity
  - Planner was removed from the primary shell and legacy `/planner` now
    redirects to Team capacity
  - Knowledge was removed from primary navigation and reduced to a canonical
    placeholder until a real source contract exists
- Reworked Onboarding and Clients toward canonical TeamForge identity:
  - onboarding now shows canonical flows only instead of mixing fallback
    synthesized records into the default view
  - client surfaces now distinguish canonical TeamForge profiles from
    operational-only signal records
- Added repo-owned Tauri skill workflow scaffolding:
  - pinned the installed Tauri skill manifest in `config/tauri-skill-suite.txt`
  - added `pnpm skills:tauri:list` and `pnpm skills:tauri:refresh`
  - documented the reusable prompt scaffold and skill-routing guidance
- Added the TeamForge visual asset workflow and shipped the approved app icon:
  - promoted the approved TeamForge icon assets into
    `design-assets/teamforge/icons/approved/`
  - regenerated `src-tauri/icons/*` from the approved master
  - fixed the export pipeline so Tauri bundle PNGs are normalized to RGBA
    before packaging
- Clarified release ownership:
  - local `cargo tauri build --bundles app` remains the icon/bundle validation
    path
  - GitHub Actions release CI remains the canonical OTA signing and publication
    path
- Bumped release metadata to `0.1.23` across the frontend package, Tauri config,
  and Rust crate.

### Verification

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo tauri build --bundles app` produced the macOS `.app` and updater
  archive before the expected local signing-env failure
- `git diff --check`

## v0.1.22 - 2026-04-23

This release cleans up the TeamForge founder console UI so the app reads as a
cohesive LCARS operations surface instead of a collection of sync/debug views.

### Changed

- Rebuilt the `Comms` page into a roster-first signal console with sync rails,
  chat/meeting leader panels, and a crew matrix.
- Rebuilt the `Calendar` page into split control/data surfaces for leave and
  holiday operations.
- Tightened the Team crew profile panel with vault/KPI status pills and shorter
  section language.
- Swept visible pages for narrator-style sync prose, verbose errors, and weak
  empty states so founder-facing language stays short and product-grade.
- Bumped release metadata to `0.1.22` across the frontend package, Tauri config,
  and Rust crate.

### Verification

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`

## v0.1.21 - 2026-04-22

This release turns the new TeamForge founder console into a real local-control
surface by wiring native vault selection and Paperclip launcher controls on top
of the Worker-backed project and issue control plane.

### Changed

- Added a `LOCAL WORKSPACE` section in `src/pages/Settings.tsx` for:
  - choosing and validating the local vault directory
  - configuring the Paperclip launcher script path and working directory
  - opening the Paperclip UI directly from TeamForge
- Added native Tauri commands for:
  - `pick_vault_directory`
  - `validate_vault_directory`
  - `launch_paperclip_script`
  - `open_paperclip_ui`
- Added `scripts/launch-thoughtseed-paperclip.sh` so TeamForge can launch the
  real sibling `thoughtseed-paperclip` repo through its existing
  `babysitter.sh start` contract without requiring extra CLI args in settings.
- Updated vault resolution so TeamForge prefers the saved local
  `local_vault_root` setting before falling back to environment variables or
  Obsidian heuristics.
- Replaced the misleading `Devices` shell module with a real `Issues` module
  grouped by active project.
- Moved active project issue loading onto the Worker-owned TeamForge issue feed
  with local SQLite used only as cache/offline projection.
- Bumped release metadata to `0.1.21` across the frontend package, sidecar
  package, Tauri config, and Rust crate.

### Verification

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm build`
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
