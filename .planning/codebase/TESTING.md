# Testing Patterns

**Analysis Date:** 2026-05-04

## Test Framework

**Frontend (TypeScript/React):**
- `node:test` (Node's built-in test runner) with `node:assert/strict`. No Jest, Vitest, or Playwright in `package.json`.
- Tests are TypeScript and import from source with the `.ts` suffix (`tsconfig.json` enables `"allowImportingTsExtensions": true`).
- No `package.json` script wraps the test invocation today — run manually with Node's TypeScript-loader path (e.g. `node --import tsx --test tests/updater.test.ts`) or whatever loader the operator has configured. The CI pipeline does not run frontend tests; `pnpm build` (= `tsc && vite build`) is the only frontend gate.

**Backend (Rust):**
- The standard Rust test harness, run via `cargo test --manifest-path src-tauri/Cargo.toml`.
- Async tests use `#[tokio::test]` (Tokio is already in `[dependencies]` with `features = ["full"]`; `src-tauri/Cargo.toml:20`). There are no separate `[dev-dependencies]` declared — production deps are reused in tests.
- Synchronous tests use plain `#[test]`.
- Long/external tests use `#[tokio::test]` plus `#[ignore]` so they are skipped by default; run with `-- --ignored` (see `src-tauri/src/commands/mod.rs:11695-11696`, `:11761-11762`, `:11772-11773`).

**Run Commands (canonical, from `CHANGELOG.md` `### Verification` blocks):**

```bash
# Rust: format, typecheck, full test suite (lib only)
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Rust: target a specific test module (e.g. before a Paperclip release)
cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture

# Frontend: typecheck + build (the de-facto frontend gate)
pnpm build

# Cross-repo Paperclip adapter contract checks
node --check ../thoughtseed-paperclip/scripts/forge-aura-adapter/server.mjs
bash -n ../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh
../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh

# Whitespace / merge-marker hygiene
git diff --check

# Full release-bundle build (only for hands-on release verification)
cargo tauri build --bundles app
```

## Test File Organization

**Frontend:**
- `tests/` at repo root, mirroring source modules by name. Currently a single file: `tests/updater.test.ts`, exercising `src/lib/updater.ts`.
- No co-located `.test.ts` files in `src/`. New frontend tests should land in `tests/` mirroring the `src/lib`/`src/hooks` path of what they cover.

**Backend (Rust):**
- All Rust tests are inline `#[cfg(test)] mod tests { … }` blocks at the bottom of the module they test. There is no top-level `tests/` integration-test directory in `src-tauri/`.
- 46 inline test functions distributed across these modules:
  - `src-tauri/src/paperclip.rs:1161` — 3 tests (runtime endpoint URL handling, runtime summary, founder queue prioritization).
  - `src-tauri/src/commands/mod.rs:10800` — 14 tests (workspace normalization plan, Slack scope errors, org-chart filtering, Tauri command behavior; 3 of these are `#[ignore]`-gated).
  - `src-tauri/src/clockify/sync.rs:389` — 1 test.
  - `src-tauri/src/github/types.rs:279` — 5 tests.
  - `src-tauri/src/huly/client.rs:592` — 2 tests.
  - `src-tauri/src/huly/naming.rs:203` — 5 tests (task-naming convention parser, compliance stats).
  - `src-tauri/src/db/queries.rs:1228` and `:2291` — 11 tests across two `mod tests` blocks (SQLite round-trips, identity map, calendar, etc.).
  - `src-tauri/src/slack/sync.rs:587` — 3 tests.
  - `src-tauri/src/ops/mod.rs:56` — 2 tests (sync-key normalization).
- Per `tasks/todo.md`, the v0.1.28 baseline run reported `43 passed, 0 failed, 3 ignored`.

## Test Structure

**Rust suite organization (idiomatic in this repo):**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fully_compliant_title() {
        let p = parse_task_name("AXT-FEAT-AUTH-001: Implement OAuth login");
        assert!(p.compliant);
        assert_eq!(p.project_code.as_deref(), Some("AXT"));
        // ...
    }
}
```
(see `src-tauri/src/huly/naming.rs:203-249`)

**Async + SQLite pattern:**

Tests that touch SQLite spin up a fresh on-disk DB per test using a unique temp directory derived from PID + nanoseconds + an atomic counter (`src-tauri/src/db/queries.rs:2298-2310`):

```rust
static TEST_DB_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_test_dir() -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|v| v.as_nanos()).unwrap_or_default();
    let seq = TEST_DB_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("teamforge-db-test-{}-{nanos}-{seq}", std::process::id()))
}

