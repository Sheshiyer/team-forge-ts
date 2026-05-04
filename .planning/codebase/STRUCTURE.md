# TeamForge Codebase Structure

**Analysis Date:** 2026-05-04

## Directory Layout

```
team-forge-ts/
├── src/                          # React 19 frontend (Vite, TypeScript)
│   ├── main.tsx                  # ReactDOM root + BrowserRouter
│   ├── App.tsx                   # LCARS shell, nav, route table
│   ├── pages/                    # One .tsx per route (Overview, Timesheet, Agents, …)
│   ├── components/               # Shared UI (team/, ui/)
│   ├── hooks/                    # useInvoke (IPC contract), useViewportWidth
│   ├── lib/                      # types, format, export, updater, lcarsPageStyles
│   ├── stores/                   # Zustand store (appStore.ts, 13 LOC)
│   └── styles/                   # globals.css (LCARS theme)
│
├── src-tauri/                    # Rust core (Tauri 2)
│   ├── Cargo.toml                # deps: tauri 2, sqlx 0.8, reqwest 0.12, tokio 1
│   ├── tauri.conf.json           # window/bundle/updater/resources config
│   ├── src/
│   │   ├── main.rs               # 5 lines — calls team_forge_lib::run()
│   │   ├── lib.rs                # tauri::Builder, plugins, IPC registry, tray
│   │   ├── commands/mod.rs       # ALL #[tauri::command] handlers (11.8 KLOC)
│   │   ├── db/                   # SqlitePool + sqlx queries + models
│   │   ├── huly/                 # Huly REST/JSON-RPC client + sync engine
│   │   ├── slack/                # Slack Web API client + sync engine
│   │   ├── clockify/             # Clockify API client + sync engine
│   │   ├── github/               # GitHub API client + sync engine
│   │   ├── sync/                 # Background scheduler, alerts, teamforge_worker
│   │   ├── ops/                  # ops_event sync_key builder
│   │   ├── paperclip.rs          # HTTP adapter for local Paperclip runtime
│   │   └── vault.rs              # Local Obsidian vault filesystem reader
│   ├── migrations/001_initial.sql # SQLite schema (only numbered migration)
│   ├── capabilities/             # Tauri 2 ACL capability files
│   ├── icons/                    # App icons (icns/ico/png)
│   └── gen/                      # Tauri-generated platform stubs (do not edit)
│
├── cloudflare/worker/            # Cloudflare Worker (TypeScript) + D1 schema
│   ├── src/index.ts              # default fetch + WorkspaceLock Durable Object
│   ├── src/routes/               # v1.ts router + per-domain handlers
│   ├── src/lib/                  # auth, db, env, response, locks, *-api wrappers
│   ├── migrations/               # 5 D1 migrations (0001 → 0005)
│   ├── fixtures/v1/              # JSON fixtures for offline testing
│   ├── wrangler.jsonc            # bindings: D1, R2, Queue, Durable Object
│   └── README.md
│
├── sidecar/                      # Standalone Node helper (NOT a Tauri sidecar)
│   ├── src/index.ts              # entry (currently empty/1 line)
│   ├── src/seed-parkarea.ts      # GitHub→Huly mirror seeder
│   ├── package.json              # @teamforge/huly-sidecar (private)
│   └── README.md                 # Use only via `pnpm mirror:github`
│
├── scripts/                      # Node/Bash automation (some bundled as Tauri resources)
│   ├── teamforge-vault-parity.mjs       # 2778 LOC — vault → worker importer (BUNDLED)
│   ├── paperclip-runtime-adapter.mjs    # 796 LOC — Paperclip runtime ops (BUNDLED)
│   ├── launch-thoughtseed-paperclip.sh  # Paperclip launcher (BUNDLED)
│   ├── publish-ota-release.mjs          # OTA publish to worker /internal/releases/publish
│   ├── export-team-kpi-feed.mjs         # KPI feed exporter
│   ├── huly-client.mjs                  # standalone Huly REST helpers
│   ├── p0-*.mjs / p1-*.mjs              # one-off Huly seed/normalize scripts
│   ├── *-icon-*.sh / *-icon-*.py        # icon generation/review pipeline
│   └── refresh-tauri-skills.sh, list-tauri-skills.sh
│
├── config/
│   └── tauri-skill-suite.txt     # Cached Tauri skill manifest list
│
├── tests/
│   └── updater.test.ts           # Frontend updater wrapper test (only test file)
│
├── tasks/
│   ├── todo.md                   # Active task list
│   └── lessons.md                # Retro notes
│
├── docs/
│   ├── DESIGN.md (root-level)    # Original product spec
│   ├── architecture/
│   │   ├── cloudflare-backend-ota-design.md
│   │   └── contracts/            # Schema/route/security contracts (one .md each)
│   ├── plans/                    # Dated implementation plans
│   ├── runbooks/                 # Operational playbooks (huly-sync-cadence, etc.)
│   ├── images/                   # README screenshots
│   ├── engagement-playbook.md
│   └── huly-system-design.md
│
├── design-assets/teamforge/      # Icon source assets
├── dist/                         # Vite build output (generated)
├── .planning/codebase/           # GSD codebase mapping output (this file)
├── .github/                      # CI workflows
├── package.json                  # Root pnpm package, version mirrors Tauri version
├── pnpm-lock.yaml
├── tsconfig.json, vite.config.ts, tsconfig.node.json
├── index.html                    # Vite entry
├── README.md, CHANGELOG.md, DESIGN.md
└── thoughtseed-seedforge-note.md
```

