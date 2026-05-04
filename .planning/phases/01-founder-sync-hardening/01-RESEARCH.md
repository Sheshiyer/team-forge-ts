# Phase 1: Founder Sync Hardening — Research

**Researched:** 2026-05-04
**Domain:** Native Rust port of `scripts/teamforge-vault-parity.mjs` (markdown-frontmatter walker + Cloudflare Worker writer + JSON-on-disk report producer) into `src-tauri/src/vault/parity.rs`.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** **Native Rust importer.** Port `scripts/teamforge-vault-parity.mjs` (~2778 LOC) to a new `src-tauri/src/vault/parity.rs` module. No external Node runtime. No bundled Node sidecar.
  - Pattern to copy: `WorkerEnvelope<T>` at `src-tauri/src/sync/teamforge_worker.rs:20-24`; the existing `reqwest`-based `fetch_teamforge_project_graphs` / `fetch_teamforge_client_profiles` / `fetch_teamforge_onboarding_flows` calls in the same file.
  - Spec authority during port: `scripts/teamforge-vault-parity.mjs` is the canonical spec until Rust parity is verified.
- **D-02:** Keep the Node script bundled and accessible for **one release** as a silent fallback. Add a `vault_sync_runtime` setting (`"rust"` (default) | `"node"`). Kill date: **v0.2.1** — Node script and the setting come out together when Phase 2 verifies parity against real data.
- **D-03:** Port **all four note families** in Phase 1: project briefs, client profiles, onboarding flows, employee KPI notes. Includes workspace_id fallback at `teamforge-vault-parity.mjs:865-878`, project payload shape at `:1403`, onboarding/agent-feed payload at `:1701-1777`.
- **D-04:** Keep the existing JSON-on-disk report contract that Rust currently reads back from Node. The new Rust path writes the same shape; only the producer changes. Drop the temp-file dance in v0.2.x as a separate cleanup, not in this phase.
- **D-05:** Ship Phase 1 directly to **stable channel** at v0.2.0. No beta bake.
- **D-06:** Invoke `/gsd:review --phase 1 --all` after `/gsd:plan-phase 1` and before `/gsd:execute-phase 1`. Capture in `01-REVIEWS.md`.

### Claude's Discretion

- Exact `Cargo.toml` markdown-frontmatter crate selection (likely `gray_matter` or `serde_yaml` + minimal frontmatter parser); researcher to recommend.
- Exact Rust module layout inside `src-tauri/src/vault/` — single `parity.rs` vs sub-files per note family.
- Exact `eprintln!` log surface during the port — match `sync/teamforge_worker.rs` cadence.
- Whether the Node script stays in `bundle.resources` after kill date or migrates to `scripts/_legacy/` (revisit at v0.2.1).
- Settings UI affordance (if any) for `vault_sync_runtime` — default behavior is invisible; only surface if Rust path errors during the dual-path window.

### Deferred Ideas (OUT OF SCOPE)

- **Refactor `LocalVaultSyncReport` IPC payload to drop the temp-file dance.** Tracked for v0.2.x cleanup; not Phase 1.
- **Split `commands/mod.rs` into modules.** Out of scope per PROJECT.md; revisit at v0.3.
- **Migrate to typed Rust errors (`thiserror` enum).** Codebase convention is `Result<T, String>`; not Phase 1.
- **Beta channel rollout for v0.2.0.** User picked straight-to-stable; revisit only if Phase 2 / #46 verification reveals issues.
- **Permanent `vault_sync_runtime` setting.** D-02 caps it at one release.
- **Removing the Node script entirely.** Happens at v0.2.1, after Phase 2 verifies the Rust path against real-world data. Phase 1 ships with the script still bundled.
- **Worker-side validation of inbound vault payloads.** Out of scope; Worker / D1 wire format frozen for Phase 1.
- **Adding founder-sync to CI.** Manual verification on a clean-PATH Mac is the v0.2.0 bar.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SYNC-01** | TeamForge.app runs founder vault sync end-to-end on a clean Mac without any user-installed Node on PATH. Either a native Rust importer or a packaged Node sidecar; Settings-based UX preserved. Canonical parity behavior preserved for: project briefs, client profiles, onboarding flows, employee KPI notes. Local Workspace status model preserved. OTA-shipped builds must work — no `../scripts/...` repo-checkout assumptions. | §2 (`gray_matter` adds zero C deps; pure-Rust runtime). §4 (worker write surface mapped 1:1 from Node). §5 (report struct preserves JSON-on-disk contract per D-04). §6 (dual-path mechanic per D-02). §3 (module layout under `src-tauri/src/vault/`). §9 (verification ladder includes the "no node on PATH" acceptance test). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist at repo root (verified 2026-05-04). Operative constraints come from CONVENTIONS.md, TESTING.md, ARCHITECTURE.md, and `tasks/lessons.md`:

- **`commands/mod.rs` stays a single file** — out of scope per PROJECT.md to split. The new Tauri call site changes inline.
- **Every Tauri command returns `Result<T, String>`** — no typed errors, no `thiserror`, no `anyhow`. (CONVENTIONS.md §"Rust Style → Error handling"; current `sync_local_vault_to_teamforge` already returns `Result<LocalVaultSyncReport, String>`.)
- **`eprintln!("[module] …")` for logs** — no `log`/`tracing` crate. (CONVENTIONS.md §"Logging"; `sync/teamforge_worker.rs` does not log proactively, but if the importer logs progress it should follow `eprintln!("[vault-parity] …")`.)
- **Inline `#[cfg(test)] mod tests`** — no new test directory. (TESTING.md §"Test File Organization → Backend (Rust)".)
- **Additive schema migrations via `ensure_*_columns`** — no new numbered migration files. (Phase 1 expects no new SQLite columns; the `vault_sync_runtime` setting fits in the existing `settings` key/value table.)
- **`Result<T, sqlx::Error>` only at the migration/init boundary**; everything else normalizes to `Result<T, String>` before crossing the IPC line.
- **`#[derive(Debug, Clone, Serialize, Deserialize)]` is the default derive list** for DTOs; `#[serde(rename_all = "camelCase")]` on every cross-boundary struct; `#[serde(skip_serializing_if = "Option::is_none")]` on optional outbound fields. (CONVENTIONS.md §"Serde patterns".)
- **Lesson 31** — "When upstream SDK packages are transitively broken on npm, do not stall feature delivery on dependency firefighting; pivot immediately to a REST transaction path that uses stable endpoint contracts already proven in this repo." This is the lesson being applied: we are doubling down on the proven REST contract (`PUT /v1/project-mappings/:id`, `PUT /v1/client-profiles/:id`, `PUT /v1/onboarding-flows`) and removing the upstream Node runtime as a dependency.
- **Lesson 37** — Vault parity must inspect both `60-client-ecosystem` AND `50-team/*-kpi.md`. The Rust port preserves both.
- **Lesson 5 / 24 / 32** — verification authenticity: "sync succeeded" ≠ "page renders data". Verification ladder (§9) includes a Rust-vs-Node report diff and a real founder-sync run, not just `cargo test`.
- **Lesson 911 (todo.md:908-911)** — for OTA bundles, prove the runtime path with a live functional invocation, not a process check. Phase 1 verification must include `open TeamForge.app` on a clean-PATH Mac, not a unit test.

## Summary

The Node parity script (`scripts/teamforge-vault-parity.mjs`, 2778 LOC) is **mechanically simple and 100% portable to Rust**. It does five things:

