# Technology Stack

**Analysis Date:** 2026-05-04

TeamForge is a multi-tier hybrid app: a Tauri 2 desktop shell (Rust backend + React 19 frontend) on the operator's Mac, a Cloudflare Worker + D1 control plane in the cloud, and a Node.js sidecar/scripts layer for runtime adapters and parity tooling. SQLite is the desktop cache; D1 is the canonical project graph; Worker R2 holds release artifacts.

## Languages

**Primary:**
- Rust (edition 2021) — Tauri backend in `src-tauri/src/`. Crate name `team-forge-ts`, library name `team_forge_lib` (`src-tauri/Cargo.toml:1-9`).
- TypeScript 5.7 — React frontend in `src/`, Cloudflare Worker in `cloudflare/worker/src/`, Node.js scripts in `scripts/*.mjs`, sidecar in `sidecar/src/`.

**Secondary:**
- Bash — release/automation (`scripts/launch-thoughtseed-paperclip.sh`, `scripts/refresh-tauri-skills.sh`, `scripts/export-teamforge-tauri-icons.sh`, `scripts/generate-teamforge-dock-icon-batch.sh`).
- Python 3 — design tooling only (`scripts/review-teamforge-dock-icons.py`).
- SQL — desktop migration `src-tauri/migrations/001_initial.sql`; D1 migrations `cloudflare/worker/migrations/0001_initial.sql` … `0005_project_identity_links.sql`.

## Runtime

**Environment:**
- Tauri 2 (`tauri = "2"` in `src-tauri/Cargo.toml:14`) producing a macOS native shell. Bundle targets `dmg` + `app`; minimum macOS 10.15 (`src-tauri/tauri.conf.json:38-46`).
- Tokio multi-threaded async runtime (`tokio = { version = "1", features = ["full"] }` `src-tauri/Cargo.toml:20`).
- Node.js 20+ for frontend dev, sidecar, scripts, and Worker tooling (README: `Prerequisites: Node.js 20+, Rust 1.75+, pnpm`).
- Cloudflare Workers runtime (compatibility date `2026-04-09`, `cloudflare/worker/wrangler.jsonc:4`).
- WebView2/WKWebView shell hosting React (`tauri.conf.json` `withGlobalTauri: true`, `frontendDist: "../dist"`).

**Package Manager:**
- pnpm 10.33.0 declared as `packageManager` (`package.json:40`).
- Lockfiles present: `pnpm-lock.yaml` at repo root, `sidecar/pnpm-lock.yaml`, `cloudflare/worker/pnpm-lock.yaml`.
- Cargo for Rust backend (`src-tauri/Cargo.toml`, lockfile assumed in `src-tauri/`).

## Frameworks

**Core (frontend `src/`):**
- React 19 + react-dom 19 (`package.json:27-28`).
- React Router DOM 7 — `BrowserRouter` mounted in `src/main.tsx:9`.
- Zustand 5 — global app state in `src/stores/appStore.ts` (per README project tree).
- Tauri JS API: `@tauri-apps/api` v2, `@tauri-apps/plugin-shell` v2, `@tauri-apps/plugin-sql` v2 (`package.json:24-26`).

**Core (backend `src-tauri/`):**
- Tauri 2 with `tray-icon` feature (`Cargo.toml:14`). Tray menu wired in `src-tauri/src/lib.rs:55-88`.
- Tauri plugins enabled in `src-tauri/src/lib.rs:41-45`: `tauri-plugin-dialog`, `tauri-plugin-shell`, `tauri-plugin-notification`, `tauri-plugin-process`, `tauri-plugin-updater`.
- Capabilities granted in `src-tauri/capabilities/default.json` (`shell:allow-execute`, `shell:allow-open`, `dialog:default`, `notification:default`, `process:default`, `updater:default`).
- `serde` / `serde_json` 1.x for JSON IPC and integration payload (de)serialization.
- `reqwest` 0.12 with `json` + `rustls-tls` features — every outbound HTTP integration uses this client.
- `sqlx` 0.8 with `runtime-tokio` + `sqlite` features — desktop cache pool (`src-tauri/src/db/queries.rs:10-30`).
- `chrono` 0.4 with `serde` — timestamps and date math throughout.

**Core (Cloudflare Worker `cloudflare/worker/`):**
- Plain Workers fetch handler (no framework). Entry `cloudflare/worker/src/index.ts`.
- Durable Object class `WorkspaceLock` exported from same file (`cloudflare/worker/src/index.ts:61`), bound as `WORKSPACE_LOCKS` (`wrangler.jsonc:39-46`).
- D1, R2, and Queues bindings declared in `wrangler.jsonc:17-37`.

