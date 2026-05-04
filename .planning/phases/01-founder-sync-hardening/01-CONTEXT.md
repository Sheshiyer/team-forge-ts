# Phase 1: Founder Sync Hardening — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Issue:** [#45](https://github.com/Sheshiyer/team-forge-ts/issues/45)

<domain>
## Phase Boundary

Productize the Settings-based founder vault sync so TeamForge.app runs end-to-end on a clean macOS install with **no `node` on PATH**, while preserving:

- Settings-based UX and the Local Workspace status model.
- Canonical parity behavior for **all four note families**: project briefs, client profiles, onboarding flows, employee KPI notes.
- The Cloudflare Worker / D1 wire format (no schema changes).
- OTA-shipped builds — no `../scripts/...` repo-checkout assumptions at runtime.

This phase clarifies HOW founder sync runs, not WHAT it syncs.
</domain>

<decisions>
## Implementation Decisions

### Runtime path (the architectural fork)
- **D-01:** **Native Rust importer.** Port `scripts/teamforge-vault-parity.mjs` (~2778 LOC) to a new `src-tauri/src/vault/parity.rs` module. No external Node runtime. No bundled Node sidecar.
  - **Why this won:** Smallest bundle delta. OTA-safe by default. Single-language backend. Bundle / signing surface argument is one-way — shipping Node-in-bundle is hard to take back. Porting forces a parity-rules audit that pays off in Phase 2 (#46 backfill). Aligns with `tasks/lessons.md` lesson 31 (prefer direct REST against stable endpoint contracts already proven in this repo).
  - **Pattern to copy:** `WorkerEnvelope<T>` at `src-tauri/src/sync/teamforge_worker.rs:20-24`; the existing `reqwest`-based `fetch_teamforge_project_graphs` / `fetch_teamforge_client_profiles` / `fetch_teamforge_onboarding_flows` calls in the same file.
  - **Spec authority during port:** `scripts/teamforge-vault-parity.mjs` is the canonical spec until Rust parity is verified.

### Migration cadence — dual-path with kill date (Claude's call, captured for downstream)
- **D-02:** Keep the Node script bundled and accessible for **one release** as a silent fallback. Add a `vault_sync_runtime` setting (values: `"rust"` (default) | `"node"`) so it's a flip-of-a-switch revert if anything goes wrong post-ship. **Kill date: v0.2.1** — when Phase 2 (#46 vault backfill) verifies the Rust path against real data, the Node script and the setting come out together.
  - **Why dual-path:** rollout is straight to stable per user decision; one-release safety net is cheap and matches the v0.1 release-cadence posture.
  - **Why short kill window:** a permanent fallback grows surface; this isn't a long-term hedge, it's a one-release safety belt.

### Scope of port — full parity (Claude's call, captured for downstream)
- **D-03:** Port **all four note families** in Phase 1: project briefs, client profiles, onboarding flows, employee KPI notes.
  - The phase boundary already mandates canonical parity for all four; MVP-only would be a scope cut, not a scope clarification.
  - This includes the workspace_id fallback logic at `teamforge-vault-parity.mjs:865-878`, project payload shape at `:1403`, and onboarding/agent-feed payload at `:1701-1777`.

### Report contract — preserve JSON-on-disk shape initially (Claude's call, captured for downstream)
- **D-04:** Keep the existing JSON-on-disk report contract that Rust currently reads back from Node. The new Rust path writes the same shape; only the producer changes. Drop the temp-file dance / refactor IPC payload in v0.2.x as a separate cleanup, **not in this phase**.
  - **Why:** minimum-blast-radius replacement at the call site (`src-tauri/src/commands/mod.rs:2681-2702`); easier dual-path (D-02) since both producers emit the same shape; Settings UI / Local Workspace status code paths untouched.

### Rollout posture
- **D-05:** Ship Phase 1 directly to **stable channel** at v0.2.0. No beta bake. (User decision.)

### Cross-AI peer review
- **D-06:** Invoke `/gsd:review --phase 1 --all` after `/gsd:plan-phase 1` and before `/gsd:execute-phase 1`. Independent Gemini + Codex reads on the architectural call. Capture in `01-REVIEWS.md`. (User decision.)

### Claude's Discretion
- Exact `Cargo.toml` markdown-frontmatter crate selection (likely `gray_matter` or `serde_yaml` + minimal frontmatter parser); researcher will recommend.
- Exact Rust module layout inside `src-tauri/src/vault/` — single `parity.rs` vs sub-files per note family.
- Exact `eprintln!` log surface during the port — match `sync/teamforge_worker.rs` cadence.
- Whether the Node script stays in `bundle.resources` after kill date or migrates to `scripts/_legacy/` (revisit at v0.2.1).
- Settings UI affordance (if any) for `vault_sync_runtime` — default behavior is invisible; only surface if Rust path errors during the dual-path window.
</decisions>

<specifics>
## Specific Ideas

- **`gsd:review --phase 1 --all`** is mandatory before execute. The point of Phase 1 being the GSD pilot is to validate that the discuss → research → plan → review loop catches blind spots; skipping review defeats the experiment.
- **Spec preservation:** `scripts/teamforge-vault-parity.mjs` should be treated as a frozen reference doc during the port. Any behavior the Rust path doesn't match → flag in `01-VERIFICATION.md` rather than silently diverge.
- **Test posture:** mirror the existing inline `#[cfg(test)] mod tests` pattern in `src-tauri/src/sync/teamforge_worker.rs` and `src-tauri/src/db/queries.rs`. No new test framework. No new test directory.
- **No new core integrations.** Phase 1 changes only the founder-sync runtime; it does not introduce new SaaS connectors.
- **Verification anchor (matches CHANGELOG style):** `cargo fmt`, `cargo check`, `cargo test --lib`, `pnpm build`, plus a manual founder-sync run on a Mac with `node` removed from PATH.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher + planner) MUST read these before producing artifacts.**

