# External Integrations

**Analysis Date:** 2026-05-04

TeamForge talks to seven external surfaces from the Tauri backend (Clockify, Huly, Slack, GitHub, the TeamForge Cloudflare Worker, the local Paperclip runtime API, and the OTA updater channel hosted on the same Worker). The Worker itself talks to D1, R2, Queues, and a Workspace-Lock Durable Object. There are no third-party SDKs in the Tauri runtime path — every integration is hand-rolled `reqwest` HTTP. The Huly SDK only lives in the reserved Node sidecar.

## APIs & External Services

**Time tracking — Clockify:**
- Service: Clockify REST API at `https://api.clockify.me/api/v1` (`src-tauri/src/clockify/client.rs:6`).
- Used for: presence (active timers, 30 s), time entries (5 min), summary reports (15 min), users / projects / workspaces (60 min). See README "Sync Strategy" table.
- Client: `ClockifyClient` in `src-tauri/src/clockify/client.rs:10-90` — built-in 10 req/s rate limiter via Tokio semaphore (line 25), one-shot retry on HTTP 429 (line 59-79). Auth: `X-Api-Key` header (line 53).
- Sync engine: `src-tauri/src/clockify/sync.rs` (`ClockifySyncEngine`).
- Settings keys (SQLite `settings` table): `clockify_api_key`, `clockify_workspace_id` (read in `src-tauri/src/lib.rs:221-228` and `src-tauri/src/sync/scheduler.rs:42-53`).
- Cloud parity secret: `TF_CLOCKIFY_API_TOKEN_GLOBAL` on the Worker (`cloudflare/worker/src/lib/env.ts:43`).
- Default ignored emails: `thoughtseedlabs@gmail.com` (`src-tauri/src/commands/mod.rs:40`).

**Execution / project management — Huly.io:**
- Service: `https://huly.app` (default), with a discovered transactor endpoint per workspace. Connection flow in `src-tauri/src/huly/client.rs:31-120`:
  1. `GET https://huly.app/config.json` → reads `ACCOUNTS_URL`.
  2. JSON-RPC `POST {accounts_url}` with `{"method": "selectWorkspace", "params": {"workspaceUrl": <slug>, "kind": "external"}}` and `Authorization: Bearer <jwt>`.
  3. Rewrites returned `wss://` transactor URL to `https://` and uses `GET /api/v1/find-all/{workspace}?class=...` for class queries (transactor REST). Workspace slug is decoded from the JWT middle segment.
- Used for: issues, milestones, time-spend reports, departments, leave requests, holidays, chunter messages, board cards, calendar events. Class list in README "Huly Integration Details" table.
- Client: `HulyClient` in `src-tauri/src/huly/client.rs`. Sync engine: `src-tauri/src/huly/sync.rs` (`HulySyncEngine`). Naming/normalization: `src-tauri/src/huly/naming.rs`. Workspace normalization commands in `src-tauri/src/commands/mod.rs` (`preview_huly_workspace_normalization`, `apply_huly_workspace_normalization`).
- SDK fallback path: `sidecar/` uses `@hcengineering/api-client` 0.7.3 (`sidecar/package.json:15`) — reserved for parity / seed scripts (`sidecar/src/seed-parkarea.ts`); not loaded by the Tauri runtime.
- Settings key: `huly_token` (read in `src-tauri/src/lib.rs:236`, `src-tauri/src/sync/scheduler.rs:54`, many command handlers around `src-tauri/src/commands/mod.rs:4407`).
- Cloud parity secret: `TF_HULY_USER_TOKEN_GLOBAL` on the Worker.
- Worker-side helpers in `cloudflare/worker/src/lib/huly-api.ts` for Worker-driven Huly normalization preview/apply.

