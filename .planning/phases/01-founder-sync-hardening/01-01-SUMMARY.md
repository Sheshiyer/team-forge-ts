---
phase: 01-founder-sync-hardening
plan: 01
subsystem: infra

tags: [rust, tauri, gray_matter, vault, founder-sync, dual-path, sqlx]

# Dependency graph
requires:
  - phase: 00-bootstrap
    provides: "Existing Node-shellout founder-sync (scripts/teamforge-vault-parity.mjs) wired through commands::sync_local_vault_to_teamforge; settings table with get/set helpers; LocalVaultSyncReport IPC contract."
provides:
  - "src-tauri/src/vault/ as a module directory (vault.rs moved to vault/mod.rs byte-identically; new vault/parity.rs skeleton)."
  - "gray_matter v0.3.2 dep with default-features=false, features=[\"yaml\"] (for Plan 01-02 frontmatter parsing)."
  - "vault_sync_runtime dual-path setting wired at the Tauri call site (default \"rust\"; \"node\" preserves the existing shell-out for one release per D-02)."
  - "read_local_workspace_status is runtime-aware: node-only blockers (parity_script_error, node_runtime_error) no longer gate founder_sync_ready when runtime_choice == \"rust\"."
  - "vault::parity::run_apply / run_dry_run public signatures stable — Plan 01-02 fills bodies."
  - "src-tauri/tests-fixtures/vault-min/ — 7-file Wave 0 fixture vault covering all four note families plus one project-artifact path."
affects: [01-02-rust-importer-body, 01-03-real-vault-diff, phase-2-vault-backfill, v0.2.1-node-script-removal]

# Tech tracking
tech-stack:
  added: ["gray_matter 0.3.2 (frontmatter parsing, YAML feature only); transitive: yaml-rust2 0.10.4, arraydeque 0.5.1"]
  patterns: ["Dual-path runtime gate via settings key (vault_sync_runtime) with sentinel strings on the IPC report (rust-native / (native rust))", "Tuple-destructure of (stdout, stderr, runtime_succeeded) across the producer match so the existing report-parser block stays untouched"]

key-files:
  created:
    - "src-tauri/src/vault/parity.rs (51 LOC skeleton; run_apply / run_dry_run signatures + #[cfg(test)] mod tests stub)"
    - "src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/client-profile.md"
    - "src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/project-brief.md"
    - "src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/technical-spec.md"
    - "src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/design/ux-flow.md"
    - "src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/onboarding/client-onboarding.md"
    - "src-tauri/tests-fixtures/vault-min/50-team/alice-iyer-kpi.md"
    - "src-tauri/tests-fixtures/vault-min/50-team/onboarding/bob-employee-onboarding.md"
    - "src-tauri/tests-fixtures/README.md"
  modified:
    - "src-tauri/Cargo.toml (gray_matter dep + Cargo.lock resolved)"
    - "src-tauri/src/vault/mod.rs (former vault.rs; +1 line `pub mod parity;` at top)"
    - "src-tauri/src/commands/mod.rs (+105/-45 — runtime-aware read_local_workspace_status, dual-path dispatch in sync_local_vault_to_teamforge)"

key-decisions:
  - "Place gray_matter at the end of [dependencies] (existing Cargo.toml is domain-grouped, not alphabetical; 'between futures and keyring' was a hint, neither exists). Documented as a no-op deviation."
  - "Rather than insert a fresh `let report_path = ...` block inside the match-arm (per the plan's literal Edit C example), reuse the existing `let report_path = ...` immediately above and have the match-arm only own the producer call. Both arms write to the same `report_path`, the post-match parser at :2737-2825 stays untouched."
  - "Surface a unified `runtime_succeeded: bool` from the match instead of preserving the `output.status.success()` reference outside the match. Allows the rust arm to never construct a tauri-shell `Output` struct while keeping the existing failure-aggregation block functional for both branches."
  - "Drop #[allow(dead_code)] from run_apply once Task 2 wires the call site, but keep it on run_dry_run (used only by Plan 01-02 tests)."

