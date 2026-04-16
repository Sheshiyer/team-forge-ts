# Task Plan

## Goal

Automate OTA release publication for signed macOS updater bundles:
- upload the Tauri updater artifact, signature, and release notes to Cloudflare R2
- call `/internal/releases/publish` with the published artifact metadata
- keep the user-facing OTA hop verification manual

## Plan

- [x] Reconfirm current release workflow gaps and OTA contract requirements.
- [x] Add a small release publish script for Cloudflare upload + Worker publish.
- [x] Update GitHub Actions release workflow to build signed updater artifacts and invoke the publish script.
- [x] Bump release metadata to `0.1.16` so the manual OTA hop targets a real new version.
- [x] Verify script/workflow behavior locally where possible and document required secrets/manual follow-up.

## Review

- Added `scripts/publish-ota-release.mjs` and root `pnpm release:ota:publish` for OTA publication.
- The publish script now:
  - uploads the updater artifact, `.sig`, and `release-notes.md` to `teamforge-artifacts`
  - publishes the release row through `/internal/releases/publish`
  - derives release notes from `CHANGELOG.md` when no explicit notes file is provided
  - supports `--dry-run` for local validation without Cloudflare credentials
- Updated `.github/workflows/release.yml` so tag builds now:
  - require `TAURI_SIGNING_PRIVATE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `TF_WEBHOOK_HMAC_SECRET`
  - build signed updater artifacts for both `aarch64-apple-darwin` and `x86_64-apple-darwin`
  - locate the generated `TeamForge.app.tar.gz` + `.sig` pairs and publish them to Cloudflare
- Bumped release metadata to `0.1.16` across:
  - root `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entry in `src-tauri/Cargo.lock`
  - `CHANGELOG.md`
- Verification passed:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm release:ota:publish -- --dry-run --version v0.1.16 --platform darwin --arch aarch64 --artifact <tmp>/TeamForge.app.tar.gz --signature <tmp>/TeamForge.app.tar.gz.sig`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)
- Manual follow-up remains with the user:
  - install/test the real `0.1.15 -> 0.1.16` OTA hop locally after pushing the tag and ensuring GitHub repo secrets/vars are set.

## Goal

Add a manual OTA updater flow to Settings, verify the release path against the existing Cloudflare/Tauri updater config, then bump and push the next app version.

## Plan

- [x] Add a small tested updater helper for download progress / status reduction.
- [x] Wire Tauri updater + relaunch support into the packaged app and Settings UI.
- [x] Verify build/test coverage for the updater flow and existing repo changes.
- [x] Bump root app, sidecar, and Tauri version surfaces to the next patch release.
- [x] Commit all current changes with a conventional commit and push the branch.

## Review

- Added a tested updater helper module for:
  - Tauri updater/process runtime detection
  - download progress reduction
  - human-readable progress formatting
- Added a new Settings > App Updates panel with:
  - current version display
  - manual "check for update"
  - manual "install & restart"
  - download/install state and release notes display
- Added `tauri-plugin-process` to the desktop runtime and enabled `process:default`
  so installed updates can relaunch the packaged app.
- Version surfaces bumped to `0.1.15`:
  - root `package.json`
  - sidecar `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entries in `src-tauri/Cargo.lock`
- Corrected an accidental lockfile over-bump during version replacement:
  - restored `nodrop` to `0.1.14`
  - re-ran Rust verification after the fix
- Verification passed:
  - `pnpm --dir sidecar exec tsx --test ../tests/updater.test.ts`
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)
- OTA publication is not yet end-to-end releasable from this shell:
  - `pnpm tauri build --bundles app` generated `TeamForge.app` and `TeamForge.app.tar.gz`
  - bundling then stopped because `TAURI_SIGNING_PRIVATE_KEY` is missing
  - the existing Cloudflare OTA endpoint and new Settings UI are ready, but signed release publishing still requires that private key plus the artifact publish step.

## Goal

Fresh rebuild and reinstall TeamForge after cleaning old build artifacts.

## Plan

- [x] Check available Tauri build flags and project scripts.
- [x] Clean frontend and Tauri/Cargo build outputs.
- [x] Rebuild fresh macOS `.app` bundle.
- [x] Replace `/Applications/TeamForge.app` with the fresh bundle.
- [x] Verify installed app version and bundle presence.

## Review

- Tauri CLI has no native `--fresh` build flag in this project, so freshness was achieved by clearing `dist` and running `cargo clean`.
- `cargo clean --manifest-path src-tauri/Cargo.toml` removed `14.1GiB` of old Cargo/Tauri build artifacts.
- Fresh build command succeeded:
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
- Fresh bundle built at `src-tauri/target/release/bundle/macos/TeamForge.app`.
- Replaced `/Applications/TeamForge.app` with the fresh bundle.
- Installed app verification:
  - version: `0.1.14`
  - bundle executable exists
  - installed app size: `25M`

## Goal

Allow TeamForge GitHub projects to be configured from GitHub URLs/repo slugs and expand sync beyond issues to PRs, branches, and check runs.

## Plan

- [x] Add tested GitHub repo URL/slug normalization.
- [x] Extend SQLite schema/models for GitHub PRs, branches, and check runs.
- [x] Extend GitHub sync to fetch/cache PRs, branches, and branch check runs.
- [x] Surface expanded sync counts in Settings and type definitions.
- [x] Verify frontend build, Worker typecheck, sidecar build, and Rust tests.

## Review

- Settings now accepts GitHub repo slugs plus GitHub HTTPS, issue, PR, and SSH URLs, normalizing them to `owner/repo` before save.
- Backend also normalizes `github_repos` and Cloudflare integration repo entries before seeding `github_repo_configs`.
- GitHub sync now fetches and caches:
  - milestones
  - issues
  - pull requests
  - branches
  - branch/PR check runs
- Added SQLite tables for `github_pull_requests`, `github_branches`, and `github_check_runs`.
- GitHub activity now emits ops events for PR, branch, and check-run events so agent feeds/activity can consume them.
- Projects now exposes GitHub PR, branch, and failing-check counts alongside issue counts.
- Verification passed:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)

## Goal

Commit and push the Cloudflare-backed integration sync work with a fresh patch version.

## Plan

- [x] Inspect current branch, remote, and dirty worktree scope.
- [x] Bump root app, Tauri, sidecar, and lockfile version surfaces to `0.1.14`.
- [x] Run verification before committing.
- [x] Stage all intended changes.
- [x] Commit with a conventional message.
- [x] Push `main` to `origin`.

## Review

- Version surfaces updated to `0.1.14`:
  - root `package.json`
  - sidecar `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entry in `src-tauri/Cargo.lock`
- Verification passed before commit:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`28 passed, 0 failed, 3 ignored`)

## Goal

Route TeamForge integration setup through the Cloudflare Worker instead of page-local display defaults:
- `/v1/credentials` returns both shared credentials and non-secret integration config.
- GitHub repo/milestone/client ownership is hydrated from Cloudflare into SQLite.
- Clockify, Huly, Slack, and GitHub sync can run from one Cloudflare-backed flow.
- Clients/Projects pages consume backend projections without hardcoded repo display constraints.

## Plan

- [x] Extend the Cloudflare Worker credential route to include GitHub credentials and integration config.
- [x] Persist Cloudflare integration config into Tauri settings and GitHub repo config cache.
- [x] Add a unified `sync_cloud_integrations` command for Cloudflare config + Clockify/Huly/Slack/GitHub sync.
- [x] Remove UI-level ParkArea repo defaults from Settings.
- [x] Add GitHub client ownership projection using Cloudflare-provided `clientName`.
- [x] Verify worker typecheck, frontend build, sidecar build, and Rust tests.

## Review

- Cloudflare Worker:
  - `/v1/credentials` now returns shared `clockify`, `huly`, `slack`, and `github` credentials.
  - `/v1/credentials` also returns `integrations` from `TF_INTEGRATION_CONFIG_JSON`.
  - `wrangler.jsonc` and `.dev.vars.example` include the first ParkArea GitHub config preset in Cloudflare config, not page code.
- Tauri backend:
  - `sync_cloud_credentials` now persists credentials plus integration config.
  - added `sync_cloud_integrations` to run Cloudflare config sync, Clockify full sync, Huly full sync, Slack delta sync, GitHub plans sync, and agent feed refresh as one flow.
  - `github_repo_configs` now supports `client_name`; existing SQLite DBs get the column via startup `ALTER TABLE`.
  - GitHub repo defaults are no longer seeded from Projects/Settings display code.
  - background scheduler now includes GitHub plan cache refresh when a GitHub token/config is available.
- Clients:
  - client ownership for GitHub projects is driven by Cloudflare-provided `clientName`.
  - Clients can show GitHub-backed projects/issues even when there is no Clockify project yet.
  - Linked project rows now show source, repo, and GitHub issue counts.
- Version/install:
  - bumped app to `0.1.13`.
  - built and installed `/Applications/TeamForge.app`.
  - installed bundle plist confirms `CFBundleShortVersionString = 0.1.13`.
- Deployment:
  - deployed Cloudflare Worker `teamforge-api` successfully.
  - live URL: `https://teamforge-api.sheshnarayan-iyer.workers.dev`.
  - deployed version id: `f2dc126b-ed08-4e82-ab3a-cf38e2b20f90`.
  - sanitized live endpoint check confirmed Clockify/Huly/Slack credentials are available and GitHub repo integration config is present.
  - live endpoint currently reports GitHub credential unavailable until `TF_GITHUB_TOKEN_GLOBAL` is set as a Cloudflare secret.
- Verification:
  - `pnpm build` ✅
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `pnpm --dir sidecar build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`28 passed, 0 failed, 3 ignored`)
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅

## Goal

Implement GitHub-driven TeamForge Projects:
- GitHub issues become the source of truth for project plans/activity.
- ParkArea Phase 2 (`Sheshiyer/parkarea-aleph`, milestone `1`) appears as a TeamForge project.
- Huly remains mirror-only.
- Clockify remains the time source and overlays hours onto GitHub projects when matched.

## Plan

- [x] Add SQLite cache tables and Rust models for GitHub repos, milestones, issues, labels, and aliases.
- [x] Add GitHub client + idempotent sync command for `Sheshiyer/parkarea-aleph`.
- [x] Upsert GitHub issue events into `ops_events` and extend activity views.
- [x] Add unified execution project backend command.
- [x] Add GitHub token/repo Settings controls and manual sync button.
- [x] Update Projects UI to show GitHub execution projects first, then Clockify-only rows.
- [x] Update Activity UI to include GitHub events from `ops_events`.
- [x] Refactor sidecar mirror naming/config toward reusable GitHub-to-Huly mirror.
- [x] Bump version, build, test, create DMG, install `/Applications/TeamForge.app`.

## Review

- Implemented GitHub cache tables:
  - `github_repo_configs`
  - `github_milestones`
  - `github_issues`
  - `github_project_aliases`
- Added Rust GitHub sync path:
  - `sync_github_plans() -> Vec<GitHubSyncReport>`
  - default repo config: `Sheshiyer/parkarea-aleph`, milestone `1`
  - issue identity: `github:<repo>:issue:<number>`
  - project identity: `github:<repo>:milestone:<number>`
  - idempotent issue upsert and `ops_events` upsert
  - explicit events for opened, updated, closed, reopened, labels changed, assignees changed
- Added project/activity backend views:
  - `get_execution_projects()`
  - `get_project_activity(project_id, limit)`
  - Activity now reads canonical `ops_events`
- Updated frontend:
  - Projects shows GitHub execution projects first and Clockify-only rows after.
  - Summary cards now show GitHub project count, issue completion, and open issue count.
  - Activity can link to GitHub source URLs and show source/status.
  - Settings has GitHub token/repo controls plus `SYNC GITHUB PLANS`.
- Updated Huly sidecar:
  - `pnpm mirror:github` added.
  - ParkArea remains default preset, but project identity is env-overridable.
  - Existing Huly issues are updated from GitHub/cache instead of skipped.
  - `TEAMFORGE_DB_PATH` can mirror from TeamForge's local `github_issues` cache; otherwise it falls back to GitHub API.
- Version/install:
  - bumped root app, Tauri, and sidecar versions to `0.1.12`
  - installed `/Applications/TeamForge.app`
  - DMG created at `src-tauri/target/release/bundle/dmg/TeamForge_0.1.12_aarch64.dmg`
- Verification:
  - `pnpm build` ✅
  - `pnpm --dir sidecar build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`28 passed, 0 failed, 3 ignored`)
  - `pnpm tauri build` produced app/dmg/updater artifacts but exited non-zero because `TAURI_SIGNING_PRIVATE_KEY` is not configured for updater signing.
- Live GitHub sync status:
  - local `github_token` was not configured
  - existing `gh` CLI token is invalid
  - cloud credential endpoint currently returns Clockify/Huly/Slack only, not GitHub
  - unauthenticated GitHub API returns 404 for the private repo
  - implementation is ready, but live issue backfill needs a GitHub token saved in Settings or returned by cloud credential sync.

## Goal

Fix the reported "Projects shows zero" state and ship a clearly identifiable fresh install build:
- ensure Projects loader survives startup/backend warmup races
- bump app version for easy visual verification
- deliver and open a fresh `.dmg` + replace `/Applications/TeamForge.app`

## Plan

- [x] Verify live DB actually contains projects/time data
- [x] Confirm loader hardening is present for partial failures + retry
- [x] Bump app version to `0.1.11`
- [x] Build fresh frontend + Tauri app bundle
- [x] Produce fresh DMG and open it for installer flow
- [x] Replace `/Applications/TeamForge.app` and launch updated app

## Review

- Data presence confirmed in live DB (`~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`):
  - `projects`: `11`
  - `time_entries`: `241`
  - current-month entries: `31`
- `Projects.tsx` already contains hardened loader behavior:
  - `Promise.allSettled` instead of fail-fast `Promise.all`
  - retries every `2s` until first successful load
  - refreshes every `60s` after success
  - fallback synced-project count from breakdown when catalog is unavailable
- Version bump applied:
  - `package.json`: `0.1.11`
  - `src-tauri/Cargo.toml`: `0.1.11`
  - `src-tauri/tauri.conf.json`: `0.1.11`