### Founder sync runtime
- `scripts/teamforge-vault-parity.mjs` — current Node implementation; **the spec**. Hot lines: workspace_id fallback `:865-878`, project payload `:1403`, agent-feed / onboarding payload `:1701-1777`.
- `src-tauri/src/commands/mod.rs:2638` — `sync_local_vault_to_teamforge` Tauri command (current call site).
- `src-tauri/src/commands/mod.rs:2681-2702` — the Node shell-out block to be replaced.
- `src-tauri/src/commands/mod.rs:1677` — `resolve_parity_script_path` (bundled-resource resolver pattern; mirror for the dual-path setting).
- `src-tauri/src/commands/mod.rs:1661-1675` — repo-checkout fallback paths (must be removed for OTA-safety after kill date).
- `src-tauri/src/vault.rs` (1163 LOC) — existing local Obsidian vault filesystem reader; will become `src-tauri/src/vault/mod.rs` to make room for `parity.rs`.

### Wire format & contracts
- `src-tauri/src/sync/teamforge_worker.rs` — Rust HTTP-client pattern to copy. `WorkerEnvelope<T>` at `:20-24`. Existing `fetch_teamforge_project_graphs / fetch_teamforge_client_profiles / fetch_teamforge_onboarding_flows` are the canonical Worker call sites.
- `cloudflare/worker/src/routes/v1.ts` — exposed `/v1/projects`, `/v1/client-profiles/:id`, `/v1/onboarding-flows`, `/v1/employee-kpi-*` endpoints. **Wire format frozen for Phase 1.**
- `docs/architecture/contracts/` — authoritative wire-format and security contracts. Consult before any payload change. Phase 1 must not modify these.

### Tauri / packaging
- `src-tauri/tauri.conf.json:53-57` — current `bundle.resources` declaration for the Node script. Updates here drive the dual-path and the eventual deletion at v0.2.1.
- `src-tauri/Cargo.toml` — Rust deps. Phase 1 likely adds a frontmatter crate (researcher to recommend).
- `src-tauri/migrations/001_initial.sql` + `ensure_*_columns` pattern in `src-tauri/src/db/queries.rs:32-93` — pattern for adding the `vault_sync_runtime` settings key (just a `settings` row, no schema change).

### Skills the planner / executor should consult
- `understanding-tauri-process-model` — confirms the choice (Rust core, no sidecar growth).
- `calling-rust-from-tauri-frontend` — IPC pattern (no IPC changes here, but useful for verification).
- `rust-coding-skill` — idiomatic Rust style guidance.
- `testing-tauri-apps` — for the inline-test posture this repo uses.
- `signing-tauri-apps` — relevant only because the Rust path *removes* a signing concern (the Node binary that would have been added in Option B).