**Testing:**
- Frontend: no JS test runner configured (no `jest`/`vitest`/`playwright` in `package.json`). README scores tests at 40%.
- Backend: Rust unit tests inline (e.g. `src-tauri/src/paperclip.rs:1161-1361` `#[cfg(test)] mod tests`). Run with `cargo test`.
- Repo `tests/` directory present at root — likely fixtures/integration scaffolding (not yet wired to CI).

**Build/Dev:**
- Vite 6 + `@vitejs/plugin-react` 4 — frontend dev server on port 1420 (`vite.config.ts:1-14`). `envPrefix: ["VITE_", "TAURI_"]`.
- TypeScript 5.7 strict mode (`tsconfig.json:13-18` — `strict`, `noUnusedLocals`, `noUnusedParameters`).
- `tauri-build` v2 build dependency (`src-tauri/Cargo.toml:11`).
- Wrangler CLI for Worker dev/deploy (`cloudflare/worker/package.json:5-11`).
- pnpm scripts in root `package.json:7-21` orchestrate everything: `dev` (vite), `build` (tsc + vite), `tauri`, plus design / paperclip / parity / OTA / KPI export scripts.

## Key Dependencies

**Critical (Rust, `src-tauri/Cargo.toml:13-25`):**
- `tauri = "2"` features `tray-icon` — desktop shell.
- `tauri-plugin-updater = "2"` — drives auto-update against the Cloudflare Worker OTA endpoint (`tauri.conf.json:63-68`).
- `tauri-plugin-shell = "2"` — used to launch the Paperclip babysitter and open vault paths (`src-tauri/src/commands/mod.rs` uses `ShellExt`).
- `tauri-plugin-dialog = "2"` — directory pickers for vault root selection.
- `tauri-plugin-notification = "2"` — macOS alerts from sync engine (`src-tauri/src/sync/alerts.rs`).
- `tauri-plugin-process = "2"` — process control (used by updater + paperclip launchers).
- `reqwest = "0.12"` (json, rustls-tls) — Clockify, Huly, Slack, GitHub, Paperclip, Worker HTTP.
- `tokio = "1"` (full) — async runtime; semaphore used for Clockify rate limiting (`src-tauri/src/clockify/client.rs:25`).
- `sqlx = "0.8"` (runtime-tokio, sqlite) — desktop cache.
- `serde`, `serde_json`, `chrono` — DTOs and time math.

**Critical (frontend, `package.json:23-31`):**
- `@tauri-apps/api` ^2 — IPC into Rust commands.
- `@tauri-apps/plugin-shell` ^2 — frontend bridge to shell plugin.
- `@tauri-apps/plugin-sql` ^2 — present but the desktop cache is owned by Rust/sqlx; frontend reads go through invoke handlers, not direct SQL.
- `react` / `react-dom` ^19, `react-router-dom` ^7, `zustand` ^5.

**Critical (sidecar, `sidecar/package.json:14-21`):**
- `@hcengineering/api-client` 0.7.3 — official Huly SDK. Reserved for the sidecar / parity scripts; the Tauri runtime path uses direct REST instead (see INTEGRATIONS.md → Huly).
- `tsx` ^4.19, `typescript` ^5.7, `@types/node` ^22 — build/run.

**Critical (Cloudflare Worker, `cloudflare/worker/package.json`):**
- Wrangler is invoked via `pnpm dlx wrangler` — no explicit `wrangler` dep; only `tsc --noEmit` for typecheck.
- No external runtime dependencies: routes, auth, DB, locks, response helpers are all hand-rolled in `cloudflare/worker/src/lib/` (`auth.ts`, `db.ts`, `env.ts`, `github-api.ts`, `huly-api.ts`, `locks.ts`, `project-registry.ts`, `response.ts`, `sync-control-plane.ts`).

**Critical (release/ops scripts, `scripts/`):**
- Plain Node.js ESM (`*.mjs`); no third-party deps required at runtime.
- `scripts/publish-ota-release.mjs` shells out to `wrangler d1` and uploads R2 artifacts.
- `scripts/teamforge-vault-parity.mjs` uses `node:sqlite` (DatabaseSync) — requires Node 22+ for stable `node:sqlite` builtin.

## Configuration

**Environment (frontend / Vite):**
- Vite picks up `VITE_*` and `TAURI_*` env vars (`vite.config.ts:10`).
- No `.env*` checked in (none discovered at repo root). Per-machine config is stored in the desktop SQLite `settings` table via `queries::get_setting` / `commands::save_setting` (`src-tauri/src/commands/mod.rs:2240`).