#[tokio::test]
async fn team_department_cache_round_trips_through_sqlite() {
    let dir = unique_test_dir();
    let pool = init_db(&dir).await.expect("init db");
    // exercise the query under test against a real pool
    pool.close().await;
    let _ = std::fs::remove_dir_all(dir);
}
```
(see `src-tauri/src/db/queries.rs:2312-2355`)

Patterns to mirror:
- Acquire a real `SqlitePool` via `init_db(&dir)`; do not mock `sqlx`.
- Always `pool.close().await` and `remove_dir_all(dir)` at the end so successive tests do not leak state.
- Use `.expect("…")` with short context messages; avoid `unwrap()` in tests.

**TypeScript test pattern (from `tests/updater.test.ts`):**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { reduceDownloadProgress } from "../src/lib/updater.ts";

test("reduceDownloadProgress captures total size and downloaded bytes", () => {
  let state = reduceDownloadProgress(
    { downloadedBytes: 0, contentLength: null, finished: false },
    { event: "Started", data: { contentLength: 4096 } }
  );
  // ...
  assert.deepEqual(state, { downloadedBytes: 3072, contentLength: 4096, finished: false });
});
```

Patterns to mirror:
- One `test("…", () => { … })` per behavior; no `describe` blocks.
- Use `assert.deepEqual` for structural state, `assert.equal` for scalars.
- Test pure helpers extracted from larger modules — `tests/updater.test.ts` exercises the reducer/formatter functions in `src/lib/updater.ts` rather than the Tauri-coupled `checkForUpdate` / `relaunchForInstall` paths, which depend on `window.__TAURI__`.

## Mocking

**Mocking philosophy:** the codebase prefers real fixtures and pure helpers over mocking frameworks. There is no `mockito`, `mockall`, `wiremock`, or JS mocking library in dependencies.

- **Rust:** No mocking library. Tests construct real domain types (`HulyDepartment`, `HulyPerson`, `HulyEmployee`, `Employee`) inline as test fixtures — see `src-tauri/src/db/queries.rs:2316-2331` and `src-tauri/src/commands/mod.rs:11008-11050`. SQLite queries hit a real on-disk pool; HTTP-flavored tests target pure helpers (URL parsing, payload normalization) rather than the live `reqwest::Client`.
- **TypeScript:** No mocking. The updater suite tests pure reducer/formatter functions; the Tauri-coupled functions guard on `typeof window === "undefined"` (`src/lib/updater.ts`) and are exercised manually in the packaged app rather than mocked.

**What to mock:** essentially nothing — extract pure helpers and test those instead.
**What NOT to mock:** `sqlx::SqlitePool`, `reqwest::Client`, `window.__TAURI__`. Never invent shims for these.

## Fixtures and Factories

- No dedicated `fixtures/` or factory directory.
- Rust tests build domain structs inline at the top of each test (one block of `let departments = vec![…]; let persons = vec![…];`).
- Where multiple tests in one module need the same shape, a private helper is defined inside `mod tests` (e.g. the `test_snapshot()` helper referenced from `src-tauri/src/commands/mod.rs:10965`).
- The frontend has no shared fixture module today.

## Coverage

No coverage tool is configured. There are no `tarpaulin`, `grcov`, `c8`, or `nyc` configs in the repo, and no `--cov` flags appear in CI. Coverage is implicit: track ISC-style verification commands per release in `CHANGELOG.md` `### Verification` and `tasks/todo.md` `## Review`.