## Directory Purposes (one-liners)

- **`src/`** — React 19 + Vite frontend; everything the WebView renders.
- **`src/pages/`** — Route-level components; one file per nav item in `App.tsx`.
- **`src/hooks/useInvoke.ts`** — Single source of truth for the IPC contract (every Rust command has a typed wrapper here).
- **`src/lib/types.ts`** — TS mirrors of Rust serde structs.
- **`src/lib/updater.ts`** — Wraps `tauri-plugin-updater` for the in-app update flow.
- **`src-tauri/src/`** — Rust core; this is the entire backend that ships in the binary.
- **`src-tauri/src/commands/mod.rs`** — Every `#[tauri::command]`. Adding a new IPC means editing this file and `lib.rs`.
- **`src-tauri/src/db/`** — sqlx-based SQLite layer; `queries.rs` is the only file that runs SQL.
- **`src-tauri/src/{huly,slack,clockify,github}/`** — Per-integration `client.rs` (HTTP) + `types.rs` (DTOs) + `sync.rs` (sync engine writing to local DB).
- **`src-tauri/src/sync/`** — Background scheduler and Cloudflare-worker HTTP client.
- **`src-tauri/src/ops/`** — `ops_event` sync_key builder (deduplication primitive).
- **`src-tauri/src/paperclip.rs`** — HTTP adapter for the local Paperclip runtime on 127.0.0.1.
- **`src-tauri/src/vault.rs`** — Local Obsidian vault filesystem reader (founder-sync read path).
- **`src-tauri/migrations/`** — Embedded SQLite schema; loaded via `include_str!` at startup.
- **`cloudflare/worker/`** — Cloudflare Worker (TS) backing `https://teamforge-api.sheshnarayan-iyer.workers.dev`.
- **`cloudflare/worker/migrations/`** — D1 schema migrations (0001 → 0005); applied via `wrangler d1 migrations apply`.
- **`cloudflare/worker/fixtures/v1/`** — JSON fixtures for offline tests of v1 routes.
- **`sidecar/`** — Standalone Node mirror tool. **Never bundled into the app**; dev-time only.
- **`scripts/`** — Mixed Node/Bash automation. Three are bundled as Tauri resources (parity, paperclip launcher, paperclip adapter — see `tauri.conf.json:53-57`).
- **`docs/architecture/contracts/`** — Authoritative contracts for schemas, routes, secrets, OTA, agent-feed; consult before changing wire formats.
- **`docs/runbooks/`** — Operational SOPs.
- **`docs/plans/`** — Historical and active implementation plans (dated).
- **`tests/`** — Single Vitest file (frontend updater); no Rust tests directory exists, but `#[cfg(test)] mod tests` blocks live inline (e.g. `db/queries.rs:2443`, `ops/mod.rs:56`).
- **`tasks/`** — Active TODO and retro notes.
- **`config/`** — Cached external manifests (Tauri skill suite list).

## Where Does X Live? — Cheat Sheet

### Rust Core

