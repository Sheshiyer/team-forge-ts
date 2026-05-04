---
phase: 1
slug: founder-sync-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `01-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standard Rust test harness (`cargo test`); async tests use `#[tokio::test]` (Tokio is in `[dependencies]` already with `features = ["full"]`). No new test framework. |
| **Config file** | None — the existing `[lib]` configuration in `src-tauri/Cargo.toml:6-8` is sufficient. |
| **Quick run command** | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests -- --nocapture` |
| **Full suite command** | `cargo test --manifest-path src-tauri/Cargo.toml --lib` |
| **Estimated runtime** | ~2-5 seconds (quick), ~15-30 seconds (full suite, matches existing v0.1.28 CHANGELOG verification) |

---

## Sampling Rate

- **After every task commit:** `cargo fmt --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests -- --nocapture`
- **After every plan wave:** `cargo test --manifest-path src-tauri/Cargo.toml --lib && pnpm build && git diff --check`
- **Before `/gsd:verify-work`:** Full suite green, Tier 2 manual founder-sync run on clean-PATH Mac, Tier 3 parity diff against real `thoughtseed-labs` vault — all recorded in `01-VERIFICATION.md` and the `CHANGELOG.md` v0.2.0 `### Verification` block.
- **Max feedback latency:** ~30 seconds (full suite); ~5 seconds (quick run).

---

## Per-Task Verification Map

> Every requirement → test cell below references a specific Node-script line range as its parity anchor; this is what makes the Rust port verifiable.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-frontmatter-parser | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::parses -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-status-normalize | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::normalizes_status_with_alias_table -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-workspace-id-fallback | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::workspace_id_falls_back -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-request-body-dup-keys | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::builds_request_body_with_camel_and_snake_duplicates -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-merge-artifacts | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::merges_artifacts_dedup_by_source_and_external_id -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-kpi-employee-resolve | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::kpi_employee_resolution -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-onboarding-apply-guard | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::onboarding_flow_apply_disabled_when_project_filter_active -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-report-struct-shape | 02 | 1 | SYNC-01 | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::report_struct_serializes_to_node_compatible_json -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-kpi-snapshot-sqlite | 02 | 2 | SYNC-01 | integration | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::kpi_snapshot_round_trips_through_sqlite -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-fixture-vault-parity | 02 | 2 | SYNC-01 | integration | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::rust_parity_run_against_fixture_vault -- --nocapture` | ❌ W0 | ⬜ pending |
| 01-real-vault-diff | 03 | 3 | SYNC-01 | integration (live, `--ignored`) | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::rust_parity_diff_against_real_vault -- --ignored --nocapture` | ❌ W0 | ⬜ pending |
| 01-clean-path-app-run | 03 | 3 | SYNC-01 | manual-only | `open TeamForge.app` then click "Sync vault" in Settings (Tier 2 of `01-RESEARCH.md` §9). **Justification:** Tauri WebView IPC + macOS LaunchServices behavior cannot be exercised by `cargo test`; this is the literal acceptance criterion of issue #45 and must be verified by a human at the packaged-app level. | ✅ (existing UI; new verification step) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Wave 0 is the test infrastructure that must exist before Wave 1 implementation tasks can be verified. The planner places Wave 0 tasks first.

- [ ] `src-tauri/src/vault/parity.rs` — covers SYNC-01 (the new module being created in Phase 1; tests are inline at the bottom of this file per the repo's `#[cfg(test)] mod tests` convention).
- [ ] `src-tauri/tests-fixtures/vault-min/` — fixture vault with 7 minimal markdown files (1 project brief, 1 client profile, 1 onboarding flow, 1 employee KPI note, 1 invalid frontmatter, 1 missing required field, 1 status-alias edge case). Used by `rust_parity_run_against_fixture_vault`.
- [ ] One pre-seeded employee row in the fixture's SQLite (created at test-setup time inside `rust_parity_run_against_fixture_vault` — does NOT need a separate fixture file).
- [ ] No new test framework install — `cargo` + `tokio` already present in `Cargo.toml`.
- [ ] No new shared fixtures crate — inline patterns mirror `src-tauri/src/db/queries.rs:2298-2331`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TeamForge.app on a clean-PATH Mac runs founder-sync to completion | SYNC-01 | Tauri WebView IPC + macOS LaunchServices behavior cannot be exercised by `cargo test`; this is the literal acceptance criterion of issue #45 | (1) Build the .app: `pnpm tauri build`. (2) On a Mac with `node` removed from PATH (`PATH=/usr/bin:/bin /Applications/TeamForge.app/Contents/MacOS/TeamForge`), launch the app. (3) Open Settings → Local Workspace → click "Sync vault". (4) Confirm completion (no error toast, status returns to ready). (5) Inspect `agent_feed` projection in the app: new vault-sourced rows appear. (6) Optional: bundle inspection — `find /Applications/TeamForge.app -name "*.mjs"` should still list the bundled Node script (D-02 dual-path safety net), but `vault_sync_runtime=rust` must take effect at runtime. |
| Rust path output matches Node path output against the REAL `thoughtseed-labs` vault | SYNC-01 | Real-vault content is private; cannot be checked into fixtures. Diff requires both runtimes available simultaneously. | Tier 3 of `01-RESEARCH.md` §9. Run Node path: `node scripts/teamforge-vault-parity.mjs --apply --vault-root <real> --workspace-id <id> --report /tmp/node.json`. Run Rust path via `cargo test ... rust_parity_diff_against_real_vault -- --ignored` (the test reads the same vault and emits `/tmp/rust.json`). Diff with `jq` against expected normalized fields. Record any drift in `01-VERIFICATION.md` §"Parity Diff Results". |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Wave 1 has 8 unit tests covering 8 sub-behaviors of the new module — full sampling continuity)
- [ ] Wave 0 covers all MISSING references (`vault/parity.rs` module, `tests-fixtures/vault-min/`, fixture markdown files)
- [ ] No watch-mode flags (every command is one-shot; `cargo test` exits with code)
- [ ] Feedback latency < 30s (full suite); < 5s (quick run, `vault::parity::tests` filter)
- [ ] `nyquist_compliant: true` set in frontmatter — flip after Wave 0 lands and the first Wave 1 task is green

**Approval:** pending
