# Coding Conventions

**Analysis Date:** 2026-05-04

## Naming Patterns

**Files:**
- React pages and components use `PascalCase.tsx` (`src/pages/Overview.tsx`, `src/components/ui/Avatar.tsx`).
- Hooks use `useCamelCase.ts` (`src/hooks/useInvoke.ts`, `src/hooks/useViewportWidth.ts`).
- Stores use `camelCaseStore.ts` (`src/stores/appStore.ts`).
- Plain TypeScript libs use `camelCase.ts` (`src/lib/updater.ts`, `src/lib/format.ts`, `src/lib/lcarsPageStyles.ts`, `src/lib/types.ts`).
- Rust modules use `snake_case` directories and files (`src-tauri/src/huly/client.rs`, `src-tauri/src/db/queries.rs`, `src-tauri/src/clockify/sync.rs`).
- Build/dev shell scripts in `scripts/` use kebab-case with explicit prefixes (`scripts/launch-thoughtseed-paperclip.sh`, `scripts/publish-ota-release.mjs`, `scripts/teamforge-vault-parity.mjs`).
- Migration files are zero-padded numbered SQL (`src-tauri/migrations/001_initial.sql`, referenced via `include_str!` from `src-tauri/src/db/queries.rs:21`).

**Functions:**
- TypeScript: `camelCase` for functions and methods (`reduceDownloadProgress`, `formatDownloadProgress`, `getStardate`).
- Rust: `snake_case` for functions and methods (`init_db`, `build_sync_key`, `parse_task_name`, `get_paperclip_runtime_status`).
- Tauri command names crossing the IPC boundary are `snake_case` strings (`"test_clockify_connection"`, `"sync_local_vault_to_teamforge"`, `"run_paperclip_warm_start"`) — declared `#[tauri::command] pub async fn` in `src-tauri/src/commands/mod.rs` and called via `invoke<T>("…")` in `src/hooks/useInvoke.ts`.

**Variables:**
- TypeScript: `camelCase` locals, `UPPER_SNAKE_CASE` for module-level string constants (`ACTIVE_WORK_NOTE`, `PORTFOLIO_REVIEW_NOTE` in `src/pages/Overview.tsx`).
- Rust: `snake_case` locals, `SCREAMING_SNAKE_CASE` for `const`/`static` (`DEFAULT_BASE_URL`, `CORE_CLASS_TX_CREATE_DOC` in `src-tauri/src/huly/client.rs:10-13`; `VALID_PROJECT_CODES`, `VALID_TYPE_CODES` in `src-tauri/src/huly/naming.rs:59-60`).

**Types:**
- TypeScript: `PascalCase` for interfaces, type aliases, and discriminated unions (`DownloadProgressState`, `TauriUpdateHandle`, `UpdaterDownloadEvent` in `src/lib/updater.ts`).
- Centralized DTO types live in `src/lib/types.ts`; pages import named types from there.
- Rust: `PascalCase` structs and enums (`HulyClient`, `ParsedTaskName`, `ProjectCode`, `TypeCode`, `OpsSyncKeyInput` in `src-tauri/src/ops/mod.rs:4-13`).

## TypeScript Style

**Strictness (from `tsconfig.json`):**
- `"strict": true`
- `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`
- `"forceConsistentCasingInFileNames": true`
- `"isolatedModules": true`, `"moduleDetection": "force"`
- `"jsx": "react-jsx"`, `"target": "ES2020"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`
- `"allowImportingTsExtensions": true` (tests import from `../src/lib/updater.ts` with the `.ts` suffix).
- `"noEmit": true` — `tsc` is used as a typecheck step before `vite build` (`package.json` script: `"build": "tsc && vite build"`).

**No formatter or linter config is checked in.** No `.eslintrc`, `.prettierrc`, `biome.json`, or equivalent — convention is enforced by `tsc --strict` plus reviewer judgement.

