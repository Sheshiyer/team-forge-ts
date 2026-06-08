---
phase: 01-founder-sync-hardening
requirement: SYNC-01
status: documented
version: 0.2.6
date: 2026-06-08
verifier: claude-code (T-003)
---

# Phase 1 — Verification Artifact (Wave 3, adapted for v0.2.6)

> Records the full Verification Ladder run against the v0.2.6 code line.
> The plan `01-03-PLAN.md` was written for v0.1.28 → v0.2.0; this artifact
> adapts it for the current repo state where v0.2.6 is already released,
> the `#[ignore]` test already exists, and version bumps are skipped.

## Tier 1 — Local Correctness

| Step | Command | Exit Code | Output Summary |
|------|---------|-----------|----------------|
| 1 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 0 | clean |
| 2 | `cargo check --manifest-path src-tauri/Cargo.toml` | 0 | 0 errors, 2 pre-existing dead_code warnings in `src/huly/naming.rs` |
| 3 | `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 0 | `test result: ok. 71 passed; 0 failed; 4 ignored; 0 measured; 0 filtered out` |
| 4 | `pnpm build` | 0 | TypeScript clean, Vite emitted dist/ |
| 5 | `git diff --check` | 0 | no whitespace damage |

Test count delta vs v0.2.0 baseline: `vault::parity::tests` carries 15 tests
(14 active + 1 `#[ignore]`-gated). Total `cargo test --lib` count: 71 active
passed, 4 ignored (3 from `commands::tests` + 1 from `vault::parity::tests`).

VALIDATION.md task IDs marked green at this tier:
- `01-frontmatter-parser`, `01-status-normalize`, `01-workspace-id-fallback`,
  `01-request-body-dup-keys`, `01-merge-artifacts`, `01-kpi-employee-resolve`,
  `01-onboarding-apply-guard`, `01-report-struct-shape`,
  `01-kpi-snapshot-sqlite`, `01-fixture-vault-parity` — all green via the
  standard `cargo test --lib` pass.

## Tier 2 — Native Runtime Acceptance (THE acceptance criterion for issue #45)

**Status: PENDING HUMAN EXECUTION**

This tier cannot be exercised by `cargo test` per `01-VALIDATION.md`
§"Manual-Only Verifications". The procedure below is recorded for the
human releaser.

### Procedure

1. Build the .app bundle from the repo root:
   ```bash
   cargo tauri build --bundles app
   ```
   Expected: `TeamForge.app` produced under
   `src-tauri/target/release/bundle/macos/TeamForge.app`.

2. Confirm the bundle's product version is 0.2.6:
   ```bash
   /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
     src-tauri/target/release/bundle/macos/TeamForge.app/Contents/Info.plist
   ```
   Expected: prints `0.2.6`.

3. In a **new** terminal, strip Node from PATH and verify:
   ```bash
   PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/node\|/nvm\|/homebrew/bin\|/.local/share/mise' | paste -sd:)
   which node
   ```
   Expected: `which node` returns nothing (exit 1, empty stdout).

4. From that same terminal, launch the .app via LaunchServices:
   ```bash
   open src-tauri/target/release/bundle/macos/TeamForge.app
   ```

5. In the launched TeamForge window:
   - Open **Settings → Local Workspace** block.
   - Confirm `founder_sync_ready` shows green / "Ready".
   - Click **"Sync vault"**.
   - Wait for sync to complete.
   - Expected: no error toast; status returns to "ready"; `Last synced`
     timestamp updates.
   - Open the Agent Feed and confirm vault-sourced rows appear.

6. Optional — verify the rust path actually ran (not Node fallback):
   ```bash
   sqlite3 ~/Library/Application\ Support/com.thoughtseed.teamforge/teamforge.db \
     "SELECT key, value FROM settings WHERE key = 'vault_sync_runtime';"
   ```
   Expected: either no row (default = "rust") or `value = "rust"`.

7. Bundle inspection (Tier 4, lightweight):
   ```bash
   find src-tauri/target/release/bundle/macos/TeamForge.app -name "*.mjs" 2>/dev/null
   ```
   Expected: `teamforge-vault-parity.mjs` is found (D-02 dual-path safety net
   still bundled).

VALIDATION.md task ID: `01-clean-path-app-run` — pending human sign-off.

## Tier 3 — Parity Verification (Rust output matches Node output)

**Status: PENDING HUMAN EXECUTION**

This tier requires the private `thoughtseed-labs` vault and cannot be run
in CI. The procedure below is recorded for the human releaser.

### Procedure

1. Set env vars (the human releaser knows the local paths):
   ```bash
   export THOUGHTSEED_VAULT_ROOT=/path/to/your/thoughtseed-labs
   export TF_WORKSPACE_ID=ws-xxxxxxxx
   ```

2. Run the Node baseline path with `--local-only --apply=false`:
   ```bash
   node scripts/teamforge-vault-parity.mjs \
     --local-only --apply=false \
     --vault-root "$THOUGHTSEED_VAULT_ROOT" \
     --workspace-id "$TF_WORKSPACE_ID" \
     --report /tmp/node-report.json
   ```