patterns-established:
  - "Settings-keyed runtime gate: `let runtime_choice = get_setting(pool, \"key\").await.ok().flatten().map(trim).filter(non_empty).unwrap_or_else(default);` — copy this for any future single-string setting read."
  - "[vault-parity] eprintln! tag matches [scheduler]/[huly] convention from sync/teamforge_worker.rs and huly/client.rs."
  - "Dual-path producer match returning a normalized tuple — the post-producer code (parser, failure aggregation, refresh fetches) treats both runtimes identically."

requirements-completed: [SYNC-01]

# Metrics
duration: 8min
completed: 2026-05-04
---

# Phase 1 Plan 01-01: Founder Sync Hardening — Foundation Summary

**gray_matter dep + vault.rs split into vault/{mod,parity} + vault_sync_runtime dual-path wired at the Tauri call site (default rust, node fallback) + 7-file Wave 0 fixture vault — Plan 01-02 has a stable scaffold to fill in.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-04T01:34:48Z
- **Completed:** 2026-05-04T01:42:46Z
- **Tasks:** 3 / 3
- **Files modified/created:** 13 (including Cargo.lock)

## Accomplishments

- gray_matter 0.3.2 resolved with `default-features = false, features = ["yaml"]` per RESEARCH.md §"Standard Stack". yaml-rust2 0.10.4 lands transitively; no other new deps.
- `src-tauri/src/vault.rs` (1163 LOC) moved to `src-tauri/src/vault/mod.rs` byte-identically via `git mv`, then prefixed with `pub mod parity;` (+1 line). Rust resolves `mod vault;` in `lib.rs:10` to the new directory layout automatically — `lib.rs` untouched.
- `src-tauri/src/vault/parity.rs` skeleton lands with `pub async fn run_apply` and `pub async fn run_dry_run` signatures matching the patterns Plan 01-02 implements; both return `Err("not implemented yet")`. `#[cfg(test)] mod tests` stub with `skeleton_compiles` placeholder.
- `read_local_workspace_status` reads `vault_sync_runtime` (default `"rust"`) and gates `parity_script_error` / `node_runtime_error` blockers behind `node_required` so the rust path no longer reports node-only blockers.
- `sync_local_vault_to_teamforge` dispatches into `crate::vault::parity::run_apply` for the rust branch, preserves the existing `app_handle.shell().command("node")...` for the node branch, and returns `Err("Unknown vault_sync_runtime setting '<other>'")` on anything else.
- `LocalVaultSyncReport` is stamped with `node_runtime_version = script_source = "rust-native"` and `script_path = "(native rust)"` for the rust branch — sentinel strings per RESEARCH.md §"Dual-Path Mechanics". The IPC struct definition is untouched (D-04 contract preserved).
- 7-file Wave 0 fixture vault under `src-tauri/tests-fixtures/vault-min/` covering the four note families plus the project-artifact path: 1 project brief, 1 client profile, 2 project artifacts (technical-spec + design/ux-flow), 1 client onboarding flow, 1 employee KPI note (member_id `emp-001`), 1 employee onboarding flow. README.md sentinel included.

## Task Commits

Each task was committed atomically (per-task commits, no `git add .`, fixture commit isolated):