| What | Path : Line |
|------|-------------|
| App entry | `src-tauri/src/main.rs:3` |
| Tauri builder + IPC registry | `src-tauri/src/lib.rs:39` (`run`), commands at `lib.rs:103` |
| All IPC commands | `src-tauri/src/commands/mod.rs` |
| DB pool init / migrations | `src-tauri/src/db/queries.rs:10` (`init_db`) |
| All SQL queries | `src-tauri/src/db/queries.rs` |
| DB models / structs | `src-tauri/src/db/models.rs` |
| `ops_events` upsert | `src-tauri/src/db/queries.rs:1979` |
| `agent_feed` upsert | `src-tauri/src/db/queries.rs:2032` |
| `agent_feed` projection refresh | `src-tauri/src/db/queries.rs:2162` |
| `agent_feed` query (UI) | `src-tauri/src/db/queries.rs:2097` |
| Sync key (ops_event dedup) | `src-tauri/src/ops/mod.rs:39` (`build_sync_key`) |
| Background scheduler | `src-tauri/src/sync/scheduler.rs:38` (`SyncScheduler::start`) |
| Quota alerts | `src-tauri/src/sync/alerts.rs` |
| **Cloudflare worker HTTP client (Rust)** | `src-tauri/src/sync/teamforge_worker.rs` |
| Worker envelope deserializer | `src-tauri/src/sync/teamforge_worker.rs:20` (`WorkerEnvelope<T>`) |
| Huly REST client | `src-tauri/src/huly/client.rs:31` (`HulyClient::connect`) |
| Huly sync engine | `src-tauri/src/huly/sync.rs` |
| Huly DTOs | `src-tauri/src/huly/types.rs` |
| Huly naming/normalization | `src-tauri/src/huly/naming.rs` |
| Slack client / sync / types | `src-tauri/src/slack/{client,sync,types}.rs` |
| Clockify client / sync / types | `src-tauri/src/clockify/{client,sync,types}.rs` |
| GitHub client / sync / types | `src-tauri/src/github/{client,sync,types}.rs` |
| Paperclip HTTP adapter (Rust) | `src-tauri/src/paperclip.rs` |
| Local vault filesystem reader | `src-tauri/src/vault.rs` |
| Founder-sync vault parity command (Rust→Node) | `src-tauri/src/commands/mod.rs:2638` (`sync_local_vault_to_teamforge`) |
| Bundled-resource resolver (parity script) | `src-tauri/src/commands/mod.rs:1677` (`resolve_parity_script_path`) |
| Repo-checkout fallback paths | `src-tauri/src/commands/mod.rs:1661-1675` |
| Paperclip launch IPC | `src-tauri/src/commands/mod.rs:2123` (`launch_paperclip_script_internal`), `commands/mod.rs:2337` (`ensure_paperclip_runtime_started`) |
| Tray menu + tray sync | `src-tauri/src/lib.rs:55-89`, `lib.rs:215` (`run_tray_sync`) |

### Frontend

| What | Path : Line |
|------|-------------|
| ReactDOM root | `src/main.tsx:7` |
| App shell + routes | `src/App.tsx:82` |
| **IPC contract (every command)** | `src/hooks/useInvoke.ts` |
| TS types mirroring Rust | `src/lib/types.ts` |
| Updater UX wrapper | `src/lib/updater.ts` |
| Zustand store | `src/stores/appStore.ts` |
| Page components | `src/pages/{Overview,Activity,Agents,Boards,Calendar,Clients,Comms,Insights,Issues,Knowledge,Onboarding,Projects,Settings,Sprints,Team,Timesheet}.tsx` |
| LCARS theme | `src/styles/globals.css` |
| LCARS shared layout helpers | `src/lib/lcarsPageStyles.ts` |
| Avatar / DateRangePicker / Skeleton | `src/components/ui/` |

### Cloudflare Worker