- Build verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed, 0 failed, 3 ignored`)
- Fresh artifacts:
  - app bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
  - dmg: `src-tauri/target/release/bundle/dmg/TeamForge_0.1.11_aarch64.dmg`
    - generated via manual `hdiutil create` because Tauri `bundle_dmg.sh` failed in this shell context
- Installed and launched:
  - replaced `/Applications/TeamForge.app` with the fresh bundle
  - opened the new DMG and launched `/Applications/TeamForge.app`
  - app plist confirms `CFBundleShortVersionString = 0.1.11`

## Goal

Execute post-fix validation flow requested by user:
- rebuild/run latest Tauri app
- run one sync pass to backfill corrected project mapping
- verify Projects and Knowledge data surfaces are now populated

## Plan

- [x] Rebuild latest Tauri app bundle from current code
- [x] Run one headless sync-equivalent pass using local settings and Clockify API
- [x] Verify project mapping coverage and project breakdown data in local DB
- [x] Verify Huly document source reachability for Knowledge page

## Review

- Rebuilt app successfully:
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅
  - artifact: `src-tauri/target/release/bundle/macos/TeamForge.app`
- Ran one headless Clockify backfill pass (equivalent to pressing `SYNC NOW` for project mapping correctness):
  - fetched entries: `209`
  - project mapping updates applied: `209`
- Local DB project mapping state improved:
  - before: `mapped_project_id=0` / `227`
  - after: `mapped_project_id=203` / `227` (`24` remained `No Project`)
- Current month project breakdown now resolves named projects:
  - `HeyZack` and `Axtech-ERP` buckets present (plus a small `No Project` bucket)
- Verified live Huly data path for Knowledge backend:
  - `preview_live_huly_workspace_normalization` test succeeded
  - Huly `document:class:Document` fetch returned documents in live run

## Goal

Deep audit page-by-page data coverage and fix missing synced data in UI:
- verify what each page reads from local DB or live Huly APIs
- identify Huly/Clockify data that is synced but not rendered
- fix the immediate project visibility gap (`projects synced` in Settings but empty/partial Projects page)
- implement at least one additional high-signal Huly-backed page data path that is currently stubbed

## Plan

- [x] Audit page-to-command-to-source mapping and identify concrete missing coverage per page
- [x] Fix Clockify time-entry project mapping so `project_id` is persisted correctly
- [x] Add a project catalog API and update Projects page to render synced projects even with 0 tracked hours
- [x] Replace one stubbed page data path with real Huly-backed data (Knowledge)
- [x] Verify with `pnpm build` and `cargo test --manifest-path src-tauri/Cargo.toml`

## Review

- Root-cause found for “projects synced but nothing useful in Projects UI”:
  - Clockify time-entry parser expected nested `project` object only, so `time_entries.project_id` was stored as `NULL`.
  - Projects page only consumed project breakdown rows from time entries, so synced project catalog was not directly rendered.
- Fixes shipped:
  - Added `project_id` parsing from Clockify time entries and kept nested project fallback.
  - Added a 30-day overlap window on incremental Clockify sync so recent entries can self-heal after parser fixes.
  - Added `get_projects_catalog` Tauri command and UI merge logic so Projects page always shows synced projects (0h rows included).
  - Replaced Knowledge page backend stub with real Huly document ingestion (`get_documents` + `get_persons` mapping).
- Remaining deep-review findings (not fixed in this pass):
  - `Clients`, `Devices`, `Sprint detail`, `Training tracks/status`, `Skills matrix`, `Onboarding flows`, and `Planner capacity` still return stub responses in `commands/mod.rs`.
- Verification:
  - `pnpm build` ✅

## Goal

Unblock Huly engagement seeding by rewriting sidecar sync to REST-only mode that does not depend on broken `@hcengineering/tracker` package publishing.

## Plan

- [x] Remove broken sidecar dependencies and keep installable package surface.
- [x] Rewrite `sidecar/src/seed-parkarea.ts` to use Huly REST endpoints (`config/selectWorkspace/find-all/tx`) with string class refs.
- [x] Preserve idempotent upsert behavior for Project + Components + GitHub Issues.
- [x] Update `sidecar/README.md` runbook to reflect the REST-first implementation.
- [x] Run sidecar install + typecheck/build verification and document outcomes.

## Review

- Sidecar dependency surface simplified in `sidecar/package.json`:
  - removed broken upstream chain (`@hcengineering/tracker`, `@hcengineering/core`, `@hcengineering/document`, `ws`, overrides)
  - retained installable minimal dependency: `@hcengineering/api-client@0.7.3`
- Rewrote `sidecar/src/seed-parkarea.ts` to REST-only Huly flow:
  - `config.json` discovery + `selectWorkspace` JSON-RPC session negotiation
  - typed REST helper for:
    - `find-all` queries
    - `tx` mutations via `core:class:TxCreateDoc`
    - account info lookup
  - string class refs used directly:
    - `tracker:class:Project`
    - `tracker:class:Component`
    - `tracker:class:Issue`
  - preserved idempotent upsert semantics:
    - project by `identifier`
    - components by `(space,label)`
    - issues by `(space,number)`
  - preserved GitHub mirror and component inference heuristics.
- Updated `sidecar/README.md`:
  - run command now documents REST-first path (`pnpm seed:parkarea`)
  - added endpoint contract details (`config/selectWorkspace/find-all/tx`)
  - replaced blocker section with current status: typed SDK still unstable, REST seeder is unblocked.
- Verification:
  - `pnpm install` in `sidecar/` ✅ (completed after enabling network)
  - `pnpm build` in `sidecar/` ✅
  - `pnpm seed:parkarea` ✅ startup path; exits with expected env guard:
    - `FATAL: HULY_TOKEN is required.`
  - Live seeded run with real credentials ✅:
    - Workspace: `46352c1b-9c0a-4562-b204-d39e47ff0b1b`
    - Project created: `PARKAREA` (`69dff7f96c1ce2a20e000000`)
    - Components created: `10`
    - GitHub issues mirrored: `21 created`, `0 existing`

## Goal

Fix Projects page showing zero synced projects despite existing Clockify data.

## Plan

- [x] Verify whether live SQLite tables (`projects`, `time_entries`) actually contain data.
- [x] Identify frontend/backend failure path causing zero-state rendering.
- [x] Harden `Projects.tsx` loader against early backend readiness races and partial command failures.
- [x] Build and reinstall app bundle for immediate user verification.

## Review

- Confirmed live DB had non-zero project/time data:
  - `projects`: `11`
  - `time_entries`: `241`
  - active employees: `6`
  - current month entries: `31` (non-zero hours)
- Root cause was in Projects page data loading behavior:
  - `Promise.all` failed hard if either `getProjectsCatalog` or `getProjectBreakdown` errored once.
  - first-load failure path (common when DB/backend state is still warming) was swallowed and permanently rendered zero-state with no retry.
- Updated `src/pages/Projects.tsx`:
  - switched to `Promise.allSettled` with partial fallback (catalog/breakdown independent),
  - treat load as failed only if both requests fail,
  - added adaptive auto-retry loop:
    - retry every `2s` until successful,
    - refresh every `60s` after success,
  - preserved no-data behavior for genuine empty datasets.
- Verification/build:
  - `pnpm build` ✅
  - `pnpm tauri build --no-bundle` ✅
  - updated `TeamForge.app` bundle generated and installed to `/Applications`, then relaunched.
  - `pnpm tauri build --no-bundle` ✅ (updated release binary)
  - `pnpm tauri build --bundles app` produced updated `TeamForge.app` bundle (command exits non-zero after bundle because updater signing key is missing, expected in this environment).
  - Replaced `/Applications/TeamForge.app` with the new `TeamForge.app` bundle and relaunched.
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Provide current founder bearer token and run a full clean Tauri rebuild:
- print the active `cloud_credentials_access_token`
- clear old build artifacts/caches
- run a fresh Tauri build with latest code

## Plan

- [x] Read active `cloud_credentials_access_token` from local TeamForge DB
- [x] Clear project build artifacts/caches for a clean Tauri rebuild
- [x] Run `pnpm tauri build` and capture outcome
- [x] Document verification/review and return token + build result

## Review

- Read active local token from:
  - `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
  - key: `cloud_credentials_access_token`
  - length: `64`
- Cleared old artifacts/caches:
  - removed `dist`
  - removed `src-tauri/target`
  - removed `node_modules/.vite`
- Rebuild attempts:
  - `pnpm tauri build` -> compiled app, failed on DMG bundling
  - `pnpm tauri build --bundles app` -> bundled app, then failed because updater signing key env missing (`TAURI_SIGNING_PRIVATE_KEY`)
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` -> success
- Fresh output artifact:
  - `src-tauri/target/release/bundle/macos/TeamForge.app`
  - mtime: `2026-04-11 17:31:11`

## Goal

Roll out shared bearer token for founder cloud credential sync:
- generate one secure token
- set Worker secret `TF_CREDENTIAL_ENVELOPE_KEY`
- persist the same token to TeamForge local setting `cloud_credentials_access_token`

## Plan

- [x] Generate a new 32-byte hex token and keep it in-process for setup
- [x] Apply token to Cloudflare Worker secret `TF_CREDENTIAL_ENVELOPE_KEY`
- [x] Upsert `cloud_credentials_access_token` in local TeamForge settings DB
- [x] Verify both values are configured without printing full secret value

## Review

- Generated a fresh 64-char hex bearer token via `openssl rand -hex 32`.
- Uploaded Worker secret using Wrangler:
  - `pnpm dlx wrangler secret put TF_CREDENTIAL_ENVELOPE_KEY`
  - result: `Success! Uploaded secret TF_CREDENTIAL_ENVELOPE_KEY`
- Updated local TeamForge settings DB key:
  - key: `cloud_credentials_access_token`
  - db path: `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
- Verification (redacted):
  - local DB token length: `64`
  - generated-token hash == DB-token hash: `true`
  - Wrangler secret list includes `TF_CREDENTIAL_ENVELOPE_KEY`: `true`
- Cleanup:
  - removed temporary `/tmp/teamforge_token` after verification

## Goal

Set cloud-driven credentials as the default workflow:
- cloud credential sync should be enabled by default (unless explicitly disabled)
- preserve secure token requirement and simple setup for founder/cofounder sync
- align Settings copy with default-on behavior

## Plan

- [x] Flip startup and Settings defaults so cloud credential sync is on unless user turns it off
- [x] Update Settings labels/help text to reflect default-on founder workflow
- [x] Verify with frontend build and document the result

## Review

- Startup sync default changed to enabled unless explicitly disabled:
  - app now skips cloud credential sync only when `cloud_credential_sync_enabled === "false"`
- Settings cloud sync state now defaults to enabled and treats missing value as enabled.
- Cloud sync UI copy updated to reflect default-on behavior for founder/cofounder shared-token flow.
- Verification:
  - `pnpm build` ✅

## Goal

Immediate hardening + coherence pass for cloud credentials and OTA:
- lock down `/v1/credentials` and `/internal/*` routes
- fix OTA updater endpoint output and query mapping for Tauri updater compatibility
- make desktop cloud credential sync opt-in (user-enabled) instead of automatic at startup

## Plan

- [x] Add Worker auth guards for credential and internal routes using secret-backed bearer validation
- [x] Update OTA check route to return raw updater manifest and support `target` query mapping
- [x] Update Tauri updater endpoint template to use `target` and align with Worker parsing
- [x] Make startup credential sync opt-in and add Settings controls for cloud sync config + manual sync
- [x] Verify with frontend build, worker typecheck, and Rust tests; then capture review notes

## Review

- Locked down credential and internal Worker routes:
  - added bearer auth helper in `cloudflare/worker/src/lib/auth.ts`
  - `/v1/credentials` now requires `Authorization: Bearer <token>` matching `TF_CREDENTIAL_ENVELOPE_KEY`
  - `/internal/*` now requires bearer auth matching `TF_WEBHOOK_HMAC_SECRET`
- Fixed OTA updater compatibility:
  - `handleOtaCheck` now supports `target=<platform-arch>` parsing
  - returns top-level updater manifest JSON (no `ok/data` envelope)
  - returns `204` for no-update cases instead of wrapped payloads
  - Tauri updater endpoint updated to pass `target={{target}}`
- Made cloud credential sync opt-in:
  - app startup now checks `cloud_credential_sync_enabled` before calling sync
  - Settings now includes a `CLOUD CREDENTIAL SYNC` card with:
    - startup opt-in toggle
    - bearer token field
    - save config action
    - manual "sync now" action
  - Rust sync command now reads local cloud settings (`base_url`, `audience`, `access_token`) and sends authenticated bearer requests
- Verification:
  - `pnpm build` ✅
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Review the latest staged + unstaged changes with focus on:
- UI differences between logged-in/browser expectations and Tauri runtime behavior
- new cloud credential secret sync path
- new OTA/updater rollout path

## Plan

- [x] Inspect full staged and unstaged git diff surfaces
- [x] Trace secret-manager credential flow end-to-end (worker route -> Tauri command -> app bootstrap)
- [x] Trace OTA route/manifest flow end-to-end (worker route -> tauri updater config/runtime)
- [x] Produce severity-ranked review findings with concrete file/line references

## Review

- Completed a full diff-based review over the latest staged backend/Tauri updates and unstaged Team UI pass.
- Identified multiple release-blocking findings in secrets and OTA flow (details provided in response with file/line refs).
- Validation included:
  - `git diff --cached --name-only`
  - `git diff --cached --stat`
  - targeted source reads in Worker routes, Tauri commands/config, and app bootstrap calls

## Goal

Run a final UI coherence pass with responsive breakpoint hardening, focused on the Team route:
- tighten Team breakpoint behavior (desktop/tablet/mobile) so assignment controls and org cards do not collapse awkwardly
- align Team visual language with the shared LCARS design system primitives instead of route-local ad hoc spacing/width choices
- fix overflow-prone sections (notably tables and selector rails) so dense data remains usable on narrower widths

## Plan

- [x] Capture current Team/App responsive and design-coherence gaps from code and runtime behavior
- [x] Implement Team page breakpoint and layout fixes (directory rail, org bento cards, role/member controls, table overflow)
- [x] Align Team styles to shared LCARS page primitives and consistent spacing/shape rules
- [x] Run build verification and log final review evidence + residual risks

## Review

- Responsive hardening completed for Team route with three practical breakpoints:
  - compact stack mode below `1180px`
  - narrow control behavior below `980px`
  - mobile single-column behavior below `760px`