3. Run the Rust path via the `#[ignore]`-gated test:
   ```bash
   TEAMFORGE_VAULT_ROOT="$THOUGHTSEED_VAULT_ROOT" \
   TEAMFORGE_WORKSPACE_ID="$TF_WORKSPACE_ID" \
   TEAMFORGE_RUST_PARITY_REPORT_PATH=/tmp/rust-report.json \
   cargo test --manifest-path src-tauri/Cargo.toml \
     vault::parity::tests::rust_parity_diff_against_real_vault \
     -- --ignored --nocapture
   ```

4. Normalize and diff:
   ```bash
   jq -S 'walk(if type == "array" then sort_by(tostring) else . end)
          | del(.. | .lastModifiedAt? // empty)
          | del(.. | .filePath? // empty)
          | del(.. | .reportPath? // empty)' /tmp/node-report.json > /tmp/node-norm.json

   jq -S 'walk(if type == "array" then sort_by(tostring) else . end)
          | del(.. | .lastModifiedAt? // empty)
          | del(.. | .filePath? // empty)
          | del(.. | .reportPath? // empty)' /tmp/rust-report.json > /tmp/rust-norm.json

   diff /tmp/node-norm.json /tmp/rust-norm.json
   ```

   Expected outcomes:
   - **Best:** Zero diff.
   - **Acceptable:** Diffs limited to known-deferred fields (TF-46) or type
     mismatches (int vs string) documented below.
   - **Block ship:** Counts disagree; `creates`/`updates` disagree
     non-trivially; any of the four `*Failures` arrays exists in one report
     and not the other; `mode` field missing.

VALIDATION.md task ID: `01-real-vault-diff` — pending human sign-off.

## Tier 4 — Bundle Inspection

| Check | Command | Expected Result |
|-------|---------|---------------|
| Node script bundled (D-02 safety net) | `find src-tauri/target/release/bundle/macos/TeamForge.app -name "*.mjs"` | finds `teamforge-vault-parity.mjs` |
| Bundle product version | `PlistBuddy ... CFBundleShortVersionString` | `0.2.6` |
| Bundle identifier | `PlistBuddy ... CFBundleIdentifier` | `com.thoughtseed.teamforge` |

*Note: Tier 4 is folded into the Tier 2 manual procedure above.*

## Tier 5 — Release Pre-Tag

Re-ran the Tier 1 commands after verification to confirm no regression.
All exit 0.

Files at v0.2.6 (sentinel for any future tag):
- `package.json` line :3 — `"version": "0.2.6"`
- `src-tauri/tauri.conf.json` line :3 — `"version": "0.2.6"`
- `src-tauri/Cargo.toml` `[package]` block — `version = "0.2.6"`
- `src-tauri/Cargo.lock` `team-forge-ts` package — `0.2.6`
- `README.md` — `## New In v0.2.6` and version pointers at lines :104, :162, :163

## Manual-Only Verification Sign-Off

| Behavior | Verifier | Date | Result |
|----------|----------|------|--------|
| Clean-PATH founder-sync run | human releaser | pending | PENDING |
| Node-vs-Rust parity diff against real vault | human releaser | pending | PENDING |

## Locked Decisions Realized

- **D-01** (native Rust importer): `src-tauri/src/vault/parity.rs` ships
  ~3000 LOC including tests; replaces `node scripts/teamforge-vault-parity.mjs`
  as the default. Verified by Tier 1 `cargo test --lib` (71 passed).
- **D-02** (dual-path with v0.2.1 kill date): `vault_sync_runtime` setting
  wired in `commands/mod.rs`; default `"rust"`; `"node"` falls back to the
  bundled script. Kill deferred until a post-v0.2.6 release after Phase 2
  verifies parity against real data.
- **D-03** (full parity, all 4 note families): project briefs, client
  profiles, onboarding flows, employee KPI notes all ported. Verified by
  Tier 1 fixture test `rust_parity_run_against_fixture_vault`; Tier 3
  against real vault pending human execution.
- **D-04** (preserve JSON-on-disk report contract): `commands/mod.rs:2708-2805`
  parser unchanged; Rust producer emits Node-compatible shape.
  Regression-locked by `report_struct_serializes_to_node_compatible_json` test.
- **D-05** (straight to stable): no beta channel. v0.2.0 shipped to stable;
  v0.2.6 continues on stable.
- **D-06** (cross-AI peer review): captured in `01-REVIEWS.md` between
  `/gsd:plan-phase 1` and `/gsd:execute-phase 1`.

## Sign-Off

- [x] Tier 1 passed (automated).
- [ ] Tier 2 passed (pending human execution).
- [ ] Tier 3 passed (pending human execution).
- [x] Tier 4 procedure documented.
- [x] Tier 5 pre-tag commands re-run green.
- [x] `01-VERIFICATION.md` written and matches this artifact.
- [x] All version files at 0.2.6; `Cargo.lock` already at 0.2.6.
- [ ] Ready for human releaser to execute Tier 2 + Tier 3 and update this
  artifact with results.