| What | Path : Line |
|------|-------------|
| Worker fetch entry | `cloudflare/worker/src/index.ts:15` |
| `WorkspaceLock` Durable Object | `cloudflare/worker/src/index.ts:61` |
| `/v1` router | `cloudflare/worker/src/routes/v1.ts:31` |
| `/internal/*` handlers | `cloudflare/worker/src/routes/internal.ts` |
| **`/v1/agent-feed/export`** | `cloudflare/worker/src/routes/agent-feed.ts:10` |
| `/v1/projects*` (CRUD, mappings, control plane, actions) | `cloudflare/worker/src/routes/projects.ts` |
| `/v1/credentials`, `/v1/connections` | `cloudflare/worker/src/routes/{credentials,connections}.ts` |
| `/v1/sync/*` (jobs, runs) | `cloudflare/worker/src/routes/sync.ts` |
| `/v1/team/{snapshot,refresh}` | `cloudflare/worker/src/routes/team.ts` |
| `/v1/huly/normalization/*` | `cloudflare/worker/src/routes/normalization.ts` |
| `/v1/ota/*` | `cloudflare/worker/src/routes/ota.ts` |
| Bearer auth | `cloudflare/worker/src/lib/auth.ts` |
| D1 helpers (`queryAll`, `execute`, `nanoid`, `now`) | `cloudflare/worker/src/lib/db.ts` |
| Env type + DO wrapper | `cloudflare/worker/src/lib/env.ts` |
| JSON response helpers | `cloudflare/worker/src/lib/response.ts` |
| GitHub/Huly server-side wrappers | `cloudflare/worker/src/lib/{github-api,huly-api}.ts` |
| D1 schema (initial) | `cloudflare/worker/migrations/0001_initial.sql` |
| Project control plane schema | `cloudflare/worker/migrations/0002_project_control_plane.sql` |
| Sync control plane schema | `cloudflare/worker/migrations/0003_sync_control_plane.sql` |
| Vault population schema | `cloudflare/worker/migrations/0004_vault_population.sql` |
| Project identity links schema | `cloudflare/worker/migrations/0005_project_identity_links.sql` |
| Worker bindings | `cloudflare/worker/wrangler.jsonc` |
| Worker fixtures | `cloudflare/worker/fixtures/v1/*.json` |

### Scripts (the "near-sidecar" surface)

| What | Path |
|------|------|
| **Vault parity importer (current Node implementation, target for Rust port)** | `scripts/teamforge-vault-parity.mjs` |
| Paperclip runtime adapter (Node fallback) | `scripts/paperclip-runtime-adapter.mjs` |
| Paperclip launcher | `scripts/launch-thoughtseed-paperclip.sh` |
| OTA publish | `scripts/publish-ota-release.mjs` |
| KPI feed export | `scripts/export-team-kpi-feed.mjs` |
| One-off Huly seed/normalize | `scripts/p0-*.mjs`, `scripts/p1-seed-operational-data.mjs` |
| Standalone Huly REST helpers | `scripts/huly-client.mjs` |
| Bundled-as-resource declaration | `src-tauri/tauri.conf.json:53-57` |

### Sidecar package (dev-only)

| What | Path |
|------|------|
| Dev mirror entry | `sidecar/src/seed-parkarea.ts` |
| Package manifest | `sidecar/package.json` |
| Usage docs | `sidecar/README.md` |

### Config / Build

| What | Path |
|------|------|
| Tauri config (window, bundle, updater endpoint, bundled resources) | `src-tauri/tauri.conf.json` |
| Updater pubkey (minisign) | `src-tauri/tauri.conf.json:64` |
| OTA endpoint | `src-tauri/tauri.conf.json:66` |
| Rust deps | `src-tauri/Cargo.toml` |
| Frontend deps + scripts | `package.json` |
| Vite config | `vite.config.ts` |
| TS config | `tsconfig.json`, `tsconfig.node.json` |
| Node-only TS config (worker) | `cloudflare/worker/tsconfig.json` |

## Naming Conventions

**Files:**
- Rust: `snake_case.rs`. One module per integration in its own folder with `mod.rs`, `client.rs`, `types.rs`, `sync.rs`.
- TS components: `PascalCase.tsx` (e.g. `Avatar.tsx`).
- TS pages: `PascalCase.tsx` matching nav label.
- TS modules: `camelCase.ts` (e.g. `useInvoke.ts`, `appStore.ts`).
- Scripts: `kebab-case.mjs` (Node ESM) / `kebab-case.sh` (Bash).
- D1 migrations: `NNNN_snake_case.sql`, zero-padded 4-digit prefix.
- Local SQLite migrations: `NNN_snake_case.sql`, zero-padded 3-digit prefix (only `001_initial.sql` exists).

**Functions:**
- Rust: `snake_case`. Tauri commands: `snake_case` (verb_object: `get_overview`, `sync_local_vault_to_teamforge`).
- TS IPC wrappers: `camelCase` matching the Rust command name (`getOverview`, `syncLocalVaultToTeamforge`) — defined in `src/hooks/useInvoke.ts`.

**Types:**
- Rust structs: `PascalCase`. DTOs from external APIs prefixed by source: `HulyIssue`, `SlackMessage`, `ClockifyUser`, `WorkerProjectGraph`.
- TS types: `PascalCase`, mirroring Rust serde shapes in `src/lib/types.ts`.