- Team page layout fixes:
  - org action row now adapts spacing/alignment on narrow widths
  - directory/select controls avoid fixed-width overflow and collapse cleanly
  - role/member grids collapse to single-column on mobile
  - org canvas can safely scroll horizontally in narrow contexts
  - monthly hours table now renders inside an explicit horizontal scroll container with minimum table width
- Employee summary panel now adapts at the same narrow/mobile breakpoints:
  - header and selector stack cleanly on mobile
  - identity card/aside collapse to a single flow on narrow widths
  - detail rows convert to vertical layout on mobile to avoid clipped metadata
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual risk:
  - Playwright browser tooling failed to initialize in this environment (`ENOENT` for `/.playwright-mcp`), so this pass is code-and-build verified rather than screenshot-verified.

## Goal

Begin Phase 2 Wave 1 of the Cloudflare backend program:
- provision the first TeamForge D1 database in Cloudflare so the backend scaffold binds to a real account resource
- scaffold the Cloudflare Worker package and Wrangler config in-repo
- add the first additive D1 migration that matches the frozen schema contract

## Plan

- [x] Record the Phase 2 Wave 1 execution slice and expected deliverables in this task log
- [x] Use the Cloudflare MCP to locate the D1 API surface and attempt provisioning of the initial TeamForge database
- [x] Scaffold the Worker package, Wrangler config, and initial D1 migration files under a dedicated cloud package
- [x] Review the resulting package for coherence, document verification, and capture the next implementation slice

## Review

- Added a new Cloudflare backend scaffold under `cloudflare/worker/` with:
  - `wrangler.jsonc`
  - `package.json`
  - `tsconfig.json`
  - `.dev.vars.example`
  - `src/index.ts`
  - `src/lib/*`
  - `src/routes/*`
  - `migrations/0001_initial.sql`
  - `fixtures/v1/*`
- The Worker scaffold now:
  - binds the contract-required D1, R2, Queue, and Durable Object resources
  - exposes `/`, `/healthz`, `/v1/bootstrap`, and `/v1/remote-config`
  - reserves the rest of the Phase 1 route contract behind explicit `feature_not_ready` responses instead of silent drift
  - includes a placeholder `WorkspaceLock` Durable Object for future serialized sync and normalization flows
- The first D1 migration creates the canonical shared tables from the contract pack:
  - organizations, workspaces, devices
  - employees and employee/project external ID mapping tables
  - integration connection and credential metadata
  - sync cursor/job/run state
  - normalization, transitional leave/holiday, remote config, OTA, and audit tables
  - seeded `canary` and `stable` OTA channels
- Captured payload fixtures for:
  - bootstrap
  - remote config
  - projects
  - project mappings
  - sync job status
  - OTA manifest
- Cloudflare MCP result:
  - confirmed the live D1 endpoints from the Cloudflare API spec
  - attempted live account execution through the MCP
  - remote provisioning is still blocked by `10000 Authentication error`, so the Wrangler config keeps placeholder resource IDs until account auth is fixed
- Verification:
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `sqlite3 ':memory:' < cloudflare/worker/migrations/0001_initial.sql` ✅
- Next executable slice:
  - authenticate Cloudflare MCP or Wrangler against the target account
  - create the real `teamforge-primary` D1 database, `teamforge-artifacts` bucket, and `teamforge-sync` queue
  - replace Wrangler placeholder IDs
  - implement repository-backed `/v1/projects`, `/v1/project-mappings`, and `/v1/connections` routes

---

## Goal

Begin Phase 1 of the Cloudflare backend + OTA program:
- freeze the system boundary, trust boundary, secrets model, schema contract, route contract, updater contract, and migration/rollback rules in repo docs
- give Phase 2 implementation work a stable contract pack instead of relying on chat context

## Plan

- [x] Record the exact Phase 1 deliverables in the task log and map them to repo artifacts
- [x] Create the Phase 1 contract pack under `docs/architecture/`
- [x] Link the contract pack from the main Cloudflare architecture plan and review for coherence
- [x] Document the Phase 1 outcome and identify the next executable slice

## Review

- Created the Phase 1 contract pack under `docs/architecture/contracts/`:
  - `README.md`
  - `phase1-baseline.md`
  - `secrets-auth-contract.md`
  - `d1-schema-contract.md`
  - `worker-route-contract.md`
  - `ota-updater-contract.md`
  - `migration-rollback-contract.md`
- Updated `docs/architecture/cloudflare-backend-ota-design.md` so the main architecture plan now points directly at the Phase 1 contract pack.
- The contract pack now freezes:
  - service ownership and environment boundaries
  - lock-zone files
  - secret ownership and trust boundaries
  - canonical D1 scope
  - Worker route and response rules
  - Tauri OTA artifact and manifest expectations
  - migration stages, feature flags, reconciliation requirements, and rollback triggers
- Verification:
  - reviewed the new contract docs in-place after writing them
  - reviewed the top of `tasks/todo.md` and `cloudflare-backend-ota-design.md` to confirm the new artifacts are linked coherently
  - no build/test rerun, because this slice changed architecture documentation only
- Next executable slice:
  - Phase 2 Wave 1
  - scaffold the Cloudflare Worker package, Wrangler config, and initial D1 migrations
  - keep lock-zone edits serialized when updater plumbing begins

---

## Goal

Draft the exact Cloudflare backend and OTA architecture using the requested `swarm-architect` skill:
- define the Cloudflare secret layout for Clockify, Huly, Slack, and encrypted credential expansion
- define the canonical D1 schema, Worker route contract, and OTA manifest flow
- define a phased migration path from the current local-first TeamForge app

## Plan

- [x] Load the requested `swarm-architect` skill and its required planning context
- [x] Review the existing TeamForge Huly/system docs plus current Tauri bootstrap files
- [x] Produce an execution-ready architecture artifact covering backend, OTA, and migration

## Review

- Created [cloudflare-backend-ota-design.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/cloudflare-backend-ota-design.md).
- The design freezes the target shape as:
  - Edge API Worker
  - D1 for canonical shared persistence
  - R2 for OTA artifacts, signatures, and large snapshots/exports
  - Queues for async vendor sync
  - Workflows for backfills and reconciliation
  - Durable Objects only for serialized coordination
- The plan uses Cloudflare secret management for shared upstream vendor credentials and keeps Tauri signing credentials in CI/CD secret storage instead of Worker runtime.
- The architecture artifact includes:
  - discovery summary and constraints
  - exact secret layout
  - exact D1 schema
  - exact Worker route contract
  - exact OTA manifest and release flow
  - phased migration path
  - phase / wave / swarm decomposition with 90 dependency-aware tasks
- Verification:
  - reviewed the requested skill's playbooks, templates, schemas, and runbook
  - reviewed existing TeamForge docs and current Tauri bootstrap/config files
  - no build/test rerun, because this pass created a planning artifact rather than executable changes

---

## Goal

Review whether TeamForge should insert a Cloudflare layer between the desktop app and current services:
- evaluate a Cloudflare Worker / Durable Object / storage architecture for project management, bridge logic, and backend persistence
- verify the current OTA update path available for this Tauri desktop app
- recommend a concrete architecture and rollout path

## Plan

- [x] Verify current Cloudflare service capabilities and fit for TeamForge's bridge/persistence layer
- [x] Verify the current Tauri updater / OTA model and what it can realistically deliver
- [x] Recommend the simplest viable architecture, including what should stay local vs move to Cloudflare

## Review

- Cloudflare can sit cleanly in the middle, but the right shape is not “one Worker that does everything.”
- Recommended split:
  - Edge API Worker as the desktop app's single remote entrypoint
  - D1 for shared relational persistence if TeamForge needs a central multi-device/team backend
  - R2 for OTA bundles, signatures, exports, and larger snapshot payloads
  - Queues for ingestion and retryable background sync from Clockify / Huly / Slack
  - Workflows for long-running backfills, reconciliation, and human-reviewed sync flows
  - Durable Objects only where strict serialization matters, such as “one sync per workspace/project at a time” or shared mutation locks
- Durable Objects are a coordination primitive, not the default primary database here. They fit workspace/project command serialization better than broad analytics persistence.
- Tauri OTA is not wired in this repo today:
  - no updater plugin dependency in `package.json` or `src-tauri/Cargo.toml`
  - no updater configuration in `src-tauri/tauri.conf.json`
  - no signing keys, updater endpoints, or artifact generation configured
- Best OTA design for this app:
  - generate signed updater artifacts during CI
  - upload artifacts + `.sig` files to R2
  - serve either a static manifest or a rollout-aware dynamic manifest from a Cloudflare Worker
  - call the Tauri updater plugin from the desktop app to check, download, install, and relaunch
- Important constraint:
  - Tauri OTA updates ship new signed binaries; they are not “hot code push” for native Rust changes
  - if you want lightweight post-install changes, treat those separately as remote config / remote data from the Worker
- Verification:
  - reviewed current repo config in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
  - verified current platform capabilities against official Cloudflare and Tauri docs
  - no code or build changes in this pass

---

## Goal

Review the full Settings surface for integrations, connections, and Huly coverage:
- inventory every live Settings option and what it actually persists or tests
- trace each Settings integration through the frontend and Rust command layer
- identify what remains pending, missing, or partial in the Huly integration

## Plan

- [x] Inspect the Settings UI and saved setting keys to inventory the available options
- [x] Trace Clockify, Huly, and Slack connection flows through `useInvoke` and Rust commands
- [x] Review Huly-backed features and list what is still pending or only partially implemented
- [x] Document findings, risks, and open questions in this review section

## Review

- Current Settings surface is limited to three integrations: Clockify, Huly, and Slack, plus sync controls and crew quota management. The UI persists only `clockify_*`, `huly_token`, and `slack_*` settings and exposes no other integrations.
- Clockify is the most complete integration operationally:
  - test connection + workspace selection
  - ignored-crew filtering
  - manual and background sync
  - downstream use across presence, timesheets, quotas, and people state
- Huly is partially integrated:
  - token test/save
  - manual full sync
  - cached Team/Calendar snapshot refresh
  - downstream reads for milestones, board cards, chat, meetings, org data, leave, and holidays
- Slack is additive, not foundational:
  - bot-token validation + optional channel filters
  - downstream reads only for chat activity and standup/message enrichment
- Main findings:
  - Huly “Test Connection” only validates account access, not the workspace capabilities the app actually depends on. Missing HR/calendar/chunter classes can still produce a green Settings state.
  - Huly base URL is hardcoded to `https://huly.app`, so self-hosted or alternate Huly deployments are not configurable from Settings.
  - Calendar leave and holiday editing is local-only today. The app reads Huly leave/holiday cache, but manual edits are written to local SQLite tables and do not sync back to Huly.
  - Huly workspace normalization tooling exists in the backend and covers projects/issues/channels/boards/doc hygiene, but it is not exposed through `useInvoke` or the Settings UI.
  - Clockify-to-Huly project linkage is still pending in local persistence: project rows have `huly_project_id`, but Clockify sync always writes `None`.
  - Background sync is Clockify-only. Huly sync must be triggered manually through Settings or a Team/Calendar refresh path.
- Verification:
  - reviewed `src/pages/Settings.tsx`, `src/hooks/useInvoke.ts`, `src/App.tsx`
  - reviewed `src-tauri/src/commands/mod.rs`, `src-tauri/src/huly/client.rs`, `src-tauri/src/huly/sync.rs`, `src-tauri/src/clockify/sync.rs`, `src-tauri/src/sync/scheduler.rs`
  - reviewed Huly/Slack consumer pages and calendar/team cache flows
  - no build/test rerun, because this pass was a code review and integration audit only

---

## Goal

Replace the broken Team drag-and-drop org assignment flow with explicit assignment controls:
- stop depending on roster drag/drop for department and role mapping
- add dropdown-based assign controls for member, head, and team lead placement
- verify the new Team interaction still saves cleanly through the existing org mapping path

## Plan

- [x] Inspect the current Team assignment render path and identify the smallest replacement surface
- [x] Replace drag-and-drop interactions with explicit dropdown-based role and department assignment controls
- [x] Verify with build/test commands and record the interaction change

## Review

- Removed the broken Team page drag-and-drop state entirely from `src/pages/Team.tsx` instead of trying to preserve a partially working pointer flow.
- Added direct assignment dropdowns to the roster and unassigned tray so every visible person can be mapped to `Unassigned`, `Department • Member`, `Department • Head`, or `Department • Team Lead`.
- Reworked each department card to use explicit Head and Team Lead selectors plus the existing member removal control, while keeping the existing draft/save org-chart persistence path unchanged.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual note:
  - I did not run a manual desktop click-through of the Team page after this interaction change, so this pass is build/test verified rather than interactively QA’d.

---

## Goal

Cut the next TeamForge release so Team becomes a people-first surface again:
- move leave and holiday calendar operations off the Team page into a dedicated Calendar route
- add an employee-specific detail view with summary signals for standups, leave, work hours, meetings, and related ops context
- bump the app from `0.1.5` to `0.1.6` once the split is implemented and verified

## Plan

- [x] Add the route/version scope for the next release (`/calendar`, nav updates, `0.1.6` target)
- [x] Slim `Team` down to org mapping, department structure, and employee detail drill-down
- [x] Build the new `Calendar` page for leave tracking, holiday management, and yearly calendar views
- [x] Add a backend-backed employee summary command and frontend types/invoke plumbing
- [x] Verify with frontend build and Rust tests, then record the release review

## Review

- Added a dedicated `Calendar` route and shell navigation entry so leave tracking and yearly holiday management no longer live on the Team page.
- Slimmed `src/pages/Team.tsx` down to the org chart editor, department structure, and a new employee operations drill-down backed by a single summary payload instead of multiple frontend joins.
- Added `src/components/team/EmployeeSummaryPanel.tsx` plus the Rust/TypeScript summary plumbing so Team can show per-employee work hours, meeting load, standup activity, leave state, and upcoming schedule.
- Added `src/pages/Calendar.tsx` to own the leave editor, holiday editor, and yearly holiday calendar using the existing cache-first Team snapshot flow.
- Bumped release metadata and README guidance from `0.1.5` to `0.1.6`, including the new Calendar route and updated keyboard shortcut note for Settings.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual note:
  - I did not do a manual click-through of the new Team and Calendar routes this turn, so this pass is compiler/test verified rather than interactively QA’d in the desktop shell.