**Module style:**
- ESM (`"type": "module"` in `package.json`).
- Default-export React pages, named-export hooks/utilities/types.
- Type-only imports use `import type { … }` (see top of `src/hooks/useInvoke.ts`, `src/pages/Overview.tsx`).

## Rust Style

**Module patterns:**
- `src-tauri/src/lib.rs` declares top-level modules: `clockify`, `commands`, `db`, `github`, `huly`, `ops`, `paperclip`, `slack`, `sync`, `vault`. Each integration is a directory module with internal `client.rs`, `sync.rs`, `types.rs` (e.g. `src-tauri/src/huly/{client,sync,types,naming}.rs`).
- `src-tauri/src/main.rs` is a 4-line shim that calls `team_forge_lib::run()` — all real wiring is in `src-tauri/src/lib.rs`.
- The crate is built as `lib`, `cdylib`, `staticlib` (`src-tauri/Cargo.toml:7-8`) with `name = "team_forge_lib"`.

**Error handling:**
- Convention: return `Result<T, String>` everywhere — both internal helpers and `#[tauri::command]` functions. Error context is composed with `format!` and `.map_err(|e| format!("…: {e}"))` (see `src-tauri/src/huly/client.rs:42-46`, `:74-78`). Tauri commands surface these strings directly to the frontend.
- The repo does not use `anyhow` or `thiserror`; do not introduce them without an explicit decision recorded in `tasks/todo.md`.
- Inside helpers, `?` propagates `String` errors after explicit conversion with `.map_err(|e| e.to_string())`.
- Database paths return `Result<_, sqlx::Error>` only at the migration/init boundary (`init_db` in `src-tauri/src/db/queries.rs:10`); higher-level queries normalize to `Result<_, String>` before returning to commands.

**Async runtime:**
- Tokio with the `full` feature (`src-tauri/Cargo.toml:20`). Async functions use plain `async fn`; tests that need a runtime use `#[tokio::test]`.
- HTTP via `reqwest` with `json` and `rustls-tls` features. Construct one `reqwest::Client` per integration client (e.g. `HulyClient.http`) and reuse it.
- Tauri managed state for shared resources: `DbPool(SqlitePool)` and `SchedulerState(Mutex<Option<SyncScheduler>>)` are wrapped in newtypes and registered via `app.manage(...)` in `src-tauri/src/lib.rs:27-32`.

**Serde patterns (idiomatic in this repo):**
- `#[derive(Debug, Clone, Serialize, Deserialize)]` is the default derive list for DTOs (every type in `src-tauri/src/huly/types.rs`). Add `Default` only when needed for builders.
- `#[serde(rename_all = "camelCase")]` on every struct that crosses an external API boundary (Huly REST, Tauri IPC). The TypeScript side consumes camelCase fields verbatim.
- `#[serde(rename = "_id")]` and `#[serde(rename = "_class")]` for Huly transactor fields (`src-tauri/src/huly/types.rs:25,41,54,72,78`).
- `#[serde(skip_serializing_if = "Option::is_none")]` on optional outbound fields (`src-tauri/src/huly/types.rs:110-112`).
- `#[serde(default)]` on optional inbound fields and `#[serde(other)]` as the catch-all enum variant for forward-compat (`ProjectCode::Unknown`, `TypeCode::Unknown` in `src-tauri/src/huly/naming.rs:23-24,36-37`).
- `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` for code-style enums (`ProjectCode`, `TypeCode`).

**Doc comments:**
- `///` on public items (clients, structs, key functions). Example header block at the top of `src-tauri/src/huly/naming.rs:1-12` documents the issue-naming format and links to `Issue #13`.

**Logging:**
- Plain `eprintln!("[huly] …")` with bracketed module tag. No `tracing`/`log` crate. Match this style if you add new diagnostics.

## React Patterns