**Tables / DB:**
- SQLite tables: `snake_case`, plural (`employees`, `ops_events`, `agent_feed`, `teamforge_projects`).
- Settings keys: `snake_case` strings stored in the `settings` table (e.g. `clockify_api_key`, `cloud_credentials_access_token`, `huly_sync_issues_interval_seconds`).

## Where to Add New Code

**New Tauri IPC command:**
1. Implement `#[tauri::command] pub async fn …` in `src-tauri/src/commands/mod.rs`.
2. Register in the `invoke_handler![…]` macro at `src-tauri/src/lib.rs:103-197`.
3. Add a typed wrapper in `src/hooks/useInvoke.ts`.
4. Add return-type definition in `src/lib/types.ts`.

**New integration (e.g. a new SaaS):**
- Create `src-tauri/src/<integration>/{mod.rs, client.rs, types.rs, sync.rs}` mirroring `huly/` or `slack/`. Wire into `sync/scheduler.rs` for cadence; emit `ops_events` via `db::queries::upsert_ops_event` so the existing `agent_feed` projection picks them up automatically.

**New page:**
- Add `src/pages/<Name>.tsx`. Add a `<Route>` and a `navSections` entry in `src/App.tsx`.

**New worker route:**
- Add handler in `cloudflare/worker/src/routes/<domain>.ts`.
- Register in `cloudflare/worker/src/routes/v1.ts` (or `internal.ts` for HMAC-only).
- If schema change required, add `cloudflare/worker/migrations/000N_<name>.sql`.
- Update fixtures in `cloudflare/worker/fixtures/v1/` if adding a public read endpoint.

**New local SQLite column:**
- Add to `src-tauri/migrations/001_initial.sql` (for fresh installs) AND add a corresponding `ensure_*_columns` function called from `db::queries::init_db` (`src-tauri/src/db/queries.rs:23-27` for examples).

**Issue #45 — replace the Node founder-sync importer with Rust:**
- New module: `src-tauri/src/vault/parity.rs` (create `vault/` folder, move `vault.rs` into `vault/mod.rs`).
- Use `reqwest::Client` exactly like `src-tauri/src/sync/teamforge_worker.rs` (copy the `WorkerEnvelope<T>` pattern at line 20-24).
- Replace the `app_handle.shell().command("node")` block in `src-tauri/src/commands/mod.rs:2681-2702` with a direct call into `vault::parity::run(...)`.
- Spec to match: `scripts/teamforge-vault-parity.mjs` (2778 LOC). Hot keys: workspace_id fallback at `teamforge-vault-parity.mjs:865`, project payload shape at `:1403`, agent-feed payload shape at `:1701-1777`.
- Keep the Node script bundled (`tauri.conf.json:54`) until the Rust path is verified at parity, then remove from bundle resources.

**New bundled script resource:**
- Add file under `scripts/`.
- Declare in `src-tauri/tauri.conf.json:53` `bundle.resources`.
- Add a resolver in `src-tauri/src/commands/mod.rs` following the pattern of `resolve_parity_script_path` (`commands/mod.rs:1677`) — try `BaseDirectory::Resource` first, fall back to repo path via `env!("CARGO_MANIFEST_DIR")`.

## Special Directories

| Directory | Generated? | Committed? | Purpose |
|-----------|------------|------------|---------|
| `dist/` | Yes (Vite build) | No (in `.gitignore`) | Frontend bundle, copied into app at build time |
| `src-tauri/gen/` | Yes (Tauri) | No | Tauri-generated platform stubs |
| `node_modules/` | Yes (pnpm) | No | Per-package install (root, `cloudflare/worker/`, `sidecar/`) |
| `.pnpm-store/` | Yes (pnpm) | No | Local pnpm cache |
| `.planning/codebase/` | Yes (GSD agents) | Per project policy | This mapping output |
| `dist/` (worker) | Yes (wrangler) | No | Worker bundle |
| `tasks/` | No | Yes | Active TODOs and retro notes |
| `docs/plans/` | No | Yes | Implementation plans (one .md per phase, dated) |
| `docs/runbooks/` | No | Yes | Operational SOPs |
| `docs/architecture/contracts/` | No | Yes | Wire-format and security contracts (consult before schema changes) |

---

*Structure analysis: 2026-05-04*