1. Walks two vault subtrees (`60-client-ecosystem/`, `50-team/`) and filters six file-name patterns (`project-brief.md`, `client-profile.md`, `technical-spec.md`, `*-kpi.md`, plus `design/`, `research/`, `closeouts/`, `onboarding/` paths).
2. Parses YAML-lite frontmatter (a small subset — scalars, simple arrays, and one custom `external_refs: [{system, id}]` shape) and extracts H1 titles + named `## Section` blocks from the body.
3. Diffs against the Worker registry by `GET /v1/project-mappings?status=...` for six statuses.
4. Issues four families of writes against the Worker: `PUT /v1/project-mappings/:id`, `PUT /v1/client-profiles/:id`, `PUT /v1/onboarding-flows`, plus a **direct local SQLite write** for `employee_kpi_snapshots`.
5. Emits a single JSON report (the contract D-04 freezes) and exits.

**The repo already has every primitive needed:** `reqwest::Client` with `WorkerEnvelope<T>` deserialization (`sync/teamforge_worker.rs:20-24`), `bearer_auth`-based Worker calls (`sync/teamforge_worker.rs:728-770`), recursive `fs::read_dir` traversal (`vault.rs:715-745`), a working hand-rolled YAML-lite frontmatter parser (`vault.rs:428-486`), and a `settings` key/value table (`db/queries.rs`). **Only one new dependency is needed**, and it is small, pure-Rust, and MIT-licensed: `gray_matter 0.3.2`.

**Primary recommendation:** Add `gray_matter = { version = "0.3", default-features = false, features = ["yaml"] }` (pure-Rust, MIT, zero C deps), create `src-tauri/src/vault/{mod.rs, parity.rs}` (move existing `vault.rs` body to `vault/mod.rs`, no API change), implement `pub async fn run_vault_parity_apply(...) -> Result<LocalVaultSyncReport, String>` mirroring the Node script's main() flow, gate at the Tauri call site by `get_setting("vault_sync_runtime")` (default `"rust"`), keep the Node shell-out path intact for one release. **Top risk** is parity drift between Rust and Node on the JSON report shape — mitigated by a `Cargo.toml` test fixture diffing both producers against a frozen vault snapshot.

## Standard Stack

### Core (already in `src-tauri/Cargo.toml`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tokio` | 1 (full) | Async runtime | Tauri's native runtime; every existing async path uses it. |
| `reqwest` | 0.12 (json + rustls-tls) | HTTP client to Worker | Already the canonical Worker client; `bearer_auth`, `.json()`, `.timeout(...)` patterns established at `sync/teamforge_worker.rs:739-744`. |
| `serde` | 1 (derive) | DTO serialization | Repo standard. |
| `serde_json` | 1 | Report JSON I/O | Already used for the report read at `commands/mod.rs:2710`; producer side will use the same. |
| `sqlx` | 0.8 (runtime-tokio + sqlite) | Local DB writes for `employee_kpi_snapshots` | Replaces the script's `execFileSync("/usr/bin/sqlite3", ...)` shell-out. |
| `chrono` | 0.4 (serde) | `Utc::now().to_rfc3339()` for `imported_at` / `updated_at` columns | Already pulled in. |

### New (one dep)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **`gray_matter`** | **0.3.2** (released 2025-07-10) | Markdown frontmatter extraction | Pure Rust (deps: `serde`, `thiserror 2.0`, `yaml-rust2 0.10`); MIT; serde-deserialize directly into typed structs; battle-tested port of the JS `gray-matter` library. Default delimiters (`---`) match the script's frontmatter convention. Sources: [gray_matter on lib.rs](https://lib.rs/crates/gray_matter), [gray_matter on crates.io](https://crates.io/crates/gray_matter). |

**Add to `src-tauri/Cargo.toml`:**
```toml
gray_matter = { version = "0.3", default-features = false, features = ["yaml"] }
```

`default-features = false` to avoid pulling in `serde_json` (we already have it) and `toml` features we do not need; `features = ["yaml"]` is the only one this script's frontmatter format needs.

### Alternatives Considered

| Instead of `gray_matter` | Could Use | Tradeoff |
|--------------------------|-----------|----------|
| `gray_matter` | **Hand-roll** the YAML-lite parser (extend the existing `parse_frontmatter` at `vault.rs:428-486`) | **Viable, recommended fallback.** The existing parser handles scalars, simple `[a, b, c]` arrays, and nested map keys — which is **exactly** what the Node script's `parseFrontmatter` does. We'd extend it to also parse the `external_refs: [{system, id}]` list-of-maps shape (Node does this with a custom regex at `:169-178`, not real YAML). Saves one dependency at the cost of ~80 LOC of Rust we'd write anyway for the `## Section` body parser. **Recommend gray_matter as primary** because it gives us serde-typed access to frontmatter, but the hand-rolled fallback is a real option if cargo deps must stay frozen for OTA-bundle-size reasons. |
| `gray_matter` | `yaml-front-matter` (0.1.x) | Smaller surface area but stale (last release 2021); no serde integration story documented; only handles YAML. |
| `gray_matter` | `fronma` | Active but smaller community; same shape as `yaml-front-matter`. |
| `gray_matter` | `serde_yaml` (raw) | Would still need to write our own delimiter detection; loses the engine-trait abstraction. The official `serde_yaml` is also unmaintained as of 2024 — yaml-rust2 (which gray_matter pulls) is the actively maintained YAML parser. |
| `pulldown-cmark` for body parsing | Plain string scans (current Node approach) | The Node script does **not** use a real markdown parser — it splits on `^## ` regex (`teamforge-vault-parity.mjs:553-583`). We mirror that. Adding `pulldown-cmark` would be over-engineering for headers + bulleted lists + JSON-fenced code blocks. |

**Verification of versions** (run before merging — versions can drift between research and execution):

```bash
cargo info gray_matter
# OR (if cargo info is unavailable on the build host):
curl -sS https://crates.io/api/v1/crates/gray_matter | jq '.crate.max_stable_version'
```

Document the verified version in the plan's `## Decisions` block before BUILD.

**Installation:**
```bash
# Single new dep, no transitive C bindings, no version pinning concerns
cd src-tauri && cargo add gray_matter --no-default-features --features yaml
cargo check --manifest-path src-tauri/Cargo.toml
```

## Module Layout

Final tree under `src-tauri/src/vault/`:

```
src-tauri/src/vault/
├── mod.rs              # All current contents of src-tauri/src/vault.rs (1163 LOC) — moved verbatim, zero API change. The vault filesystem reader, validation, founder signals, team profile loader, capture registry — everything unrelated to parity.
└── parity.rs           # NEW. The native importer. Single file (~1200-1500 LOC estimated), structured as the Node script's main() flow:
                        #   - Public entry: pub async fn run_vault_parity_apply(pool, vault_root, workspace_id, worker_base_url, access_token, report_path) -> Result<LocalVaultSyncReport, String>
                        #   - Internal: fn walk_vault(...), normalize_project_brief(...), normalize_client_profile(...), normalize_kpi_note(...), normalize_onboarding_flow(...), normalize_project_artifact(...), build_request_body(...), put_project_mapping(...), put_client_profile(...), put_onboarding_flows(...), upsert_employee_kpi_snapshot(...), build_report(...), write_report(...).
                        #   - Inline #[cfg(test)] mod tests at the bottom: frontmatter parsing, status normalization, workspace_id fallback, payload shape construction, mergeArtifacts dedup logic.
```

**Why a single `parity.rs` file rather than `vault/parity/{briefs,profiles,onboarding,kpis}.rs`:**

1. The Node script keeps everything in one file because the parsers share helpers (`normalizeOptionalString`, `normalizeStringArray`, `normalizeKey`, `parseScalar`, `findExternalRefId`). Splitting forces those helpers into a sibling util module, which becomes a third file with no clear owner.
2. `commands/mod.rs` is 11.8 KLOC in one file by repo convention. A 1500-LOC `parity.rs` is small by comparison.
3. The single-file boundary makes the `#[cfg(test)] mod tests` block unambiguous: one module = one test pass.
4. If the file grows past ~2000 LOC, split into `parity/{mod.rs, briefs.rs, profiles.rs, onboarding.rs, kpis.rs}` at v0.2.x cleanup time — but defer.