**Routing — `react-router-dom` v7:**
- Single `<Routes>` block in `src/App.tsx` with one `<Route>` per page. Pages are eagerly imported at the top of `App.tsx` (no lazy loading currently).
- Nav structure is data-driven: a `navSections` array (`src/App.tsx:29-72`) with `label`, `color`, and `items` shapes the LCARS sidebar — add new routes there, not by editing JSX.
- Nested splat routes (`/agents/*`, `/team/*`) own their internal sub-tab routing inside their page component. Per `tasks/lessons.md:30`, splat nested tabs must use stable absolute targets and provide `index` plus `*` fallback redirects.
- Old route names redirect rather than break (`/live` → `/agents`).

**State management — Zustand v5:**
- Stores live under `src/stores/`. Current pattern is single small store: `src/stores/appStore.ts` exposes app-global UI state (`dateRange`) with a typed setter.
- Store shape: `interface AppState { … }` then `export const useAppStore = create<AppState>((set) => ({ … }))`. Keep stores narrow — page-local state stays in `useState`.
- Per-page server data uses Tauri invokes through the `useInvoke` hook (`src/hooks/useInvoke.ts`), not Zustand.

**Tauri IPC contract:**
- All `invoke()` calls are funneled through one typed surface: the `invokeApi` object in `src/hooks/useInvoke.ts` (currently 100+ methods). Each method declares the return type via `invoke<T>("command_name", { …args })`.
- Per `tasks/lessons.md:13`: do not put the returned `useInvoke` object directly into `useEffect` dependencies — stabilize the invoke surface first or the page will get stuck in a refresh loop.
- Every new Rust command needs a matching method in `invokeApi` and types in `src/lib/types.ts`. The "add a command" sequence is: Rust DTO → `#[tauri::command]` in `src-tauri/src/commands/mod.rs` → register in `src-tauri/src/lib.rs` → TS type in `src/lib/types.ts` → `invokeApi` method in `src/hooks/useInvoke.ts` → page consumer.

**Component layout:**
- Pages are flat in `src/pages/` (one file per top-level route).
- Reusable UI primitives in `src/components/ui/` (`Avatar`, `DateRangePicker`, `Skeleton`, …).
- Cross-page domain components in `src/components/team/`.
- Page-local helpers (formatters, route builders) are defined as plain functions at the top of the page file (see `formatRatioPercent`, `formatHours`, `formatDate`, `buildRoute` in `src/pages/Overview.tsx`).
- Shared LCARS styling is centralized in `src/lib/lcarsPageStyles.ts`; pages import `lcarsPageStyles` rather than redefining inline styles. Per `tasks/lessons.md:18`, build pages from "segmented rails, bands, strips, and console sections" — do not introduce generic dashboard cards or boxed admin panels.

**Async page data:**
- Pages own their own `useState`/`useEffect` orchestration on top of `invokeApi`. Per `tasks/lessons.md:32`, never leave a page on a one-shot fetch: include retry plus partial-failure fallback so a Tauri-state startup race cannot freeze the UI into a false zero-state.

## Commit Message Style

From `git log --oneline -30`:

- Conventional-commit-style prefix with optional scope: `type(scope): subject`.
- Observed types: `feat`, `fix`, `chore`, `docs`, `ci`, `release`.
- Observed scopes: `release`, `ci`, `projects`, `teamforge`, `ops-fabric`, `readme`, `agents`, plus version-tag scopes for releases (`release(0.1.28)`).
- `release(MAJOR.MINOR.PATCH): short summary` is the canonical release commit form (`release(0.1.28): paperclip runtime ops and approvals`, `release(0.1.27): bundle paperclip runtime adapter fallback`).
- `docs:` commits track release lifecycle: `docs: record v0.1.27 release kickoff` before, `docs: record v0.1.27 release success` after.
- Subjects are lowercase, imperative, under ~70 chars, no trailing period.
- No `Co-Authored-By` or AI signature lines in recent history; do not add them unless explicitly requested.

## CHANGELOG Style (`CHANGELOG.md`)