**Environment (Tauri / Rust):**
- Reads OS env vars `GITHUB_TOKEN` (fallback for the `github_token` setting, `src-tauri/src/sync/scheduler.rs:70`), `TEAMFORGE_OPERATOR_EMAIL` / `USER_EMAIL` / `EMAIL` for Paperclip focus user (`src-tauri/src/paperclip.rs:1129`), and vault overrides `TEAMFORGE_VAULT_ROOT` / `THOUGHTSEED_VAULT_ROOT` / `OBSIDIAN_VAULT_ROOT` (`src-tauri/src/vault.rs:23-27`).
- Per-user settings stored in the SQLite `settings` table (key/value). Documented keys (see INTEGRATIONS.md): `clockify_api_key`, `clockify_workspace_id`, `huly_token`, `slack_bot_token`, `github_token`, `paperclip_api_url`, `paperclip_api_token`, `paperclip_operator_email`, `cloud_credentials_base_url`, `cloud_credentials_audience`, `cloud_credentials_access_token`, `local_vault_root`.

**Environment (Cloudflare Worker, `cloudflare/worker/wrangler.jsonc`):**
- Vars: `TF_ENV`, `TF_API_BASE_URL`, `TF_DEFAULT_OTA_CHANNEL`, `TF_ACCESS_AUDIENCE`, `TF_INTEGRATION_CONFIG_JSON`.
- Secrets (declared in `cloudflare/worker/src/lib/env.ts:38-55`, set via `wrangler secret put`): `TF_CLOCKIFY_API_TOKEN_GLOBAL`, `TF_HULY_USER_TOKEN_GLOBAL`, `TF_SLACK_BOT_TOKEN_GLOBAL`, `TF_GITHUB_TOKEN_GLOBAL`, `TF_CREDENTIAL_ENVELOPE_KEY`, `TF_WEBHOOK_HMAC_SECRET`, `TF_RELEASE_PUBLISH_TOKEN`.
- Bindings: D1 `TEAMFORGE_DB` (`teamforge-primary`, id `d773aaa8-aa51-4ef8-ae08-1d3d238d2ae3`), R2 `TEAMFORGE_ARTIFACTS` (`teamforge-artifacts`), Queue producer `SYNC_QUEUE` → `teamforge-sync`, Durable Object `WORKSPACE_LOCKS` (`WorkspaceLock` class).

**Environment (paperclip runtime adapter, `scripts/paperclip-runtime-adapter.mjs:11-21`):**
- `REPO_ROOT`, `PORT` (default 3101), `HOST` (default 127.0.0.1), `PAPERCLIP_API_TOKEN`, `PAPERCLIP_STALE_THRESHOLD_SEC` / `TEAMFORGE_STALE_THRESHOLD_SEC`, `FORGE_AURA_ADAPTER_DRY_RUN`.

**Build:**
- `tauri.conf.json` — bundle config, updater pubkey + endpoint, shell plugin allowlist, packaged sidecar resources (`scripts/teamforge-vault-parity.mjs`, `scripts/launch-thoughtseed-paperclip.sh`, `scripts/paperclip-runtime-adapter.mjs` are bundled into the .app via `bundle.resources`, `tauri.conf.json:53-57`).
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts` for the React app.
- `cloudflare/worker/tsconfig.json` for Worker typecheck.
- `sidecar/tsconfig.json` for sidecar.

## Platform Requirements

**Development:**
- macOS host (Tauri produces a Mac-only bundle currently; `bundle.targets: ["dmg", "app"]`).
- Node.js 20+, Rust 1.75+ (2021 edition), pnpm 10.33.0 (README + `package.json:40`).
- Cloudflare account with Wrangler auth for Worker dev / D1 migrations / R2 bucket / OTA publishing.
- A local Thoughtseed Paperclip checkout at `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip` (override via `THOUGHTSEED_PAPERCLIP_ROOT`, `scripts/launch-thoughtseed-paperclip.sh:4-5`) for the agent runtime features.

**Production:**
- Distribution: GitHub Releases macOS `.app` and `.dmg` for Apple Silicon and Intel (signed via `.github/workflows/release.yml` per README).
- Auto-update: Tauri updater pulls the manifest from `https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/ota/check?target={{target}}&currentVersion={{current_version}}&channel=stable` (`tauri.conf.json:65-67`), signed with the embedded minisign pubkey at `tauri.conf.json:64`.
- Cloud control plane: Cloudflare Worker `teamforge-api` (`workers_dev: true`) with D1 `teamforge-primary` and R2 `teamforge-artifacts`.

---

*Stack analysis: 2026-05-04*