## Test Types

**Unit tests:**
- The dominant style. Inline `#[cfg(test)]` Rust modules and standalone Node tests in `tests/`. They cover pure transformations: parsing (`parse_task_name`), normalization (`build_sync_key`, `normalize_segment`), URL composition (`endpoint_url_handles_api_base_alias`), reducer behavior (`reduceDownloadProgress`).

**Integration tests:**
- Implemented as Rust integration *via* real SQLite pools rather than as a separate `tests/` crate. The DB tests in `src-tauri/src/db/queries.rs:2291-3034+` and several command-layer tests in `src-tauri/src/commands/mod.rs` (the `#[tokio::test]` cluster around `:11224-11587`) round-trip data through `init_db`, then through the production query/command code.
- The `#[ignore]`-gated tests around `src-tauri/src/commands/mod.rs:11695,11761,11772` are integration-level checks that talk to live external systems; they are intentionally excluded from the default `cargo test` run.

**Contract tests (cross-repo):**
- The Paperclip adapter contract test lives in the **sibling repo**, not this one: `../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh`. There is no in-repo copy under `team-forge-ts/scripts/forge-aura-adapter/` — only the bundled fallback adapter at `scripts/paperclip-runtime-adapter.mjs`.
- Pre-tag verification for any Paperclip-touching release executes three steps (verbatim from `CHANGELOG.md` v0.1.28):
  1. `node --check ../thoughtseed-paperclip/scripts/forge-aura-adapter/server.mjs` — syntax-check the adapter server.
  2. `bash -n ../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh` — syntax-check the contract harness.
  3. `../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh` — run the harness against a live local adapter, asserting the `/api/runtime/*` and `/api/approvals*` shapes that TeamForge's Rust commands depend on.
- Per `tasks/lessons.md:5`, treat "the adapter starts" as insufficient — the contract test must exercise the live runtime path.

**E2E tests:**
- Not used. No Playwright, Cypress, or `tauri-driver` setup is present. End-to-end verification of packaged behavior is manual: per `tasks/lessons.md:6`, "verify bundled Tauri apps via `open TeamForge.app` or Finder/LaunchServices, not by directly executing `TeamForge.app/Contents/MacOS/...`". The v0.1.27 release verification block (`CHANGELOG.md`) explicitly lists `packaged app visual verification of Overview and Agents`.

## CI Pipeline (`.github/workflows/release.yml`)

There is exactly one workflow: `Build & Release` (`.github/workflows/release.yml`). It is **not a test gate** — it is a release pipeline triggered by `push: tags: ['v*']` or `workflow_dispatch`.

What it does:
- Runs on `macos-latest` only.
- Sets up Node 22, pnpm 10.33.0, Rust stable with `aarch64-apple-darwin` and `x86_64-apple-darwin` targets, plus `swatinem/rust-cache@v2` scoped to `src-tauri`.
- Installs frontend deps (`pnpm install`).
- Validates that all updater secrets are present (`TAURI_SIGNING_PRIVATE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TF_RELEASE_PUBLISH_TOKEN`) — fails fast with `::error::Missing required secret` if any are blank.
- Builds two Tauri bundles via `tauri-apps/tauri-action@v0`: `--target aarch64-apple-darwin` and `--target x86_64-apple-darwin`.
- After each build, locates `TeamForge.app.tar.gz` and its `.sig`, then publishes the OTA artifact via `pnpm release:ota:publish` (i.e. `scripts/publish-ota-release.mjs`) to Cloudflare R2.

What it does **not** do:
- It does not run `cargo test`.
- It does not run `cargo check`.
- It does not run `cargo fmt --check`.
- It does not run `pnpm build` as a standalone step (the build happens inside `tauri-action`).
- It does not run any frontend or contract tests.
- It does not run on PRs or on push-to-main.

**Implication: there is no CI-enforced test gate.** All correctness gating happens locally before the release tag is pushed. The `### Verification` block in each `CHANGELOG.md` entry is the historical record of what was actually executed for that release; mirror those exact commands when shipping.