**Migration of `src-tauri/src/vault.rs` to `src-tauri/src/vault/mod.rs`:**

| Current | After | Touch Count |
|---------|-------|-------------|
| `src-tauri/src/vault.rs` (1163 LOC) | `src-tauri/src/vault/mod.rs` (same 1163 LOC, byte-identical) | `git mv src-tauri/src/vault.rs src-tauri/src/vault/mod.rs` |
| `src-tauri/src/lib.rs:10` `mod vault;` | unchanged | 0 — Rust resolves `mod vault;` to either `vault.rs` or `vault/mod.rs`. |
| `src-tauri/src/commands/mod.rs:37` `use crate::vault;` | unchanged | 0 — module path is the same. |
| All callers of `vault::resolve_local_vault_root`, `vault::validate_vault_directory`, `vault::load_team_profiles`, `vault::load_founder_vault_signals`, `vault::LOCAL_VAULT_ROOT_SETTING_KEY`, `vault::VaultDirectoryValidation` | unchanged | 0 — public API surface is identical. |
| New `pub mod parity;` line in `vault/mod.rs` | added | 1 line. |
| New `use crate::vault::parity;` in `commands/mod.rs` | added at top | 1 line. |

**Total touch:** one `git mv`, two new lines. Zero risk of breaking existing vault read paths because nothing in `vault.rs` moves.

## Worker Write Surface

The four note families map to **three Worker endpoints** plus **one direct local SQLite write**. Wire format is locked by D-04 / `docs/architecture/contracts/`; the Rust importer mirrors the Node payload byte-for-byte.

| Family | Method + Path | Auth | Request Shape (top-level keys, snake/camel as observed in the Node script) | Response Shape (envelope-stripped) | Status Codes | Retry |
|--------|---------------|------|------------------------------------------------------------------------------|------------------------------------|--------------|-------|
| **Project briefs** | `PUT /v1/project-mappings/:targetProjectId` | Bearer (`cloud_credentials_access_token`) | `{ workspaceId, project: {name, slug, portfolioName, clientId, clientName, clockifyProjectId, projectType, status, visibility, syncMode}, githubLinks, hulyLinks, artifacts: [{artifactType, title, url, source, externalId, isPrimary}], policy, workspace_id (snake duplicate), name, code, slug, portfolio_name, client_id, client_name, clockify_project_id, project_type, status, visibility, sync_mode, external_ids: [{source, external_id}] }` — note the deliberate camel **and** snake fields living side-by-side at top level (see `teamforge-vault-parity.mjs:1400-1417`). The Worker accepts both shapes; the snake duplicates are a back-compat hedge that **must be preserved** byte-for-byte. | `{ project: WorkerProjectGraph }` | 200 OK on success; 400 `invalid_project_graph`; 503 `db_unavailable` (retryable). Worker: `cloudflare/worker/src/routes/projects.ts:357-379`. | None in current Node script. **Recommend Rust path keeps the same — one shot per project, accumulate failures into report.** |
| **Client profiles** | `PUT /v1/client-profiles/:clientId` | Bearer | `{ workspaceId, clientId, clientName, engagementModel, active, industry, primaryContact, onboarded, projectIds, stakeholders, strategicFit, risks, resourceLinks, tags, sourcePath }` — see `teamforge-vault-parity.mjs:1419-1443`. | `{ clientProfile, linkedProjects: [...] }` (from `getClientProfileDetail` follow-up read) | 200 OK; 400 `invalid_client_profile`; 503. Worker: `cloudflare/worker/src/routes/projects.ts:270-296`. | None. After PUT, the Node script does an immediate `GET /v1/client-profiles/:clientId?workspace_id=...` to verify (`teamforge-vault-parity.mjs:2423-2437`); **mirror this read-after-write in Rust** for the same `postApplyClientProfileVerification` block. |
| **Onboarding flows** | `PUT /v1/onboarding-flows` (workspace-scoped, **replaces full set**) | Bearer | `{ workspaceId, flows: [{ workspaceId, flowId, audience, owner, status, startsOn, tasks: [{taskId, title, completed, completedAt, resourceCreated, notes, position}], sourcePath, /* if family=client */ clientId, projectIds, primaryContact, workspaceReady, /* if family=employee */ memberId, manager, department, joinedOn }] }` — see `teamforge-vault-parity.mjs:1445-1509`. | `{ flows: [...], total }` | 200 OK; 400 `invalid_onboarding_flow`; 503. Worker: `cloudflare/worker/src/routes/projects.ts:314-333`. **Critical:** this is a full-set replace — if `--project` filter is on, the Node script disables onboarding apply entirely (`teamforge-vault-parity.mjs:2447-2457`) to avoid wiping unrelated workspace flows. **Rust path must replicate this guard.** | Read-after-write `GET /v1/onboarding-flows?workspace_id=...` to verify each flowId came back. |
| **Employee KPI snapshots** | **Local SQLite, not Worker.** `INSERT … ON CONFLICT(employee_id, kpi_version) DO UPDATE SET …` against `employee_kpi_snapshots` table in the local TeamForge DB. | None (local) | Row shape is the 28-column struct at `teamforge-vault-parity.mjs:1151-1182` (`buildEmployeeKpiRow`). | n/a | sqlx errors normalized to `Result<_, String>` per repo convention. | None — wrap in a single transaction per KPI note; failure goes into the report's `employeeKpiFailures` array. |

**Plus one read for the diff baseline:**

| Family | Method + Path | Notes |
|--------|---------------|-------|
| Existing project graphs | `GET /v1/project-mappings?status={status}` for each of `["active", "completed", "paused", "draft", "planning", "white-labelable"]` | `teamforge-vault-parity.mjs:1828-1842` (`loadExistingGraphs`). The script then merges the responses into `byId` / `bySlug` maps. The Rust importer does the same — **reuse the existing `fetch_worker_graphs(pool)` private function in `sync/teamforge_worker.rs:686-719` if visibility allows**, or duplicate it inside `parity.rs` (preferred — keeps `sync/teamforge_worker.rs` private surface unchanged). |

**Rust function surface to add inside `vault/parity.rs`** (mirror `fetch_teamforge_*` pattern from `sync/teamforge_worker.rs`):

```rust
// Internal HTTP helpers, all private to vault::parity.
async fn put_project_mapping(client: &reqwest::Client, base_url: &str, token: &str, project_id: &str, body: &serde_json::Value) -> Result<(), String> { ... }
async fn put_client_profile(client: &reqwest::Client, base_url: &str, token: &str, client_id: &str, body: &serde_json::Value) -> Result<serde_json::Value, String> { ... } // returns the detail body for verification
async fn put_onboarding_flows(client: &reqwest::Client, base_url: &str, token: &str, body: &serde_json::Value) -> Result<(), String> { ... }
async fn fetch_existing_project_graphs(client: &reqwest::Client, base_url: &str, token: &str) -> Result<RemoteGraphIndex, String> { ... }
async fn fetch_client_profile_detail(client: &reqwest::Client, base_url: &str, token: &str, client_id: &str, workspace_id: &str) -> Result<serde_json::Value, String> { ... }
async fn fetch_onboarding_flows(client: &reqwest::Client, base_url: &str, token: &str, workspace_id: &str) -> Result<serde_json::Value, String> { ... }
```

Each helper builds a URL by string concatenation against `base_url.trim_end_matches('/')` (mirroring `sync/teamforge_worker.rs:670-672`), uses `bearer_auth(token)`, and `.timeout(Duration::from_secs(30))` (longer than the read-side 10s because vault PUTs can be slow on cold D1).