### Phase boundaries / requirements
- `.planning/REQUIREMENTS.md` — SYNC-01 (this phase) and SYNC-02 (next phase, do not bleed scope).
- `.planning/ROADMAP.md` — Phase 1 success criteria 1-5.
- `.planning/PROJECT.md` — constraint: "Founder-installable: app must run on a clean founder Mac without requiring a separate Node runtime on PATH."

### Codebase map (already produced)
- `.planning/codebase/ARCHITECTURE.md` §"Data Flow — Founder-Sync Vault Parity" — the as-is flow.
- `.planning/codebase/STRUCTURE.md` §"Issue #45 — replace the Node founder-sync importer with Rust" — exact module-layout recommendation.
- `.planning/codebase/CONCERNS.md` §"Founder sync runtime path (drives #45)" — the architectural fork that this CONTEXT.md resolves.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`WorkerEnvelope<T>` deserializer + reqwest pattern** at `src-tauri/src/sync/teamforge_worker.rs:20-24`. Direct copy target for the Rust importer's HTTP layer.
- **`fetch_teamforge_project_graphs` / `fetch_teamforge_client_profiles` / `fetch_teamforge_onboarding_flows`** in the same file — the Rust importer should not re-implement these reads; it builds on top of them.
- **`resolve_parity_script_path` pattern** at `src-tauri/src/commands/mod.rs:1677` — mirror for any bundled-resource lookup the Rust path needs (probably none, but useful template).
- **Settings table + `set_setting` / `get_setting`** at `src-tauri/src/db/queries.rs` — used as-is to store `vault_sync_runtime`. No new schema.
- **`get_local_workspace_status`** command — UI must keep working unchanged; Rust path produces the same `LocalVaultSyncReport` shape.
- **`summarize_sync_failures`** at `src-tauri/src/commands/mod.rs:1789` — existing failure-reporting helper; reuse for the Rust path's report.

### Established Patterns
- **Single 12 KLOC `commands/mod.rs`** — Phase 1 stays inside it; do **not** split. (Locked in PROJECT.md "Out of Scope".)
- **`Result<T, String>` from every Tauri command** — keep this; do not introduce typed errors.
- **`eprintln!` for logs** — keep; no log crate.
- **Inline `#[cfg(test)] mod tests`** — keep; no new test directory.
- **`ensure_*_columns` for additive schema migrations** — relevant if any new columns appear (none expected for Phase 1).

### Integration Points
- **Frontend Settings UI** at `src/pages/Settings.tsx` (Local Workspace block). Phase 1 should be invisible here unless Rust path errors during the dual-path window.
- **`useInvoke()` IPC contract** at `src/hooks/useInvoke.ts` — `syncLocalVaultToTeamforge` signature must not change.
- **Tray "Sync Now"** at `src-tauri/src/lib.rs:215` (`run_tray_sync`) — calls into `sync_local_vault_to_teamforge` indirectly via the credentials sync; verify it still works.
- **Tauri capabilities** at `src-tauri/capabilities/` — confirm no new capabilities needed for Rust filesystem reads (the existing `vault.rs` already does FS access; same surface).
</code_context>

<deferred>
## Deferred Ideas

These came up during discussion or are obvious adjacent work, but **belong outside Phase 1**:

- **Refactor `LocalVaultSyncReport` IPC payload to drop the temp-file dance.** Tracked for v0.2.x cleanup; not Phase 1.
- **Split `commands/mod.rs` into modules.** Out of scope per PROJECT.md; revisit at v0.3.
- **Migrate to typed Rust errors (`thiserror` enum).** Codebase convention is `Result<T, String>`; not Phase 1.
- **Beta channel rollout for v0.2.0.** User picked straight-to-stable; revisit only if Phase 2 / #46 verification reveals issues with the Rust path.
- **Permanent `vault_sync_runtime` setting.** D-02 caps it at one release; not a long-term feature.
- **Removing the Node script entirely.** Happens at v0.2.1, **after** Phase 2 verifies the Rust path against real-world data. Phase 1 ships with the script still bundled.
- **Worker-side validation of inbound vault payloads.** Out of scope; Worker / D1 wire format is frozen for Phase 1.
- **Adding founder-sync to CI.** Manual verification on a clean-PATH Mac is the v0.2.0 bar; CI integration deferred.

---

*Phase: 01-founder-sync-hardening*
*Context gathered: 2026-05-04*
</deferred>