## Common Patterns

**Async testing:**
```rust
#[tokio::test]
async fn round_trips_through_sqlite() {
    let dir = unique_test_dir();
    let pool = init_db(&dir).await.expect("init db");
    // ... exercise queries ...
    pool.close().await;
    let _ = std::fs::remove_dir_all(dir);
}
```

**Skipping live-dependency tests:**
```rust
#[tokio::test]
#[ignore]
async fn talks_to_real_huly_workspace() { /* … */ }
```
Run with `cargo test … -- --ignored` only when the relevant credentials/network are available.

**Error-message testing (Rust):**
```rust
let message = humanize_slack_connection_error(
    "Slack API rejected conversations.list: missing_scope | needed=groups:read | provided=channels:read,users:read".to_string()
);
assert!(message.contains("missing scope `groups:read`"));
assert!(message.contains("Reinstall to Workspace"));
```
(`src-tauri/src/commands/mod.rs:10995-11005`) — assert on substrings users will see, not on exact equality, so the human copy can evolve without breaking the test.

**Pure-function testing (TypeScript):**
- Extract reducers/formatters from Tauri-coupled flows, then test them with Node's built-in runner (`tests/updater.test.ts`).

## What "Ship-Ready" Looks Like in This Repo

A change is ship-ready when, in this order:

1. `cargo fmt --manifest-path src-tauri/Cargo.toml` — format pass.
2. `cargo check --manifest-path src-tauri/Cargo.toml` — passes with **no warnings** (the v0.1.28 baseline reset the active warning count to zero; do not regress this — see `tasks/todo.md` `## Review` for v0.1.28).
3. `cargo test --manifest-path src-tauri/Cargo.toml --lib` (or a targeted module like `paperclip::tests -- --nocapture`) — all default tests pass; ignored ones may stay ignored.
4. `pnpm build` — TypeScript typechecks and Vite produces a bundle.
5. For Paperclip-touching changes: the three-step adapter contract verification against `../thoughtseed-paperclip/scripts/forge-aura-adapter/`.
6. `git diff --check` — no whitespace / merge-marker damage.
7. The `tasks/todo.md` plan's `## Review` section is updated with the executed `Verification:` block, and `CHANGELOG.md` gains a new `## vX.Y.Z` entry whose `### Verification` block lists those same commands.

For a release, additionally bump the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, and `README.md` in a single commit, then push a `v*` tag to trigger `.github/workflows/release.yml`.

## Gaps Where Verification Is Manual

- **No CI test gate.** PRs and `main` pushes never run `cargo test` or `pnpm build` automatically. Skipping local verification means broken code can land on `main`.
- **No frontend test runner script.** `tests/updater.test.ts` exists but is not wired to any `package.json` script; running it requires the operator to know the right Node loader incantation.
- **No coverage measurement** for either Rust or TypeScript.
- **No E2E or UI tests.** Page rendering, route transitions, LCARS sub-tabs, and updater download/install flows are verified by hand on macOS via `open TeamForge.app` (per `tasks/lessons.md:6`).
- **Cross-repo contract tests live in a sibling repo** (`../thoughtseed-paperclip/`). If that repo is missing or out of sync, the contract step is silently skipped. The bundled `scripts/paperclip-runtime-adapter.mjs` fallback addresses runtime drift but does not run the contract harness.
- **`#[ignore]`-gated tests** at `src-tauri/src/commands/mod.rs:11695,11761,11772` cover live external paths; running them is operator-discretion and not part of the standard `cargo test` invocation.
- **Updater signing is not exercised in `cargo check`.** Per `tasks/lessons.md:23`, treat local `cargo tauri build` updater-signing failures as non-canonical: trust `.github/workflows/release.yml` as the real updater-signing path.
- **OTA publish path** runs only inside the GitHub Actions release job. Local validation can prove the artifact builds (`cargo tauri build --bundles app`) but cannot prove the R2 upload succeeds — that is observable only after pushing the tag.

---

*Testing analysis: 2026-05-04*