---

## Goal

Update the README so it matches the latest shipped TeamForge state:
- document the app-wide LCARS overhaul, local leave/holiday management, and current release path
- keep the existing visual README style, screenshots, and Thoughtseed framing

## Plan

- [x] Read the requested README skill and inspect the current README plus shipped changes
- [x] Refresh README sections that are now outdated after the UI/release work
- [x] Review the updated README for coherence and record the doc update

## Review

- Updated `README.md` in the existing visual/landing-page style instead of replacing it with a generic template.
- Refreshed the stale release and feature messaging to match the current shipped state:
  - `v0.1.5` release callout
  - app-wide LCARS consistency overhaul
  - local leave + yearly holiday management on the Team page
  - cache-first Team snapshot behavior
  - tag-driven macOS `.app` / `.dmg` release path
- Updated the Team/dashboard and project-structure sections so the docs now mention the SQLite-backed Team workflows plus the shared UI infrastructure (`hooks/` and `lcarsPageStyles`).
- Review result:
  - checked the edited README sections in-place for stale version references and broken flow ✅
  - no code build/test rerun, because this pass only changed markdown and task notes

---

## Goal

Ship the current TeamForge changes as a new release build:
- bump the app version from `0.1.3` to `0.1.5`
- commit and push the current app/design work on `main`
- push a release tag so GitHub Actions builds the new DMG

## Plan

- [x] Inspect git state, branch, version files, and release workflow triggers
- [x] Bump version metadata consistently to `0.1.5`
- [x] Re-run verification after the version bump
- [x] Commit and push `main`
- [x] Create and push tag `v0.1.5` to trigger the DMG workflow
- [x] Confirm the GitHub Actions release workflow was triggered

## Review

- Initial tag `v0.1.4` triggered the release workflow, but it failed in `Setup pnpm` because `.github/workflows/release.yml` pinned `pnpm/action-setup` to `version: 10` while the repo declares `packageManager: "pnpm@10.33.0"`.
- Fixed the workflow by aligning `pnpm/action-setup` to `10.33.0`, then cut a follow-up release version `0.1.5` instead of rewriting the already-pushed failed `v0.1.4` tag.
- Release metadata now points to `0.1.5` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.lock`
- Verification after the CI fix/version bump:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Git history / release refs:
  - `e6618b3` pushed to `main` as `release: ship TeamForge 0.1.4`
  - `e1bd1be` pushed to `main` as `fix(ci): cut TeamForge 0.1.5 release`
  - tag `v0.1.4` pushed and failed in CI
  - tag `v0.1.5` pushed and triggered the fixed release workflow
- Current GitHub Actions status:
  - Run `24125002100` is in progress at `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24125002100`
  - The run has already passed `Setup pnpm`, `Setup Rust`, and dependency installation, and is currently in `Build Tauri app (Apple Silicon)`

---

## Goal

Run an app-wide LCARS design consistency overhaul instead of only touching Team:
- unify page-level LCARS primitives across the shell and major views
- improve Team/calendar organization and responsive behavior
- reduce generic box/card styling in favor of a stronger console language

## Plan

- [x] Audit the app shell, major pages, and shared controls for repeated one-off styling
- [x] Add shared LCARS page primitives and shell responsive behavior
- [x] Rebuild Team / calendar tracking on top of the shared visual language
- [x] Apply the same consistency pass across the other visible dashboard pages
- [x] Verify the frontend build, Rust tests, packaged app build, and app launch

## Review

- Added a reusable LCARS page-style layer in `src/lib/lcarsPageStyles.ts` plus a viewport hook in `src/hooks/useViewportWidth.ts` so page titles, dividers, cards, buttons, tables, and toolbars now share one visual system instead of each page inventing its own.
- Strengthened the app shell in `src/App.tsx` and `src/styles/globals.css` with a deeper console background, shell gradients, tighter nav sizing logic, and more responsive spacing so the LCARS theme carries through the whole app frame.
- Updated shared controls in `src/components/ui/DateRangePicker.tsx` and `src/components/ui/Skeleton.tsx` so segmented controls and loading states match the same console treatment.
- Brought the main dashboard surfaces into alignment:
  - `src/pages/Live.tsx`
  - `src/pages/Overview.tsx`
  - `src/pages/Activity.tsx`
  - `src/pages/Projects.tsx`
  - `src/pages/Timesheet.tsx`
  - `src/pages/Insights.tsx`
  - `src/pages/Boards.tsx`
  - `src/pages/Comms.tsx`
  - `src/pages/Sprints.tsx`
  - `src/pages/Settings.tsx`
  - `src/pages/Team.tsx`
- Team got the heaviest pass: the org chart rail/canvas now stack more cleanly on narrower widths, wide department cards stop forcing awkward spans on compact layouts, leave/holiday forms collapse more cleanly, and the yearly holiday grid uses the same shared console surfaces as the rest of the app.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - launched `src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running process confirmed via `ps -ax | rg "TeamForge.app|team-forge-ts"` ✅

---

## Goal

Update TeamForge so it better reflects the Thoughtseed operating model:
- Add preview screenshots to the GitHub README
- Explain how Clockify + Huly + Thoughtseed workflow context map into the dashboard
- Expand the tray menu with quick access to a live people check and a weekly timeline
- Ignore `thoughtseedlabs@gmail.com` across Clockify-derived data so admin activity does not pollute metrics

## Plan

- [x] Inspect the current README, tray implementation, dashboard pages, and Clockify sync/query path
- [x] Update the README with preview images and a clearer architecture / cross-population explanation
- [x] Add a simple weekly timeline view backed by the existing activity data
- [x] Add tray actions for live presence and weekly timeline navigation
- [x] Filter `thoughtseedlabs@gmail.com` out of Clockify ingestion and downstream queries
- [x] Verify with build/test commands and document the result

## Review

- Added repo-local preview screenshots under `docs/images/` and embedded them into the README.
- Expanded `README.md` with a Thoughtseed-specific data-flow section that explains how Clockify, Huly, and the Thoughtseed operating model should fuse inside TeamForge.
- Added a weekly timeline card to the Activity page using the existing combined activity feed.
- Extended the tray menu with `Live Crew Check` and `Weekly Timeline`, plus wired tray navigation into the React router.
- Added an ignored-email control in Settings and enforced the ignore rule in Rust sync/query logic so `thoughtseedlabs@gmail.com` is excluded from Clockify-derived metrics and UI.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Remaining note: if the admin account already exists in local cached Clockify data, save Settings or run a sync once to apply the purge to existing records.

---

## Goal

Cut a local preview build for the latest TeamForge updates:
- Bump the app version from `0.1.0` to `0.1.1`
- Rebuild the frontend and Tauri app artifacts locally
- Re-run the verification path before preview/testing

## Plan

- [x] Inspect current version sources and build entry points
- [x] Update version metadata consistently across the app and sidecar
- [x] Run local verification and rebuild commands for the updated release
- [x] Document the build outputs and local preview status

## Review

- Bumped TeamForge from `0.1.0` to `0.1.1` in the frontend package, Tauri metadata, Rust crate metadata, and sidecar package metadata.
- Cargo refreshed `src-tauri/Cargo.lock` to match the new crate version during the verification pass.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
- Local preview artifact:
  - App bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
  - Built executable version confirmed in `Info.plist`: `0.1.1`
  - Local launch confirmed via running process: `.../TeamForge.app/Contents/MacOS/team-forge-ts`
- Packaging note:
  - Full `pnpm tauri build` compiled successfully and produced the `.app`, but the final DMG packaging step failed inside `bundle_dmg.sh`.
  - This does not block local preview/testing because the `.app` bundle was built and launched successfully.

---

## Goal

Start the Huly rollout in-repo so the execution path is explicit and trackable:
- Publish the Thoughtseed Huly system design as a source-of-truth document
- Save a phase-by-phase rollout plan with issue mapping under `docs/plans/`
- Link the rollout documents from the README so work can move from audit into execution

## Plan

- [x] Review current Huly backlog state, docs, and rollout gaps
- [x] Create the source-of-truth Huly system design document
- [x] Create a phase-by-phase rollout implementation plan under `docs/plans/`
- [x] Link the new rollout assets from the README
- [x] Verify the repo still builds and document the result

## Review

- Added `docs/huly-system-design.md` as the repo source of truth for the Thoughtseed Huly operating model, including foundation entities, module behavior, rollout phases, and success metrics.
- Added `docs/plans/2026-04-06-huly-rollout.md` as the execution plan that maps the audit and GitHub backlog into a phased rollout sequence.
- Linked both documents from `README.md` under a new `System Design` section so the repo now has an explicit control plane for rollout work.
- Verification:
  - `pnpm build` ✅
- Important limitation:
  - This slice starts the rollout in-repo, but it does not yet mutate the live Huly workspace.
  - The next real execution step is to implement safe Huly write-paths or use a verified manual workspace runbook for `#18`, `#1`, `#2`, `#3`, and `#4`.

---

## Goal

Start execution of workspace normalization issue `#18` using a safe manual path:
- create a strict workspace normalization runbook
- link the runbook into the rollout docs
- keep live Huly mutation manual until verified write-paths exist

## Plan

- [x] Review the rollout docs and `#18` scope
- [x] Create the manual workspace normalization runbook
- [x] Link the runbook from the rollout plan and system design docs
- [x] Verify the repo still builds and document the result

## Review

- Added `docs/runbooks/huly-workspace-normalization.md` as the strict manual runbook for executing workspace normalization issue `#18`.
- Linked the runbook from `docs/plans/2026-04-06-huly-rollout.md` and `docs/huly-system-design.md` so Phase 1 now has an explicit manual execution path.
- Verification:
  - `PATH=/opt/homebrew/bin:$PATH pnpm build` ✅
- Blocker:
  - GitHub issue sync for `#18` was not completed in this shell because `gh` is not available on the current PATH.
  - The runbook exists locally and is ready to be linked back to the issue once GitHub CLI or connector access is restored.

---

## Goal

Execute workspace normalization issue `#18` against the live Huly workspace using verified backend write paths:
- add safe tx-backed Huly mutation support in the Rust backend
- expose preview/apply normalization commands in the command layer
- run the normalization pass against the live workspace

## Plan

- [x] Inspect official Huly source and current workspace model assumptions for tx payloads, ids, classes, and spaces
- [x] Extend `src-tauri/src/huly/types.rs` and `src-tauri/src/huly/client.rs` with safe write-path primitives and normalized workspace domain types
- [x] Add preview/apply normalization orchestration in `src-tauri/src/commands/mod.rs`
- [x] Execute the normalization flow against the live Huly workspace
- [x] Verify the backend build and record the mutations performed

## Review

- Added tx-backed Huly write primitives in the Rust backend and aligned transaction authorship with Huly's actual REST contract: `modifiedBy` / `createdBy` now use the account's primary social identity, while workspace membership fields continue using the account UUID.
- Added typed Huly workspace domain models plus normalization report structs so preview/apply runs can produce deterministic action lists and mutation results.
- Added `preview_huly_workspace_normalization` and `apply_huly_workspace_normalization` command paths, including safe project rename/create, department shell creation, channel creation, and project-aware issue moves.
- Executed the live normalization run against workspace `46352c1b-9c0a-4562-b204-d39e47ff0b1b` after verifying the dry-run plan.
- Live mutations applied successfully:
  - Renamed project `Heyzack-AI` -> `Axtech`
  - Created projects `Tuya clients`, `OASIS R&D`, and `Internal Ops`
  - Moved the Tuya issue out of the legacy project into `Tuya clients`
  - Created departments `Engineering`, `Marketing`, and `Leadership`
  - Created channels `#standups`, `#axtech`, `#tuya-clients`, `#research-rnd`, `#tech-resources`, `#blockers-urgent`, and `#training-questions`
- Post-apply live preview confirms the normalized state:
  - `projectCount = 6`
  - `issueCount = 36`
  - `departmentCount = 4`
  - `channelCount = 10`
  - `pendingSafeCount = 0`
  - `manualReviewCount = 2`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute Issue #23: add periodic Huly sync to the background scheduler (currently Clockify-centric).

## Plan

- [x] Refactor scheduler startup to treat Clockify and Huly as independent integrations
- [x] Add periodic Huly polling loops for issues/presence/team cache
- [x] Preserve existing Clockify scheduling behavior and quota-alert checks
- [x] Ensure scheduler can still start when only one integration is configured
- [x] Verify with Rust tests

## Review

- Updated scheduler architecture in:
  - `src-tauri/src/sync/scheduler.rs`
- Behavior changes:
  - Scheduler no longer hard-requires Clockify settings to start.
  - It now starts when either integration is configured:
    - Clockify config: `clockify_api_key` + `clockify_workspace_id`
    - Huly config: `huly_token`
  - Existing Clockify jobs remain:
    - presence every 30s
    - time entries every 5m
    - users/projects + quota checks every 60m
  - New Huly jobs added:
    - issues every 10m
    - presence every 2m
    - team cache every 60m
  - If Huly token exists but Huly connection fails at scheduler boot, Clockify jobs still run; scheduler only returns `None` if no jobs can be started.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute Issue #22: persist Slack activity to durable SQLite tables so chat analytics and signals do not rely only on runtime Slack API aggregation.

## Plan

- [x] Add canonical `slack_message_activity` SQLite table + indexes
- [x] Add DB model and query APIs for idempotent Slack message persistence
- [x] Persist Slack messages during existing Slack fetch paths (`chat activity`, `employee summary`, `daily standup`)
- [x] Add fallback read path from persisted Slack activity when live Slack API is unavailable
- [x] Verify with Rust tests

## Review

- Added durable Slack activity table:
  - `src-tauri/migrations/001_initial.sql`
  - table: `slack_message_activity`
  - unique key: `message_key`
  - indexes: `(employee_id, message_ts_ms)` and `(slack_channel_id, message_ts_ms)`
- Added model + queries:
  - `src-tauri/src/db/models.rs`: `SlackMessageActivity`
  - `src-tauri/src/db/queries.rs`:
    - `upsert_slack_message_activity`
    - `get_slack_message_activity_since`
  - regression test:
    - `upsert_slack_message_activity_is_idempotent_by_message_key`
- Added command-layer persistence hooks:
  - `src-tauri/src/commands/mod.rs`
  - helper: `persist_slack_message_activity(...)`
  - writes now occur in:
    - `get_chat_activity` Slack loop
    - employee summary Slack loop
    - daily standup Slack loop