## Report Contract (D-04 Preservation)

The Node script writes a single JSON file at `--report <path>`; Rust currently **reads** that file at `commands/mod.rs:2708-2723` and pulls the following keys:

- `report.warnings: string[]` — every warning aggregated.
- `report.failures: [{ projectId, error }]`
- `report.clientProfileFailures: [{ clientId, relativePath?, error }]`
- `report.onboardingFlowFailures: [{ flowId?, relativePath?, error }]`
- `report.employeeKpiFailures: [{ memberId, error }]`
- `report.mode: "apply"|"dry-run"`
- `report.counts.{projectBriefsFound, creates, updates, clientProfilesFound, onboardingFlowsFound, employeeKpiNotesFound}`
- `report.clientProfileApplied: [...]` — array length used.
- `report.onboardingFlowApplied: [{flowIds: [...]}, ...]` — sum of flowIds lengths used.
- `report.employeeKpiApplied: [...]` — array length used.

**The Rust path must produce a JSON file containing AT MINIMUM the keys above** with the same shapes, so that `summarize_sync_failures` (`commands/mod.rs:1789-1855`), `json_array_len`, and `json_usize` (`commands/mod.rs:1765-1787`) keep working unchanged.

**Recommended Rust producer side — typed structs that serde-emit the exact JSON shape:**

```rust
// vault/parity.rs — mirrors the Node report 1:1.
// The struct field names use camelCase via serde rename so the on-disk JSON matches the Node output byte-for-byte.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParityReport {
    mode: String,                                   // "apply" — Phase 1 only invokes apply mode
    local_only: bool,                               // false from Tauri command path
    vault_root: String,
    worker_base_url: String,
    teamforge_db_path: String,                      // tauri::path::AppHandle::app_data_dir().join("teamforge.db")
    workspace_id: Option<String>,
    remote_warning: Option<String>,
    remote_shapes: Vec<String>,
    teamforge_db_warnings: Vec<String>,
    counts: ParityCounts,
    warnings: Vec<String>,
    projects: ProjectsReportSection,
    client_profiles: ClientProfilesReportSection,
    project_artifacts: ProjectArtifactsReportSection,
    onboarding_flows: OnboardingFlowsReportSection,
    employee_kpis: EmployeeKpisReportSection,
    operations: Vec<ProjectOperationSummary>,        // also emitted as a top-level alias by the Node script
    employee_kpi_operations: Vec<EmployeeKpiOperationSummary>,
    // Apply-mode-only fields (omitted when not in apply mode):
    #[serde(skip_serializing_if = "Option::is_none")] applied: Option<Vec<AppliedProject>>,
    #[serde(skip_serializing_if = "Option::is_none")] failures: Option<Vec<ProjectFailure>>,
    #[serde(skip_serializing_if = "Option::is_none")] client_profile_applied: Option<Vec<AppliedClientProfile>>,
    #[serde(skip_serializing_if = "Option::is_none")] client_profile_failures: Option<Vec<ClientProfileFailure>>,
    #[serde(skip_serializing_if = "Option::is_none")] post_apply_client_profile_verification: Option<VerificationBlock>,
    #[serde(skip_serializing_if = "Option::is_none")] onboarding_flow_applied: Option<Vec<AppliedOnboardingFlowGroup>>,
    #[serde(skip_serializing_if = "Option::is_none")] onboarding_flow_failures: Option<Vec<OnboardingFlowFailure>>,
    #[serde(skip_serializing_if = "Option::is_none")] post_apply_onboarding_flow_verification: Option<VerificationBlock>,
    #[serde(skip_serializing_if = "Option::is_none")] employee_kpi_applied: Option<Vec<AppliedEmployeeKpi>>,
    #[serde(skip_serializing_if = "Option::is_none")] employee_kpi_failures: Option<Vec<EmployeeKpiFailure>>,
    #[serde(skip_serializing_if = "Option::is_none")] post_apply_verification: Option<PostApplyProjectVerification>,
    #[serde(skip_serializing_if = "Option::is_none")] post_apply_kpi_verification: Option<VerificationBlock>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParityCounts {
    project_briefs_found: usize,
    creates: usize,
    updates: usize,
    statuses: serde_json::Map<String, serde_json::Value>,  // {"active": 5, "planning": 3, ...}
    duplicate_project_ids: usize,
    client_profiles_found: usize,
    client_profiles_ready: usize,
    client_profiles_ready_with_workspace: usize,
    project_artifacts_found: usize,
    project_artifacts_ready: usize,
    onboarding_flows_found: usize,
    onboarding_flows_ready: usize,
    onboarding_flows_ready_with_workspace: usize,
    onboarding_client_flows_found: usize,
    onboarding_employee_flows_found: usize,
    employee_kpi_notes_found: usize,
    employee_kpi_creates: usize,
    employee_kpi_updates: usize,
    employee_kpi_unresolved: usize,
}

// (Other struct definitions follow the same pattern — see Node script :2226-2367 for the full shape.)

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFailure { project_id: String, target_project_id: Option<String>, mode: String, error: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientProfileFailure { client_id: Option<String>, relative_path: String, error: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingFlowFailure { flow_id: Option<String>, audience: Option<String>, relative_path: String, error: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmployeeKpiFailure { member_id: String, employee_id: Option<String>, employee_name: Option<String>, mode: String, error: String }
```

