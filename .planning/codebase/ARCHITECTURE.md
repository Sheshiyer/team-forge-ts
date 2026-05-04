# TeamForge Architecture

**Analysis Date:** 2026-05-04
**Version analyzed:** v0.1.28 (per `package.json`, `src-tauri/tauri.conf.json:3`, `src-tauri/Cargo.toml:3`)

## Pattern Overview

**Overall:** Tauri 2 desktop app (React+Vite WebView ↔ Rust Core) backed by a Cloudflare Worker + D1 control plane, with Node.js helper scripts invoked via `tauri-plugin-shell` (no true Tauri sidecar).

**Key Characteristics:**
- Single-binary native macOS app; the "sidecar" directory is **not** wired as a Tauri sidecar — it's a standalone Node helper invoked manually.
- All cross-process work goes through three transport layers: (a) Tauri IPC (`@tauri-apps/api/core::invoke`), (b) `reqwest` HTTP from Rust to Cloudflare/Huly/Slack/Clockify/GitHub, (c) `Command::new("node")` shell-outs to `.mjs` scripts under `scripts/`.
- Local source of truth is SQLite (`teamforge.db` in `app_data_dir`); cloud source of truth is Cloudflare D1 via the worker. The worker holds the project graph + agent_feed export; the local DB holds raw integration data + the materialized `agent_feed` projection.
- OTA updates use `tauri-plugin-updater` pointing at the same worker (`/v1/ota/check`).

## Process Model

```
┌────────────────────────────────────────────────────────────────────────┐
│  TeamForge.app (single Tauri 2 process tree)                           │
│                                                                        │
│  ┌─────────────────────┐         IPC          ┌────────────────────┐   │
│  │  WebView (WKWebView)│ ◄──── invoke() ────► │  Rust Core         │   │
│  │  React 19 + Vite    │   tauri:event        │  team_forge_lib    │   │
│  │  src/ → dist/       │ ──────────────────►  │  src-tauri/src/    │   │
│  │  Router: BrowserRtr │                      │  tokio runtime     │   │
│  └─────────────────────┘                      │  sqlx SqlitePool   │   │
│                                               │  reqwest::Client   │   │
│                                               └─────────┬──────────┘   │
│                                                         │              │
│  ┌──────────────────┐   shell.command("node")  ┌────────▼────────────┐ │
│  │ tray-icon menu   │ ◄────────────────────────│  tauri_plugin_shell │ │
│  │ (Show/Sync/Quit) │                          │  spawns scripts/*.mjs│ │
│  └──────────────────┘                          └────────┬────────────┘ │
└─────────────────────────────────────────────────────────┼──────────────┘
                                                          │
                                          ┌───────────────┼─────────────┐
                                          ▼               ▼             ▼
                                  scripts/teamforge   scripts/launch-  scripts/paperclip
                                  -vault-parity.mjs   thoughtseed-     -runtime-adapter
                                  (Node, 2778 LOC)    paperclip.sh     .mjs (796 LOC)

Outbound HTTPS from Rust Core (reqwest):
  ├─ https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/*  (CF worker + D1)
  ├─ https://huly.app  (config.json → JSON-RPC selectWorkspace → /api/v1/tx)
  ├─ https://slack.com/api/*
  ├─ https://api.clockify.me/api/v1/*
  └─ https://api.github.com/*

Outbound HTTP from Rust Core to Paperclip runtime (loopback):
  └─ http://127.0.0.1:3101/api  (Paperclip API), http://127.0.0.1:3100 (UI)
```

There is **no Tauri sidecar** in the strict sense. `src-tauri/tauri.conf.json:53-57` exposes three Node assets as bundle resources; they are launched on demand via `tauri_plugin_shell`. `sidecar/` is a separate pnpm package never bundled into the app — it is a developer-time mirror utility (`sidecar/README.md:1-22`).

## Layers (Rust Core)

**`src-tauri/src/main.rs:3` (entry, 5 lines):**
- Calls `team_forge_lib::run()`. Nothing else.

**`src-tauri/src/lib.rs:39` (`pub fn run`, 200 lines total):**
- Builds the Tauri app, registers plugins (`shell`, `dialog`, `notification`, `process`, `updater`).
- `setup` block (`lib.rs:46-101`): resolves `app_data_dir`, builds tray menu+icon, blocks on `db::queries::init_db` so the SqlitePool is `app.manage()`'d before first render.
- Registers ~95 IPC commands at `lib.rs:103-197`.
- Owns two managed states: `DbPool(SqlitePool)` and `SchedulerState(Mutex<Option<SyncScheduler>>)`.