- Added fallback analytics behavior:
  - `get_chat_activity` now reads persisted `slack_message_activity` rows for the last 7 days when live Slack sync is unavailable.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml preview_live_huly_workspace_normalization -- --ignored --nocapture` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml apply_live_huly_workspace_normalization -- --ignored --nocapture` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml preview_live_huly_workspace_normalization -- --ignored --nocapture` ✅ post-apply
- Remaining manual follow-ups:
  - assign employees and team leads across `Engineering`, `Marketing`, and `Leadership`
  - inspect the empty `Default` board and decide whether to keep starter content or archive it

---

## Goal

Verify the Copaw execution path and make sure it runs real logic instead of only opening a browser:
- inspect the Copaw integration docs and launcher scripts
- identify whether the current path only starts or opens a server
- run the proper Copaw script or smoke test and capture whether it actually executes

## Plan

- [x] Inspect Copaw docs, start script, and smoke test path under `~/.openclaw`
- [x] Determine whether the current launcher only opens a browser/server shell or actually exercises Copaw logic
- [x] Run the appropriate Copaw verification path and record the result
- [x] Document findings and any blocker or fix needed

## Review

- Inspected `~/.openclaw/docs/COPAW_INTEGRATION.md`, `~/.openclaw/scripts/copaw-start.sh`, `~/.openclaw/scripts/copaw_smoke_test.sh`, and `~/.openclaw/skills/copaw/scripts/copaw_invoke.py`.
- Confirmed `copaw-start.sh` is not a browser opener. It activates the CoPaw virtualenv, refreshes provider config, and then `exec`s the real `copaw` CLI.
- Starting CoPaw inside the sandbox failed with `PermissionError` on `~/.copaw/config.json`, so runtime verification required launching the app outside the sandbox.
- Verified real runtime behavior after launching `copaw-start.sh app --port 8099`:
  - `copaw_invoke.py status` reported `CoPaw server: RUNNING`
  - the live server exposed 10 skills via `/api/skills`
  - `copaw_invoke.py chat ... --agent chitta-weaver` reached the CoPaw agent pipeline and failed only at upstream provider auth with `AuthenticationError: invalid x-api-key`
- Re-ran the full smoke test against the live server:
  - `44 passed, 7 failed, 0 skipped`
  - runtime checks now pass, proving the script executes logic instead of only opening a page
- Remaining Copaw issues found:
  - 6 manifest checks fail because Tier 1 agent manifests do not currently include `copaw`
  - 1 security check fails because the smoke test detects `api_key`/secret-like patterns in the scanned integration files
  - live agent inference is blocked by invalid provider auth (`invalid x-api-key`)

---

## Goal

Stabilize the Copaw runtime path so the launcher and smoke test reflect the real system state:
- stop `copaw-start.sh` from writing a known-invalid Anthropic auth token into Copaw config
- fix the Tier 1 manifest drift and smoke-test false positive
- rerun live Copaw verification and record the remaining external blocker, if any

## Plan

- [x] Patch `~/.openclaw/scripts/copaw-start.sh` and `~/.copaw.secret/providers.json` so Copaw no longer injects invalid Anthropic auth from Claude OAuth state
- [x] Add the missing `copaw` skill entries to the Tier 1 agent manifests under `~/.openclaw/agents/`
- [x] Narrow the Copaw smoke-test secret scan so vendored `node_modules` fixtures do not trigger false failures
- [x] Restart Copaw, rerun status + smoke test + live chat, and document the result

## Review

- Patched `~/.openclaw/scripts/copaw-start.sh` so it no longer treats `CLAUDE_CODE_OAUTH_TOKEN` as a valid Anthropic `x-api-key`. The launcher now only writes a real `ANTHROPIC_API_KEY` when one exists and otherwise leaves Copaw in a safe, explicit unauthenticated state.
- Sanitized `~/.copaw.secret/providers.json` by clearing the previously injected `sk-ant-oat...` token that Anthropic rejected as an invalid API key.
- Added the missing `copaw` skill entry to all Tier 1 manifests checked by the smoke test:
  - `noesis-vishwakarma`
  - `chitta-weaver`
  - `kosha-regulator`
  - `nadi-mapper`

---

## Goal

Stop the Team page from hanging on Huly by making it render from persistent local cache first:
- persist Team-facing Huly entities in SQLite
- serve the Team screen from cached snapshot data
- refresh Huly in the background without blanking the page when live fetch fails

## Plan

- [x] Inspect the Team page load path and current SQLite coverage
- [x] Add persistent SQLite cache tables and query helpers for Team-facing Huly entities
- [x] Extend Huly sync so Team cache is hydrated during sync runs
- [x] Split Team loading into cached snapshot + background refresh
- [x] Verify with Rust tests, frontend build, app bundle build, and macOS app launch

## Review

- Added persistent SQLite cache tables for Huly departments, people, employees, leave requests, and holidays in `src-tauri/migrations/001_initial.sql`.
- Added JSON-backed cache query helpers plus a new regression test that proves Team department cache data round-trips through SQLite.
- Extended `HulySyncEngine` so full Huly syncs now refresh Team cache data and record a `team_snapshot` sync timestamp.
- Reworked the Team command layer so `get_team_snapshot` is now SQLite-only and immediate, while `refresh_team_snapshot` does the live Huly refresh and then returns the refreshed cached snapshot.
- Updated `Team.tsx` to render cached Team data first, show cache status, and keep stale data visible if live Huly refresh fails.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running process confirmed for `TeamForge.app/Contents/MacOS/team-forge-ts` ✅

---

## Goal

Stop the Team screen from constant self-refreshing and make the running build obvious:
- eliminate the Team page refresh loop / skeleton churn
- show the shipped app version in the bottom-left footer above the brown bar
- cut a visibly newer build and clean old artifacts / caches before launch

## Plan

- [x] Record the correction and verify the Team load loop root cause
- [x] Fix the Team page refresh loop and keep cached loading stable
- [x] Show the app version in the sidebar footer and bump version metadata
- [x] Clean old build artifacts and caches, then rebuild the app bundle
- [x] Verify the launched app is the new version and document the result

## Review

- Stabilized `useInvoke` so it now returns a module-level API object instead of recreating a fresh invoke surface on every render. This removes the Team page self-refresh loop that was retriggering the cached/background load effect.
- Bumped the app from `0.1.2` to `0.1.3` in the frontend package, sidecar package, Rust crate metadata, and Tauri bundle config.
- Added a runtime version read in `App.tsx` and surfaced `BUILD v0.1.3` above the sidebar's brown footer bar so the running app version is visible inside the UI.
- Cleaned old build artifacts and caches before rebuilding:
  - removed repo build artifacts under `dist/`, `.pnpm-store/`, and `src-tauri/target/`
  - cleared persisted Team snapshot cache rows from `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
  - replaced the older `/Applications/TeamForge.app` with the rebuilt `0.1.3` bundle so the default macOS launch target now matches the new build
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - generated bundle plist shows `CFBundleShortVersionString = 0.1.3` and `CFBundleVersion = 0.1.3` ✅
  - relaunched `TeamForge.app` and confirmed the running process path points at `/Applications/TeamForge.app/Contents/MacOS/team-forge-ts` ✅

---

## Goal

Keep Team snapshot refresh alive even when this Huly workspace is missing optional HR classes:
- identify the missing-class failure mode behind the `find_all 404 INVALID CLASS NAME` error
- degrade unsupported Team snapshot classes to empty results
- rebuild and verify the Team path after the fallback is in place

## Plan

- [x] Record the invalid-class correction and inspect the failing Huly query surface
- [x] Treat optional Team snapshot classes as soft-fail / empty in the Huly client
- [x] Rebuild and verify the Team snapshot path after the Huly fallback change

## Review

- Hardened `HulyClient::find_all` error messages so they now include the exact failing class name.
- Added `find_all_typed_optional_class` and routed Team-facing HR fetches through it, so missing workspace classes such as `hr:class:Request` or `hr:class:Holiday` now resolve to empty datasets instead of aborting the Team refresh.
- Added a regression test for invalid-class error detection in `src-tauri/src/huly/client.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - relaunched the rebuilt `src-tauri/target/release/bundle/macos/TeamForge.app` and confirmed the running process path still points at that bundle ✅

---

## Goal

Make Slack setup in TeamForge Settings feel like a first-class provider integration:
- match the existing credential setup pattern used for Clockify and Huly
- make it explicit that Slack needs the `xoxb-...` bot token, not the user token
- surface reinstall/scope guidance directly in the app so Slack setup is not guesswork

## Plan

- [x] Inspect the current Slack settings card and backend connection test behavior
- [x] Tighten Slack token validation and friendlier connection errors in the Tauri command layer
- [x] Update the Settings UI copy and layout so Slack setup matches the app's other integration settings
- [x] Verify with fresh build/test commands and record the result

## Review

- Tightened the Slack command layer in `src-tauri/src/commands/mod.rs` so the app now:
  - rejects `xoxp-...` user tokens with an explicit `use the xoxb bot token` error
  - rejects ambiguous non-`xoxb-...` values before making Slack API calls
  - turns Slack `missing_scope` responses into reinstall/scope guidance instead of raw API text
- Refined the Slack Settings card in `src/pages/Settings.tsx` so it now matches the existing provider setup flow more closely:
  - explicit `BOT USER OAUTH TOKEN` label
  - `xoxb-...` placeholder and wrong-token guardrails
  - setup summary strip for status, token source, and channel mode
  - in-app reinstall warning and required-scope guidance tied to the actual Slack flow
  - normalized channel-filter saving so the stored setting is cleaner and consistent
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅
- Output bundle:
  - `src-tauri/target/release/bundle/macos/TeamForge.app`

---

## Goal

Make the Slack missing-scope error actionable inside TeamForge:
- surface the exact scope Slack reports as missing instead of only a generic reinstall message
- keep the reinstall guidance, but tie it to the specific missing scope
- rebuild the app so the improved message is available in Settings immediately

## Plan

- [x] Inspect the current Slack error path and what metadata from Slack is being discarded
- [x] Preserve `needed` / `provided` scope details from Slack responses and format them into the Settings error message
- [x] Add a focused regression test for the missing-scope formatting
- [x] Verify with fresh tests/builds and rebuild the Tauri app bundle

## Review

- Extended `src-tauri/src/slack/types.rs` so Slack error envelopes now keep the `needed` and `provided` scope fields that Slack returns on `missing_scope`.
- Updated `src-tauri/src/slack/client.rs` to preserve those fields in the error path instead of collapsing everything down to only `missing_scope`.
- Tightened `humanize_slack_connection_error` in `src-tauri/src/commands/mod.rs` so TeamForge now says which scope Slack reports as missing, while still reminding the user to reinstall the app after scope changes.
- Added a regression test in `src-tauri/src/commands/mod.rs` to lock the exact-scope formatting.
- Verification so far:
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅

---

## Goal

Replace the current Team org-chart form with a drag-and-drop bento layout:
- move the crew directory to the left side
- replace dropdown-heavy role assignment with drag targets for head, team lead, and members
- support draggable / reorderable department cards in a bento grid
- respect the ignored-email settings so ignored people do not appear in the assignment UI

## Plan

- [x] Inspect the current Team page layout and the org-chart backend shape
- [x] Filter ignored-email people out of the org-chart payload in the Rust command layer
- [x] Redesign the Team page into a left crew rail and draggable bento department cards
- [x] Verify with fresh tests/builds and rebuild the Tauri app bundle

## Review

- Reworked the org-chart surface in `src/pages/Team.tsx` from a select-heavy form into a drag-and-drop workspace:
  - left-side crew directory rail with search
  - unassigned drop tray
  - draggable crew cards
  - draggable / reorderable department cards in a bento grid
  - role-specific drop zones for `Head`, `Team Lead`, and `Members`
  - inline remove / clear actions so role management no longer depends on dropdowns
- Updated `src-tauri/src/commands/mod.rs` so `get_org_chart` now respects the ignored-email settings by filtering ignored people out of:
  - the assignable roster
  - department member ids
  - department head / team lead assignments returned to the UI
- Added a regression test in `src-tauri/src/commands/mod.rs` covering the ignored-email org-chart filter.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅

---

## Goal

Prepare the next TeamForge patch release and align the repo + GitHub release state:
- bump the app from `0.1.1` to `0.1.2`
- update the README and release-facing docs for the latest shipped work
- create clear release notes and update the GitHub release entry

## Plan

- [ ] Inspect current version metadata, README/docs, and GitHub release state
- [ ] Bump version metadata consistently across package, sidecar, Cargo, and Tauri config
- [ ] Update README and release-facing docs to reflect the latest shipped features
- [ ] Create/update release notes for `0.1.2` and publish or update the GitHub release entry
- [ ] Verify with fresh build/test commands and record the result

---

## Goal

Continue the live Huly workspace cleanup and clarify the Slack state:
- inspect the real Huly employee / department / board state needed for final normalization
- assign department members / leads and decide whether the empty Default board should be archived
- verify whether any Slack integration exists in TeamForge or the Huly rollout

## Plan

- [x] Inspect the current live Huly employee, department, and board records using the repo’s Huly client
- [x] Implement any missing safe write path needed for department assignment or board archival
- [x] Apply the live Huly updates and verify the resulting workspace state
- [x] Confirm whether Slack integration is implemented, partial, or absent, and document that status

## Review

- Added a read-only ignored test in `src-tauri/src/commands/mod.rs` to print the live Huly organization state needed for the remaining normalization pass.
- Live Huly inspection confirmed:
  - `Engineering`, `Marketing`, and `Leadership` exist but all have empty `members`, `teamLead`, and `head`
  - the legacy `Organization` department still holds 8 member ids
  - the `Default` board existed, had `0` cards, and was the only remaining board
- Upgraded the normalization engine so an empty `Default` board becomes a safe `archive` action instead of permanent manual review.
- Applied the live normalization again against workspace `46352c1b-9c0a-4562-b204-d39e47ff0b1b`:
  - archived board `board:space:DefaultBoard`
  - post-apply preview now reports `boardCount = 0`
  - post-apply preview now reports `pendingSafeCount = 0`
  - the only remaining manual item is department membership / team-lead mapping
- Live Huly roster still needing human mapping:
  - current `Organization` members: `Hulia AI`, `Raheman Ali`, `Pavun Kumar`, `Subitcha`, `Mohankumar`, `Imran`, `Preetha`, `Rifayudeen`
  - additional active employee/person records outside `Organization`: `Shesh`, duplicate `Akshay Balraj`, `Shankha Subhra`, and `Guest,Anonymous`
- Slack status:
  - searched `src-tauri/src`, `src`, `docs`, and `README.md`
  - found no Slack integration code, command surface, config, or rollout documentation in this repo
  - current status is `absent`, not merely incomplete

---

## Goal

Cut a fresh Tauri build that includes the latest Huly and Copaw-related changes, then launch it locally:
- verify the frontend and Rust code still compile after the latest updates
- produce a new local Tauri app bundle
- run the built app to confirm the runtime path

## Plan

- [x] Verify the current frontend and Rust code with build/test commands
- [x] Build a fresh local Tauri app bundle with the latest changes
- [x] Launch the newly built app bundle and confirm the runtime path
- [x] Record the build/run result and any packaging limitation

## Review

- Verified the current codebase after the latest Huly workspace and Copaw changes:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Built a fresh local Tauri app bundle:
  - `pnpm tauri build --bundles app` ✅
  - output bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
- Launched the new app bundle directly from:
  - `src-tauri/target/release/bundle/macos/TeamForge.app/Contents/MacOS/team-forge-ts`
- Runtime confirmation:
  - app startup log printed `database initialized`
  - running process confirmed via `ps` for the built `.app` executable path
- Packaging note:
  - this pass produced and launched the `.app` bundle successfully
  - DMG packaging was not part of this run

---

## Goal

Derive the remaining Huly org mapping and add real Slack integration to TeamForge:
- read the Team Pulse export to produce a department-member and team-lead recommendation for Huly
- add Slack auth/config into the Tauri app settings flow
- feed Slack chat activity into the existing communications surface
- rebuild and verify the desktop app with the new integration path

## Plan

- [ ] Locate and inspect the Team Pulse CSV so the department-member and team-lead mapping is evidence-based
- [x] Inspect the existing settings/comms/backend seams and add a minimal Slack client and typed response models
- [x] Add Slack settings + connection testing in the Tauri settings UI and command layer
- [x] Merge Slack-derived chat activity into the communications view
- [x] Verify with build/test commands, rebuild the Tauri app, and document any remaining credential or data blockers

## Review

- Added a real Slack integration path to the Tauri backend under `src-tauri/src/slack/` with:
  - bot-token based connection testing
  - Slack channel listing and history reads
  - Slack user-directory reads for employee matching
- Extended the generic settings flow so TeamForge now stores and loads:
  - `slack_bot_token`
  - `slack_channel_filters`
- Added a dedicated Slack settings card in `src/pages/Settings.tsx` with:
  - token save/show/hide
  - connection test button
  - optional channel filter input
  - required-scope guidance for the current MVP
- Upgraded `get_chat_activity` so the Communications page now merges:
  - Huly chat activity
  - Slack chat activity
  - source badges are shown in the UI so merged data is visible instead of silent
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - direct execution of `TeamForge.app/Contents/MacOS/team-forge-ts` is not a valid macOS verification path here; the user supplied a crash report showing AppKit/HIServices aborting during app registration when started that way from Codex
  - LaunchServices start works:
    - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
    - process remained alive after launch via LaunchServices
  - LaunchServices-started app logs printed:
    - `[teamforge] database initialized`
    - `[scheduler] background sync started`
- Remaining blockers:
  - the Team Pulse CSV file path provided by the user is no longer present on disk, so the Huly department-member / team-lead mapping is still blocked on the actual file
  - Slack end-to-end verification is blocked on the real Slack bot token and workspace scopes from the user

---

## Goal

Move the remaining Huly org-chart and department mapping work into the app itself:
- load the live Huly department roster dynamically inside TeamForge
- let users assign department members, heads, and team leads in the Team page
- save those mappings back to Huly from the app instead of doing it manually outside the product

## Plan

- [x] Inspect the existing Team page, department summary data, and Huly write primitives
- [x] Add backend commands for loading and updating a live org-chart mapping model
- [x] Add a dynamic org-mapping editor to the Team page
- [x] Verify with build/test commands and rebuild the Tauri app

## Review

- Added live Huly org-chart commands in `src-tauri/src/commands/mod.rs`:
  - `get_org_chart`
  - `apply_org_chart_mapping`
- Added typed org-chart models in `src-tauri/src/db/models.rs` and `src/lib/types.ts` so the app now has a structured editable view of:
  - department membership
  - department head
  - team lead
  - assignable people roster
- Wired the new commands into the Tauri bridge in `src-tauri/src/lib.rs` and `src/hooks/useInvoke.ts`.
- Replaced the static Team-page-only summary with a dynamic editor in `src/pages/Team.tsx`:
  - loads the live Huly roster into the app
  - shows department cards with member checklists
  - supports assigning heads and team leads
  - automatically moves a person between departments when reassigned
  - shows unassigned people explicitly
  - saves the mapping back to Huly from the app
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Prepare and publish the next TeamForge release:
- bump the app from `0.1.1` to `0.1.2`
- update the README and repo docs to match the shipped Slack + Team workflow
- prepare release notes for the GitHub release entry
- verify the release bundle before tagging it

## Plan

- [x] Inspect the current package, Tauri, Cargo, README, and published release state
- [x] Bump version metadata consistently across the frontend package, sidecar, Cargo crate, and Tauri config
- [x] Update README and repo docs to reflect the Slack setup flow, drag-and-drop team mapping, and rollout artifacts
- [x] Add repo-local release notes for `v0.1.2`
- [x] Verify the release build chain and macOS app launch path

## Review

- Bumped TeamForge from `0.1.1` to `0.1.2` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.lock` refreshed during verification
- Added `CHANGELOG.md` with a `v0.1.2` entry that summarizes the unreleased Slack, Team mapping, and rollout-documentation work since the published `v0.1.0` release.
- Updated `README.md` to:
  - mark the repo state as `v0.1.2`
  - describe the new Slack Settings flow
  - describe the dynamic drag-and-drop Team mapping workflow
  - link the changelog alongside the rollout docs
  - update dashboard descriptions for Team and Comms