**Chat — Slack:**
- Service: Slack Web API at `https://slack.com/api` (`src-tauri/src/slack/client.rs:8`).
- Used for: chat activity volume in the Comms view; backfills the last 7 days of messages by default (`src-tauri/src/slack/sync.rs:13`).
- Client: `SlackClient` in `src-tauri/src/slack/client.rs:19-100`. Auth: bearer (`bot_token` via `bearer_auth`, line 50). Honors `Retry-After` on 429 (lines 56-72), exponential backoff on 5xx (lines 74-87). `MAX_RATE_LIMIT_RETRIES = 5`, `MAX_SERVER_RETRIES = 3`, `PAGE_SIZE = 200`.
- Sync engine: `src-tauri/src/slack/sync.rs` (`SlackSyncEngine`) — delta sync via `sync_message_deltas` (called from `src-tauri/src/lib.rs:254`).
- Settings key: `slack_bot_token` (must start `xoxb-`, validated by `validate_slack_bot_token` at `src-tauri/src/commands/mod.rs:127`). Backfill window key: `slack_sync_backfill_days`. Channel filter key: `slack_channel_filters`.
- Required Slack scopes (`src-tauri/src/commands/mod.rs:43-50`): `channels:read`, `channels:history`, `groups:read`, `groups:history`, `users:read`, `users:read.email`.
- Cloud parity secret: `TF_SLACK_BOT_TOKEN_GLOBAL` on the Worker.

**Code platform — GitHub:**
- Service: GitHub REST API at `https://api.github.com/repos/{repo}/...` (`src-tauri/src/github/client.rs:28-105`).
- Used for: issues (filtered to non-PR), milestones, pull requests, branches, check runs. Pagination is per_page=100 with cursor loops.
- Client: `GithubClient` in `src-tauri/src/github/client.rs:10-22`. Auth via PAT (token sent as bearer in `get_json` helper, not shown here).
- Sync engine: `src-tauri/src/github/sync.rs` (`GithubSyncEngine`). Drives milestone propagation into Huly (see README "Cloudflare project-registry tranche").
- Settings key: `github_token`, with OS env fallback `GITHUB_TOKEN` (`src-tauri/src/sync/scheduler.rs:67-70`).
- Cloud parity secret: `TF_GITHUB_TOKEN_GLOBAL` on the Worker.
- Worker-side helpers: `cloudflare/worker/src/lib/github-api.ts`. Worker-managed repo registry + scaffolding via `cloudflare/worker/src/routes/agent-feed.ts` (`handleProjectScaffold`, `handleProjectCloseout`).
- Repo registry seed in Worker var `TF_INTEGRATION_CONFIG_JSON` (`cloudflare/worker/wrangler.jsonc:15`) — JSON listing GitHub repos with `displayName`, `clientName`, `defaultMilestoneNumber`, `enabled`.