**Critical fidelity points** (the report fields the Rust struct **must not drop** because Rust currently reads them, even if the human-readable summary line doesn't surface them):

1. `failures[].projectId` and `failures[].error` — read at `commands/mod.rs:1796-1802`.
2. `clientProfileFailures[].clientId` and `.error` — read at `commands/mod.rs:1810-1820`.
3. `onboardingFlowFailures[].flowId` and `.error` — read at `commands/mod.rs:1827-1837`.
4. `employeeKpiFailures[].memberId` and `.error` — read at `commands/mod.rs:1842-1850`.
5. `counts.projectBriefsFound`, `counts.creates`, `counts.updates`, `counts.clientProfilesFound`, `counts.onboardingFlowsFound`, `counts.employeeKpiNotesFound` — read via `json_usize`.
6. `clientProfileApplied`, `employeeKpiApplied` — array lengths read via `json_array_len`.
7. `onboardingFlowApplied[].flowIds` — array-of-arrays summed via the closure at `commands/mod.rs:2783-2797`.
8. `mode` — read at `commands/mod.rs:2772-2776`.

If any of these are missing or differently typed, the Rust call site will silently report `0` for that field — a parity drift that won't surface in `cargo test` but will surface in production. **§7 (test plan) addresses this with a fixture-based parity diff.**

## Dual-Path Mechanics

CONTEXT.md D-02 mandates a `vault_sync_runtime` setting (`"rust"` (default) | `"node"`) plumbed through the existing Tauri command. The implementation is a single `match` at the top of `sync_local_vault_to_teamforge`:

**Where to add the read:**

In `commands/mod.rs:2638-2702`, after the existing `read_local_workspace_status` and pre-flight checks (which validate vault root, workspace_id, access token), but **before** the temp report path allocation:

```rust
// At the top of sync_local_vault_to_teamforge, after the LocalWorkspaceStatus check.
let runtime_choice = trimmed_setting_value(pool, "vault_sync_runtime")
    .await?
    .unwrap_or_else(|| "rust".to_string());

match runtime_choice.as_str() {
    "rust" => {
        // New native path: invoke vault::parity::run(...) directly.
        // Skips all node detection. Skips script_path resolution. Writes the same JSON report shape to the same temp path so the rest of the existing parsing code at :2710-2805 stays unchanged.
        crate::vault::parity::run_apply(
            pool,
            vault_root.as_str(),
            workspace_id.as_str(),
            status.worker_base_url.as_str(),
            access_token.as_str(),
            &report_path,
        ).await?;
        // node_runtime_version becomes "rust-native" (sentinel string for the report).
        let node_runtime_version = "rust-native".to_string();
        let script_source = "rust-native".to_string();
        let script_path = "(native rust)".to_string();
        // ... fall through to the existing report-parsing block at :2708-2805.
    }
    "node" => {
        // EXISTING path — unchanged. The block at :2681-2702 stays exactly as it is.
        // Pre-flight check that node_runtime_version is Some, parity_script_path is Some
        // (these checks already exist via founder_sync_ready in read_local_workspace_status).
    }
    other => {
        return Err(format!(
            "Unknown vault_sync_runtime setting '{other}'. Expected 'rust' or 'node'."
        ));
    }
}
```

**Critical subtlety — the pre-flight check (`founder_sync_ready` at `commands/mod.rs:1930-1935`) currently requires `node_runtime_error.is_none()` AND `parity_script_error.is_none()` AS PRECONDITIONS.** When `vault_sync_runtime = "rust"`, neither of these should block the sync. Recommended fix in `read_local_workspace_status`:

```rust
// Read the setting first.
let runtime_choice = trimmed_setting_value(pool, "vault_sync_runtime")
    .await?
    .unwrap_or_else(|| "rust".to_string());

// founder_sync_ready criteria depend on which runtime is selected.
let node_required = runtime_choice == "node";
let founder_sync_ready = local_vault_root.is_some()
    && vault_validation.status == "ready"
    && teamforge_workspace_id.is_some()
    && cloud_access_token_configured
    && (!node_required || parity_script_error.is_none())
    && (!node_required || node_runtime_error.is_none());
```

The blocker prose at `:1937-1963` should also branch — when `runtime_choice == "rust"`, omit the "Node not on PATH" / "parity script unavailable" blockers from the user-visible message.

**Settings UI affordance (CONTEXT.md says invisible by default):**

Phase 1 ships **no UI surface for `vault_sync_runtime`**. The setting is set/read via:

- Default value (`"rust"`) when the row does not exist — handled in code, not in DB.
- Manual override via the existing `settings` table — a founder who hits a Rust-path bug can run, in `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`:
  ```sql
  INSERT OR REPLACE INTO settings (key, value) VALUES ('vault_sync_runtime', 'node');
  ```
  This restores the Node fallback for one release without a code patch. Document this command in the v0.2.0 release notes as the safety belt.

The Settings UI MAY surface a future toggle in v0.2.x, but that is deferred per CONTEXT.md "Claude's Discretion".

**What the fallback path looks like at runtime:**

1. User installs v0.2.0. Default `vault_sync_runtime` = `"rust"` (no row in settings → code default).
2. Founder Sync runs. Native Rust path executes. JSON report written. Existing parsing code at `commands/mod.rs:2708-2805` reads the report unchanged.
3. **If Rust path errors:** founder sees a structured failure in the existing UI (no UI changes). Founder runs the SQL above. Next sync uses Node fallback.
4. **At v0.2.1 (post-Phase 2 verification):** the entire `match runtime_choice` block, the Node shell-out at `:2681-2702`, the `repo_parity_script_path` / `resolve_parity_script_path` / `detect_node_runtime_version` helpers, and the `tauri.conf.json:54` resource entry are all deleted in one PR.

**Bundled resource handling during dual-path window:**

`tauri.conf.json:53-57` keeps the Node script in `bundle.resources` for v0.2.0:
```json
"resources": {
  "../scripts/teamforge-vault-parity.mjs": "teamforge-vault-parity.mjs",
  ...
}
```
At v0.2.1 the entry is removed, the script is moved to `scripts/_legacy/` (per CONTEXT.md discretion), and the bundle shrinks by ~95 KB.

## Test Plan

Per repo convention (TESTING.md §"Test File Organization → Backend (Rust)"), all tests are inline `#[cfg(test)] mod tests { … }` at the bottom of `src-tauri/src/vault/parity.rs`. **No new test directory.** **No new test framework.**

### Tests to add inline in `vault/parity.rs`

| Test | Scope | Pattern |
|------|-------|---------|
| `parses_minimal_project_brief_frontmatter` | Pure parser | Static markdown string with `project_id`, `client_id`, `external_refs: [{system: clockify, id: 12345}]`. Assert struct fields normalized to expected shapes. |
| `normalizes_status_with_alias_table` | Pure | Test the 5 alias mappings (`in progress` → `active`, `cancelled` → `completed`, etc., from `:281-290`) and the `tags: [archived]` edge case. |
| `parses_external_refs_with_quoted_and_unquoted_values` | Pure | Both `{ system: clockify, id: 12345 }` and `{ system: "clockify-project", id: "abc" }` — match the regex shape at `:170-178`. |
| `workspace_id_falls_back_through_three_sources` | Pure | Frontmatter → CLI arg → env. Mirrors `:865-878`. |
| `builds_request_body_with_camel_and_snake_duplicates` | Pure | Construct a project record + payload + existingGraph. Assert the resulting body has BOTH `workspaceId` (camel) and `workspace_id` (snake), `name` (camel) and `code` (snake) — see `:1400-1417`. **Critical:** the Worker's `handlePutProjectMappings` at `routes/projects.ts:357-379` accepts both shapes; we must keep both. |
| `merges_artifacts_dedup_by_source_and_external_id` | Pure | Test `mergeArtifacts` (`:1310-1333`). Two artifacts with same source + same externalId → one merged. Different externalIds → both kept. |
| `kpi_employee_resolution_alias_exact_vs_prefix` | Pure | `resolveEmployeeForKpi` (`:959-994`) — three-tier match (exact → prefix → unresolved). Test all three branches. |
| `parses_yaml_section_inside_code_fence` | Pure | KPI body has `## KPI Contracts` with a fenced ```json block — test `parseJsonSection` (`:598-616`). |
| `onboarding_flow_apply_disabled_when_project_filter_active` | Pure | When `args.projects.size > 0`, all onboarding flows go to `onboardingFlowFailures` with the specific guard message. Mirrors `:2447-2457`. **Regression-locks the safety guard.** |
| `report_struct_serializes_to_node_compatible_json` | Pure | Build a `ParityReport` instance, serialize via `serde_json::to_string_pretty`, parse the result back as `serde_json::Value`. Assert all keys read by `summarize_sync_failures` (`commands/mod.rs:1789-1855`) and `json_usize` paths (`commands/mod.rs:2777-2799`) exist with expected types. **Regression-locks D-04.** |
| `kpi_snapshot_round_trips_through_sqlite` | Async + SQLite | Use the existing `unique_test_dir()` + `init_db(&dir)` pattern from `db/queries.rs:2298-2310`. Insert a synthetic KPI row via the Rust `upsert_employee_kpi_snapshot`. Re-read. Assert all 28 columns roundtrip. |

### Fixture vault

Create one minimal fixture vault under `src-tauri/tests-fixtures/vault-min/` (note: outside `src/` to avoid `cargo check` walking it as code):

```
src-tauri/tests-fixtures/vault-min/
├── 60-client-ecosystem/
│   └── acme-corp/
│       ├── client-profile.md          # Realistic frontmatter: client_id, client_name, engagement_model, active, project_ids
│       ├── project-brief.md           # client-engagement project with one external_ref to clockify
│       ├── technical-spec.md          # vault-technical-spec artifact
│       ├── design/
│       │   └── ux-flow.md             # vault-design-doc artifact
│       └── onboarding/
│           └── client-onboarding.md   # client onboarding flow with 3 tasks
└── 50-team/
    ├── alice-iyer-kpi.md              # member_id matches a fixture employee, with 1 monthlyKpi + 1 kpiContract
    └── onboarding/
        └── bob-employee-onboarding.md # employee onboarding with 2 tasks
```

This fixture is consumed by ONE integration-style test:

```rust
#[tokio::test]
async fn rust_parity_run_against_fixture_vault_emits_node_compatible_report() {
    let fixture_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests-fixtures/vault-min");

    let dir = unique_test_dir();
    let pool = init_db(&dir).await.expect("init db");
    // Pre-seed the employees table with one row matching alice-iyer-kpi.md
    sqlx::query("INSERT INTO employees (id, name, email, is_active) VALUES ('emp-001', 'Alice Iyer', 'alice@example.com', 1)")
        .execute(&pool).await.expect("seed employee");

    // Run the importer in DRY-RUN mode (no network calls — easier to assert).
    let report_path = dir.join("rust-report.json");
    crate::vault::parity::run_dry_run(
        &pool,
        fixture_root.to_str().unwrap(),
        "ws-test-001",
        "https://teamforge-api.invalid",  // dry-run does not hit the worker
        "fake-token",
        &report_path,
    ).await.expect("run parity");

    let report: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&report_path).expect("read report")
    ).expect("parse report");

    // Assert the SHAPE matches what commands/mod.rs:2777-2799 expects.
    assert_eq!(report["counts"]["projectBriefsFound"], 1);
    assert_eq!(report["counts"]["clientProfilesFound"], 1);
    assert_eq!(report["counts"]["projectArtifactsFound"], 2);  // technical-spec + design/ux-flow
    assert_eq!(report["counts"]["onboardingClientFlowsFound"], 1);
    assert_eq!(report["counts"]["onboardingEmployeeFlowsFound"], 1);
    assert_eq!(report["counts"]["employeeKpiNotesFound"], 1);
    assert_eq!(report["mode"], "dry-run");
    // ... and the fields summarize_sync_failures expects.
    assert!(report["warnings"].is_array());

    pool.close().await;
    let _ = std::fs::remove_dir_all(dir);
}
```

This test is the **canonical regression lock**: it proves the Rust path emits a Node-compatible JSON file against a real-shaped vault. **Suggest also exposing a `pub async fn run_dry_run(...)` entry point even though Phase 1's command path only invokes apply mode** — dry-run is what makes this test possible without mocking reqwest.

### Parity diff approach (manual verification, not automated)

For the v0.2.0 release verification step (mentioned in §9), run BOTH paths against the **same** vault and diff the resulting JSON reports:

```bash
# Run Node path against a frozen vault snapshot
node scripts/teamforge-vault-parity.mjs \
  --vault-root /path/to/thoughtseed-labs \
  --workspace-id $WS_ID \
  --report /tmp/node-report.json \
  --local-only           # skip remote diff so no apply happens