- Updated `docs/huly-system-design.md` so the rollout contract now references post-`v0.1.2` work.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Stabilize the Team page and make ignore-list management work for Huly-sourced people:
- identify and fix the current Team page fetch failure / glitch state
- add a roster-driven multiselect in Settings for ignored people
- keep ignore behavior effective even when synced team members do not have emails

## Plan

- [x] Inspect the Team fetch path, current ignore-list settings model, and synced employee data shape
- [x] Fix the root cause behind the Team page fetch failure or unstable state
- [x] Add backend support for ignoring people by employee identity instead of email alone
- [x] Replace the Settings ignore input with a team multiselect and keep manual email ignores as a fallback if needed
- [x] Verify with tests/build/app launch and document the result

## Review

- Root cause:
  - the Team page was issuing four independent Huly commands on load
  - each command reconnected to Huly from scratch, which meant four separate `config.json` fetches and workspace-selection handshakes
  - when one of those failed, the page degraded into a mixed `error + empty cards` state exactly like the screenshot
- Added a single backend snapshot command for the Team page so it now performs one Huly connection per load and returns:
  - department summary data
  - org chart data
  - leave requests
  - holidays
  - a single Huly error field when the connection fails
- Added employee-ID-based ignore support in Settings via `clockify_ignored_employee_ids`, while keeping manual email ignores as a fallback for unmapped service accounts.
- Updated ignore enforcement so selected crew are excluded even when email is blank:
  - `apply_clockify_ignore_rules` now honors ignored employee ids as well as ignored emails
  - Team/org-chart filtering now excludes ignored or inactive mapped people
  - Huly-derived summary mappings for departments, leave, boards, meetings, and chat now only resolve against active employees
- Replaced the old email-only ignore control in `Settings` with a searchable roster multiselect plus removable chips, and kept the manual email textarea as a secondary fallback path.
- Updated the Crew Management table so ignored/inactive people remain visible instead of disappearing completely after save.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Make the Team page resilient with a persistent local cache:
- stop depending on live Huly as the only source for Team rendering
- persist Team-facing Huly data into SQLite
- serve cached Team data immediately and refresh in the background when possible

## Plan

- [ ] Inspect the Team page read path against the current SQLite schema and Huly sync coverage
- [ ] Extend the backend with persistent SQLite caching for Team-facing Huly entities
- [ ] Build a layered Team snapshot command that serves cached data first and reports refresh state separately
- [ ] Update the Team page to render cached data immediately instead of hanging on live fetches
- [ ] Verify with tests/build/app launch and document the behavior

---

## Goal

Add leave and holiday management directly to the Team page:
- persist local manual leave entries in SQLite
- persist local holiday entries and show a year-view holiday calendar
- keep Huly-synced leave and holiday rows visible without making them editable

## Plan

- [x] Inspect the current Team snapshot, Team page, and SQLite schema for leave / holiday coverage
- [x] Add persistent local SQLite tables and Rust query helpers for manual leave and holiday entries
- [x] Merge manual leave / holiday rows into the Team snapshot alongside cached Huly data
- [x] Add Team-page controls for manual leave updates and holiday editing plus a yearly holiday calendar
- [x] Verify with tests/build/app launch and document the result

## Review

- Added persistent `manual_leave_entries` and `manual_holidays` SQLite tables in `src-tauri/migrations/001_initial.sql`.
- Added Rust-side models, inputs, CRUD query helpers, and a regression test for local Team calendar rows in:
  - `src-tauri/src/db/models.rs`
  - `src-tauri/src/db/queries.rs`
- Extended the Team snapshot pipeline so cached Huly leave / holiday data is merged with local manual entries, tagged by source, and returned with editability metadata.
- Added new Tauri commands for local Team calendar management:
  - `save_manual_leave`
  - `delete_manual_leave`
  - `save_manual_holiday`
  - `delete_manual_holiday`
- Updated the Team page so it now:
  - loads the employee roster locally for leave assignment
  - lets you add and edit local leave entries in-place
  - lets you add and edit local holiday entries in-place
  - shows which rows are local versus Huly-synced
  - renders a 12-month holiday calendar for the selected year
  - uses safer local date parsing for leave / holiday display instead of relying on browser UTC parsing of `YYYY-MM-DD`
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Populate the Team holiday tracker with the requested 2026 holiday list:
- add the provided 2026 holidays into the local Team holiday store
- verify the local SQLite calendar contains the exact dates and titles requested

## Plan

- [x] Inspect the current app data location and local holiday storage path
- [x] Insert the requested 2026 holidays into the local manual holiday table
- [x] Verify the inserted rows and document the exact entries added

## Review

- Confirmed the live app database path is:
  - `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
- Inserted 9 local manual holiday rows into `manual_holidays` for the requested 2026 India holiday list.
- Verified the exact stored rows directly via `sqlite3`:
  - `2026-01-01` — `New Year's Day`
  - `2026-01-26` — `Republic Day (National)`
  - `2026-03-19` — `Ugadi (Karnataka New Year)`
  - `2026-04-03` — `Good Friday`
  - `2026-05-01` — `May Day / Labour Day`
  - `2026-08-15` — `Independence Day (National)`
  - `2026-10-02` — `Gandhi Jayanti (National)`
  - `2026-10-21` — `Vijayadashami / Dussehra`
  - `2026-11-10` — `Diwali`
- Verification:
  - `sqlite3 ... ".schema manual_holidays"` ✅
  - `sqlite3 ... "SELECT date, title, note FROM manual_holidays ORDER BY date, title"` ✅
  - `sqlite3 ... "SELECT COUNT(*) FROM manual_holidays"` → `9` ✅

---

## Goal

Run an app-wide LCARS consistency overhaul, not just a Team-page polish pass:
- reduce the generic card-and-box feel across the shell and major views
- improve hierarchy, spacing, controls, and responsive behavior across the app
- bring the Team / leave / holiday tracking experience into that broader design system
- deliver a meaningful multi-point visual consistency pass instead of isolated styling tweaks

## Plan

- [ ] Audit the current shell, major page layouts, shared controls, and responsive breakpoints for consistency gaps
- [ ] Upgrade the app shell and shared UI treatments so pages inherit a stronger LCARS system
- [ ] Redesign the Team / calendar tracking surface inside that broader app-wide language
- [ ] Apply consistency fixes to the most visible adjacent views and controls so the overhaul is not Team-only
- [ ] Verify with build/test/app launch and document the redesign outcomes

---

## Goal

Set up Supabase MCP support in Codex for project `qjnqdhvlxdmezxdnlrbj`:
- add Supabase MCP server
- enable remote MCP client support in Codex config
- authenticate Supabase MCP
- verify MCP server/auth status
- optionally install Supabase agent skills

## Plan

- [x] Add Supabase MCP server via `codex mcp add`
- [x] Ensure `[mcp] remote_mcp_client_enabled = true` exists in `~/.codex/config.toml`
- [x] Authenticate with `codex mcp login supabase`
- [x] Verify MCP setup and authentication state from Codex CLI
- [x] Install optional Supabase agent skills via `npx skills add supabase/agent-skills`
- [x] Document verification output and completion notes

## Review

- Added Supabase MCP server:
  - `codex mcp add supabase --url 'https://mcp.supabase.com/mcp?project_ref=qjnqdhvlxdmezxdnlrbj'`
  - output: `Added global MCP server 'supabase'.`
- Enabled remote MCP client support in global Codex config:
  - `~/.codex/config.toml` now contains:
    - `[mcp]`
    - `remote_mcp_client_enabled = true`
- Authentication completed:
  - `codex mcp login supabase`
  - output ended with: `Successfully logged in to MCP server 'supabase'.`
- Verification from Codex CLI:
  - `codex mcp list` shows Supabase server URL and `enabled` status.
  - `codex mcp get supabase` confirms configured transport and URL.
- Optional skills installed non-interactively:
  - `npx skills add supabase/agent-skills -y -g`
  - installed:
    - `~/.agents/skills/supabase`
    - `~/.agents/skills/supabase-postgres-best-practices`

## Goal

Enable real Clients page data from synced sources:
- replace `get_clients` stub with DB-backed client aggregates
- replace `get_client_detail` stub with linked projects and recent activity
- verify with Rust tests and frontend build