**Cloud control plane — TeamForge Cloudflare Worker:**
- Service: `https://teamforge-api.sheshnarayan-iyer.workers.dev` (default in `src-tauri/src/sync/teamforge_worker.rs:18` and `src-tauri/src/commands/mod.rs:42`). Override via `cloud_credentials_base_url` setting.
- Used for: canonical project graph, GitHub repo links, Huly project links, artifacts, sync policy, sync journal, conflict review, agent feed export, project scaffold/closeout, OTA manifest, bootstrap config. Endpoints exposed under `/v1/*` (`cloudflare/worker/src/routes/v1.ts`) and `/internal/*` (`cloudflare/worker/src/routes/internal.ts`).
- Bridge module: `src-tauri/src/sync/teamforge_worker.rs` (1087 lines) — thin `reqwest` client mapping Worker JSON envelopes (`{ ok, data }`, see lines 20-25) into the Rust DTOs from `src-tauri/src/db/models.rs`.
- Worker route map (selected, `cloudflare/worker/src/routes/v1.ts`): `GET /v1/bootstrap`, `GET /v1/remote-config`, `GET /v1/projects`, `PUT /v1/projects`, `POST /v1/projects/:id/action`, `GET /v1/projects/:id/control-plane`, `GET /v1/projects/mappings`, `PUT /v1/projects/mappings`, `GET /v1/client-profiles`, `PUT /v1/client-profiles/:id`, `GET /v1/onboarding-flows`, `PUT /v1/onboarding-flows`, `GET /v1/sync/runs`, `POST /v1/sync/jobs`, `GET /v1/sync/jobs/:id`, `GET /v1/team/snapshot`, `POST /v1/team/refresh`, `GET /v1/credentials`, `GET /v1/connections`, `POST /v1/connections/test`, `GET /v1/normalization/history`, `POST /v1/normalization/preview`, `POST /v1/normalization/apply`, `GET /v1/agent-feed/export`, `POST /v1/projects/scaffold`, `GET /v1/projects/:id/closeout`, `GET /v1/ota/check`, `POST /v1/ota/install-event`.
- Auth model (`cloudflare/worker/src/index.ts:7-13`, `cloudflare/worker/src/routes/v1.ts:33-44`): bearer token. App-side reads use `TF_CREDENTIAL_ENVELOPE_KEY` ("app" audience). Internal routes (agent-feed, scaffold, closeout, install-event) use `TF_WEBHOOK_HMAC_SECRET`. `/internal/releases/publish` uses `TF_RELEASE_PUBLISH_TOKEN`.
- Settings keys (desktop): `cloud_credentials_base_url`, `cloud_credentials_audience`, `cloud_credentials_access_token` (read in `src-tauri/src/commands/mod.rs:10481-10491`). Sync triggered by `commands::sync_cloud_credentials` and `sync_cloud_integrations`.

**Local agent runtime — Paperclip API:**
- Service: locally hosted at `http://127.0.0.1:3101/api` (default API, `src-tauri/src/paperclip.rs:12`) and `http://127.0.0.1:3100` (default UI, line 11). Override via `paperclip_api_url` setting.
- Auth: bearer token from `paperclip_api_token` setting (`src-tauri/src/paperclip.rs:385-399`, sent via `bearer_auth`).
- Endpoints used (`src-tauri/src/paperclip.rs`): `GET /api/users` (line 526), `GET /api/telemetry` (532), `GET /api/runtime/status` (542), `GET /api/personal/{user_id}` (553), `GET /api/rooms/{user_id}` (564), `POST /api/escalations` (577), `POST /api/runtime/warm-start` (584), `POST /api/runtime/refresh-stale` (591), `POST /api/runtime/maintain-heartbeat` (598), `GET /api/approvals` (602), `POST /api/approvals/{task_id}/resolve` (614), `GET /api/user/{email}` (1150).
- Operator email lookup chain (`src-tauri/src/paperclip.rs:1116-1138`): settings `paperclip_operator_email` → `operator_email` → `founder_email`, then env `TEAMFORGE_OPERATOR_EMAIL` → `USER_EMAIL` → `EMAIL`.
- Launcher: `scripts/launch-thoughtseed-paperclip.sh` shells into a Paperclip checkout (default `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip`, override via `THOUGHTSEED_PAPERCLIP_ROOT`) and runs `scripts/babysitter.sh start|status|health|stop`. Bundled into the .app via `tauri.conf.json:55`.
- Fallback runtime adapter: `scripts/paperclip-runtime-adapter.mjs` — a stand-in HTTP server on port 3101 that serves `/api/users`, `/api/telemetry`, etc. from the local agent vault filesystem when no real Paperclip API is reachable. Bundled at `tauri.conf.json:56`. Reads `agents/`, `config/projects/`, `MEMORY/`, `vault/leadership/escalations/` under `REPO_ROOT`.
- Tauri commands (frontend → Rust → Paperclip), exposed in `src-tauri/src/lib.rs:113-131`: `launch_paperclip_script`, `open_paperclip_ui`, `ensure_paperclip_runtime_started`, `probe_paperclip_api`, `get_paperclip_runtime_summary`, `get_paperclip_users`, `get_paperclip_telemetry`, `get_paperclip_personal_context`, `get_paperclip_rooms`, `create_paperclip_escalation`, `get_paperclip_org_view`, `get_paperclip_founder_queue`, `get_paperclip_agent_detail`, `get_paperclip_runtime_status`, `run_paperclip_warm_start`, `run_paperclip_refresh_stale`, `run_paperclip_maintain_heartbeat`, `get_paperclip_approvals`, `resolve_paperclip_approval`.