**`src-tauri/src/commands/mod.rs` (single 11,810-line module):**
- Every `#[tauri::command]` handler. This is the IPC surface.
- Pulls in `crate::db`, integration clients (`huly`, `slack`, `clockify`, `github`), `paperclip`, `vault`, `sync::teamforge_worker`.
- Hot-spot helpers: `repo_parity_script_path()` `commands/mod.rs:1661`, `repo_paperclip_launcher_path()` `commands/mod.rs:1665`, `repo_paperclip_adapter_script_path()` `commands/mod.rs:1669` — these select between bundled resource paths and dev-checkout paths.

**`src-tauri/src/db/`:**
- `db/queries.rs` (3116 lines) — all SQL access; opens pool in `init_db` `db/queries.rs:10`.
- `db/models.rs` (1084 lines) — sqlx-derived structs; types include `OpsEvent` `models.rs:426`, `AgentFeedItem` `models.rs:446`, `TeamforgeProject` `models.rs:101`, `Presence` `models.rs:469`, `SyncState` `models.rs:480`.
- `db/mod.rs` — re-exports.

**Integration adapters (one client + one sync engine per integration):**
- `src-tauri/src/huly/{client,types,sync,naming,mod}.rs` — REST/JSON-RPC client (`huly/client.rs:31` `connect()`), sync engine (`huly/sync.rs`).
- `src-tauri/src/slack/{client,types,sync,mod}.rs`
- `src-tauri/src/clockify/{client,types,sync,mod}.rs`
- `src-tauri/src/github/{client,types,sync,mod}.rs` — added in v0.1.27+, used by `commands::sync_github_plans`.

**`src-tauri/src/sync/`:**
- `sync/scheduler.rs:38` `SyncScheduler::start()` — spawns one `tokio::task` per cadence (Clockify presence 30 s, time entries 5 m, users/projects+quota alerts 60 m; Huly issues 10 m / presence 2 m / team cache 60 m; Slack deltas 3 m; GitHub 10 m; agent_feed projection refresh 2 m at `sync/scheduler.rs:295-310`).
- `sync/teamforge_worker.rs` (1087 lines) — Rust HTTP client to the Cloudflare worker. Holds `WorkerProjectGraph`, `WorkerClientProfile`, `WorkerOnboardingFlow*` deserialization shapes; entry points called from commands include `fetch_teamforge_project_graphs`, `fetch_teamforge_client_profiles`, `fetch_teamforge_onboarding_flows` (all called from `commands::sync_local_vault_to_teamforge` post-sync at `commands/mod.rs:2750-2757`).
- `sync/alerts.rs` — quota threshold notifications (used by scheduler at `sync/scheduler.rs:162`).

**`src-tauri/src/paperclip.rs` (1361 lines):**
- HTTP-only adapter for the local Paperclip runtime (`http://127.0.0.1:3101/api`, `paperclip.rs:11-12`). Defines DTOs (`PaperclipUser` etc.) and `reqwest`-based fetchers. Does **not** spawn the runtime — that's `commands::launch_paperclip_script` / `ensure_paperclip_runtime_started` (`commands/mod.rs:2123`, `commands/mod.rs:2337`) which shells out to `scripts/launch-thoughtseed-paperclip.sh` or to `scripts/paperclip-runtime-adapter.mjs`.

**`src-tauri/src/vault.rs` (1163 lines):**
- Filesystem reader for the founder's local Obsidian vault. `resolve_local_vault_root` resolves the configured root from `settings`. Used by `commands::get_local_workspace_status` and `commands::sync_local_vault_to_teamforge` (`commands/mod.rs:2638`).

**`src-tauri/src/ops/mod.rs` (106 lines):**
- `OPS_EVENT_SCHEMA_VERSION = "ops_event/v1"`.
- `build_sync_key(OpsSyncKeyInput)` — deterministic dedup key for `ops_events.sync_key`. Format: `ops:v1:{source}:{event_type}:{entity_type}:{entity_id}:{actor_*}:{occurred_at}` (`ops/mod.rs:39-54`).

## Layers (Frontend)

**`src/main.tsx` (13 lines):** ReactDOM.createRoot, wraps `<App/>` in `<BrowserRouter>`.