## Plan

- [x] Implement DB-backed `get_clients` aggregation from `projects` + `time_entries`
- [x] Implement DB-backed `get_client_detail` with linked projects and recent activity
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`

## Review

- Replaced `Clients` command stubs with live-backed logic in `src-tauri/src/commands/mod.rs`:
  - `get_clients` now aggregates from `projects` + `time_entries` and computes:
    - `activeProjects`, `primaryContact`, `monthlyValue` (billable-hour estimate),
    - `tier`, `contractStatus`, `daysRemaining`, and inferred `techStack`.
  - `get_client_detail` now returns:
    - linked projects with status (`active` / `idle` / `planned` / `archived`),
    - resources (client drive/profile overrides + matching Huly docs),
    - recent activity from Clockify + Huly issue/document activity.
- Added helper mappers to keep client IDs stable (`client-<slug>`) and to support optional per-client settings:
  - `client_<slug>_drive_link` / `client_<slug>_chrome_profile`
  - legacy fallback `client.<slug>.drive_link` / `client.<slug>.chrome_profile`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Enable real Devices page data from synced Huly workspace data:
- replace `get_devices` stub with live Huly-backed extraction
- map issue/card signals into Device registry rows expected by UI
- verify with Rust tests and frontend build

## Plan

- [x] Implement live-backed `get_devices` using Huly issues/cards + local project/employee mapping
- [x] Normalize platform/status/client/dev-owner fields into `DeviceView`
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`

## Review

- Replaced `get_devices` stub with live extraction in `src-tauri/src/commands/mod.rs`:
  - queries Huly `issues`, `board cards`, `projects`, and `persons`
  - maps active local employees to Huly person IDs for responsible-dev labels
  - maps local synced project metadata (`huly_project_id` / project name) to `clientName`
- Added device normalization helpers:
  - device candidate detection (`device`/`iot`/`firmware`/`tuya` keywords)
  - platform inference (`iOS`, `Android`, `Firmware`, `Backend`, `Web`)
  - status normalization to UI states (`not started`, `in progress`, `testing`, `deployed`, `issue`)
  - URL and firmware version extraction from issue content for detail rows
- `DeviceView` rows are now deterministic and deduplicated by normalized device key, with merged issue counts and severity-priority status.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Replace remaining analytics stubs and run a fresh Tauri rebuild:
- implement `get_sprint_detail`, `get_training_tracks`, `get_training_status`, `get_skills_matrix`, `get_onboarding_flows`, `get_planner_capacity`
- keep payloads aligned with current page contracts
- run full build verification plus Tauri rebuild artifact generation

## Plan

- [x] Implement sprint detail command from Huly milestones/issues/time data
- [x] Implement training/skills/onboarding/planner commands from current synced Huly + Clockify datasets
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`
- [x] Run fresh `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`

## Review

- Replaced remaining stubs in `src-tauri/src/commands/mod.rs` with data-backed implementations:
  - `get_sprint_detail` now derives timeline/capacity/comparison/retro from Huly milestones, issues, and synced hours.
  - `get_training_tracks`, `get_training_status`, and `get_skills_matrix` now compute skill/training signals from active employee + issue/time-entry datasets.
  - `get_onboarding_flows` and `get_planner_capacity` now map onboarding/planning rows from synced local data and live Huly context where available.
- Fixed a Rust ownership error in planner capacity issue aggregation (`issue.assignee` move after borrow) and reran verification.
- Verification run:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅
- Rebuild output:
  - `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/target/release/team-forge-ts`
  - `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/target/release/bundle/macos/TeamForge.app`

## Goal

Update GitHub-facing release docs for the `0.1.7` rollout and push to trigger CI:
- align README release/version messaging to `v0.1.7`
- publish/update GitHub release metadata for `v0.1.7`
- push branch/tag so GitHub Actions CI/release workflows run

## Plan

- [x] Update `README.md` release sections from `v0.1.6` to `v0.1.7` with current rollout summary
- [x] Validate release metadata source (`CHANGELOG.md`) and sync GitHub release notes
- [x] Push commits/tags to GitHub and verify CI workflow kickoff

## Review

- Updated `README.md`:
  - `## New In v0.1.6` → `## New In v0.1.7`
  - refreshed rollout bullets for the P2 dashboard wave and command-surface additions
  - `Releases` section latest tag now `v0.1.7`
- Updated GitHub repo description to reflect the `v0.1.7` rollout positioning.
- Published GitHub release:
  - `https://github.com/Sheshiyer/team-forge-ts/releases/tag/v0.1.7`
  - notes sourced from `CHANGELOG.md` `v0.1.7` section
- Pushed rollout to GitHub:
  - `main` advanced to `e5e6244`
  - tag `v0.1.7` pushed
- CI/release verification:
  - Build & Release workflow triggered on tag push:
    - `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24283881187`
    - status at check time: `in_progress`

## Goal

Diagnose missing `v0.1.7` release assets and restore downloadable app artifacts.

## Plan

- [x] Inspect failed GitHub Actions release run and identify root cause
- [x] Patch release workflow so future tag builds do not fail on updater signing keys
- [x] Build local `.app`/`.dmg` artifacts and upload to `v0.1.7` release

## Review

- Root cause identified from run `24283881187`: Apple Silicon Tauri build failed after bundling with:
  - `A public key has been found, but no private key. Make sure to set TAURI_SIGNING_PRIVATE_KEY environment variable.`
- This is not a package-version issue; updater artifact signing was required but CI lacked `TAURI_SIGNING_PRIVATE_KEY`.
- Updated `.github/workflows/release.yml` to pass:
  - `--config '{"bundle":{"createUpdaterArtifacts":false}}'`
  - on both Apple Silicon and Intel release build steps.
- Built release assets locally with updater artifacts disabled and uploaded to `v0.1.7`:
  - `TeamForge_0.1.7_aarch64.dmg`
  - `TeamForge_0.1.7_aarch64_app.zip`
- Pushed CI fix commit to `main`:
  - `5bd34a5`

## Goal

Cut a fresh release tag after CI workflow fix so GitHub Actions can publish release assets automatically.

## Plan

- [x] Create and push `v0.1.8` tag from latest `main`
- [x] Monitor Build & Release workflow to completion
- [x] Verify `v0.1.8` release assets are present on GitHub

## Review

- Tagged and pushed:
  - `v0.1.8` at commit `5bd34a5`
- Release workflow run:
  - `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24285428588`
  - final status: `completed`, `success`
- Release page:
  - `https://github.com/Sheshiyer/team-forge-ts/releases/tag/v0.1.8`
- Assets now present:
  - `TeamForge_0.1.7_aarch64.dmg`
  - `TeamForge_0.1.7_x64.dmg`
  - `TeamForge_aarch64.app.tar.gz`
  - `TeamForge_x64.app.tar.gz`

## Goal

Cut `v0.1.9` with fully aligned version metadata so release artifact filenames no longer lag old app versions.

## Plan

- [x] Bump app/package metadata to `0.1.9`
- [x] Verify builds and tests after version update
- [ ] Push release commit, tag `v0.1.9`, and verify GitHub release artifacts

## Review

- Version fields set to `0.1.9` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Release docs aligned:
  - `README.md` latest tag now `v0.1.9`
  - `CHANGELOG.md` includes a `v0.1.9` entry (2026-04-12)
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Align app/package version metadata with the new `v0.1.8` rollout.

## Plan

- [x] Bump canonical version fields from `0.1.7` to `0.1.8` across frontend, sidecar, Rust crate, and Tauri config
- [x] Verify builds still pass after version bump
- [x] Document the version-alignment outcome

## Review

- Updated version fields to `0.1.8` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Create a concrete GitHub issue backlog for the 20-point TeamForge ↔ Paperclip ops-data unification program, with clear ownership slices across TeamForge runtime and Paperclip orchestration.

## Plan

- [x] Validate repo mapping and label strategy for issue creation
- [x] Draft 20 implementation issues with acceptance criteria and dependency hints
- [x] Publish issues in GitHub and capture the created issue links
- [x] Add a review summary with ownership grouping and rollout order

## Review

- Created 20 backlog issues in `Sheshiyer/team-forge-ts` covering the full TeamForge ↔ Paperclip ops-data unification scope:
  - `#20` Define canonical ops_event schema for TeamForge ↔ Paperclip
  - `#21` Add deterministic sync_key generation for idempotent ops_event processing
  - `#22` Persist Slack activity to SQLite for durable analytics and feed export
  - `#23` Add periodic Huly sync in background scheduler
  - `#24` Add Slack delta sync with cursor checkpoints
  - `#25` Introduce cross-platform identity map (Clockify ↔ Huly ↔ Slack)
  - `#26` Add identity-match confidence + manual override controls
  - `#27` Create dedicated agent_feed projection in TeamForge
  - `#28` Expose TeamForge agent_feed export API for Paperclip
  - `#29` Build ts-paperclip teamforge-sync ingestion script
  - `#30` Persist immutable dated feed snapshots into vault
  - `#31` Enrich paperclip-sync dispatch with TeamForge feed context
  - `#32` Implement role-specific agent_feed slices (Jarvis/Clawd/Sentinel/Sage)
  - `#33` Inject role-specific feed slices into agent-prompt-assembler
  - `#34` Add signal-to-owner routing rules for ops events
  - `#35` Add severity scoring pipeline for ops signals
  - `#36` Add dedupe windows and cooldown suppression for repeated alerts
  - `#37` Add ingestion health metrics (lag/failure/coverage)
  - `#38` Implement unified data quality checks and drift detection
  - `#39` Add closed-loop action outcome tracking for agent interventions
- Repo mapping decision:
  - `ts-paperclip` local path points to repo `Sheshiyer/14113-X-vault`, not a separate `ts-paperclip` GitHub repo.
  - All issues were created in `team-forge-ts` with explicit ownership notes for TeamForge runtime vs Paperclip scripts.
- Suggested rollout waves encoded by dependency order:
  - Wave 1 (contract + identity + persistence): `#20 #21 #22 #25 #26 #27`
  - Wave 2 (sync + export + ingestion): `#23 #24 #28 #29 #30`
  - Wave 3 (agent context + routing intelligence): `#31 #32 #33 #34 #35 #36`
  - Wave 4 (operational excellence + learning loop): `#37 #38 #39`
- Milestone created and linked:
  - `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification`
  - `https://github.com/Sheshiyer/team-forge-ts/milestone/2`
  - Issues attached: `#20` through `#39` (20 total)
- Project board created and populated:
  - `TeamForge Ops Fabric Rollout`
  - `https://github.com/users/Sheshiyer/projects/6`
  - Items attached: 20 (`#20` through `#39`)

## Goal

Execute Ops Fabric backlog sequentially, starting with foundational Issue #20 (canonical ops_event schema) and Issue #21 (deterministic sync_key generation) in TeamForge.

## Plan

- [x] Add canonical `ops_events` persistence schema (SQLite table + indexes + model)
- [x] Implement deterministic `sync_key` generation for `ops_event/v1`
- [x] Emit canonical ops events from Clockify and Huly sync pipelines
- [x] Add schema contract docs for TeamForge ↔ Paperclip consumption
- [x] Run Rust test suite to verify no regressions

## Review

- Implemented canonical ops event foundation for Issues `#20` and `#21`:
  - Added `ops_event/v1` sync-key helper module:
    - `src-tauri/src/ops/mod.rs`
    - deterministic `build_sync_key` + normalization rules + unit tests
  - Added canonical persistence table and indexes:
    - `src-tauri/migrations/001_initial.sql`
    - table: `ops_events` with unique `sync_key`
  - Added Rust model + query layer support:
    - `src-tauri/src/db/models.rs` (`OpsEvent`)
    - `src-tauri/src/db/queries.rs` (`upsert_ops_event`)
    - query test: `upsert_ops_event_is_idempotent_by_sync_key`
- Wired emission paths:
  - Clockify:
    - `src-tauri/src/clockify/sync.rs` now emits `clockify.time_entry.logged` ops events for each synced time entry.
  - Huly:
    - `src-tauri/src/huly/sync.rs` now emits `huly.issue.modified` ops events for each synced issue.
    - events are emitted even when employee mapping is unresolved (actor person ID retained), while legacy `huly_issue_activity` still requires mapped employee.
- Added TeamForge ↔ Paperclip contract doc:
  - `docs/architecture/contracts/ops-event-schema-contract.md`
  - linked from `docs/architecture/contracts/README.md`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute sequential Ops Fabric items `#22`, `#23`, and `#24` by hardening Slack persistence, expanding scheduler coverage, and introducing cursor-checkpointed Slack delta sync.

## Plan

- [x] `#22` Persist Slack message activity durably in SQLite with idempotent upsert semantics
- [x] `#23` Run Huly issue/presence/team-cache sync on scheduler intervals independent of Clockify configuration
- [x] `#24` Add Slack periodic delta sync with per-channel cursor checkpoints and bootstrap backfill strategy
- [x] Add scheduler + tray integration for periodic/manual Slack delta sync execution
- [x] Verify Rust formatting and tests after all sync changes

## Review

- Implemented `#22` durable Slack activity persistence:
  - `src-tauri/migrations/001_initial.sql`
    - `slack_message_activity` table + indexes (`message_key` unique idempotency key).
  - `src-tauri/src/db/models.rs`
    - `SlackMessageActivity` model.
  - `src-tauri/src/db/queries.rs`
    - `upsert_slack_message_activity`, `get_slack_message_activity_since`.
    - idempotency test: `upsert_slack_message_activity_is_idempotent_by_message_key`.
  - `src-tauri/src/commands/mod.rs`
    - Slack ingestion paths now persist message activity rows as they ingest.
- Implemented `#23` periodic Huly scheduler jobs:
  - `src-tauri/src/sync/scheduler.rs`
    - scheduler now starts with independent integration checks instead of hard coupling.
    - added periodic jobs:
      - Huly issues: every 10m
      - Huly presence: every 2m
      - Huly team cache refresh: every 60m