**OTA / auto-update channel:**
- Endpoint: `https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/ota/check?target={{target}}&currentVersion={{current_version}}&channel=stable` (`src-tauri/tauri.conf.json:65-67`).
- Signing: minisign public key embedded in `tauri.conf.json:64`. Updater plugin enabled in `src-tauri/src/lib.rs:45`.
- Worker handler: `cloudflare/worker/src/routes/ota.ts:50-60` (`handleOtaCheck`) — looks up active channel + release row in D1 `ota_channels` / `ota_releases` tables. Returns `204` with `x-teamforge-updater-status` header when no update; manifest JSON otherwise.
- Install telemetry: `POST /v1/ota/install-event` (`handleOtaInstallEvent` in `cloudflare/worker/src/routes/ota.ts`).
- Publishing pipeline: `scripts/publish-ota-release.mjs` shells out to Wrangler R2 + D1 to upload `.app.tar.gz` artifacts and POSTs to `/internal/releases/publish` with `TF_RELEASE_PUBLISH_TOKEN`. Default artifact base URL `https://artifacts.teamforge.app`, default bucket `teamforge-artifacts`.
- Trigger: pushing a `v*` tag to `Sheshiyer/team-forge-ts` runs `.github/workflows/release.yml` (per README "Releases").

## Data Storage

**Databases:**
- **Cloudflare D1 (canonical, cloud):** `teamforge-primary`, id `d773aaa8-aa51-4ef8-ae08-1d3d238d2ae3`, binding `TEAMFORGE_DB` (`cloudflare/worker/wrangler.jsonc:17-23`). Migrations in `cloudflare/worker/migrations/0001_initial.sql` … `0005_project_identity_links.sql`. Owns the canonical project graph, sync policies, sync journal, conflict records, OTA channels/releases, integration credentials envelope.
- **SQLite (desktop cache, local):** `teamforge.db` under the macOS app data dir (`src-tauri/src/db/queries.rs:11-18`). Pool size 5. Migration `src-tauri/migrations/001_initial.sql` plus runtime `ALTER TABLE` shims for backfill columns (`src-tauri/src/db/queries.rs:32-93`). Owns the desktop projection: settings, identity map, GitHub repo configs, TeamForge project mirror, active project issues, Slack message activity, Huly cached data, agent feed projection.

**File Storage:**
- **R2 bucket `teamforge-artifacts`** — bound as `TEAMFORGE_ARTIFACTS` (`wrangler.jsonc:25-30`). Stores OTA `.app.tar.gz` artifacts. Uploaded by `scripts/publish-ota-release.mjs`.
- **Local Obsidian vault** — read/written by `src-tauri/src/vault.rs` from a configurable root (`local_vault_root` setting; OS env overrides `TEAMFORGE_VAULT_ROOT`, `THOUGHTSEED_VAULT_ROOT`, `OBSIDIAN_VAULT_ROOT`). Expected structure includes `40-products/`, `50-team/`, `60-client-ecosystem/`, `30-research-hub/`, `.obsidian/`.

**Caching:**
- Desktop SQLite acts as an offline read cache for Worker-owned data and a hot cache for Clockify/Huly/Slack/GitHub responses. No Redis or external cache.
- Tokio in-process state for tray + scheduler handles (`SchedulerState` in `src-tauri/src/lib.rs:32`).

