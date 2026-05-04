//! Native Rust port of `scripts/teamforge-vault-parity.mjs`.
//!
//! See `.planning/phases/01-founder-sync-hardening/01-RESEARCH.md` for the full
//! spec mapping. Public surface is two entry points (`run_apply`, `run_dry_run`)
//! invoked from `commands/mod.rs::sync_local_vault_to_teamforge` and from inline
//! integration tests against `src-tauri/tests-fixtures/vault-min/`.
//!
//! Phase 1 scope (per CONTEXT.md D-03): full parity for all four note families —
//! project briefs, client profiles, onboarding flows, employee KPI notes.
//! Report shape (per CONTEXT.md D-04): byte-compatible with the Node script's
//! JSON-on-disk output so `commands/mod.rs:2708-2805` keeps working unchanged.

use sqlx::SqlitePool;
use std::path::Path;

/// Apply-mode entry. Walks the vault, diffs against the Worker, PUTs all four
/// note families, writes a Node-compatible JSON report at `report_path`.
///
/// Implementation lands in Plan 01-02. This skeleton exists so Plan 01-01 can
/// wire the dual-path setting at the Tauri call site against a stable signature.
#[allow(dead_code)]
pub async fn run_apply(
    _pool: &SqlitePool,
    _vault_root: &str,
    _workspace_id: &str,
    _worker_base_url: &str,
    _access_token: &str,
    _report_path: &Path,
) -> Result<(), String> {
    Err("vault::parity::run_apply not implemented yet — see Plan 01-02".to_string())
}

/// Dry-run entry. Same as `run_apply` but issues no Worker writes and no SQLite
/// writes. Used by the inline integration test
/// `rust_parity_run_against_fixture_vault` and by the Tier 3 parity-diff test
/// `rust_parity_diff_against_real_vault`.
#[allow(dead_code)]
pub async fn run_dry_run(
    _pool: &SqlitePool,
    _vault_root: &str,
    _workspace_id: &str,
    _worker_base_url: &str,
    _access_token: &str,
    _report_path: &Path,
) -> Result<(), String> {
    Err("vault::parity::run_dry_run not implemented yet — see Plan 01-02".to_string())
}

#[cfg(test)]
mod tests {
    // Tests added in Plan 01-02 — see 01-VALIDATION.md Per-Task Verification Map.
    #[test]
    fn skeleton_compiles() {
        assert!(true);
    }
}