- Implemented `#24` Slack delta sync with cursor checkpoints:
  - `src-tauri/src/slack/sync.rs` (new)
    - Added `SlackSyncEngine::sync_message_deltas` with:
      - per-channel checkpoint scope via `sync_state` (`source=slack`, `entity=messages_channel:<channel_id>`),
      - persisted JSON checkpoint payload (`cursor`, `oldest_ts`, `last_message_ts`),
      - first-run bootstrap backfill strategy (`slack_sync_backfill_days`, default 7),
      - resume-after-restart behavior by restoring cursor/oldest checkpoint,
      - sync lag observability (`max_lag_seconds`) persisted in summary sync state (`source=slack`, `entity=messages_delta`).
  - `src-tauri/src/slack/client.rs`
    - Added rate-limit and transient server retry logic in Slack API requests.
    - Added page-level history fetch API (`get_channel_messages_page`) to support checkpointed pagination.
  - `src-tauri/src/sync/scheduler.rs`
    - added periodic Slack delta sync job every 3m when `slack_bot_token` is configured.
  - `src-tauri/src/lib.rs`
    - tray/manual sync (`Sync Now`) now also executes Slack delta sync.
  - `src-tauri/src/slack/mod.rs`
    - exported new `sync` module.
  - `src-tauri/src/slack/sync.rs`
    - added unit tests for checkpoint parsing and Slack timestamp parsing.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`21 passed`, `0 failed`, `3 ignored`)

## Goal

Execute the remaining Ops Fabric backlog items `#29` through `#39` in one continuous implementation pass across TeamForge + ts-paperclip.

## Plan

- [x] `#29` Add `teamforge-sync.sh` ingestion with cursor checkpoints, schema validation, idempotent ingest, and cycle integration
- [x] `#30` Persist immutable date-partitioned TeamForge feed snapshots with replay metadata and retention notes
- [x] `#31` Enrich Paperclip dispatch payloads using TeamForge feed context with bounded deterministic formatting and dry-run preview
- [x] `#32` Add deterministic role-specific feed slices (`jarvis`, `clawd`, `sentinel`, `sage`) plus explicit overlap/fallback policy
- [x] `#33` Inject role-specific feed slice blocks into `agent-prompt-assembler.sh` with missing-slice handling and prompt-size guardrails
- [x] `#34` Implement signal-to-owner routing rules with override + fallback behavior and evaluation traces
- [x] `#35` Add severity scoring + rationale fields and plumb severity into dispatch priority assignment
- [x] `#36` Add cooldown-based dedupe suppression with bypass for critical events and suppression counters
- [x] `#37` Expose ingestion health metrics (lag/failure/coverage) as persisted artifacts and command output
- [x] `#38` Add data-quality checks (orphan refs, stale mappings, timestamp drift) and quality score output
- [x] `#39` Track closed-loop outcomes by linking dispatched tasks back to `sync_key` and recording resolution/recurrence metrics
- [x] Run script-level verification for TeamForge sync/cycle/prompt assembly behavior and log all outcomes in review notes

## Review

- Implemented the full `#29`-`#39` Paperclip-side Ops Fabric surface in `ts-paperclip`:
  - Added `scripts/teamforge-sync.sh` with:
    - schema validation against `agent_feed/v1`,
    - cursor-aware incremental ingestion,
    - idempotent handling by `syncKey`,
    - immutable snapshot writes to date-partitioned vault paths,
    - replay + status + quality command modes,
    - role-slice materialization (`jarvis`, `clawd`, `sentinel`, `sage`),
    - routing rules + severity scoring + cooldown suppression,
    - persisted health (`lag/failure/coverage`) and data quality findings,
    - closed-loop outcome rollups based on task lifecycle + `source_sync_key`.
- Integrated TeamForge sync into cycle orchestration:
  - `scripts/paperclip-cycle.sh` now runs TeamForge sync before Paperclip issue sync and supports `--without-teamforge` and `--teamforge-dry-run`.
  - `bootstrap.sh` now validates `scripts/teamforge-sync.sh` as a required executable.
- Enriched dispatch and registry primitives:
  - `scripts/dispatch-task.sh` supports `--details`, `--sync-key`, `--source-ref`, `--signal-severity`, `--score-rationale`, writes them into INBOX payloads, and forwards metadata to the registry.
  - `scripts/task-registry.sh` now persists these fields (`details`, `source_sync_key`, `source_ref`, `signal_severity`, `score_rationale`) for downstream analytics and closed-loop reporting.
- Added TeamForge context-driven paperclip dispatch enrichment:
  - `scripts/paperclip-sync.sh` now reads role slices, builds deterministic bounded context blocks, supports `sync-issues --dry-run` preview mode, and attaches enrichment metadata on dispatch.
- Added role-specific prompt injection:
  - `scripts/agent-prompt-assembler.sh` now loads only the relevant TeamForge slice for the executing role, falls back gracefully to `jarvis`, and enforces prompt-size guardrails.
- Added documentation and config surface:
  - `manifest.yaml` includes TeamForge feed/routing/health/cooldown configuration keys.
  - `memory/teamforge-ops-feed.md` documents replay, retention, routing, severity rubric, dedupe policy, alert thresholds, quality remediation, and closed-loop metrics.
  - `memory/processes.md` now references the TeamForge ops-feed contract.

- Verification executed:
  - `bash -n` validation passed for all changed shell scripts and `bootstrap.sh`.
  - End-to-end dry/live simulation on a writable mirror (`/tmp/ts-paperclip-work`) with synthetic TeamForge exports:
    - initial ingest: `new=3 skipped=0 suppressed=0 dispatched=0 errors=0`,
    - idempotent replay: `new=0 skipped=3 suppressed=3 dispatched=0 errors=0`,
    - dispatch run: `new=2 skipped=0 suppressed=0 dispatched=2 errors=0`,
    - outcome rollup after lifecycle mutation shows resolved/no-change split and time-to-resolution metrics.
  - `paperclip-sync.sh sync-issues --dry-run` against local API endpoint currently fails in this shell when `http://127.0.0.1:3100` is unreachable, but dry-run enrichment path and syntax are validated.

## Goal

Remove Training from the TeamForge shell and refocus the Clients page on hours-based tracking (no monetary value/revenue displays).

## Plan

- [x] Remove Training from app navigation and route registration.
- [x] Replace Clients monetary/value metrics with billable-hours-based metrics and labels.
- [x] Update backend/frontend client view types to expose month billable hours directly.
- [x] Build frontend and Tauri Rust workspace to verify no regressions.

## Review

- Removed Training from the shell navigation + routing surface:
  - `src/App.tsx` no longer imports `Training`, includes the Training nav item, or registers `/training`.
- Removed remaining Training-facing labels from adjacent UI:
  - `src/pages/Knowledge.tsx` category filter replaced `Training` with `Playbook`.
  - `src/pages/Overview.tsx` developer dashboard card now uses `PROCESS READINESS` / `SOP & DOC COVERAGE`.
- Refocused Clients UI from perceived monetary value to hours:
  - `src/pages/Clients.tsx` now shows `BILLABLE HOURS (MONTH)` in the top metrics, client cards, and detail panel.
  - Removed `MONTHLY REVENUE`/`MONTHLY VALUE` displays and dollar formatting from Clients page.
- Added direct hours field in shared client contracts:
  - `src-tauri/src/commands/mod.rs` now exposes `month_billable_hours` in `ClientView`.
  - `src/lib/types.ts` now uses `monthBillableHours` in `ClientView`.
  - Client sorting now prioritizes `month_billable_hours` and then active projects.
- Verification:
  - `npm run build` ✅
  - `npm run build` (post-label cleanup) ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Redesign Team page layout to stabilize the Crew Directory rail, reduce mapping clutter, and preserve all current assignment/sync features.

## Plan

- [x] Rework Crew Directory card layout so identity text never collapses and assignment controls are structured.
- [x] Simplify left rail information architecture (single directory flow with clear mode/filter controls).
- [x] Add Team mapping validation signals (duplicate department names, unassigned crew, inactive assignments).
- [x] Streamline Department Structure summary rendering to avoid noisy duplicate cards.
- [x] Run frontend build + Tauri tests to validate no regressions.

## Review

- Reworked Team directory layout in `src/pages/Team.tsx`:
  - Added a dedicated `DirectoryCrewCard` component that renders identity first and assignment controls below to prevent text collapse in narrow rails.
  - Removed the prior side-by-side compact card/select layout that forced names and assignment text into vertical wrapping.
- Simplified left rail flow:
  - Replaced dual-list (`UNASSIGNED TRAY` + `FULL ROSTER`) pattern with one searchable directory list and explicit mode toggles:
    - `UNASSIGNED (n)`
    - `ALL CREW (n)`
  - Preserved direct assignment capability for every listed person.
- Added live validation counters in the left rail:
  - duplicate department names,
  - inactive assigned crew,
  - open leadership roles.
- Improved department naming clarity + summary output:
  - Duplicate department names in mapping controls are now disambiguated with ordinal suffixes (for example `ENGINEERING 2`) in assignment option labels and department card headers.
  - Department Structure cards now render from aggregated name-level summaries to avoid noisy duplicate rows.
- Styling and structure adjustments:
  - widened org workspace rail column (`320px`) and increased directory list usable height.
  - introduced dedicated style tokens for directory mode controls, validation strip, and stacked assignment rows.
- Verification:
  - `npm run build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Split Team into focused subroutes (Mapping, Capacity, Crew Profile), extract reusable Team domain components, and enforce hard validation gates before org-chart save.

## Plan

- [x] Convert Team routing to `/team/*` with subroute navigation (`mapping`, `capacity`, `crew`).
- [x] Extract reusable components: `DirectoryPanel`, `DepartmentCard`, `RolePicker`, `ValidationBar`.
- [x] Add blocking validation gates for duplicate department names and missing required leadership roles.
- [x] Add inline validation fix actions (reset draft, auto-fill leadership, unassign inactive).
- [x] Run frontend build + Tauri tests to verify end-to-end stability.

## Review

- Routing split implemented:
  - `src/App.tsx` now mounts Team at `/team/*`.
  - `src/pages/Team.tsx` now provides subroute tabs and nested routes:
    - `mapping` (org chart editing),
    - `capacity` (department structure + monthly hours),
    - `crew` (employee profile summary panel).
- Team domain components extracted from monolith:
  - `src/components/team/DirectoryPanel.tsx`
  - `src/components/team/DepartmentCard.tsx`
  - `src/components/team/RolePicker.tsx`
  - `src/components/team/ValidationBar.tsx`
  - shared mode type: `src/components/team/types.ts`
- Hard save validation gates enforced:
  - Save is blocked when either of these is true:
    - duplicate department names exist,
    - required leadership roles are missing (HEAD/TEAM LEAD, excluding `organization`).
  - `handleSaveOrgChart` now exits early with error message if blocking conditions exist.
- Inline fix actions added:
  - `RESET DRAFT` for duplicate-name recovery path,
  - `AUTO-FILL ROLES` to fill missing HEAD/TEAM LEAD from active members,
  - `UNASSIGN INACTIVE` to clear stale inactive assignments.
- Additional streamlining retained:
  - Assignment option labels and department headers disambiguate duplicate names with ordinal suffixes.
  - Department Structure continues showing aggregated name-level summaries (reduced noise).
- Verification:
  - `npm run build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Bump release metadata to the next patch version and run a fresh clean build.

## Plan

- [x] Bump version metadata from `0.1.9` to `0.1.10` across app and sidecar package manifests.
- [x] Run a fresh clean frontend build on the bumped version.
- [x] Record the build result and touched version surfaces in review notes.

## Review

- Bumped version metadata from `0.1.9` to `0.1.10` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock` (root package entry refreshed by Cargo)
- Fresh build verification on bumped version:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)
  - `pnpm tauri build --no-bundle` ✅ (release binary built)
- Packaging notes:
  - `pnpm tauri build` reaches app+dmg bundling but exits non-zero at DMG bundling (`bundle_dmg.sh`) in this environment.
  - `pnpm tauri build --bundles app` finishes app artifacts but exits non-zero due missing updater signing key: `TAURI_SIGNING_PRIVATE_KEY`.

## Goal

Generate a usable latest DMG (`0.1.10`) and replace the installed `/Applications/TeamForge.app`.

## Plan

- [x] Create a clean DMG from the newly built `TeamForge.app`.
- [x] Mount DMG and replace existing `/Applications/TeamForge.app` with the new build.
- [x] Verify installed app metadata reports `0.1.10`.

## Review

- Created DMG successfully at:
  - `src-tauri/target/release/bundle/dmg/TeamForge_0.1.10_aarch64.dmg`
  - size: ~10 MB
- Installed updated app by mounting DMG and copying app bundle into `/Applications`:
  - source: mounted `TeamForge.app`
  - destination: `/Applications/TeamForge.app`
- Verified installed metadata:
  - `CFBundleShortVersionString`: `0.1.10`
  - `CFBundleVersion`: `0.1.10`
- Opened the installed app (`open /Applications/TeamForge.app`) after replacement.

## Goal

Fix Team sub-tab navigation so Mapping/Capacity/Crew always render their content instead of blank screen states.

## Plan

- [x] Inspect Team subroute link and nested route matching behavior.
- [x] Fix Team tab links to avoid broken relative navigation under `/team/*`.
- [x] Add safe nested route redirects (`index` + wildcard fallback) for Team.
- [x] Run frontend build to verify no route/regression issues.

## Review

- Updated Team sub-tab link targets in `src/pages/Team.tsx`:
  - `MAPPING` now points to `/team/mapping`
  - `CAPACITY` now points to `/team/capacity`
  - `CREW PROFILE` now points to `/team/crew`
  - each tab link now uses `end` for stable active-state behavior.
- Updated nested routing in `src/pages/Team.tsx`:
  - replaced `path="/"` redirect with `index` redirect to `mapping`,
  - added wildcard fallback route (`path="*"`) redirecting to `mapping`.
- Verification:
  - `pnpm build` ✅

## Goal

Update Clients to participate in the GitHub-driven execution flow:
- GitHub-only projects create client visibility before Clockify exists.
- ParkArea appears in Client Directory through the default GitHub repo config.
- Client detail shows GitHub-backed linked projects, issue counts, source URLs, and GitHub activity.
- Clockify remains the billing/time overlay.

## Plan

- [ ] Extend client backend view fields with planning source and GitHub issue/project counts.
- [ ] Merge GitHub repo+milestone aggregates into `load_clients`.
- [ ] Add GitHub linked projects/resources/activity to `get_client_detail`.
- [ ] Update Client UI cards/detail panel to show integrated source and issue metadata.
- [ ] Verify with frontend build and Rust tests.

## Review

- Pending implementation.