**Queues / locks (Worker side):**
- Cloudflare Queue producer `SYNC_QUEUE` → queue name `teamforge-sync` (`wrangler.jsonc:32-38`). Message shape `SyncJobMessage` in `cloudflare/worker/src/lib/env.ts:31-36` (`{ jobId, workspaceId, source: clockify|github|huly|slack, jobType }`). Producer wired through `cloudflare/worker/src/routes/sync.ts` (`handlePostSyncJob`).
- Durable Object `WorkspaceLock` (class in `cloudflare/worker/src/index.ts:61`) bound as `WORKSPACE_LOCKS` — provides `/acquire` and `/release` for cross-region project mutation locks. Helper in `cloudflare/worker/src/lib/locks.ts`.

## Authentication & Identity

**Auth Provider:**
- No SaaS identity provider. The Worker uses simple bearer-token gating with three audiences (`cloudflare/worker/src/lib/auth.ts`, called from `cloudflare/worker/src/index.ts:7-13` and `cloudflare/worker/src/routes/v1.ts:33-44`):
  - `app` audience: token must equal `TF_CREDENTIAL_ENVELOPE_KEY`. Used by the desktop app for `/v1/projects`, `/v1/sync/*`, `/v1/team/*`, etc.
  - `internal` audience: token must equal `TF_WEBHOOK_HMAC_SECRET`. Used for `/v1/agent-feed/export`, `/v1/projects/scaffold`, `/v1/projects/:id/closeout`, `/v1/ota/install-event`, and any `/internal/*` route except releases.
  - Release publish: token must equal `TF_RELEASE_PUBLISH_TOKEN`, only for `POST /internal/releases/publish`.
- Worker advertises `TF_ACCESS_AUDIENCE = "teamforge-desktop"` (`wrangler.jsonc:14`) for documentation but does not yet enforce JWT/Cloudflare Access — bearer equality only.

**Per-integration auth:**
- Clockify: per-user API key, stored in `clockify_api_key` setting, sent as `X-Api-Key`.
- Huly: per-user JWT, stored in `huly_token` setting, sent as `Authorization: Bearer ...` to the accounts URL during `selectWorkspace`.
- Slack: bot OAuth token (`xoxb-...`), stored in `slack_bot_token`, sent as bearer.
- GitHub: PAT, stored in `github_token` (or `GITHUB_TOKEN` env), sent as bearer.
- Paperclip: shared bearer in `paperclip_api_token`.
- TeamForge Worker: bearer in `cloud_credentials_access_token`.

## Monitoring & Observability

**Error Tracking:**
- No Sentry / Bugsnag / Rollbar. Errors are surfaced as Tauri command return strings and logged via `eprintln!` (e.g. `src-tauri/src/lib.rs:79`, `src-tauri/src/huly/client.rs:37,47,84`).
- Worker observability is enabled in `wrangler.jsonc:7-9` (`observability.enabled = true`) — uses Cloudflare's built-in Workers logs.

**Logs:**
- Rust backend: `eprintln!` to stderr, prefixed `[teamforge]` / `[huly]` / `[clockify]` / `[paperclip-runtime-adapter]`.
- Worker: `console.log`/`console.error` captured by Cloudflare observability.

**Alerts:**
- Local macOS notifications via `tauri-plugin-notification` driven by `src-tauri/src/sync/alerts.rs`.

## CI/CD & Deployment

**Hosting:**
- Desktop app: distributed via GitHub Releases (`https://github.com/Sheshiyer/team-forge-ts/releases`). Updater pulls from the Cloudflare Worker.
- Cloud control plane: Cloudflare Workers (`teamforge-api.sheshnarayan-iyer.workers.dev`).