**`src/App.tsx` (694 lines):** Top-level shell. Defines LCARS nav sections, route table for all `pages/*`, listens to `tauri:event` for tray navigation, runs `invoke("sync_cloud_credentials")` on launch (`App.tsx:96-117`). Routes: `/`, `/timesheet`, `/projects`, `/sprints`, `/insights`, `/team`, `/calendar`, `/comms`, `/clients`, `/issues`, `/onboarding`, `/activity`, `/agents`, `/settings`, `/boards`, `/knowledge`.

**`src/hooks/useInvoke.ts` (257 lines):** **The IPC contract surface.** A typed wrapper around `invoke()` exposing every Rust command as a TS function. Every page calls into this. When you add a new Rust command in `commands/mod.rs` and register it in `lib.rs:103`, you add a TS wrapper here.

**`src/lib/types.ts`:** All TS types matching Rust serde shapes.
**`src/lib/updater.ts`:** Wraps `tauri-plugin-updater` for in-app update UX.
**`src/stores/appStore.ts` (13 lines):** Zustand store; only holds `dateRange`. State is otherwise per-page React state.
**`src/pages/*.tsx`:** One file per route. Each page calls `useInvoke()` directly.

## Layers (Cloudflare Worker)

**`cloudflare/worker/src/index.ts:15` (default fetch handler):**
- Routes `/v1/*` → `handleV1Request` (`routes/v1.ts:31`).
- Routes `/internal/*` (with bearer auth) → `handleInternalRequest`.
- Exports `WorkspaceLock` Durable Object class (`index.ts:61`) used for per-workspace mutex during sync.

**Routes (`cloudflare/worker/src/routes/`):**
- `v1.ts` — central router; lists every `/v1` endpoint.
- `agent-feed.ts:10` `handleAgentFeedExport` — serves `/v1/agent-feed/export` for Paperclip; reads `projects`, `sync_conflicts`, `sync_journal` from D1.
- `projects.ts` — project CRUD, mappings, control plane, actions.
- `credentials.ts`, `connections.ts`, `sync.ts`, `team.ts`, `normalization.ts`, `ota.ts`, `internal.ts`.

**D1 schema:** `cloudflare/worker/migrations/0001_initial.sql` … `0005_project_identity_links.sql`.

**Bindings (per `wrangler.jsonc`):** `TEAMFORGE_DB` (D1), `TEAMFORGE_ARTIFACTS` (R2), `SYNC_QUEUE` (Queue), `WORKSPACE_LOCKS` (DO), plus secrets `TF_CREDENTIAL_ENVELOPE_KEY`, `TF_WEBHOOK_HMAC_SECRET`, `TF_RELEASE_PUBLISH_TOKEN`.

## Data Flow — Founder-Sync Vault Parity (issue #45 territory)

**Trigger:** UI invokes `useInvoke().syncLocalVaultToTeamforge()` → `invoke("sync_local_vault_to_teamforge")`.

**Current implementation is a Node shell-out, not a Rust importer:**

1. `commands::sync_local_vault_to_teamforge` `src-tauri/src/commands/mod.rs:2638` runs.
2. It calls `read_local_workspace_status` to verify `founder_sync_ready` (vault root configured, workspace_id set, node detected, parity script resolvable).
3. Resolves the parity script via `resolve_parity_script_path` `commands/mod.rs:1677`:
   - First tries the bundled resource `teamforge-vault-parity.mjs` (declared in `tauri.conf.json:54`).
   - Falls back to repo path `../scripts/teamforge-vault-parity.mjs` `commands/mod.rs:1662`.
4. Reads `cloud_credentials_access_token` from local `settings` table.
5. Allocates a temp report path (`std::env::temp_dir().join("teamforge-vault-sync-{ms}.json")`).
6. Spawns Node via `app_handle.shell().command("node").args([script_path, "--apply", "--vault-root", …, "--worker-base-url", …, "--workspace-id", …, "--report", …]).env("TEAMFORGE_ACCESS_TOKEN", …).output().await` (`commands/mod.rs:2681-2702`).
7. **`scripts/teamforge-vault-parity.mjs` (2778 lines)** does the heavy lifting in Node: walks the Obsidian vault, parses project briefs / client profiles / onboarding flows / employee KPI notes, diffs against the worker's project graph fetched from `/v1/projects`, then PUTs/POSTs back to the worker.
8. Rust reads the JSON report file, summarizes counts and failures, returns a `LocalVaultSyncReport`.
9. Rust then refreshes the local DB projection from the worker via `teamforge_worker::fetch_teamforge_project_graphs / fetch_teamforge_client_profiles / fetch_teamforge_onboarding_flows` `commands/mod.rs:2750-2757`.