- File header: `# Changelog` then `All notable changes to TeamForge are documented in this file.`
- Entries are descending by version: `## v0.1.28 - 2026-05-01` (`v` prefix, ISO date, en-dash separator).
- Each entry has a 1–3 sentence narrative paragraph describing the user-visible outcome of the release before any subsections.
- Subsections in fixed order:
  - `### Changed` — bullet list of behavior/UX/API changes, with nested bullets for related sub-items (e.g. listing the new HTTP endpoints under one bullet).
  - `### Verification` — fenced-or-bare list of the exact shell commands run before tagging. Shown verbatim so the next release can mirror them.
- Each release closes by stating that release metadata was bumped across `package.json`, Tauri config, and the Rust crate.
- The `### Verification` block is canonical: copy its commands when reproducing a release, and extend it (rather than replace it) when new validation steps land.

## `tasks/todo.md` Plan Format

`tasks/todo.md` is a chronological append-only log of plans (~6500 lines, 119 plan blocks). Each plan uses this fixed four-section template:

```
# Task Plan

## Goal

[1–4 sentence prose statement of the concrete outcome to ship.]

## Plan

- [ ] First concrete step.
- [ ] Second concrete step.
- [ ] Verification / record-results step.

## Review

- Bullet list filled in as work progresses, ending with the literal `Verification:`
  block enumerating the exact commands run.
```

Conventions:
- Always use a fresh `# Task Plan` H1 — older plans stay above; do not edit prior entries except to flip checkboxes.
- `## Goal` is prose, not bullets. Be explicit about what is and is not in scope.
- `## Plan` is a flat checklist of `- [ ]` boxes. Flip to `- [x]` only after the step actually lands. Keep verification as the last step.
- `## Review` accumulates concrete bullets: skills consulted, files touched (with paths), residual caveats, and a literal `Verification:` block listing every shell command that was executed (mirroring `CHANGELOG.md`'s `### Verification` form).
- The "in progress" marker is the literal phrase `- In progress.` under `## Review`.
- Plans reference Tauri skills used (e.g. `understanding-tauri-ipc`, `calling-rust-from-tauri-frontend`, `testing-tauri-apps`) when the work touched the IPC boundary — keep this practice for any new IPC-shaped work.

`tasks/lessons.md` is the lessons sink: a flat bulleted list of one-line operational lessons learned. Append new lessons; do not reorder or rewrite existing ones. Per `tasks/lessons.md:3-4`, both files must be reviewed at the start of any non-trivial session in this repo.

## Label / Issue Conventions

- Issue and task titles follow the format defined and enforced in `src-tauri/src/huly/naming.rs`:
  ```
  [PROJECT]-[TYPE]-[COMPONENT]-[ID]: Description
  ```
- Project codes (`VALID_PROJECT_CODES` in `src-tauri/src/huly/naming.rs:59`): `AXT`, `TUY`, `BZL`, `VBX`, `OAS`, `INT`.
- Type codes (`VALID_TYPE_CODES` in `src-tauri/src/huly/naming.rs:60`): `FEAT`, `BUG`, `TASK`, `DOC`, `RESEARCH`, `SETUP`.
- Component is uppercase alphanumeric, ID is zero-padded digits (`001`, `042`). The ID segment is optional but recommended.
- Examples (from `src-tauri/src/huly/naming.rs:8-11`):
  - `AXT-FEAT-AUTH-001: Implement OAuth login`
  - `TUY-BUG-API-042: Fix rate limit handling`
  - `INT-SETUP-CI-003: Configure GitHub Actions`
- Compliance is computed at runtime by `parse_task_name` and surfaced via `compute_compliance_stats` — non-compliant titles still pass through the system but score below `0.5` and are flagged in `NamingComplianceStats` views.
- Per `tasks/lessons.md:28`, GitHub vs Huly issue ownership is split by domain: GitHub owns engineering issues, Huly owns execution/admin. The hybrid classification model uses rule-based detection plus durable manual override (`tasks/lessons.md:29`) — do not collapse to either pure automation or pure manual tagging.

---

*Convention analysis: 2026-05-04*