**CI Pipeline:**
- `.github/workflows/release.yml` (referenced in README) — triggered by `v*` tags. Builds macOS Apple Silicon + Intel bundles, signs them, runs `scripts/publish-ota-release.mjs` to push the manifest into D1 + the artifact into R2.
- Worker deploy: manual via `pnpm --dir cloudflare/worker deploy` (`cloudflare/worker/package.json:7`).
- D1 migrations: `pnpm --dir cloudflare/worker d1:migrate:remote` (`cloudflare/worker/package.json:9-10`).

## Environment Configuration

**Required env vars / settings (desktop, SQLite `settings` table):**
- `clockify_api_key`, `clockify_workspace_id`
- `huly_token`
- `slack_bot_token` (must start `xoxb-`), optional `slack_sync_backfill_days`, `slack_channel_filters`
- `github_token` (env fallback: `GITHUB_TOKEN`)
- `paperclip_api_url` (default `http://127.0.0.1:3101/api`), `paperclip_api_token`, optional `paperclip_operator_email`
- `cloud_credentials_base_url` (default `https://teamforge-api.sheshnarayan-iyer.workers.dev`), `cloud_credentials_audience`, `cloud_credentials_access_token`
- `local_vault_root` (env fallbacks: `TEAMFORGE_VAULT_ROOT`, `THOUGHTSEED_VAULT_ROOT`, `OBSIDIAN_VAULT_ROOT`)
- Optional poll-interval overrides: `huly_issues_interval_secs`, `huly_presence_interval_secs`, `huly_team_cache_interval_secs` (defaults 600/120/3600 s, `src-tauri/src/sync/scheduler.rs:18-30`).

**Required Worker vars (plain text in `cloudflare/worker/wrangler.jsonc:10-16`):**
- `TF_ENV`, `TF_API_BASE_URL`, `TF_DEFAULT_OTA_CHANNEL` (`stable`), `TF_ACCESS_AUDIENCE` (`teamforge-desktop`), `TF_INTEGRATION_CONFIG_JSON`.

**Required Worker secrets (set via `wrangler secret put`):**
- `TF_CREDENTIAL_ENVELOPE_KEY` — desktop app bearer.
- `TF_WEBHOOK_HMAC_SECRET` — internal/agent-feed bearer.
- `TF_RELEASE_PUBLISH_TOKEN` — OTA release publisher bearer.
- `TF_CLOCKIFY_API_TOKEN_GLOBAL`, `TF_HULY_USER_TOKEN_GLOBAL`, `TF_SLACK_BOT_TOKEN_GLOBAL`, `TF_GITHUB_TOKEN_GLOBAL` — global integration tokens for server-side parity / scaffolding paths.

**Secrets location:**
- No `.env` files committed. Local secrets live in `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db` (the desktop SQLite, see `tauri.conf.json:4` identifier). Cloud secrets live as Cloudflare Worker secrets (`wrangler secret put`).

## Webhooks & Callbacks

**Incoming (Worker):**
- `POST /v1/projects/scaffold` — internal-auth, used by Paperclip / agent-feed pipeline to scaffold a new TeamForge project (`cloudflare/worker/src/routes/v1.ts:46-50`, handler in `cloudflare/worker/src/routes/agent-feed.ts`).
- `GET /v1/projects/:id/closeout` — internal-auth, fetches a closeout snapshot.
- `GET /v1/agent-feed/export` — internal-auth, exports the agent feed (`scripts/export-team-kpi-feed.mjs` consumer).
- `POST /v1/ota/install-event` — install telemetry callback from the desktop updater plugin.
- `POST /internal/releases/publish` — release publisher callback from `scripts/publish-ota-release.mjs`.

**Outgoing (desktop → external):**
- All integration calls listed above are unidirectional REST GETs/POSTs; no long-lived sockets. The Huly transactor REST is HTTP polling (the original `wss://` is rewritten to `https://`, `src-tauri/src/huly/client.rs:117-120`).
- Tauri tray "Sync Now" triggers a one-shot fan-out across Clockify, Huly, Slack (`src-tauri/src/lib.rs:215-263`).

---

*Integration audit: 2026-05-04*