1. **Task 1: Add gray_matter dep + restructure vault into vault/{mod,parity}** — `5019a54` (feat)
2. **Task 2: Wire vault_sync_runtime dual-path at the Tauri call site** — `bd81774` (feat)
3. **Task 3: Stage Wave 0 fixture vault under tests-fixtures/vault-min/** — `03a06d6` (chore)

**Plan metadata commit:** _(landed alongside STATE.md/ROADMAP.md update — see plan executor's final commit step)_

## Files Created / Modified

**Created**
- `src-tauri/src/vault/parity.rs` — Native Rust importer skeleton; public surface for Plan 01-02. 51 LOC.
- `src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/client-profile.md` — Acme Corporation client profile with stakeholders / strategic-fit / risks / resource-links / tags sections.
- `src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/project-brief.md` — Acme website refresh brief; carries the `external_refs: - { system: clockify, id: 12345 }` shape per teamforge-vault-parity.mjs:169-178.
- `src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/technical-spec.md` — `artifact_type: vault-technical-spec`, `is_primary: true`.
- `src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/design/ux-flow.md` — `artifact_type: vault-design-doc`, `is_primary: false`.
- `src-tauri/tests-fixtures/vault-min/60-client-ecosystem/acme-corp/onboarding/client-onboarding.md` — `audience: client`, `workspace_ready: true`.
- `src-tauri/tests-fixtures/vault-min/50-team/alice-iyer-kpi.md` — `member_id: emp-001`; fenced JSON `## Monthly KPI` + `## KPI Contracts` sections per :596-616.
- `src-tauri/tests-fixtures/vault-min/50-team/onboarding/bob-employee-onboarding.md` — `audience: employee`.
- `src-tauri/tests-fixtures/README.md` — sentinel.

**Modified**
- `src-tauri/Cargo.toml` — `gray_matter = { version = "0.3", default-features = false, features = ["yaml"] }` appended to `[dependencies]`.
- `src-tauri/Cargo.lock` — gray_matter 0.3.2, yaml-rust2 0.10.4, arraydeque 0.5.1 resolved.
- `src-tauri/src/vault/mod.rs` (renamed from vault.rs) — +1 line `pub mod parity;` at top; vault reader content byte-identical.
- `src-tauri/src/commands/mod.rs` — +105/-45 lines covering: runtime-aware `read_local_workspace_status` (vault_sync_runtime read + node_required gate on blockers), dual-path producer match in `sync_local_vault_to_teamforge` (rust branch dispatches into `crate::vault::parity::run_apply`; node branch preserves the existing shell-out byte-for-byte), `eprintln!("[vault-parity] runtime_choice={}", ...)` cadence, sentinel strings on the IPC report, error branch on unknown runtime values.

## Wave 1 Verification Block (per VALIDATION.md "Sampling Rate: After every plan wave")

```
$ cargo fmt --manifest-path src-tauri/Cargo.toml --check
(no output)                                                         exit 0  ✅

$ cargo check --manifest-path src-tauri/Cargo.toml
    Checking team-forge-ts v0.1.28
    Finished `dev` profile [unoptimized + debuginfo] target(s)       exit 0  ✅
warnings: 0                                                                  ✅

$ cargo test --manifest-path src-tauri/Cargo.toml --lib
test result: ok. 44 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out
                                                                    exit 0  ✅

$ pnpm build
✓ 76 modules transformed.
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-CX3pCcY9.css    3.21 kB │ gzip:   1.27 kB
dist/assets/index-DKgIhUv6.js   550.45 kB │ gzip: 143.59 kB
✓ built in 651ms                                                    exit 0  ✅

$ git diff --check
(no output — no whitespace issues)                                  exit 0  ✅

# Structural assertions
gray_matter in Cargo.toml ......................................... ✅
src-tauri/src/vault.rs absent ..................................... ✅
src-tauri/src/vault/mod.rs present ................................ ✅
src-tauri/src/vault/parity.rs present ............................. ✅
`pub mod parity;` in vault/mod.rs ................................. ✅
`crate::vault::parity::run_apply` referenced in commands/mod.rs ... ✅
`vault_sync_runtime` referenced in commands/mod.rs (4 occurrences). ✅
src-tauri/tests-fixtures/vault-min — exactly 7 .md files .......... ✅
```

## Decisions Made

- **gray_matter placement:** `[dependencies]` is domain-grouped, not alphabetical. Placed gray_matter at the end of the block. Documented as a no-op deviation from the planner's "between futures and keyring" hint (neither dep exists).
- **Edit C tuple destructure:** Plan literal pseudo-code for Edit C wraps the shell-out in a match without addressing how the rust arm satisfies the post-match `output.status.success()` reference. Implemented as `let (stdout, stderr, runtime_succeeded) = match runtime_choice.as_str() { ... }` and renamed the downstream check to `if !runtime_succeeded`. Both arms feed the existing failure aggregation block (lines 2747-2766) unchanged. Same intent, less code, more idiomatic. The existing `let report_path = ...` block stays where it was (above the match) — both runtimes write to the same path.
- **#[allow(dead_code)] hygiene:** Added `#[allow(dead_code)]` to both `run_apply` and `run_dry_run` after Task 1 (without it, Task 1 alone fails the zero-warnings acceptance gate because the call site doesn't exist yet). Removed from `run_apply` after Task 2 wires the dispatch (call site exists). `run_dry_run` keeps the allow until Plan 01-02's tests reference it.
- **Cargo.lock committed in Task 1:** gray_matter resolution updates Cargo.lock; staged alongside Cargo.toml for atomicity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added #[allow(dead_code)] on parity entrypoints to satisfy Task 1's zero-warnings gate**
- **Found during:** Task 1 (cargo check after parity.rs creation)
- **Issue:** Task 1's acceptance criterion requires `cargo check 2>&1 | grep -c '^warning:'` returns 0, but cargo emits `dead_code` warnings on the new `pub async fn run_apply` and `pub async fn run_dry_run` because nothing calls them yet — the call site lands in Task 2.
- **Fix:** Added `#[allow(dead_code)]` to both functions. Removed from `run_apply` after Task 2 wired the dispatch (now legitimately referenced); kept on `run_dry_run` until Plan 01-02's tests use it.
- **Files modified:** `src-tauri/src/vault/parity.rs`
- **Verification:** `cargo check 2>&1 | grep -c '^warning:'` returns 0 after both Task 1 and Task 2 commits.
- **Committed in:** `5019a54` (Task 1 — added both allows), `bd81774` (Task 2 — removed from run_apply).

**2. [Rule 3 — Blocking] Restructured Edit C as tuple destructure rather than literal match wrap**
- **Found during:** Task 2 (Edit C implementation)
- **Issue:** The plan's literal Edit C pseudo-code wraps the existing `let output = app_handle.shell().command("node")...?` in a match arm, but lines 2716-2718 (`let stdout = decode_shell_output(&output.stdout); let stderr = decode_shell_output(&output.stderr); let stdout_tail = tail_lines(&stdout, 12);`) reference `output` outside the match. The rust arm doesn't produce a tauri-shell `Output` value, so leaving these references unchanged would not compile.
- **Fix:** Changed the match to return `let (stdout, stderr, runtime_succeeded) = match runtime_choice.as_str() { ... }`. Rust arm returns `(String::new(), String::new(), true)`; node arm extracts from `output`. Renamed `if !output.status.success()` to `if !runtime_succeeded`. The existing failure-aggregation block at lines 2747-2766 stays unchanged. The post-match parser block (2737-2825) stays unchanged. The `LocalVaultSyncReport` struct definition is untouched. D-04 contract preserved.
- **Files modified:** `src-tauri/src/commands/mod.rs`
- **Verification:** `cargo check` exits 0 with zero warnings; `cargo test --lib` 44 passed / 0 failed; `git diff` confirms `LocalVaultSyncReport` definition unchanged (acceptance criterion `git diff | grep -c '^-.*LocalVaultSyncReport' returns 0` ✅).
- **Committed in:** `bd81774`

**3. [Editorial] gray_matter placement at end of `[dependencies]`**
- **Found during:** Task 1 (Cargo.toml read)
- **Issue:** Plan suggested "alphabetical placement, between futures and keyring is fine" — but Cargo.toml is domain-grouped, not alphabetical, and neither `futures` nor `keyring` is in `[dependencies]`.
- **Fix:** Placed gray_matter as the last entry in `[dependencies]`. Plan explicitly authorized executor confirmation via "the executor confirms exact location by reading the existing file."
- **Files modified:** `src-tauri/Cargo.toml`
- **Verification:** `grep -q '^gray_matter\s*=\s*{\s*version\s*=\s*"0\.3"' src-tauri/Cargo.toml` exits 0.
- **Committed in:** `5019a54`

---

**Total deviations:** 3 (2 Rule-3 blocking auto-fixes + 1 editorial confirmation per plan-authorized discretion)
**Impact on plan:** All deviations were necessary for the build to compile cleanly under the plan's own zero-warnings gate. Plan intent fully preserved — D-01 (native Rust importer skeleton at vault/parity.rs) ✅, D-02 (vault_sync_runtime dual-path with rust default + node fallback) ✅, D-03 (full parity in scope; fixture covers all 4 families) ✅, D-04 (LocalVaultSyncReport definition untouched) ✅. Locked decisions traceability complete.

## Known Stubs

- `vault::parity::run_apply` and `vault::parity::run_dry_run` return `Err("not implemented yet — see Plan 01-02")`. Intentional — Plan 01-01 is the structural scaffold; bodies land in Plan 01-02 per CONTEXT.md D-01 and the plan's own `<output>` block.
- `vault::parity::tests::skeleton_compiles` is an `assert!(true)` placeholder. Real tests land in Plan 01-02 per VALIDATION.md Per-Task Verification Map.
- `#[allow(dead_code)]` remains on `run_dry_run` until Plan 01-02 references it from inline tests.

These stubs are correctness-safe at runtime: invoking the rust path before Plan 01-02 lands surfaces a clear `"not implemented yet — see Plan 01-02"` error from the Tauri command. The default behavior (vault_sync_runtime defaults to "rust" if not set) means an unconfigured installation will see this error rather than silently fall back to node — by design, per CONTEXT.md D-02 (the kill-date-bound dual-path is for explicit operator opt-in, not silent fallback).

## Issues Encountered

- None during planned work. The pre-existing dirty worktree (`src-tauri/src/db/{models,queries}.rs`, `huly/{client,types}.rs`, `slack/types.rs`, `tasks/todo.md`) was preserved untouched throughout — explicit `git add <path>` for every commit, never `git add .` or `git add -A`. Final `git status` after the three commits confirms those eight files remain modified-but-unstaged in their pre-execution state.

## Next Plan Readiness

Plan 01-02 (rust importer body) has its scaffold:

- `vault::parity::{run_apply, run_dry_run}` skeletons return `Err` — fill the bodies; signatures stable.
- `gray_matter v0.3.2` available with the YAML feature.
- `crate::vault::parity::run_apply` is already invoked by `commands::sync_local_vault_to_teamforge` when `vault_sync_runtime == "rust"` (the default). Once 01-02 lands, end-to-end UI exercise works.
- `src-tauri/tests-fixtures/vault-min/` ready to consume — 7 markdown files covering all four note families plus the project-artifact path.
- `LocalVaultSyncReport` JSON shape unchanged (D-04). Plan 01-02's `run_apply` writes the same JSON-on-disk report shape Node produces.

Plan 01-03 (real-vault diff) gated on Plan 01-02 — no readiness work in 01-01.

## Hand-off Note for Plan 01-02

> `vault::parity::{run_apply, run_dry_run}` skeletons return Err — fill the bodies. Both share the signature `(_pool: &SqlitePool, _vault_root: &str, _workspace_id: &str, _worker_base_url: &str, _access_token: &str, _report_path: &Path) -> Result<(), String>`. Drop `#[allow(dead_code)]` from `run_dry_run` once you reference it from tests. The fixture at `src-tauri/tests-fixtures/vault-min/` is ready to consume; expected counts per RESEARCH.md §"Test Plan → Fixture vault" are: projectBriefsFound=1, clientProfilesFound=1, projectArtifactsFound=2, onboardingClientFlowsFound=1, onboardingEmployeeFlowsFound=1, employeeKpiNotesFound=1 (member_id emp-001 — pre-seed an employee row in the test setup).

---

*Phase: 01-founder-sync-hardening*
*Completed: 2026-05-04*

## Self-Check: PASSED

**Files verified:**
- FOUND: src-tauri/src/vault/mod.rs
- FOUND: src-tauri/src/vault/parity.rs
- FOUND: src-tauri/Cargo.toml (gray_matter line)
- FOUND: src-tauri/src/commands/mod.rs (modifications)
- FOUND: 7× src-tauri/tests-fixtures/vault-min/**/*.md
- FOUND: src-tauri/tests-fixtures/README.md
- ABSENT (intentional): src-tauri/src/vault.rs

**Commits verified:**
- FOUND: 5019a54 — Task 1 (gray_matter + vault restructure)
- FOUND: bd81774 — Task 2 (vault_sync_runtime dual-path)
- FOUND: 03a06d6 — Task 3 (Wave 0 fixture vault)

**Verification gates:**
- cargo fmt --check: exit 0
- cargo check: 0 warnings, 0 errors
- cargo test --lib: 44 passed / 0 failed / 3 ignored
- pnpm build: exit 0 (76 modules transformed)
- git diff --check: clean