**Where a Rust importer would replace the shell-out:** the Node call in `commands/mod.rs:2681-2702` becomes a new Rust module (e.g. `src-tauri/src/vault/parity.rs`) that uses the same `reqwest`-based pattern already established in `sync/teamforge_worker.rs`. The `WorkerProject*` deserialization types and the `WorkerEnvelope<T>` wrapper in `sync/teamforge_worker.rs:20-24` are the existing canonical Rust HTTP-client pattern to copy.

**Two-importer risk (issue #45):** the same vault parity logic exists today as ~2.8 KLOC of Node in `scripts/teamforge-vault-parity.mjs`. A Rust port must match its semantics for: project brief frontmatter parsing, workspace_id fallback (`teamforge-vault-parity.mjs:865-878`), client profile upsert keys, onboarding flow grouping, and employee KPI note handling. The Node script is the spec until parity is reached; do not delete it before the Rust path is verified.

## Data Flow — agent_feed / ops_event

**Producers (write `ops_events`):**
- All sync engines call `db::queries::upsert_ops_event` (`db/queries.rs:1979`) when they detect a noteworthy event. `OpsEvent` shape: `db/models.rs:426`. Sync key built via `ops::build_sync_key` (`ops/mod.rs:39`) for idempotency on `sync_key UNIQUE`.
- Sources include Clockify time entries, Huly issue activity, Slack message deltas, GitHub PR/issue events.

**Projector (writes `agent_feed`):**
- `db::queries::refresh_agent_feed_projection` `db/queries.rs:2162` is the single materializer.
  - Reads `sync_state` row `(scope='agent_feed', key='projection')` for the watermark.
  - Selects `ops_events` newer than the watermark (`queries.rs:2174`).
  - For each event, builds an `AgentFeedItem` (severity/owner_hint/projection metadata `queries.rs:2217`) and calls `upsert_agent_feed_item` `queries.rs:2032`.
  - Updates the watermark in `sync_state`.
- Triggered three ways:
  1. Scheduler tick every 120 s — `sync/scheduler.rs:295-310`.
  2. Tray "Sync Now" — `lib.rs:259-261` after integration syncs.
  3. Explicit `commands::refresh_agent_feed` IPC.

**Consumers (read `agent_feed`):**
- Local UI: `commands::get_agent_feed` → `db::queries::get_agent_feed` `queries.rs:2097` → `agents.tsx`/`activity.tsx`.
- Export to Paperclip: `commands::export_agent_feed_snapshot` → `db::queries::get_agent_feed_export_rows` `queries.rs:2112` (writes a JSON snapshot file).
- Cloudflare D1 export: separate path. The worker's `/v1/agent-feed/export` `cloudflare/worker/src/routes/agent-feed.ts:10` reads from D1 tables (`projects`, `sync_conflicts`, `sync_journal`) — **not** from local `agent_feed`. This is the Paperclip-cloud bridge; the local `agent_feed` is the Paperclip-desktop bridge.

```
[Clockify/Huly/Slack/GitHub sync engines]
            │ upsert_ops_event(...)
            ▼
   ┌──────────────────┐
   │ ops_events table │ (PRIMARY KEY id, UNIQUE sync_key)
   │ schema_version:  │
   │ "ops_event/v1"   │
   └────────┬─────────┘
            │ refresh_agent_feed_projection
            │ (scheduler 120s / tray sync / IPC)
            ▼
   ┌──────────────────┐         IPC          ┌──────────────────┐
   │ agent_feed table │ ───────────────────► │ Activity / Agents│
   │ projection:      │   get_agent_feed     │ pages            │
   │ "agent_feed/v1"  │                      └──────────────────┘
   └────────┬─────────┘
            │ export_agent_feed_snapshot (file) / Paperclip HTTP
            ▼
   [Paperclip runtime on 127.0.0.1:3101]
```

## Data Flow — OTA Distribution

1. Build: `pnpm tauri build` produces signed artifacts (minisign pubkey embedded at `tauri.conf.json:64`).
2. Publish: `scripts/publish-ota-release.mjs` uploads artifacts (R2 or `https://artifacts.teamforge.app`) and POSTs to `https://teamforge-api.sheshnarayan-iyer.workers.dev/internal/releases/publish` (`publish-ota-release.mjs:13`) with `TF_RELEASE_PUBLISH_TOKEN`.
3. Worker stores release rows in D1 `ota_releases`/`ota_channels` (see `cloudflare/worker/src/routes/ota.ts:5-22`).
4. Client startup: `tauri-plugin-updater` polls `tauri.conf.json:66` `https://…/v1/ota/check?target={target}&currentVersion={current_version}&channel=stable` → `routes/ota.ts::handleOtaCheck`.
5. Worker selects highest active release matching platform/arch/channel, returns signed bundle URL + signature.
6. Client downloads, verifies signature, restarts via `tauri-plugin-process`. Frontend wrapper: `src/lib/updater.ts`.
7. Telemetry: client POSTs `/v1/ota/install-events` after install (`routes/v1.ts:186`).

## Entry Points

| Entry | Path | Triggers |
|-------|------|----------|
| Rust binary | `src-tauri/src/main.rs:3` | OS launch |
| Rust app builder | `src-tauri/src/lib.rs:39` `run()` | Called from `main` |
| IPC handler registry | `src-tauri/src/lib.rs:103` | Tauri builder |
| Frontend root | `src/main.tsx:7` | WebView load |
| Frontend shell | `src/App.tsx:82` | After `BrowserRouter` mount |
| Worker | `cloudflare/worker/src/index.ts:15` `default.fetch` | CF edge request |
| Vault parity script | `scripts/teamforge-vault-parity.mjs` | Spawned from `commands::sync_local_vault_to_teamforge` |
| Paperclip launcher | `scripts/launch-thoughtseed-paperclip.sh` | Spawned from `commands::launch_paperclip_script` |
| Paperclip adapter | `scripts/paperclip-runtime-adapter.mjs` | Bundled fallback for runtime ops |
| OTA publisher | `scripts/publish-ota-release.mjs` | Manual release |
| Huly sidecar mirror | `sidecar/src/seed-parkarea.ts` | Manual `pnpm mirror:github` (dev only) |

## Error Handling

**Strategy:** Rust returns `Result<T, String>` from every `#[tauri::command]`; the JS side gets a string error from `invoke`. There is no structured error code path except for `commands::machine_error(code, message)` `commands/mod.rs:182` which JSON-encodes a `{code, message}` payload — used selectively (e.g. Slack scope errors).

**Patterns:**
- Worker integration errors are summarized with `summarize_sync_failures` `commands/mod.rs:1789` which walks `failures`/`clientProfileFailures`/`onboardingFlowFailures`/`employeeKpiFailures` arrays from the parity report.
- Scheduler tasks log with `eprintln!("[scheduler] … error: {e}")` and continue; one failing tick does not kill the loop (`sync/scheduler.rs:108-115`).
- Worker side uses `jsonError({code, message, retryable}, status)` from `cloudflare/worker/src/lib/response.ts`.

## Cross-Cutting Concerns

- **Logging:** `eprintln!` everywhere in Rust (no log crate). Worker uses `console.log`/`console.error`.
- **Auth (worker):** `requireBearerAuth` (`cloudflare/worker/src/lib/auth.ts`) checks Bearer header against `TF_CREDENTIAL_ENVELOPE_KEY` (app traffic), `TF_WEBHOOK_HMAC_SECRET` (internal callbacks/agent-feed export), or `TF_RELEASE_PUBLISH_TOKEN` (release publish only).
- **Auth (integrations):** Tokens stored in local `settings` table via `db::queries::set_setting`; read at sync time. Cloud credential envelope is fetched from worker `/v1/credentials` and re-stored locally by `commands::sync_cloud_credentials`.
- **Migrations:** Rust embeds `migrations/001_initial.sql` via `include_str!` at `db/queries.rs:20`; columns added since v0.1 are bolted on with `ensure_*_columns` functions (e.g. `db/queries.rs:32`) doing `ALTER TABLE … ADD COLUMN` and swallowing duplicate-column errors. **There is only one numbered migration file.**
- **Workspace locking:** `WorkspaceLock` Durable Object (`cloudflare/worker/src/index.ts:61`) provides per-workspace_id mutex with TTL; sync routes acquire before mutating D1.
- **State management (frontend):** Effectively none. Zustand store has 1 field (`dateRange`). All other state is fetched per-page from Rust on mount.

---

*Architecture analysis: 2026-05-04*