# Run Rust path against the same vault (dry-run)
cargo run --manifest-path src-tauri/Cargo.toml --bin parity-cli -- \
  --vault-root /path/to/thoughtseed-labs \
  --workspace-id $WS_ID \
  --report /tmp/rust-report.json \
  --dry-run

# Normalize both reports (sort arrays, strip timestamps, drop file paths) and diff
jq -S 'walk(if type == "array" then sort_by(tostring) else . end)
       | del(.. | .lastModifiedAt? // empty)
       | del(.. | .filePath? // empty)
       | del(.. | .reportPath? // empty)' /tmp/node-report.json > /tmp/node-norm.json
# (same jq expression for rust)
diff /tmp/node-norm.json /tmp/rust-norm.json
```

**Note on the `parity-cli` bin:** Cargo allows adding a `[[bin]]` entry that re-exports `vault::parity::run_dry_run` as a command-line tool — but this is **optional** and adds bundle size if not gated by `[[bin]] required-features = ["dev"]` or similar. Recommend: do this verification by writing a tiny `examples/parity_dry_run.rs` instead (cargo examples don't ship in the binary), or by adding a one-shot `#[ignore]`-gated test that runs against the real vault path with `cargo test --ignored parity_diff_against_real_vault -- --nocapture`. The `#[ignore]` test is more in line with the existing repo pattern (see `commands/mod.rs:11696,11762,11773`).

**The diff approach is the verification answer to the canonical question: "does the Rust path produce the same data as the Node path against the same input?"** It is NOT automated in CI (TESTING.md confirms there is no CI test gate), but it IS run by the human releaser before tagging v0.2.0, and the result is recorded in the `### Verification` block of `CHANGELOG.md`.

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Parity drift — Rust report shape diverges from Node** in subtle ways (missing optional field, different camelCase). The existing `commands/mod.rs:2708-2805` parser will silently report `0` for missing fields. Phase 2 (#46) backfill blocks on accurate counts. | High | High | The `report_struct_serializes_to_node_compatible_json` test (§7) regression-locks every key the Rust call site reads. Plus the manual Node-vs-Rust report diff at release time. Plus dual-path safety belt — if drift is caught post-ship, founder can flip back to Node via the `vault_sync_runtime` SQL setting in seconds. |
| **YAML-lite parser rejects a real-world frontmatter shape** the Node script accepts (e.g. multi-line strings, quoted unicode, deeply nested maps the script handles via custom regex). | Medium | Medium | The script's `parseFrontmatter` handles ONLY scalars + simple arrays + `external_refs` list-of-maps — there is no nested YAML in production vaults today. `gray_matter` handles all of these. **Mitigation:** the fixture vault test exercises the three real shapes; a `--vault-root /path/to/thoughtseed-labs` `#[ignore]` test against the real vault catches anything missed. If found, fall back to extending `vault.rs:428-486`'s hand-rolled parser. |
| **`employee_kpi_snapshots` table schema drift** between the Node script's `CREATE TABLE` (`teamforge-vault-parity.mjs:996-1028`) and what the Rust path needs. The script auto-creates the table on first run via `execFileSync("/usr/bin/sqlite3")`, including `ALTER TABLE` migrations for `contract_source_json` and `kpi_contracts_json`. | Medium | Medium | **The Rust path must include the same `CREATE TABLE IF NOT EXISTS` + `ensure_employee_kpi_columns()` logic.** Add this to `vault/parity.rs` as a private async function called once per `run_apply`. Pattern: mirror `db/queries.rs:32-93`'s `ensure_*_columns` style. The `001_initial.sql` migration does NOT contain this table — it is one of the bolted-on tables that lives only in the importer's setup. (This is a repo trap; see CONCERNS.md §"Migrations".) |
| **`PUT /v1/onboarding-flows` is workspace-scoped FULL REPLACE** — running Rust path against a vault that's missing flows the Worker has already accepted will WIPE them. The Node script protects against this with the `args.projects.size > 0` guard. | Low | Critical | The fixture test `onboarding_flow_apply_disabled_when_project_filter_active` regression-locks the guard. The Tauri command path does NOT pass a `--project` filter (it always runs the full set), so this risk is contained to the CLI fallback path which doesn't ship in v0.2.0. **Document the constraint loudly** in the public function's doc comment: "// CAUTION: PUT /v1/onboarding-flows replaces the FULL workspace set. Always invoke with the COMPLETE list of flows for the workspace." |
| **`reqwest::Client` not reused across requests** — the script builds one `fetch` call per record. In Rust, naively calling `Client::new()` for each PUT is wasteful (TLS handshake per call) and can exhaust connection pools on large vaults (50+ projects). | Low | Medium | Build ONE `reqwest::Client` at the top of `run_apply` and pass `&client` into every helper. Mirror `huly/client.rs:31` (`HulyClient.http`) — repo convention is one-client-per-flow. |
| **Bundle size regression** from adding `gray_matter` (which pulls `yaml-rust2`). | Low | Low | `gray_matter` + `yaml-rust2` is < 50 KB additional `.rlib`. Net effect: bundle SHRINKS at v0.2.1 when the 95 KB Node script comes out. Phase 1 net delta: ~30-50 KB heavier; Phase 2 net delta: ~50 KB lighter than v0.1.28. |
| **Non-UTF-8 file content in vault** — vault files are user-edited and can contain stray BOMs or invalid bytes. Node's `fs.readFile(..., "utf8")` is more forgiving than Rust's `std::fs::read_to_string` (which errors on invalid UTF-8). | Medium | Low | Use `std::fs::read(...)` then `String::from_utf8_lossy(&bytes).into_owned()` — same defensive pattern as `commands/mod.rs:1646-1648`'s `decode_shell_output`. Add a warning to `report.warnings` if any file required lossy decoding so it surfaces in Phase 2. |
| **Tauri command timeout / cold D1** — the Worker's D1 backend can be slow on cold-start, especially for the multi-status `GET /v1/project-mappings?status=...` loop (6 sequential calls). Default `reqwest::Client` has no timeout, but the existing helpers use 10s. | Low | Medium | Set `.timeout(Duration::from_secs(30))` on PUT calls, `.timeout(Duration::from_secs(15))` on GET diff calls. The full sync end-to-end takes ~15-30s today via Node — Rust should be in the same range. **Do NOT set a global timeout on the run** — accumulate per-call failures into the report and continue, exactly as the Node script does. |

**Top 5 by combined likelihood × impact:**
1. Parity drift on report shape (#1).
2. KPI table schema drift (#3).
3. YAML-lite parser edge cases (#2).
4. Non-UTF-8 vault content (#7).
5. reqwest connection pooling (#5).

## Verification Ladder

Exact commands and exit criteria for Phase 1 completion. Mirrors CHANGELOG `### Verification` style.

### Tier 1 — Local correctness (must pass before merging the implementation PR)

```bash
# 1. Format
cargo fmt --manifest-path src-tauri/Cargo.toml
# Exit criterion: zero diff after running.

# 2. Typecheck — zero warnings allowed (matches v0.1.28 baseline reset; do not regress).
cargo check --manifest-path src-tauri/Cargo.toml
# Exit criterion: 0 errors, 0 warnings.

# 3. Default test suite — vault::parity::tests must run and pass.
cargo test --manifest-path src-tauri/Cargo.toml --lib
# Exit criterion: all tests pass; ignored count >= 3 (matches v0.1.28's 43/0/3 baseline).
# Targeted run for fast iteration:
cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests -- --nocapture

# 4. Frontend typecheck + build (validates IPC contract not broken).
pnpm build
# Exit criterion: TypeScript compiles; Vite emits dist/ without errors.

# 5. Whitespace hygiene.
git diff --check
# Exit criterion: no stray whitespace / merge markers.
```

### Tier 2 — Native runtime acceptance (THE acceptance criterion for SYNC-01)

```bash
# Build the .app bundle locally (signing-skip is fine; verify-by-execution).
cargo tauri build --bundles app
# Exit criterion: TeamForge.app produced under src-tauri/target/release/bundle/macos/.

# THE TEST — verify the app runs without node on PATH.
PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/node\|/nvm\|/homebrew/bin\|/.local/share/mise' | paste -sd:) which node
# Exit criterion: 'which node' returns nothing (PATH temporarily strips node).
open /path/to/TeamForge.app
# Open Settings → Local Workspace. Click "Sync vault". 
# Exit criterion: Founder Sync runs to completion. UI shows non-zero project_briefs_found, client_profiles_found, etc. No error toast.
```

This is the **literal acceptance test** for issue #45. Per `tasks/lessons.md:6`, verify via `open TeamForge.app` (LaunchServices), NOT by directly executing `TeamForge.app/Contents/MacOS/TeamForge` — direct exec inherits the parent shell PATH and would defeat the test.

### Tier 3 — Parity verification (Rust output matches Node output)

```bash
# Set PATH back to include node for this step.
# Run Node path with --report flag against the production vault.
node scripts/teamforge-vault-parity.mjs \
  --local-only --apply=false \
  --vault-root "$THOUGHTSEED_VAULT_ROOT" \
  --workspace-id "$TF_WORKSPACE_ID" \
  --report /tmp/node-report.json

# Run Rust path via the #[ignore]-gated test against the same vault.
TEAMFORGE_VAULT_ROOT="$THOUGHTSEED_VAULT_ROOT" \
TEAMFORGE_WORKSPACE_ID="$TF_WORKSPACE_ID" \
TEAMFORGE_RUST_PARITY_REPORT_PATH=/tmp/rust-report.json \
cargo test --manifest-path src-tauri/Cargo.toml \
  vault::parity::tests::rust_parity_diff_against_real_vault \
  -- --ignored --nocapture

# Diff (with the jq normalization shown in §7).
jq -S 'walk(if type == "array" then sort_by(tostring) else .end)
       | del(.. | .lastModifiedAt? // empty)
       | del(.. | .filePath? // empty)
       | del(.. | .reportPath? // empty)' /tmp/node-report.json > /tmp/node-norm.json
jq -S 'walk(if type == "array" then sort_by(tostring) else .end)
       | del(.. | .lastModifiedAt? // empty)
       | del(.. | .filePath? // empty)
       | del(.. | .reportPath? // empty)' /tmp/rust-report.json > /tmp/rust-norm.json
diff /tmp/node-norm.json /tmp/rust-norm.json
# Exit criterion: zero diff, OR the only diffs are explainable (e.g. integer 5 vs "5" string casts) and documented in 01-VERIFICATION.md.
```

### Tier 4 — Bundle inspection (no repo paths leak into runtime)

```bash
# After cargo tauri build, inspect the bundle for references to ../scripts/...
strings src-tauri/target/release/bundle/macos/TeamForge.app/Contents/MacOS/TeamForge \
  | grep -E '\.\./scripts/|repo_parity_script|CARGO_MANIFEST_DIR' \
  || echo "OK: no repo paths in bundle"
# Exit criterion: when vault_sync_runtime defaults to 'rust', the bundle should NOT
# reference the dev-checkout fallback at runtime. (The strings ARE present in the binary
# because the dual-path code is still compiled; the criterion is "the rust path
# does not invoke them at runtime", which is verified by Tier 2 above.)

# Inspect bundle resource manifest (Phase 1 keeps the script bundled; Phase 2 removes).
ls src-tauri/target/release/bundle/macos/TeamForge.app/Contents/Resources/_up_/scripts/
# Exit criterion (v0.2.0): teamforge-vault-parity.mjs is present (dual-path).
# Exit criterion (v0.2.1): teamforge-vault-parity.mjs is absent.
```

### Tier 5 — Release verification (final pre-tag)

```bash
# Match the canonical CHANGELOG ### Verification block. Exact same commands as v0.1.28 plus the new ones above.
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm build
# Plus Tier 2 (clean-PATH founder-sync) and Tier 3 (parity diff) — those go in the CHANGELOG block too.
git diff --check
```

**Recorded in:**
- `tasks/todo.md` `## Review` block (Verification list).
- `CHANGELOG.md` `### Verification` block under v0.2.0.
- `01-VERIFICATION.md` (the GSD phase verification artifact).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Standard Rust test harness (`cargo test`); async tests use `#[tokio::test]` (Tokio is in `[dependencies]` already with `features = ["full"]`). No new test framework. |
| Config file | None — the existing `[lib]` configuration in `src-tauri/Cargo.toml:6-8` is sufficient. |
| Quick run command | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests -- --nocapture` |
| Full suite command | `cargo test --manifest-path src-tauri/Cargo.toml --lib` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | YAML-lite frontmatter parser handles project-brief, client-profile, KPI, onboarding shapes | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::parses -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Status normalization aliases (`in progress` → `active`, etc.) | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::normalizes_status_with_alias_table -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | workspace_id fallback (frontmatter → CLI arg → env, mirroring `:865-878`) | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::workspace_id_falls_back -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Project request body has BOTH camelCase and snake_case duplicate fields (mirroring `:1400-1417`) | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::builds_request_body_with_camel_and_snake_duplicates -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | `mergeArtifacts` dedup by source + externalId | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::merges_artifacts_dedup_by_source_and_external_id -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | KPI employee resolution (alias.exact / alias.prefix / alias.unresolved branches from `:959-994`) | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::kpi_employee_resolution -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Onboarding flow apply guard when `--project` filter is active | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::onboarding_flow_apply_disabled_when_project_filter_active -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Report struct serializes to Node-compatible JSON shape (regression-locks D-04) | unit | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::report_struct_serializes_to_node_compatible_json -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | KPI snapshot round-trips through SQLite (`employee_kpi_snapshots` schema) | integration | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::kpi_snapshot_round_trips_through_sqlite -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Rust dry-run against fixture vault emits Node-compatible report JSON | integration | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::rust_parity_run_against_fixture_vault -- --nocapture` | ❌ Wave 0 |
| SYNC-01 | Rust path against the REAL thoughtseed-labs vault matches Node path output | integration (live) | `cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests::rust_parity_diff_against_real_vault -- --ignored --nocapture` | ❌ Wave 0 |
| SYNC-01 | TeamForge.app on a clean-PATH Mac runs founder-sync to completion | manual-only | `open TeamForge.app` then click "Sync vault" in Settings (Tier 2 of §9). **Justification:** Tauri WebView IPC + macOS LaunchServices behavior cannot be exercised by `cargo test`; this is the literal acceptance criterion of issue #45 and must be verified by a human at the packaged-app level. | ✅ (existing UI; new verification step) |

### Sampling Rate

- **Per task commit:** `cargo fmt --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml vault::parity::tests -- --nocapture`
- **Per wave merge:** `cargo test --manifest-path src-tauri/Cargo.toml --lib && pnpm build && git diff --check`
- **Phase gate:** Full suite green (`cargo test --lib` + `pnpm build`), Tier 2 manual founder-sync run on clean-PATH Mac, Tier 3 parity diff against real vault — all recorded in `01-VERIFICATION.md` and the `CHANGELOG.md` v0.2.0 `### Verification` block — before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `src-tauri/src/vault/parity.rs` — covers SYNC-01 (the new module being created in Phase 1; tests are inline at the bottom of this file).
- [ ] `src-tauri/tests-fixtures/vault-min/` — fixture vault with 7 minimal markdown files described in §7. Used by `rust_parity_run_against_fixture_vault`.
- [ ] One pre-seeded employee row in the fixture's SQLite (created at test-setup time inside `rust_parity_run_against_fixture_vault` — does NOT need a separate fixture file).
- [ ] No new test framework install — `cargo` + `tokio` already present.
- [ ] No new shared fixtures crate — inline patterns mirror `db/queries.rs:2298-2331`.

## Sources

### Primary (HIGH confidence)

- `scripts/teamforge-vault-parity.mjs` — read line-by-line; the canonical spec. Hot lines verified: workspace_id fallback `:864-878`, project payload `:1400-1417`, onboarding payload `:1445-1487`, mergeArtifacts `:1310-1333`, employee KPI table SQL `:996-1028`, employee resolution `:959-994`, report shape `:2183-2367`, apply loop `:2369-2629`.
- `src-tauri/src/sync/teamforge_worker.rs` — read in full; the canonical Worker HTTP-client pattern. `WorkerEnvelope<T>` `:20-24`, `worker_url` `:665-680`, `worker_access_token` `:653-663`, `bearer_auth + .timeout(10s)` patterns `:739-744`.
- `src-tauri/src/commands/mod.rs:1645-1855, 2630-2805` — read; the existing call site, parser helpers (`json_array_len`, `json_usize`, `summarize_sync_failures`), and the `LocalVaultSyncReport` struct definition `:1582-1605`.
- `src-tauri/src/vault.rs:428-486, 715-745` — read; the existing hand-rolled YAML-lite frontmatter parser and recursive `fs::read_dir` traversal that the Rust port can extend or reference for style.
- `src-tauri/Cargo.toml` — read in full; confirms current deps and that no YAML/markdown parser is currently pulled in.
- `cloudflare/worker/src/routes/v1.ts` — read in full; mapped every PUT route the importer hits.
- `cloudflare/worker/src/routes/projects.ts:197-380` — read; confirmed PUT handler shapes (`handlePutProject`, `handlePutClientProfile`, `handlePutOnboardingFlows`, `handlePutProjectMappings`).
- `src-tauri/tauri.conf.json:53-57` — read; current bundle.resources entry for the Node script.
- `tasks/lessons.md:28-48` — read; confirmed lesson 31 (REST-over-SDK) is the operating principle.
- `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONCERNS,CONVENTIONS,TESTING}.md` — read in full; constitutes the project constraint set.
- `.planning/phases/01-founder-sync-hardening/01-CONTEXT.md` — read in full; D-01 through D-06 transcribed verbatim into `<user_constraints>`.
- `.planning/config.json` — read; `nyquist_validation: true`, `commit_docs: true`.

### Secondary (MEDIUM confidence)

- [gray_matter on lib.rs](https://lib.rs/crates/gray_matter) — confirmed v0.3.2 (2025-07-10), MIT, pure-Rust deps (`yaml-rust2`, `thiserror`), serde-deserialize via Engine trait.
- [gray_matter on crates.io](https://crates.io/crates/gray_matter) — package landing page (HIGH for existence; MEDIUM for transitive dep tree — verified via lib.rs which is the crates.io community mirror).

### Tertiary (LOW confidence — none)

No claims in this research rest on unverified web search alone. Every assertion about the codebase is grounded in a specific file:line read above; every assertion about `gray_matter` is grounded in the lib.rs page which mirrors crates.io metadata.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every recommendation grounded in either `Cargo.toml` (already present) or a single new dep with clean license + active maintenance + zero C deps.
- Architecture / module layout: **HIGH** — the `vault.rs → vault/mod.rs + vault/parity.rs` move is a one-line rename per Rust module-resolution rules; verified via grep that the only `crate::vault` consumer is `commands/mod.rs:37`.
- Worker write surface: **HIGH** — every endpoint cross-verified between Worker route handler signatures (`cloudflare/worker/src/routes/projects.ts`) and Node-script call sites (`teamforge-vault-parity.mjs`).
- Report contract: **HIGH** — every key the Rust call site reads is explicitly enumerated; the producer struct preserves all of them.
- Dual-path mechanics: **HIGH** — single `match` at the call site with one new setting; no schema change; no IPC change.
- Test plan: **HIGH** — mirrors existing `db/queries.rs` SQLite test pattern and `huly/naming.rs` pure-fn test pattern; one new fixture directory.
- Risk register: **MEDIUM** — top 3 risks (parity drift, KPI table schema drift, YAML edge cases) are validated; the rest are operational and already mitigated by repo conventions.
- Verification ladder: **HIGH** — Tier 1 mirrors v0.1.28's CHANGELOG; Tiers 2-5 are derived from issue #45's literal acceptance text.
- Validation Architecture: **HIGH** — every requirement → test mapping references a specific Node-script line range.

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days — Cargo registry contents and Worker API contracts are both stable surfaces; D-04 freezes the report contract for the duration of Phase 1).

## RESEARCH COMPLETE
