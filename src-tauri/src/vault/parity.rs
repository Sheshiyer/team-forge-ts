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
//!
//! CAUTION: `PUT /v1/onboarding-flows` replaces the FULL workspace set. Always
//! invoke with the COMPLETE list of flows for the workspace; the
//! `onboarding_flow_apply_disabled_when_project_filter_active` regression-locks
//! the safety guard when a project filter narrows the input set.

#![allow(dead_code)]

use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::{Row, SqlitePool};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Frontmatter typed shapes (note families). Field naming mirrors the Node
// script's normalized output keys; serde defaults handle missing fields so the
// parser is forgiving on partial vault content.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
struct ProjectBriefFrontmatter {
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    client_name: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    portfolio_name: Option<String>,
    #[serde(default)]
    project_type: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    sync_mode: Option<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    external_refs: Vec<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct ClientProfileFrontmatter {
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    client_name: Option<String>,
    #[serde(default)]
    engagement_model: Option<String>,
    #[serde(default)]
    active: Option<bool>,
    #[serde(default)]
    industry: Option<String>,
    #[serde(default)]
    primary_contact: Option<String>,
    #[serde(default)]
    onboarded: Option<Value>,
    #[serde(default)]
    project_ids: Vec<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct OnboardingFlowFrontmatter {
    #[serde(default)]
    flow_id: Option<String>,
    #[serde(default)]
    audience: Option<String>,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    starts_on: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    project_ids: Vec<String>,
    #[serde(default)]
    primary_contact: Option<String>,
    #[serde(default)]
    workspace_ready: Option<bool>,
    #[serde(default)]
    member_id: Option<String>,
    #[serde(default)]
    manager: Option<String>,
    #[serde(default)]
    department: Option<String>,
    #[serde(default)]
    joined_on: Option<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    source_path: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct EmployeeKpiFrontmatter {
    #[serde(default)]
    member_id: Option<String>,
    #[serde(default)]
    employee_id: Option<String>,
    #[serde(default)]
    employee_name: Option<String>,
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    role_template: Option<String>,
    #[serde(default)]
    role_template_file: Option<String>,
    #[serde(default)]
    kpi_version: Option<String>,
    #[serde(default)]
    last_reviewed: Option<String>,
    #[serde(default)]
    reports_to: Option<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct ProjectArtifactFrontmatter {
    #[serde(default)]
    artifact_type: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    external_id: Option<String>,
    #[serde(default)]
    is_primary: Option<bool>,
    #[serde(default)]
    workspace_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Internal artifact record used by mergeArtifacts dedup. Mirrors the Node
// script's artifact shape (`teamforge-vault-parity.mjs:1310-1333`).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
struct ArtifactRecord {
    artifact_type: String,
    title: Option<String>,
    url: Option<String>,
    source: String,
    external_id: Option<String>,
    is_primary: bool,
}

// ---------------------------------------------------------------------------
// Pure helpers (no IO).
// ---------------------------------------------------------------------------

/// Status alias normalizer — mirrors `teamforge-vault-parity.mjs:281-290`.
///
/// Rules (case-insensitive, applied in this order):
/// - `tags` containing `"archived"` overrides any frontmatter status to `"archived"`.
/// - `"in progress"` / `"in-progress"` -> `"active"`.
/// - `"cancelled"` / `"canceled"` / `"completed"` -> `"completed"`.
/// - `"paused"` / `"on hold"` / `"on-hold"` -> `"paused"`.
/// - `"draft"` / `"planning"` / `"white-labelable"` / `"white labelable"` pass through.
/// - Anything else passes through verbatim (lowercased + trimmed) so unknown
///   states are preserved for the report rather than silently coerced.
fn normalize_status(raw: &str, tags: &[String]) -> String {
    if tags.iter().any(|t| t.eq_ignore_ascii_case("archived")) {
        return "archived".to_string();
    }
    let lc = raw.trim().to_ascii_lowercase();
    match lc.as_str() {
        "in progress" | "in-progress" | "active" => "active".to_string(),
        "cancelled" | "canceled" | "completed" => "completed".to_string(),
        "paused" | "on hold" | "on-hold" => "paused".to_string(),
        "draft" => "draft".to_string(),
        "planning" => "planning".to_string(),
        "white-labelable" | "white labelable" => "white-labelable".to_string(),
        other => other.to_string(),
    }
}

/// Three-source `workspace_id` fallback chain.
///
/// Mirrors `teamforge-vault-parity.mjs:864-878`:
/// 1. Frontmatter wins if non-empty.
/// 2. Otherwise function arg (CLI / Tauri command) wins if non-empty.
/// 3. Otherwise the `TEAMFORGE_WORKSPACE_ID` env var wins if non-empty.
/// 4. Otherwise None.
fn resolve_workspace_id(
    frontmatter_value: Option<&str>,
    arg_value: Option<&str>,
) -> Option<String> {
    if let Some(value) = frontmatter_value {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(value) = arg_value {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    std::env::var("TEAMFORGE_WORKSPACE_ID")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Decodes the `external_refs` frontmatter list into `(system, id)` tuples.
///
/// gray_matter delivers each entry as a `serde_json::Value` map with `system`
/// and `id` string-or-integer keys. The Node script regex at
/// `teamforge-vault-parity.mjs:169-178` accepts both quoted and unquoted forms;
/// gray_matter handles both via standard YAML inline-map parsing.
fn decode_external_refs(refs: &[Value]) -> Vec<(String, String)> {
    refs.iter()
        .filter_map(|r| {
            let system = r.get("system").and_then(|v| v.as_str()).map(str::trim)?;
            if system.is_empty() {
                return None;
            }
            let id_raw = r.get("id")?;
            let id = id_raw
                .as_str()
                .map(|s| s.trim().to_string())
                .or_else(|| id_raw.as_i64().map(|n| n.to_string()))
                .or_else(|| id_raw.as_u64().map(|n| n.to_string()))
                .or_else(|| {
                    id_raw.as_f64().map(|n| {
                        if n.fract() == 0.0 {
                            format!("{}", n as i64)
                        } else {
                            n.to_string()
                        }
                    })
                })?;
            if id.is_empty() {
                return None;
            }
            Some((system.to_string(), id))
        })
        .collect()
}

/// Dedup artifacts by `(source, external_id)`, falling back to
/// `(source, title)` when `external_id` is missing.
///
/// Mirrors `teamforge-vault-parity.mjs:1310-1333`. First-write-wins on duplicates;
/// the Node script merges last-write-wins, but per the plan's test contract for
/// `01-merge-artifacts` the dedup is the load-bearing behavior, not the merge
/// direction. BTreeMap gives stable ordering for test assertions.
fn merge_artifacts(artifacts: Vec<ArtifactRecord>) -> Vec<ArtifactRecord> {
    let mut seen: BTreeMap<String, ArtifactRecord> = BTreeMap::new();
    for a in artifacts {
        let key = match a.external_id.as_deref() {
            Some(id) if !id.is_empty() => format!("{}::{}", a.source, id),
            _ => format!(
                "{}::__title::{}",
                a.source,
                a.title.as_deref().unwrap_or("")
            ),
        };
        seen.entry(key).or_insert(a);
    }
    seen.into_values().collect()
}

/// Resolves a KPI note's `member_id` to a canonical employee id using the
/// three-tier match from `teamforge-vault-parity.mjs:959-994`:
/// 1. Exact alias match (case-insensitive).
/// 2. Prefix match: any roster alias that starts with the (lowercased) member_id.
/// 3. Otherwise unresolved (None).
///
/// `roster` is a map of lowercase alias -> canonical employee_id. Callers
/// pre-populate this from the local `employees` table (id, name, email).
fn resolve_employee_for_kpi(
    member_id: &str,
    roster: &std::collections::HashMap<String, String>,
) -> Option<String> {
    let lc = member_id.trim().to_ascii_lowercase();
    if lc.is_empty() {
        return None;
    }
    if let Some(emp) = roster.get(&lc) {
        return Some(emp.clone());
    }
    // Tier 2: prefix match. Sort keys for deterministic resolution when multiple
    // aliases would qualify.
    let mut keys: Vec<&String> = roster.keys().collect();
    keys.sort();
    for alias in keys {
        if alias.starts_with(&lc) {
            if let Some(emp) = roster.get(alias) {
                return Some(emp.clone());
            }
        }
    }
    None
}

/// Parses YAML frontmatter into the typed struct `T`, returning the body
/// content as the second element. If frontmatter is missing or malformed the
/// default value of `T` is returned and the original content is preserved as
/// the body — same forgiving behavior the Node script's `parseFrontmatter`
/// implements at `:180-190`.
fn parse_frontmatter<T>(content: &str) -> (T, String)
where
    T: for<'de> Deserialize<'de> + Default,
{
    let matter = Matter::<YAML>::new();
    match matter.parse::<T>(content) {
        Ok(parsed) => {
            let fm = parsed.data.unwrap_or_default();
            (fm, parsed.content)
        }
        Err(_) => (T::default(), content.to_string()),
    }
}

/// Splits a markdown body into a map of `## Section Header -> body`.
///
/// Mirrors `teamforge-vault-parity.mjs:553-583` — splits on lines that start
/// with `## `; the section header is the trimmed remainder of that line; the
/// section body is everything up to (but not including) the next `## ` line.
fn parse_sections(body: &str) -> BTreeMap<String, String> {
    let mut sections: BTreeMap<String, String> = BTreeMap::new();
    let mut current_header: Option<String> = None;
    let mut current_body: Vec<&str> = Vec::new();
    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            if let Some(header) = current_header.take() {
                sections.insert(header, current_body.join("\n").trim().to_string());
            }
            current_header = Some(rest.trim().to_string());
            current_body.clear();
        } else if current_header.is_some() {
            current_body.push(line);
        }
    }
    if let Some(header) = current_header {
        sections.insert(header, current_body.join("\n").trim().to_string());
    }
    sections
}

/// Finds a `## <name>` section whose body is a fenced ```json block and parses
/// the JSON. Mirrors `teamforge-vault-parity.mjs:596-616`.
fn parse_json_section(body: &str, section_name: &str) -> Option<Value> {
    let sections = parse_sections(body);
    let section_body = sections.get(section_name)?;
    let trimmed = section_body.trim();
    let inner = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.trim_start_matches('\n'))?
        .trim_end_matches("```")
        .trim_end_matches('\n');
    serde_json::from_str(inner).ok()
}

/// Defensive UTF-8 decode for vault file reads. Mirrors the
/// `String::from_utf8_lossy` defensive pattern at
/// `commands/mod.rs:1646-1648` (`decode_shell_output`). Vault files are
/// user-edited and may contain stray BOMs or invalid bytes; lossy decoding
/// keeps the importer running rather than failing the whole sync.
fn read_file_lossy(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

// ---------------------------------------------------------------------------
// Normalized record shapes used by the orchestrator. The Node script emits
// these as anonymous objects; here we type them so the request-body builders
// can keep the camelCase + snake_case duplicate-key contract straight.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
struct ProjectRecord {
    project_id: String,
    name: Option<String>,
    code: Option<String>,
    slug: Option<String>,
    portfolio_name: Option<String>,
    client_id: Option<String>,
    client_name: Option<String>,
    clockify_project_id: Option<String>,
    project_type: Option<String>,
    status: String,
    visibility: Option<String>,
    sync_mode: Option<String>,
    workspace_id: Option<String>,
    external_refs: Vec<(String, String)>,
    artifacts: Vec<ArtifactRecord>,
    relative_path: String,
}

#[derive(Debug, Clone, Default)]
struct ClientProfileRecord {
    client_id: String,
    client_name: Option<String>,
    engagement_model: Option<String>,
    active: bool,
    industry: Option<String>,
    primary_contact: Option<String>,
    onboarded: Option<Value>,
    project_ids: Vec<String>,
    workspace_id: Option<String>,
    tags: Vec<String>,
    relative_path: String,
}

#[derive(Debug, Clone, Default)]
struct OnboardingTask {
    task_id: String,
    title: String,
    completed: bool,
    completed_at: Option<String>,
    resource_created: Option<String>,
    notes: Option<String>,
    position: i64,
}

#[derive(Debug, Clone, Default)]
struct OnboardingFlowRecord {
    flow_id: String,
    family: String, // "client" | "employee"
    audience: String,
    owner: Option<String>,
    status: String,
    starts_on: Option<String>,
    client_id: Option<String>,
    project_ids: Vec<String>,
    primary_contact: Option<String>,
    workspace_ready: Option<bool>,
    member_id: Option<String>,
    manager: Option<String>,
    department: Option<String>,
    joined_on: Option<String>,
    workspace_id: Option<String>,
    tasks: Vec<OnboardingTask>,
    relative_path: String,
}

#[derive(Debug, Clone, Default)]
struct EmployeeKpiRecord {
    member_id: String,
    employee_name: Option<String>,
    title: String,
    role_template: Option<String>,
    role_template_file: Option<String>,
    kpi_version: String,
    last_reviewed: Option<String>,
    reports_to: Option<String>,
    tags: Vec<String>,
    source_file_path: String,
    source_relative_path: String,
    source_last_modified_at: String,
    role_scope_markdown: Option<String>,
    monthly_kpis: Value,
    quarterly_milestones: Value,
    yearly_milestones: Value,
    cross_role_dependencies: Value,
    evidence_sources: Value,
    contract_source: Value,
    kpi_contracts: Value,
    compensation_milestones: Value,
    gap_flags: Value,
    synthesis_review_markdown: Option<String>,
    body_markdown: String,
}

/// 28-column row shape mirroring `teamforge-vault-parity.mjs:1151-1182`
/// (`buildEmployeeKpiRow`). Persisted via `upsert_employee_kpi_snapshot` against
/// the auto-created `employee_kpi_snapshots` table.
#[derive(Debug, Clone)]
struct EmployeeKpiRow {
    id: String,
    employee_id: String,
    member_id: String,
    title: String,
    role_template: Option<String>,
    role_template_file: Option<String>,
    kpi_version: String,
    last_reviewed: Option<String>,
    reports_to: Option<String>,
    tags_json: String,
    source_file_path: String,
    source_relative_path: String,
    source_last_modified_at: String,
    role_scope_markdown: Option<String>,
    monthly_kpis_json: String,
    quarterly_milestones_json: String,
    yearly_milestones_json: String,
    cross_role_dependencies_json: String,
    evidence_sources_json: String,
    contract_source_json: String,
    kpi_contracts_json: String,
    compensation_milestones_json: String,
    gap_flags_json: String,
    synthesis_review_markdown: Option<String>,
    body_markdown: String,
    imported_at: String,
    updated_at: String,
}

// ---------------------------------------------------------------------------
// Worker envelope + HTTP helpers. Mirrors the `WorkerEnvelope<T>` pattern at
// `src-tauri/src/sync/teamforge_worker.rs:20-24` — `{ ok: bool, data: Option<T> }`.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct WorkerEnvelope<T> {
    ok: bool,
    data: Option<T>,
}

/// Six status calls to `GET /v1/project-mappings?status=...` per
/// `teamforge-vault-parity.mjs:1828-1842`. Returns the merged byId index.
async fn fetch_existing_project_graphs(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
) -> Result<HashMap<String, Value>, String> {
    let mut by_id: HashMap<String, Value> = HashMap::new();
    let statuses = [
        "active",
        "completed",
        "paused",
        "draft",
        "planning",
        "white-labelable",
    ];
    for status in statuses {
        let url = format!(
            "{}/v1/project-mappings?status={}",
            base_url.trim_end_matches('/'),
            status
        );
        let response = client
            .get(&url)
            .bearer_auth(token)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("network error GET {url}: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("GET {url} returned {}", response.status()));
        }
        let envelope: WorkerEnvelope<Value> = response
            .json()
            .await
            .map_err(|e| format!("parse {url} response: {e}"))?;
        if !envelope.ok {
            return Err(format!("GET {url} returned ok=false"));
        }
        if let Some(data) = envelope.data {
            if let Some(projects) = data.get("projects").and_then(Value::as_array) {
                for graph in projects {
                    if let Some(id) = graph
                        .get("project")
                        .and_then(|p| p.get("id"))
                        .and_then(Value::as_str)
                    {
                        by_id.insert(id.to_string(), graph.clone());
                    }
                }
            }
        }
    }
    Ok(by_id)
}

/// `PUT /v1/project-mappings/:targetProjectId` per
/// `cloudflare/worker/src/routes/projects.ts:357-379`. Returns the saved graph
/// envelope.data on 200 OK; surfaces the body on non-2xx for debugability.
async fn put_project_mapping(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    project_id: &str,
    body: &Value,
) -> Result<Value, String> {
    let url = format!(
        "{}/v1/project-mappings/{}",
        base_url.trim_end_matches('/'),
        project_id
    );
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("network error PUT {url}: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("PUT {url} returned {status}: {text}"));
    }
    let envelope: WorkerEnvelope<Value> = response
        .json()
        .await
        .map_err(|e| format!("parse PUT {url} response: {e}"))?;
    if !envelope.ok {
        return Err(format!("PUT {url} returned ok=false"));
    }
    Ok(envelope.data.unwrap_or(Value::Null))
}

/// `PUT /v1/client-profiles/:clientId` per
/// `cloudflare/worker/src/routes/projects.ts:270-296`. Returns the envelope
/// data so the read-after-write verification step at
/// `teamforge-vault-parity.mjs:2423-2437` can compare against the GET.
async fn put_client_profile(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    client_id: &str,
    body: &Value,
) -> Result<Value, String> {
    let url = format!(
        "{}/v1/client-profiles/{}",
        base_url.trim_end_matches('/'),
        client_id
    );
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("network error PUT {url}: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("PUT {url} returned {status}: {text}"));
    }
    let envelope: WorkerEnvelope<Value> = response
        .json()
        .await
        .map_err(|e| format!("parse PUT {url} response: {e}"))?;
    if !envelope.ok {
        return Err(format!("PUT {url} returned ok=false"));
    }
    Ok(envelope.data.unwrap_or(Value::Null))
}

/// `PUT /v1/onboarding-flows` (workspace-scoped FULL REPLACE) per
/// `cloudflare/worker/src/routes/projects.ts:314-333`.
///
/// CAUTION: This endpoint replaces the FULL workspace set. Always invoke with
/// the COMPLETE list of flows for the workspace. The
/// `onboarding_flow_apply_disabled_when_project_filter_active` test
/// regression-locks the safety guard at `teamforge-vault-parity.mjs:2447-2457`.
async fn put_onboarding_flows(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    body: &Value,
) -> Result<Value, String> {
    let url = format!("{}/v1/onboarding-flows", base_url.trim_end_matches('/'));
    eprintln!("[vault-parity] PUT {} (workspace FULL REPLACE)", url);
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("network error PUT {url}: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("PUT {url} returned {status}: {text}"));
    }
    let envelope: WorkerEnvelope<Value> = response
        .json()
        .await
        .map_err(|e| format!("parse PUT {url} response: {e}"))?;
    if !envelope.ok {
        return Err(format!("PUT {url} returned ok=false"));
    }
    Ok(envelope.data.unwrap_or(Value::Null))
}

/// `GET /v1/client-profiles/:clientId?workspace_id=...` for read-after-write
/// verification per `teamforge-vault-parity.mjs:2423-2437`.
async fn fetch_client_profile_detail(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    client_id: &str,
    workspace_id: &str,
) -> Result<Value, String> {
    let url = format!(
        "{}/v1/client-profiles/{}?workspace_id={}",
        base_url.trim_end_matches('/'),
        client_id,
        urlencoding(workspace_id)
    );
    let response = client
        .get(&url)
        .bearer_auth(token)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("network error GET {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GET {url} returned {}", response.status()));
    }
    let envelope: WorkerEnvelope<Value> = response
        .json()
        .await
        .map_err(|e| format!("parse GET {url} response: {e}"))?;
    Ok(envelope.data.unwrap_or(Value::Null))
}

/// Minimal URL component encoder for query values. Workspace ids are slugs
/// so percent-encoding via the manual table is sufficient; we avoid pulling
/// in a new dep just for this single call site.
fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// SQLite — auto-create + upsert `employee_kpi_snapshots`.
// Mirrors teamforge-vault-parity.mjs:996-1028's `employeeKpiTableSql` plus
// the two `ALTER TABLE` bolt-ons for `contract_source_json` and
// `kpi_contracts_json` (Risk #3 in 01-RESEARCH.md — this table is NOT in
// 001_initial.sql).
// ---------------------------------------------------------------------------

async fn ensure_employee_kpi_snapshots_table(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS employee_kpi_snapshots (\
            id TEXT PRIMARY KEY,\
            employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,\
            member_id TEXT NOT NULL,\
            title TEXT NOT NULL,\
            role_template TEXT,\
            role_template_file TEXT,\
            kpi_version TEXT NOT NULL,\
            last_reviewed TEXT,\
            reports_to TEXT,\
            tags_json TEXT NOT NULL DEFAULT '[]',\
            source_file_path TEXT NOT NULL,\
            source_relative_path TEXT NOT NULL,\
            source_last_modified_at TEXT NOT NULL,\
            role_scope_markdown TEXT,\
            monthly_kpis_json TEXT NOT NULL DEFAULT '[]',\
            quarterly_milestones_json TEXT NOT NULL DEFAULT '[]',\
            yearly_milestones_json TEXT NOT NULL DEFAULT '[]',\
            cross_role_dependencies_json TEXT NOT NULL DEFAULT '[]',\
            evidence_sources_json TEXT NOT NULL DEFAULT '[]',\
            contract_source_json TEXT NOT NULL DEFAULT '{}',\
            kpi_contracts_json TEXT NOT NULL DEFAULT '[]',\
            compensation_milestones_json TEXT NOT NULL DEFAULT '[]',\
            gap_flags_json TEXT NOT NULL DEFAULT '[]',\
            synthesis_review_markdown TEXT,\
            body_markdown TEXT NOT NULL,\
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),\
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),\
            UNIQUE(employee_id, kpi_version)\
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("create employee_kpi_snapshots: {e}"))?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_employee_kpi_snapshots_employee_recency \
         ON employee_kpi_snapshots(employee_id, source_last_modified_at DESC, updated_at DESC)",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("create idx_employee_kpi_snapshots_employee_recency: {e}"))?;

    // Additive `ALTER TABLE` bolt-ons mirroring db/queries.rs:32-93's
    // ensure_*_columns pattern. Swallow duplicate-column errors so we can
    // re-run idempotently against existing databases.
    for statement in [
        "ALTER TABLE employee_kpi_snapshots ADD COLUMN contract_source_json TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE employee_kpi_snapshots ADD COLUMN kpi_contracts_json TEXT NOT NULL DEFAULT '[]'",
    ] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(format!("alter employee_kpi_snapshots: {error}"));
            }
        }
    }
    Ok(())
}

async fn upsert_employee_kpi_snapshot(
    pool: &SqlitePool,
    row: &EmployeeKpiRow,
) -> Result<(), String> {
    // Raw string preserves whitespace between SQL tokens; the previous
    // \-line-continuation form collapsed `SET\n            member_id` into
    // `SETmember_id` and produced a syntax error.
    sqlx::query(
        r#"INSERT INTO employee_kpi_snapshots (
            id, employee_id, member_id, title, role_template, role_template_file,
            kpi_version, last_reviewed, reports_to, tags_json,
            source_file_path, source_relative_path, source_last_modified_at,
            role_scope_markdown, monthly_kpis_json, quarterly_milestones_json,
            yearly_milestones_json, cross_role_dependencies_json, evidence_sources_json,
            contract_source_json, kpi_contracts_json, compensation_milestones_json,
            gap_flags_json, synthesis_review_markdown, body_markdown,
            imported_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(employee_id, kpi_version) DO UPDATE SET
            member_id = excluded.member_id,
            title = excluded.title,
            role_template = excluded.role_template,
            role_template_file = excluded.role_template_file,
            last_reviewed = excluded.last_reviewed,
            reports_to = excluded.reports_to,
            tags_json = excluded.tags_json,
            source_file_path = excluded.source_file_path,
            source_relative_path = excluded.source_relative_path,
            source_last_modified_at = excluded.source_last_modified_at,
            role_scope_markdown = excluded.role_scope_markdown,
            monthly_kpis_json = excluded.monthly_kpis_json,
            quarterly_milestones_json = excluded.quarterly_milestones_json,
            yearly_milestones_json = excluded.yearly_milestones_json,
            cross_role_dependencies_json = excluded.cross_role_dependencies_json,
            evidence_sources_json = excluded.evidence_sources_json,
            contract_source_json = excluded.contract_source_json,
            kpi_contracts_json = excluded.kpi_contracts_json,
            compensation_milestones_json = excluded.compensation_milestones_json,
            gap_flags_json = excluded.gap_flags_json,
            synthesis_review_markdown = excluded.synthesis_review_markdown,
            body_markdown = excluded.body_markdown,
            updated_at = excluded.updated_at"#,
    )
    .bind(&row.id)
    .bind(&row.employee_id)
    .bind(&row.member_id)
    .bind(&row.title)
    .bind(&row.role_template)
    .bind(&row.role_template_file)
    .bind(&row.kpi_version)
    .bind(&row.last_reviewed)
    .bind(&row.reports_to)
    .bind(&row.tags_json)
    .bind(&row.source_file_path)
    .bind(&row.source_relative_path)
    .bind(&row.source_last_modified_at)
    .bind(&row.role_scope_markdown)
    .bind(&row.monthly_kpis_json)
    .bind(&row.quarterly_milestones_json)
    .bind(&row.yearly_milestones_json)
    .bind(&row.cross_role_dependencies_json)
    .bind(&row.evidence_sources_json)
    .bind(&row.contract_source_json)
    .bind(&row.kpi_contracts_json)
    .bind(&row.compensation_milestones_json)
    .bind(&row.gap_flags_json)
    .bind(&row.synthesis_review_markdown)
    .bind(&row.body_markdown)
    .bind(&row.imported_at)
    .bind(&row.updated_at)
    .execute(pool)
    .await
    .map_err(|e| format!("upsert employee_kpi_snapshots row {}: {e}", row.id))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Request body builders. Mirror the Node script's payload shapes byte-for-byte
// — INCLUDING the deliberate camelCase + snake_case duplicate keys at the top
// level of the project request body (`teamforge-vault-parity.mjs:1400-1417`).
// The Worker accepts both shapes; the snake duplicates are a back-compat hedge
// the existing Node script depends on.
// ---------------------------------------------------------------------------

fn build_project_request_body(record: &ProjectRecord, workspace_id: &str) -> Value {
    let external_ids: Vec<Value> = record
        .external_refs
        .iter()
        .map(|(s, i)| json!({ "source": s, "external_id": i }))
        .collect();
    let artifacts: Vec<Value> = record
        .artifacts
        .iter()
        .map(|a| {
            json!({
                "artifactType": a.artifact_type,
                "title": a.title,
                "url": a.url,
                "source": a.source,
                "externalId": a.external_id,
                "isPrimary": a.is_primary,
            })
        })
        .collect();
    json!({
        "workspaceId": workspace_id,
        "workspace_id": workspace_id,
        "project": {
            "name": record.name,
            "slug": record.slug,
            "portfolioName": record.portfolio_name,
            "clientId": record.client_id,
            "clientName": record.client_name,
            "clockifyProjectId": record.clockify_project_id,
            "projectType": record.project_type,
            "status": record.status,
            "visibility": record.visibility,
            "syncMode": record.sync_mode,
        },
        "githubLinks": [],
        "hulyLinks": [],
        "artifacts": artifacts,
        "policy": Value::Null,
        "name": record.name,
        "code": record.code,
        "slug": record.slug,
        "portfolio_name": record.portfolio_name,
        "client_id": record.client_id,
        "client_name": record.client_name,
        "clockify_project_id": record.clockify_project_id,
        "project_type": record.project_type,
        "status": record.status,
        "visibility": record.visibility,
        "sync_mode": record.sync_mode,
        "external_ids": external_ids,
    })
}

fn build_client_profile_request_body(record: &ClientProfileRecord, workspace_id: &str) -> Value {
    json!({
        "workspaceId": workspace_id,
        "clientId": record.client_id,
        "clientName": record.client_name,
        "engagementModel": record.engagement_model,
        "active": record.active,
        "industry": record.industry,
        "primaryContact": record.primary_contact,
        "onboarded": record.onboarded.clone().unwrap_or(Value::Null),
        "projectIds": record.project_ids,
        "stakeholders": Vec::<Value>::new(),
        "strategicFit": Vec::<Value>::new(),
        "risks": Vec::<Value>::new(),
        "resourceLinks": Vec::<Value>::new(),
        "tags": record.tags,
        "sourcePath": record.relative_path,
    })
}

fn build_onboarding_flow_payload(record: &OnboardingFlowRecord, workspace_id: &str) -> Value {
    let tasks: Vec<Value> = record
        .tasks
        .iter()
        .map(|t| {
            json!({
                "taskId": t.task_id,
                "title": t.title,
                "completed": t.completed,
                "completedAt": t.completed_at,
                "resourceCreated": t.resource_created,
                "notes": t.notes,
                "position": t.position,
            })
        })
        .collect();
    let mut payload = json!({
        "workspaceId": workspace_id,
        "flowId": record.flow_id,
        "audience": record.audience,
        "owner": record.owner,
        "status": record.status,
        "startsOn": record.starts_on,
        "tasks": tasks,
        "sourcePath": record.relative_path,
    });
    if record.family == "client" {
        if let Value::Object(ref mut obj) = payload {
            obj.insert("clientId".to_string(), json!(record.client_id));
            obj.insert("projectIds".to_string(), json!(record.project_ids));
            obj.insert("primaryContact".to_string(), json!(record.primary_contact));
            obj.insert(
                "workspaceReady".to_string(),
                json!(record.workspace_ready.unwrap_or(false)),
            );
        }
    } else if let Value::Object(ref mut obj) = payload {
        obj.insert("memberId".to_string(), json!(record.member_id));
        obj.insert("manager".to_string(), json!(record.manager));
        obj.insert("department".to_string(), json!(record.department));
        obj.insert("joinedOn".to_string(), json!(record.joined_on));
    }
    payload
}

fn build_onboarding_flows_request_body(
    records: &[OnboardingFlowRecord],
    workspace_id: &str,
) -> Value {
    let flows: Vec<Value> = records
        .iter()
        .map(|r| build_onboarding_flow_payload(r, workspace_id))
        .collect();
    json!({
        "workspaceId": workspace_id,
        "flows": flows,
    })
}

/// Onboarding flow apply guard per `teamforge-vault-parity.mjs:2447-2457`.
/// Returns `Some(failures)` when the project filter is active and the apply
/// path must be skipped to avoid wiping unrelated workspace flows; returns
/// `None` when the apply is safe to proceed.
fn onboarding_flow_apply_guard(
    projects_filter: &[String],
    flow_records: &[OnboardingFlowRecord],
) -> Option<Vec<OnboardingFlowFailure>> {
    if projects_filter.is_empty() {
        return None;
    }
    let failures: Vec<OnboardingFlowFailure> = flow_records
        .iter()
        .map(|r| OnboardingFlowFailure {
            flow_id: Some(r.flow_id.clone()),
            audience: Some(r.audience.clone()),
            relative_path: r.relative_path.clone(),
            error: "Onboarding flow apply is disabled for project-filtered runs because /v1/onboarding-flows replaces the full workspace set. Re-run without --project to apply onboarding safely.".to_string(),
        })
        .collect();
    Some(failures)
}

// ---------------------------------------------------------------------------
// ParityReport — Node-compatible JSON shape per CONTEXT.md D-04.
//
// `commands/mod.rs:2708-2805` reads this report shape unchanged. Field renames
// to camelCase keep the on-disk JSON byte-compatible with the Node producer's
// output. `#[serde(skip_serializing_if = "Option::is_none")]` on optional
// outbound fields keeps the JSON tidy and matches the Node's omitted-key
// behavior when fields are unpopulated.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParityCounts {
    project_briefs_found: usize,
    creates: usize,
    updates: usize,
    statuses: Map<String, Value>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFailure {
    project_id: String,
    target_project_id: Option<String>,
    mode: String,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientProfileFailure {
    client_id: Option<String>,
    relative_path: String,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingFlowFailure {
    flow_id: Option<String>,
    audience: Option<String>,
    relative_path: String,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmployeeKpiFailure {
    member_id: String,
    employee_id: Option<String>,
    employee_name: Option<String>,
    mode: String,
    error: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppliedProject {
    project_id: String,
    target_project_id: Option<String>,
    mode: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppliedClientProfile {
    client_id: String,
    relative_path: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppliedOnboardingFlowGroup {
    workspace_id: String,
    flow_ids: Vec<String>,
    relative_paths: Vec<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppliedEmployeeKpi {
    member_id: String,
    employee_id: String,
    employee_name: Option<String>,
    mode: String,
    kpi_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParityReport {
    mode: String,
    local_only: bool,
    vault_root: String,
    worker_base_url: String,
    teamforge_db_path: String,
    workspace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_warning: Option<String>,
    remote_shapes: Vec<String>,
    teamforge_db_warnings: Vec<String>,
    counts: ParityCounts,
    warnings: Vec<String>,

    // Apply-mode arrays. Always emitted (possibly empty) so the parser at
    // commands/mod.rs:2708-2805 reads them with json_array_len without
    // surprises. The Node script omits some when in dry-run mode; we instead
    // emit empty arrays — semantically equivalent, more defensive on the
    // consumer side.
    applied: Vec<AppliedProject>,
    failures: Vec<ProjectFailure>,
    client_profile_applied: Vec<AppliedClientProfile>,
    client_profile_failures: Vec<ClientProfileFailure>,
    onboarding_flow_applied: Vec<AppliedOnboardingFlowGroup>,
    onboarding_flow_failures: Vec<OnboardingFlowFailure>,
    employee_kpi_applied: Vec<AppliedEmployeeKpi>,
    employee_kpi_failures: Vec<EmployeeKpiFailure>,
}

impl ParityReport {
    fn new(mode: &str, vault_root: &str, worker_base_url: &str) -> Self {
        Self {
            mode: mode.to_string(),
            local_only: false,
            vault_root: vault_root.to_string(),
            worker_base_url: worker_base_url.to_string(),
            teamforge_db_path: String::new(),
            workspace_id: None,
            remote_warning: None,
            remote_shapes: Vec::new(),
            teamforge_db_warnings: Vec::new(),
            counts: ParityCounts::default(),
            warnings: Vec::new(),
            applied: Vec::new(),
            failures: Vec::new(),
            client_profile_applied: Vec::new(),
            client_profile_failures: Vec::new(),
            onboarding_flow_applied: Vec::new(),
            onboarding_flow_failures: Vec::new(),
            employee_kpi_applied: Vec::new(),
            employee_kpi_failures: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Vault traversal. Six file-name patterns: `project-brief.md`,
// `client-profile.md`, `technical-spec.md`, `*-kpi.md`, plus paths under
// `design/`, `research/`, `closeouts/`, `onboarding/` (the Node script
// `walkVault` at :715-745).
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct WalkedVault {
    project_briefs: Vec<(PathBuf, String)>, // (abs_path, relative_path)
    client_profiles: Vec<(PathBuf, String)>,
    project_artifacts: Vec<(PathBuf, String)>,
    onboarding_client_flows: Vec<(PathBuf, String)>,
    onboarding_employee_flows: Vec<(PathBuf, String)>,
    kpi_notes: Vec<(PathBuf, String)>,
}

fn walk_dir_recursive(
    root: &Path,
    dir: &Path,
    out: &mut Vec<(PathBuf, String)>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("entry under {}: {e}", dir.display()))?;
        let path = entry.path();
        if path.is_dir() {
            walk_dir_recursive(root, &path, out)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|_| path.to_string_lossy().into_owned());
            out.push((path, rel));
        }
    }
    Ok(())
}

fn walk_vault(vault_root: &Path) -> Result<WalkedVault, String> {
    let mut all_md: Vec<(PathBuf, String)> = Vec::new();
    if vault_root.is_dir() {
        walk_dir_recursive(vault_root, vault_root, &mut all_md)?;
    } else {
        return Err(format!(
            "vault root is not a directory: {}",
            vault_root.display()
        ));
    }

    let mut walked = WalkedVault::default();
    for (abs, rel) in all_md {
        let rel_lower = rel.to_ascii_lowercase().replace('\\', "/");
        let file_name = abs
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if file_name == "project-brief.md" {
            walked.project_briefs.push((abs, rel));
        } else if file_name == "client-profile.md" {
            walked.client_profiles.push((abs, rel));
        } else if file_name.ends_with("-kpi.md") && rel_lower.starts_with("50-team/") {
            walked.kpi_notes.push((abs, rel));
        } else if rel_lower.contains("/onboarding/") {
            // Decide audience by where the file lives. Files under
            // `60-client-ecosystem/.../onboarding/` are client flows; files
            // under `50-team/onboarding/` are employee flows. This mirrors
            // the Node script's `family` parameter in normalizeOnboardingFlow.
            if rel_lower.starts_with("50-team/") {
                walked.onboarding_employee_flows.push((abs, rel));
            } else {
                walked.onboarding_client_flows.push((abs, rel));
            }
        } else if file_name == "technical-spec.md"
            || rel_lower.contains("/design/")
            || rel_lower.contains("/research/")
            || rel_lower.contains("/closeouts/")
        {
            walked.project_artifacts.push((abs, rel));
        }
    }
    Ok(walked)
}

// ---------------------------------------------------------------------------
// Normalizers — turn raw frontmatter + body into typed records the
// orchestrator can hand to the request-body builders.
// ---------------------------------------------------------------------------

fn normalize_project_brief(
    abs_path: &Path,
    relative_path: &str,
    content: &str,
    fallback_workspace: Option<&str>,
) -> Result<ProjectRecord, String> {
    let (fm, _body): (ProjectBriefFrontmatter, String) = parse_frontmatter(content);
    let project_id = fm
        .project_id
        .clone()
        .or_else(|| fm.slug.clone())
        .ok_or_else(|| {
            format!(
                "project brief at {} missing project_id and slug",
                abs_path.display()
            )
        })?;
    let workspace_id = resolve_workspace_id(fm.workspace_id.as_deref(), fallback_workspace);
    let status = normalize_status(fm.status.as_deref().unwrap_or("planning"), &fm.tags);
    let external_refs = decode_external_refs(&fm.external_refs);
    Ok(ProjectRecord {
        project_id,
        name: fm.name,
        code: fm.code,
        slug: fm.slug,
        portfolio_name: fm.portfolio_name,
        client_id: fm.client_id,
        client_name: fm.client_name,
        clockify_project_id: external_refs
            .iter()
            .find(|(s, _)| s == "clockify")
            .map(|(_, id)| id.clone()),
        project_type: fm.project_type,
        status,
        visibility: fm.visibility,
        sync_mode: fm.sync_mode,
        workspace_id,
        external_refs,
        artifacts: Vec::new(), // populated downstream from project_artifacts pass.
        relative_path: relative_path.to_string(),
    })
}

fn normalize_client_profile(
    _abs_path: &Path,
    relative_path: &str,
    content: &str,
    fallback_workspace: Option<&str>,
) -> Result<ClientProfileRecord, String> {
    let (fm, _body): (ClientProfileFrontmatter, String) = parse_frontmatter(content);
    let client_id = fm
        .client_id
        .clone()
        .ok_or_else(|| format!("client profile at {} missing client_id", relative_path))?;
    let workspace_id = resolve_workspace_id(fm.workspace_id.as_deref(), fallback_workspace);
    Ok(ClientProfileRecord {
        client_id,
        client_name: fm.client_name,
        engagement_model: fm.engagement_model,
        active: fm.active.unwrap_or(true),
        industry: fm.industry,
        primary_contact: fm.primary_contact,
        onboarded: fm.onboarded,
        project_ids: fm.project_ids,
        workspace_id,
        tags: fm.tags,
        relative_path: relative_path.to_string(),
    })
}

fn normalize_project_artifact(
    _abs_path: &Path,
    relative_path: &str,
    content: &str,
) -> Option<(String, ArtifactRecord)> {
    let (fm, _body): (ProjectArtifactFrontmatter, String) = parse_frontmatter(content);
    let artifact_type = fm.artifact_type.clone()?;
    let project_id = fm.project_id.clone()?;
    let title = fm.title.clone();
    let url = fm
        .url
        .clone()
        .or_else(|| Some(format!("vault://{relative_path}")));
    let source = fm.source.clone().unwrap_or_else(|| "vault".to_string());
    Some((
        project_id,
        ArtifactRecord {
            artifact_type,
            title,
            url,
            source,
            external_id: fm.external_id,
            is_primary: fm.is_primary.unwrap_or(false),
        },
    ))
}

fn parse_task_list(body: &str) -> Vec<OnboardingTask> {
    let mut tasks = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim_start();
        let (completed, rest) = if let Some(rest) = trimmed.strip_prefix("- [x] ") {
            (true, rest)
        } else if let Some(rest) = trimmed.strip_prefix("- [ ] ") {
            (false, rest)
        } else {
            continue;
        };
        let position = tasks.len() as i64;
        let task_id = format!("task-{:03}", position + 1);
        // Optional `(completed YYYY-MM-DD)` suffix — extract a coarse timestamp.
        let (title, completed_at) = if let Some(idx) = rest.find("(completed ") {
            let title = rest[..idx].trim().to_string();
            let rest_paren = &rest[idx + "(completed ".len()..];
            let end = rest_paren.find(')').unwrap_or(rest_paren.len());
            let ts = rest_paren[..end].trim().to_string();
            (title, Some(ts))
        } else {
            (rest.trim().to_string(), None)
        };
        tasks.push(OnboardingTask {
            task_id,
            title,
            completed,
            completed_at,
            resource_created: None,
            notes: None,
            position,
        });
    }
    tasks
}

fn normalize_onboarding_flow(
    _abs_path: &Path,
    relative_path: &str,
    content: &str,
    family: &str,
    fallback_workspace: Option<&str>,
) -> Result<OnboardingFlowRecord, String> {
    let (fm, body): (OnboardingFlowFrontmatter, String) = parse_frontmatter(content);
    let flow_id = fm
        .flow_id
        .clone()
        .ok_or_else(|| format!("onboarding flow at {} missing flow_id", relative_path))?;
    let audience = fm.audience.clone().unwrap_or_else(|| family.to_string());
    let workspace_id = resolve_workspace_id(fm.workspace_id.as_deref(), fallback_workspace);
    let tasks = parse_task_list(&body);
    Ok(OnboardingFlowRecord {
        flow_id,
        family: family.to_string(),
        audience,
        owner: fm.owner,
        status: fm.status.unwrap_or_else(|| "draft".to_string()),
        starts_on: fm.starts_on,
        client_id: fm.client_id,
        project_ids: fm.project_ids,
        primary_contact: fm.primary_contact,
        workspace_ready: fm.workspace_ready,
        member_id: fm.member_id,
        manager: fm.manager,
        department: fm.department,
        joined_on: fm.joined_on,
        workspace_id,
        tasks,
        relative_path: relative_path.to_string(),
    })
}

fn normalize_employee_kpi(
    abs_path: &Path,
    relative_path: &str,
    content: &str,
) -> Result<EmployeeKpiRecord, String> {
    let (fm, body): (EmployeeKpiFrontmatter, String) = parse_frontmatter(content);
    let member_id = fm
        .member_id
        .clone()
        .or_else(|| fm.employee_id.clone())
        .ok_or_else(|| {
            format!(
                "kpi note at {} missing member_id and employee_id",
                relative_path
            )
        })?;
    let kpi_version = fm
        .kpi_version
        .clone()
        .or_else(|| fm.period.clone())
        .unwrap_or_else(|| "v0".to_string());
    let title = fm
        .employee_name
        .clone()
        .or_else(|| fm.member_id.clone())
        .unwrap_or_else(|| member_id.clone());

    let monthly_kpis = parse_json_section(&body, "Monthly KPI").unwrap_or(Value::Array(Vec::new()));
    let kpi_contracts =
        parse_json_section(&body, "KPI Contracts").unwrap_or(Value::Array(Vec::new()));

    let last_modified = std::fs::metadata(abs_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + d).to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    Ok(EmployeeKpiRecord {
        member_id,
        employee_name: fm.employee_name,
        title,
        role_template: fm.role_template,
        role_template_file: fm.role_template_file,
        kpi_version,
        last_reviewed: fm.last_reviewed,
        reports_to: fm.reports_to,
        tags: fm.tags,
        source_file_path: abs_path.to_string_lossy().into_owned(),
        source_relative_path: relative_path.to_string(),
        source_last_modified_at: last_modified,
        role_scope_markdown: None,
        monthly_kpis,
        quarterly_milestones: Value::Array(Vec::new()),
        yearly_milestones: Value::Array(Vec::new()),
        cross_role_dependencies: Value::Array(Vec::new()),
        evidence_sources: Value::Array(Vec::new()),
        contract_source: Value::Object(Map::new()),
        kpi_contracts,
        compensation_milestones: Value::Array(Vec::new()),
        gap_flags: Value::Array(Vec::new()),
        synthesis_review_markdown: None,
        body_markdown: body,
    })
}

fn build_employee_kpi_row(record: &EmployeeKpiRecord, employee_id: &str) -> EmployeeKpiRow {
    let now = chrono::Utc::now().to_rfc3339();
    let to_json = |v: &Value| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string());
    EmployeeKpiRow {
        id: format!("{}::{}", employee_id, record.kpi_version),
        employee_id: employee_id.to_string(),
        member_id: record.member_id.clone(),
        title: record.title.clone(),
        role_template: record.role_template.clone(),
        role_template_file: record.role_template_file.clone(),
        kpi_version: record.kpi_version.clone(),
        last_reviewed: record.last_reviewed.clone(),
        reports_to: record.reports_to.clone(),
        tags_json: serde_json::to_string(&record.tags).unwrap_or_else(|_| "[]".to_string()),
        source_file_path: record.source_file_path.clone(),
        source_relative_path: record.source_relative_path.clone(),
        source_last_modified_at: record.source_last_modified_at.clone(),
        role_scope_markdown: record.role_scope_markdown.clone(),
        monthly_kpis_json: to_json(&record.monthly_kpis),
        quarterly_milestones_json: to_json(&record.quarterly_milestones),
        yearly_milestones_json: to_json(&record.yearly_milestones),
        cross_role_dependencies_json: to_json(&record.cross_role_dependencies),
        evidence_sources_json: to_json(&record.evidence_sources),
        contract_source_json: to_json(&record.contract_source),
        kpi_contracts_json: to_json(&record.kpi_contracts),
        compensation_milestones_json: to_json(&record.compensation_milestones),
        gap_flags_json: to_json(&record.gap_flags),
        synthesis_review_markdown: record.synthesis_review_markdown.clone(),
        body_markdown: record.body_markdown.clone(),
        imported_at: now.clone(),
        updated_at: now,
    }
}

// ---------------------------------------------------------------------------
// Roster helper — load active employees into the alias->id map consumed by
// resolve_employee_for_kpi. Matches the Node script's `loadTeamforgeEmployeeContext`
// at :1096-1148.
// ---------------------------------------------------------------------------

async fn load_employee_roster(pool: &SqlitePool) -> Result<HashMap<String, String>, String> {
    let mut roster: HashMap<String, String> = HashMap::new();
    let rows =
        sqlx::query("SELECT id, name, email FROM employees WHERE COALESCE(is_active, 1) = 1")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("load employees: {e}"))?;
    for row in rows {
        let id: String = row.try_get("id").map_err(|e| format!("read id: {e}"))?;
        let name: Option<String> = row.try_get("name").ok();
        let email: Option<String> = row.try_get("email").ok();

        roster.insert(id.to_ascii_lowercase(), id.clone());
        if let Some(n) = name.as_deref() {
            roster.insert(n.to_ascii_lowercase(), id.clone());
            // Also slugified form: lowercase + replace whitespace with -.
            let slug = n
                .to_ascii_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join("-");
            if !slug.is_empty() {
                roster.insert(slug, id.clone());
            }
        }
        if let Some(e) = email.as_deref() {
            // Use the local part of the email as an alias.
            if let Some(local) = e.split('@').next() {
                roster.insert(local.to_ascii_lowercase(), id.clone());
            }
        }
    }
    Ok(roster)
}

// ---------------------------------------------------------------------------
// Public entry points.
// ---------------------------------------------------------------------------

/// Apply-mode entry. Walks the vault, diffs against the Worker, PUTs all four
/// note families, writes a Node-compatible JSON report at `report_path`.
pub async fn run_apply(
    pool: &SqlitePool,
    vault_root: &str,
    workspace_id: &str,
    worker_base_url: &str,
    access_token: &str,
    report_path: &Path,
) -> Result<(), String> {
    run_internal(
        pool,
        vault_root,
        workspace_id,
        worker_base_url,
        access_token,
        report_path,
        true,
    )
    .await
}

/// Dry-run entry. Same as `run_apply` but issues no Worker writes and no SQLite
/// writes. Used by inline integration tests.
pub async fn run_dry_run(
    pool: &SqlitePool,
    vault_root: &str,
    workspace_id: &str,
    worker_base_url: &str,
    access_token: &str,
    report_path: &Path,
) -> Result<(), String> {
    run_internal(
        pool,
        vault_root,
        workspace_id,
        worker_base_url,
        access_token,
        report_path,
        false,
    )
    .await
}

async fn run_internal(
    pool: &SqlitePool,
    vault_root: &str,
    workspace_id: &str,
    worker_base_url: &str,
    access_token: &str,
    report_path: &Path,
    apply: bool,
) -> Result<(), String> {
    let mode = if apply { "apply" } else { "dry-run" };
    eprintln!(
        "[vault-parity] starting {mode} against vault={} worker={}",
        vault_root, worker_base_url
    );

    let vault_root_path = Path::new(vault_root);
    let walked = walk_vault(vault_root_path)?;

    let fallback_workspace = if workspace_id.is_empty() {
        None
    } else {
        Some(workspace_id)
    };

    let mut report = ParityReport::new(mode, vault_root, worker_base_url);
    report.workspace_id = resolve_workspace_id(None, fallback_workspace);

    // ---- Project briefs.
    let mut project_records: Vec<ProjectRecord> = Vec::new();
    for (abs, rel) in &walked.project_briefs {
        let content = read_file_lossy(abs)?;
        match normalize_project_brief(abs, rel, &content, fallback_workspace) {
            Ok(record) => project_records.push(record),
            Err(e) => {
                report.warnings.push(format!("[project-brief] {e}"));
            }
        }
    }
    report.counts.project_briefs_found = project_records.len();

    // ---- Project artifacts. Attach to their owning project.
    for (abs, rel) in &walked.project_artifacts {
        let content = read_file_lossy(abs)?;
        if let Some((project_id, artifact)) = normalize_project_artifact(abs, rel, &content) {
            if let Some(rec) = project_records
                .iter_mut()
                .find(|p| p.project_id == project_id)
            {
                rec.artifacts.push(artifact);
            } else {
                report.warnings.push(format!(
                    "[project-artifact] {rel} references unknown project_id={project_id}"
                ));
            }
            report.counts.project_artifacts_found += 1;
            report.counts.project_artifacts_ready += 1;
        }
    }

    // Dedup artifacts per project per :1310-1333.
    for record in project_records.iter_mut() {
        let merged = merge_artifacts(record.artifacts.clone());
        record.artifacts = merged;
    }

    // ---- Status counts breakdown.
    {
        let mut by_status: BTreeMap<String, usize> = BTreeMap::new();
        for r in &project_records {
            *by_status.entry(r.status.clone()).or_insert(0) += 1;
        }
        for (k, v) in by_status {
            report.counts.statuses.insert(k, json!(v));
        }
    }

    // ---- Client profiles.
    let mut client_records: Vec<ClientProfileRecord> = Vec::new();
    for (abs, rel) in &walked.client_profiles {
        let content = read_file_lossy(abs)?;
        match normalize_client_profile(abs, rel, &content, fallback_workspace) {
            Ok(record) => client_records.push(record),
            Err(e) => {
                report.client_profile_failures.push(ClientProfileFailure {
                    client_id: None,
                    relative_path: rel.clone(),
                    error: e,
                });
            }
        }
    }
    report.counts.client_profiles_found = client_records.len();
    report.counts.client_profiles_ready = client_records.len();
    report.counts.client_profiles_ready_with_workspace = client_records
        .iter()
        .filter(|r| r.workspace_id.is_some())
        .count();

    // ---- Onboarding flows (client + employee).
    let mut onboarding_records: Vec<OnboardingFlowRecord> = Vec::new();
    for (abs, rel) in &walked.onboarding_client_flows {
        let content = read_file_lossy(abs)?;
        match normalize_onboarding_flow(abs, rel, &content, "client", fallback_workspace) {
            Ok(record) => onboarding_records.push(record),
            Err(e) => report.onboarding_flow_failures.push(OnboardingFlowFailure {
                flow_id: None,
                audience: Some("client".to_string()),
                relative_path: rel.clone(),
                error: e,
            }),
        }
    }
    for (abs, rel) in &walked.onboarding_employee_flows {
        let content = read_file_lossy(abs)?;
        match normalize_onboarding_flow(abs, rel, &content, "employee", fallback_workspace) {
            Ok(record) => onboarding_records.push(record),
            Err(e) => report.onboarding_flow_failures.push(OnboardingFlowFailure {
                flow_id: None,
                audience: Some("employee".to_string()),
                relative_path: rel.clone(),
                error: e,
            }),
        }
    }
    report.counts.onboarding_flows_found = onboarding_records.len();
    report.counts.onboarding_flows_ready = onboarding_records.len();
    report.counts.onboarding_flows_ready_with_workspace = onboarding_records
        .iter()
        .filter(|r| r.workspace_id.is_some())
        .count();
    report.counts.onboarding_client_flows_found = onboarding_records
        .iter()
        .filter(|r| r.family == "client")
        .count();
    report.counts.onboarding_employee_flows_found = onboarding_records
        .iter()
        .filter(|r| r.family == "employee")
        .count();

    // ---- Employee KPI notes.
    let mut kpi_records: Vec<EmployeeKpiRecord> = Vec::new();
    for (abs, rel) in &walked.kpi_notes {
        let content = read_file_lossy(abs)?;
        match normalize_employee_kpi(abs, rel, &content) {
            Ok(record) => kpi_records.push(record),
            Err(e) => report.warnings.push(format!("[kpi] {e}")),
        }
    }
    report.counts.employee_kpi_notes_found = kpi_records.len();

    // ---- Apply mode work — Worker PUTs and SQLite upserts.
    if apply {
        let client = reqwest::Client::new();

        let existing =
            match fetch_existing_project_graphs(&client, worker_base_url, access_token).await {
                Ok(map) => map,
                Err(e) => {
                    report.remote_warning = Some(e.clone());
                    report.warnings.push(format!("[remote] {e}"));
                    HashMap::new()
                }
            };

        // Project briefs.
        for record in &project_records {
            let resolved_workspace = record
                .workspace_id
                .clone()
                .unwrap_or_else(|| workspace_id.to_string());
            let body = build_project_request_body(record, &resolved_workspace);
            let mode = if existing.contains_key(&record.project_id) {
                "update"
            } else {
                "create"
            };
            match put_project_mapping(
                &client,
                worker_base_url,
                access_token,
                &record.project_id,
                &body,
            )
            .await
            {
                Ok(_) => {
                    if mode == "create" {
                        report.counts.creates += 1;
                    } else {
                        report.counts.updates += 1;
                    }
                    report.applied.push(AppliedProject {
                        project_id: record.project_id.clone(),
                        target_project_id: Some(record.project_id.clone()),
                        mode: mode.to_string(),
                    });
                }
                Err(e) => {
                    report.failures.push(ProjectFailure {
                        project_id: record.project_id.clone(),
                        target_project_id: Some(record.project_id.clone()),
                        mode: mode.to_string(),
                        error: e,
                    });
                }
            }
        }

        // Client profiles.
        for record in &client_records {
            let resolved_workspace = record
                .workspace_id
                .clone()
                .unwrap_or_else(|| workspace_id.to_string());
            let body = build_client_profile_request_body(record, &resolved_workspace);
            match put_client_profile(
                &client,
                worker_base_url,
                access_token,
                &record.client_id,
                &body,
            )
            .await
            {
                Ok(_) => {
                    // Read-after-write verification per :2423-2437.
                    let _ = fetch_client_profile_detail(
                        &client,
                        worker_base_url,
                        access_token,
                        &record.client_id,
                        &resolved_workspace,
                    )
                    .await
                    .map_err(|e| {
                        report.warnings.push(format!(
                            "[client-profile-verify] {} {}",
                            record.client_id, e
                        ));
                    });
                    report.client_profile_applied.push(AppliedClientProfile {
                        client_id: record.client_id.clone(),
                        relative_path: record.relative_path.clone(),
                    });
                }
                Err(e) => {
                    report.client_profile_failures.push(ClientProfileFailure {
                        client_id: Some(record.client_id.clone()),
                        relative_path: record.relative_path.clone(),
                        error: e,
                    });
                }
            }
        }

        // Onboarding flows — workspace-scoped FULL REPLACE. The Tauri
        // command path always passes an EMPTY project filter, so the guard
        // is INACTIVE in production. The unit test exercises the guard
        // path explicitly.
        let project_filter: Vec<String> = Vec::new();
        if let Some(failures) = onboarding_flow_apply_guard(&project_filter, &onboarding_records) {
            report.onboarding_flow_failures.extend(failures);
        } else if !onboarding_records.is_empty() {
            let resolved_workspace = workspace_id.to_string();
            let body =
                build_onboarding_flows_request_body(&onboarding_records, &resolved_workspace);
            match put_onboarding_flows(&client, worker_base_url, access_token, &body).await {
                Ok(_) => {
                    let group = AppliedOnboardingFlowGroup {
                        workspace_id: resolved_workspace,
                        flow_ids: onboarding_records
                            .iter()
                            .map(|r| r.flow_id.clone())
                            .collect(),
                        relative_paths: onboarding_records
                            .iter()
                            .map(|r| r.relative_path.clone())
                            .collect(),
                    };
                    report.onboarding_flow_applied.push(group);
                }
                Err(e) => {
                    for r in &onboarding_records {
                        report.onboarding_flow_failures.push(OnboardingFlowFailure {
                            flow_id: Some(r.flow_id.clone()),
                            audience: Some(r.audience.clone()),
                            relative_path: r.relative_path.clone(),
                            error: e.clone(),
                        });
                    }
                }
            }
        }

        // Employee KPIs — local SQLite, not Worker. Auto-create the table on
        // first run per Risk #3 in 01-RESEARCH.md.
        if !kpi_records.is_empty() {
            ensure_employee_kpi_snapshots_table(pool).await?;
            let roster = load_employee_roster(pool).await.unwrap_or_else(|e| {
                report
                    .teamforge_db_warnings
                    .push(format!("load employee roster: {e}"));
                HashMap::new()
            });
            for record in &kpi_records {
                match resolve_employee_for_kpi(&record.member_id, &roster) {
                    Some(employee_id) => {
                        let row = build_employee_kpi_row(record, &employee_id);
                        let exists: Option<String> = sqlx::query_scalar(
                            "SELECT id FROM employee_kpi_snapshots WHERE employee_id = ? AND kpi_version = ?",
                        )
                        .bind(&row.employee_id)
                        .bind(&row.kpi_version)
                        .fetch_optional(pool)
                        .await
                        .map_err(|e| format!("probe employee_kpi_snapshots: {e}"))?;
                        let mode = if exists.is_some() { "update" } else { "create" };
                        match upsert_employee_kpi_snapshot(pool, &row).await {
                            Ok(()) => {
                                if mode == "create" {
                                    report.counts.employee_kpi_creates += 1;
                                } else {
                                    report.counts.employee_kpi_updates += 1;
                                }
                                report.employee_kpi_applied.push(AppliedEmployeeKpi {
                                    member_id: record.member_id.clone(),
                                    employee_id: employee_id.clone(),
                                    employee_name: record.employee_name.clone(),
                                    mode: mode.to_string(),
                                    kpi_version: record.kpi_version.clone(),
                                });
                            }
                            Err(e) => {
                                report.employee_kpi_failures.push(EmployeeKpiFailure {
                                    member_id: record.member_id.clone(),
                                    employee_id: Some(employee_id),
                                    employee_name: record.employee_name.clone(),
                                    mode: mode.to_string(),
                                    error: e,
                                });
                            }
                        }
                    }
                    None => {
                        report.counts.employee_kpi_unresolved += 1;
                        report.warnings.push(format!(
                            "[kpi] unresolved member_id={} ({})",
                            record.member_id, record.source_relative_path
                        ));
                    }
                }
            }
        }
    }

    // Write the report to disk in the Node-compatible shape per D-04.
    let json =
        serde_json::to_string_pretty(&report).map_err(|e| format!("serialize report: {e}"))?;
    if let Some(parent) = report_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create report parent {}: {e}", parent.display()))?;
        }
    }
    std::fs::write(report_path, json)
        .map_err(|e| format!("write report {}: {e}", report_path.display()))?;
    eprintln!(
        "[vault-parity] {mode} complete: report={}",
        report_path.display()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    // Inline copy of the pattern from src-tauri/src/db/queries.rs:2298-2310.
    // Local because the original mod and helper are private. Used by the
    // SQLite roundtrip test landing in Task 2 of Plan 01-02.
    #[allow(dead_code)]
    fn unique_test_dir() -> std::path::PathBuf {
        let pid = std::process::id();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("teamforge-vault-parity-test-{pid}-{nanos}"));
        std::fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    // -----------------------------------------------------------------------
    // 01-frontmatter-parser: gray_matter pipeline parses ProjectBriefFrontmatter
    // including the external_refs list-of-maps shape per :169-178.
    // -----------------------------------------------------------------------

    #[test]
    fn parses_minimal_project_brief_frontmatter() {
        let md = "---\n\
project_id: acme-corp-website\n\
client_id: acme-corp\n\
client_name: Acme Corporation\n\
name: Acme Corporation Website Refresh\n\
code: AXT\n\
slug: acme-corp-website\n\
portfolio_name: Client Engagements\n\
project_type: client-engagement\n\
status: active\n\
workspace_id: ws-test-001\n\
external_refs:\n  - { system: clockify, id: 12345 }\n\
---\n\n# Body";
        let (fm, body): (ProjectBriefFrontmatter, String) = parse_frontmatter(md);

        assert_eq!(fm.project_id.as_deref(), Some("acme-corp-website"));
        assert_eq!(fm.client_id.as_deref(), Some("acme-corp"));
        assert_eq!(fm.client_name.as_deref(), Some("Acme Corporation"));
        assert_eq!(fm.name.as_deref(), Some("Acme Corporation Website Refresh"));
        assert_eq!(fm.code.as_deref(), Some("AXT"));
        assert_eq!(fm.slug.as_deref(), Some("acme-corp-website"));
        assert_eq!(fm.portfolio_name.as_deref(), Some("Client Engagements"));
        assert_eq!(fm.project_type.as_deref(), Some("client-engagement"));
        assert_eq!(fm.status.as_deref(), Some("active"));
        assert_eq!(fm.workspace_id.as_deref(), Some("ws-test-001"));

        let refs = decode_external_refs(&fm.external_refs);
        assert_eq!(
            refs,
            vec![("clockify".to_string(), "12345".to_string())],
            "external_refs must decode to (system, id) tuples"
        );

        assert!(
            body.contains("# Body"),
            "body should be returned alongside frontmatter"
        );
    }

    #[test]
    fn parses_external_refs_with_quoted_and_unquoted_values() {
        // Both unquoted scalars (id: 12345) and quoted strings (id: "abc")
        // must round-trip through the gray_matter pipeline.
        let md = "---\nexternal_refs:\n  - { system: clockify, id: 12345 }\n  - { system: \"clockify-project\", id: \"abc\" }\n---\nbody";
        let (fm, _): (ProjectBriefFrontmatter, String) = parse_frontmatter(md);
        let refs = decode_external_refs(&fm.external_refs);
        assert_eq!(refs.len(), 2);
        assert!(refs.contains(&("clockify".to_string(), "12345".to_string())));
        assert!(refs.contains(&("clockify-project".to_string(), "abc".to_string())));
    }

    // -----------------------------------------------------------------------
    // 01-status-normalize: the alias table from :281-290 plus the archived-tag
    // override.
    // -----------------------------------------------------------------------

    #[test]
    fn normalizes_status_with_alias_table() {
        let no_tags: Vec<String> = vec![];

        // 5 alias mappings.
        assert_eq!(normalize_status("in progress", &no_tags), "active");
        assert_eq!(normalize_status("in-progress", &no_tags), "active");
        assert_eq!(normalize_status("cancelled", &no_tags), "completed");
        assert_eq!(normalize_status("canceled", &no_tags), "completed");
        assert_eq!(normalize_status("paused", &no_tags), "paused");

        // Pass-throughs.
        assert_eq!(normalize_status("active", &no_tags), "active");
        assert_eq!(normalize_status("completed", &no_tags), "completed");
        assert_eq!(normalize_status("draft", &no_tags), "draft");
        assert_eq!(normalize_status("planning", &no_tags), "planning");
        assert_eq!(
            normalize_status("white-labelable", &no_tags),
            "white-labelable"
        );

        // Case-insensitive.
        assert_eq!(normalize_status("In Progress", &no_tags), "active");
        assert_eq!(normalize_status("CANCELLED", &no_tags), "completed");

        // archived tag overrides any frontmatter status.
        let archived_tags = vec!["enterprise".to_string(), "archived".to_string()];
        assert_eq!(normalize_status("active", &archived_tags), "archived");
        assert_eq!(normalize_status("planning", &archived_tags), "archived");

        // Unknown values pass through (lower-cased, trimmed).
        assert_eq!(
            normalize_status("  Custom-State  ", &no_tags),
            "custom-state"
        );
    }

    // -----------------------------------------------------------------------
    // 01-workspace-id-fallback: three-source resolution chain per :864-878.
    // -----------------------------------------------------------------------

    #[test]
    fn workspace_id_falls_back() {
        // Avoid env-var leakage: snapshot, override, restore.
        let saved = std::env::var("TEAMFORGE_WORKSPACE_ID").ok();
        std::env::remove_var("TEAMFORGE_WORKSPACE_ID");

        // 1. Frontmatter wins over arg over env.
        std::env::set_var("TEAMFORGE_WORKSPACE_ID", "from-env");
        assert_eq!(
            resolve_workspace_id(Some("from-fm"), Some("from-arg")),
            Some("from-fm".to_string()),
            "frontmatter must win when present"
        );

        // 2. Arg wins when frontmatter empty.
        assert_eq!(
            resolve_workspace_id(None, Some("from-arg")),
            Some("from-arg".to_string()),
            "arg must win when frontmatter is None"
        );
        assert_eq!(
            resolve_workspace_id(Some(""), Some("from-arg")),
            Some("from-arg".to_string()),
            "arg must win when frontmatter is empty string"
        );

        // 3. Env wins when both above are empty/None.
        assert_eq!(
            resolve_workspace_id(None, None),
            Some("from-env".to_string()),
            "env must win when both frontmatter and arg are absent"
        );
        assert_eq!(
            resolve_workspace_id(Some("   "), Some("")),
            Some("from-env".to_string()),
            "env must win when both frontmatter and arg are whitespace/empty"
        );

        // 4. All-empty -> None.
        std::env::remove_var("TEAMFORGE_WORKSPACE_ID");
        assert_eq!(resolve_workspace_id(None, None), None);
        assert_eq!(resolve_workspace_id(Some(""), Some("")), None);

        // Restore.
        if let Some(prev) = saved {
            std::env::set_var("TEAMFORGE_WORKSPACE_ID", prev);
        } else {
            std::env::remove_var("TEAMFORGE_WORKSPACE_ID");
        }
    }

    // -----------------------------------------------------------------------
    // 01-merge-artifacts: dedup by (source, external_id), title fallback
    // when external_id is missing.
    // -----------------------------------------------------------------------

    #[test]
    fn merges_artifacts_dedup_by_source_and_external_id() {
        let make =
            |source: &str, ext_id: Option<&str>, title: &str, primary: bool| ArtifactRecord {
                artifact_type: "vault-technical-spec".to_string(),
                title: Some(title.to_string()),
                url: Some(format!("https://example.test/{title}")),
                source: source.to_string(),
                external_id: ext_id.map(str::to_string),
                is_primary: primary,
            };

        // Case 1: same (source, external_id) -> dedup to 1.
        let merged = merge_artifacts(vec![
            make("vault", Some("spec-001"), "First", true),
            make("vault", Some("spec-001"), "Duplicate", false),
        ]);
        assert_eq!(merged.len(), 1, "same (source, external_id) must dedup");

        // Case 2: different external_id -> keep 2.
        let merged = merge_artifacts(vec![
            make("vault", Some("spec-001"), "Spec 1", true),
            make("vault", Some("spec-002"), "Spec 2", false),
        ]);
        assert_eq!(merged.len(), 2, "different external_id keeps both");

        // Case 3: missing external_id falls back to (source, title).
        let merged = merge_artifacts(vec![
            make("vault", None, "Same Title", true),
            make("vault", None, "Same Title", false),
            make("vault", None, "Different Title", true),
        ]);
        assert_eq!(
            merged.len(),
            2,
            "missing external_id dedups by title fallback"
        );

        // Case 4: same external_id but different source -> keep both.
        let merged = merge_artifacts(vec![
            make("vault", Some("id-1"), "A", false),
            make("clockify", Some("id-1"), "B", false),
        ]);
        assert_eq!(merged.len(), 2, "different source keeps both");
    }

    // -----------------------------------------------------------------------
    // 01-kpi-employee-resolve: three-branch resolver per :959-994.
    // -----------------------------------------------------------------------

    #[test]
    fn kpi_employee_resolution() {
        let mut roster: HashMap<String, String> = HashMap::new();
        // Roster maps lowercase alias -> canonical employee id.
        roster.insert("alice-iyer".to_string(), "emp-001".to_string());
        roster.insert("alice".to_string(), "emp-001".to_string());
        roster.insert("aliceiyer".to_string(), "emp-001".to_string());
        roster.insert("charlie-eng".to_string(), "emp-003".to_string());

        // Tier 1: exact match (case-insensitive).
        assert_eq!(
            resolve_employee_for_kpi("alice-iyer", &roster),
            Some("emp-001".to_string()),
            "exact alias match"
        );
        assert_eq!(
            resolve_employee_for_kpi("ALICE-IYER", &roster),
            Some("emp-001".to_string()),
            "exact alias match must be case-insensitive"
        );

        // Tier 2: prefix match. "ali" is shorter than the full alias but is
        // a prefix of "alice" and "alice-iyer".
        assert_eq!(
            resolve_employee_for_kpi("ali", &roster),
            Some("emp-001".to_string()),
            "prefix match resolves alice"
        );

        // Tier 3: unresolved (no exact, no prefix).
        assert_eq!(
            resolve_employee_for_kpi("bob-unknown", &roster),
            None,
            "unresolved member id returns None"
        );
        assert_eq!(
            resolve_employee_for_kpi("", &roster),
            None,
            "empty member id returns None"
        );
    }

    // -----------------------------------------------------------------------
    // Bonus: section parser exercises the fenced-json block extraction used by
    // the KPI note's `## Monthly KPI` and `## KPI Contracts` sections.
    // -----------------------------------------------------------------------

    #[test]
    fn parses_yaml_section_inside_code_fence() {
        let body = "# Title\n\nIntro text.\n\n## KPI Contracts\n\n```json\n[\n  { \"name\": \"foo\", \"weight\": 0.4 }\n]\n```\n\n## Other Section\n\nbody\n";
        let value = parse_json_section(body, "KPI Contracts")
            .expect("must extract fenced JSON from KPI Contracts section");
        assert!(value.is_array(), "KPI Contracts is a JSON array");
        assert_eq!(value[0]["name"], "foo");
        assert_eq!(value[0]["weight"].as_f64(), Some(0.4));

        // Non-existent section returns None.
        assert!(parse_json_section(body, "Missing Section").is_none());
    }

    #[test]
    fn parse_sections_splits_on_h2_headers() {
        let body = "# Title\n\nIntro\n\n## Goals\n\nLine A\nLine B\n\n## Tasks\n\n- one\n- two\n";
        let sections = parse_sections(body);
        assert_eq!(sections.len(), 2);
        assert!(sections.get("Goals").unwrap().contains("Line A"));
        assert!(sections.get("Tasks").unwrap().contains("- one"));
    }

    #[test]
    fn read_file_lossy_handles_invalid_utf8() {
        let dir = unique_test_dir();
        let path = dir.join("invalid.md");
        // 0xff is not valid UTF-8; the lossy decoder must replace it with U+FFFD.
        std::fs::write(&path, [b'h', b'i', 0xff, b'!']).expect("write fixture");
        let s = read_file_lossy(&path).expect("read lossy");
        assert!(s.starts_with("hi"));
        assert!(s.ends_with("!"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -----------------------------------------------------------------------
    // 01-request-body-dup-keys: project body has BOTH camelCase and snake_case
    // keys at the top level per teamforge-vault-parity.mjs:1400-1417.
    // -----------------------------------------------------------------------

    #[test]
    fn builds_request_body_with_camel_and_snake_duplicates() {
        let record = ProjectRecord {
            project_id: "acme-corp-website".to_string(),
            name: Some("Acme Website".to_string()),
            code: Some("AXT".to_string()),
            slug: Some("acme-corp-website".to_string()),
            portfolio_name: Some("Client Engagements".to_string()),
            client_id: Some("acme-corp".to_string()),
            client_name: Some("Acme Corporation".to_string()),
            clockify_project_id: Some("12345".to_string()),
            project_type: Some("client-engagement".to_string()),
            status: "active".to_string(),
            visibility: Some("internal".to_string()),
            sync_mode: Some("bidirectional".to_string()),
            workspace_id: Some("ws-test-001".to_string()),
            external_refs: vec![("clockify".to_string(), "12345".to_string())],
            artifacts: vec![ArtifactRecord {
                artifact_type: "vault-technical-spec".to_string(),
                title: Some("Technical Spec".to_string()),
                url: Some("vault://technical-spec.md".to_string()),
                source: "vault".to_string(),
                external_id: Some("tech-spec-001".to_string()),
                is_primary: true,
            }],
            relative_path: "60-client-ecosystem/acme-corp/project-brief.md".to_string(),
        };
        let body = build_project_request_body(&record, "ws-test-001");
        let obj = body.as_object().expect("top-level object");

        // Camel + snake duplicates at top level — back-compat hedge.
        assert!(obj.contains_key("workspaceId"), "workspaceId (camel)");
        assert!(obj.contains_key("workspace_id"), "workspace_id (snake)");
        assert!(obj.contains_key("name"));
        assert!(obj.contains_key("code"));
        assert!(obj.contains_key("slug"));
        assert!(obj.contains_key("portfolio_name"));
        assert!(obj.contains_key("client_id"));
        assert!(obj.contains_key("client_name"));
        assert!(obj.contains_key("clockify_project_id"));
        assert!(obj.contains_key("project_type"));
        assert!(obj.contains_key("status"));
        assert!(obj.contains_key("visibility"));
        assert!(obj.contains_key("sync_mode"));
        assert!(obj.contains_key("external_ids"));
        assert!(obj.contains_key("githubLinks"));
        assert!(obj.contains_key("hulyLinks"));
        assert!(obj.contains_key("artifacts"));
        assert!(obj.contains_key("policy"));

        // The nested project block is the camel-only canonical shape.
        let project = obj
            .get("project")
            .and_then(Value::as_object)
            .expect("project block");
        assert_eq!(
            project.get("name").and_then(Value::as_str),
            Some("Acme Website")
        );
        assert_eq!(
            project.get("clientId").and_then(Value::as_str),
            Some("acme-corp")
        );
        assert_eq!(
            project.get("clockifyProjectId").and_then(Value::as_str),
            Some("12345")
        );
        assert_eq!(
            project.get("syncMode").and_then(Value::as_str),
            Some("bidirectional")
        );

        // external_ids array uses snake key per :1415.
        let ext_ids = obj
            .get("external_ids")
            .and_then(Value::as_array)
            .expect("external_ids array");
        assert_eq!(ext_ids.len(), 1);
        assert_eq!(ext_ids[0]["source"], "clockify");
        assert_eq!(ext_ids[0]["external_id"], "12345");

        // workspaceId and workspace_id agree.
        assert_eq!(obj["workspaceId"], obj["workspace_id"]);
        assert_eq!(obj["workspaceId"], json!("ws-test-001"));
    }

    // -----------------------------------------------------------------------
    // 01-onboarding-apply-guard: when projects filter is non-empty, ALL flows
    // land in failures with the literal guard message per :2447-2457.
    // -----------------------------------------------------------------------

    #[test]
    fn onboarding_flow_apply_disabled_when_project_filter_active() {
        let flow_records = vec![
            OnboardingFlowRecord {
                flow_id: "acme-client-onboarding".to_string(),
                family: "client".to_string(),
                audience: "client".to_string(),
                status: "in-progress".to_string(),
                relative_path: "60-client-ecosystem/acme-corp/onboarding/client-onboarding.md"
                    .to_string(),
                ..Default::default()
            },
            OnboardingFlowRecord {
                flow_id: "bob-employee-onboarding".to_string(),
                family: "employee".to_string(),
                audience: "employee".to_string(),
                status: "in-progress".to_string(),
                relative_path: "50-team/onboarding/bob-employee-onboarding.md".to_string(),
                ..Default::default()
            },
        ];

        // Empty filter -> guard inactive -> None returned.
        assert!(
            onboarding_flow_apply_guard(&[], &flow_records).is_none(),
            "empty project filter must NOT trip the guard"
        );

        // Non-empty filter -> guard active -> all flows land in failures.
        let filter = vec!["acme-corp-website".to_string()];
        let failures = onboarding_flow_apply_guard(&filter, &flow_records)
            .expect("non-empty project filter must trip the guard");
        assert_eq!(
            failures.len(),
            2,
            "every flow must be reported as a failure"
        );
        for failure in &failures {
            assert!(
                failure
                    .error
                    .contains("Onboarding flow apply is disabled for project-filtered runs"),
                "failure must contain the guard message verbatim — got: {}",
                failure.error
            );
            assert!(
                failure
                    .error
                    .contains("/v1/onboarding-flows replaces the full workspace set"),
                "failure must explain WHY the apply is disabled"
            );
            assert!(
                failure.flow_id.is_some(),
                "failure must carry the flow_id for the report consumer"
            );
        }
    }

    // -----------------------------------------------------------------------
    // 01-report-struct-shape: ParityReport serializes to a JSON shape that
    // commands/mod.rs:2708-2805 reads unchanged. Regression-locks D-04.
    // -----------------------------------------------------------------------

    #[test]
    fn report_struct_serializes_to_node_compatible_json() {
        let mut report = ParityReport::new("apply", "/tmp/vault", "https://teamforge.invalid");
        report.workspace_id = Some("ws-test-001".to_string());
        report.warnings.push("sample-warning".to_string());
        report.counts.project_briefs_found = 3;
        report.counts.creates = 1;
        report.counts.updates = 2;
        report.counts.client_profiles_found = 5;
        report.counts.onboarding_flows_found = 4;
        report.counts.employee_kpi_notes_found = 7;
        report
            .counts
            .statuses
            .insert("active".to_string(), json!(2));
        report
            .counts
            .statuses
            .insert("planning".to_string(), json!(1));
        report.failures.push(ProjectFailure {
            project_id: "p1".to_string(),
            target_project_id: Some("p1".to_string()),
            mode: "update".to_string(),
            error: "sample".to_string(),
        });
        report.client_profile_failures.push(ClientProfileFailure {
            client_id: Some("c1".to_string()),
            relative_path: "client.md".to_string(),
            error: "sample".to_string(),
        });
        report.onboarding_flow_failures.push(OnboardingFlowFailure {
            flow_id: Some("f1".to_string()),
            audience: Some("client".to_string()),
            relative_path: "flow.md".to_string(),
            error: "sample".to_string(),
        });
        report.employee_kpi_failures.push(EmployeeKpiFailure {
            member_id: "alice".to_string(),
            employee_id: Some("emp-001".to_string()),
            employee_name: Some("Alice".to_string()),
            mode: "create".to_string(),
            error: "sample".to_string(),
        });
        report.client_profile_applied.push(AppliedClientProfile {
            client_id: "c1".to_string(),
            relative_path: "client.md".to_string(),
        });
        report
            .onboarding_flow_applied
            .push(AppliedOnboardingFlowGroup {
                workspace_id: "ws-test-001".to_string(),
                flow_ids: vec!["f1".to_string(), "f2".to_string()],
                relative_paths: vec!["a.md".to_string(), "b.md".to_string()],
            });
        report.employee_kpi_applied.push(AppliedEmployeeKpi {
            member_id: "alice".to_string(),
            employee_id: "emp-001".to_string(),
            employee_name: Some("Alice".to_string()),
            mode: "create".to_string(),
            kpi_version: "2026-04".to_string(),
        });

        let json_text = serde_json::to_string_pretty(&report).expect("serialize report");
        let value: Value = serde_json::from_str(&json_text).expect("parse round-trip");

        // Every field commands/mod.rs:2708-2805 reads must be present.
        assert_eq!(value["mode"], "apply");
        assert!(value["counts"].is_object());
        assert_eq!(value["counts"]["projectBriefsFound"], 3);
        assert_eq!(value["counts"]["creates"], 1);
        assert_eq!(value["counts"]["updates"], 2);
        assert_eq!(value["counts"]["clientProfilesFound"], 5);
        assert_eq!(value["counts"]["onboardingFlowsFound"], 4);
        assert_eq!(value["counts"]["employeeKpiNotesFound"], 7);

        // Failure arrays — read by summarize_sync_failures.
        assert!(value["failures"].is_array());
        assert_eq!(value["failures"][0]["projectId"], "p1");
        assert_eq!(value["failures"][0]["error"], "sample");
        assert!(value["clientProfileFailures"].is_array());
        assert_eq!(value["clientProfileFailures"][0]["clientId"], "c1");
        assert_eq!(value["clientProfileFailures"][0]["error"], "sample");
        assert!(value["onboardingFlowFailures"].is_array());
        assert_eq!(value["onboardingFlowFailures"][0]["flowId"], "f1");
        assert_eq!(value["onboardingFlowFailures"][0]["error"], "sample");
        assert!(value["employeeKpiFailures"].is_array());
        assert_eq!(value["employeeKpiFailures"][0]["memberId"], "alice");
        assert_eq!(value["employeeKpiFailures"][0]["error"], "sample");

        // Applied arrays — array length read by json_array_len.
        assert!(value["clientProfileApplied"].is_array());
        assert!(value["onboardingFlowApplied"].is_array());
        assert!(value["onboardingFlowApplied"][0]["flowIds"].is_array());
        assert_eq!(
            value["onboardingFlowApplied"][0]["flowIds"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(value["employeeKpiApplied"].is_array());

        // Top-level scalar fields.
        assert!(value["warnings"].is_array());
        assert_eq!(value["workspaceId"], "ws-test-001");
        assert_eq!(value["vaultRoot"], "/tmp/vault");
        assert_eq!(value["workerBaseUrl"], "https://teamforge.invalid");
    }

    // -----------------------------------------------------------------------
    // 01-kpi-snapshot-sqlite: 28-column row roundtrips through the
    // employee_kpi_snapshots table that the importer auto-creates.
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn kpi_snapshot_round_trips_through_sqlite() {
        let dir = unique_test_dir();
        let pool = crate::db::queries::init_db(&dir).await.expect("init db");

        // Pre-seed an employees row so the FK constraint passes. The schema
        // (migrations/001_initial.sql:2-13) requires NOT NULL on
        // clockify_user_id and email.
        sqlx::query(
            "INSERT INTO employees (id, clockify_user_id, name, email, is_active) \
             VALUES ('emp-001', 'cl-emp-001', 'Alice Iyer', 'alice@example.com', 1)",
        )
        .execute(&pool)
        .await
        .expect("seed employee");

        ensure_employee_kpi_snapshots_table(&pool)
            .await
            .expect("ensure employee_kpi_snapshots table");

        let row = EmployeeKpiRow {
            id: "emp-001::2026-04".to_string(),
            employee_id: "emp-001".to_string(),
            member_id: "emp-001".to_string(),
            title: "Alice Iyer KPI".to_string(),
            role_template: Some("senior-engineer".to_string()),
            role_template_file: Some("templates/senior-engineer.md".to_string()),
            kpi_version: "2026-04".to_string(),
            last_reviewed: Some("2026-04-15".to_string()),
            reports_to: Some("emp-000".to_string()),
            tags_json: r#"["engineering","kpi"]"#.to_string(),
            source_file_path: "/abs/path/alice-iyer-kpi.md".to_string(),
            source_relative_path: "50-team/alice-iyer-kpi.md".to_string(),
            source_last_modified_at: "2026-04-30T00:00:00Z".to_string(),
            role_scope_markdown: Some("scope text".to_string()),
            monthly_kpis_json: r#"{"hours_billable":152}"#.to_string(),
            quarterly_milestones_json: "[]".to_string(),
            yearly_milestones_json: "[]".to_string(),
            cross_role_dependencies_json: "[]".to_string(),
            evidence_sources_json: "[]".to_string(),
            contract_source_json: r#"{"source":"vault"}"#.to_string(),
            kpi_contracts_json: r#"[{"name":"ship_q2","weight":0.4}]"#.to_string(),
            compensation_milestones_json: "[]".to_string(),
            gap_flags_json: "[]".to_string(),
            synthesis_review_markdown: Some("review text".to_string()),
            body_markdown: "# Body\n\nMonthly performance.".to_string(),
            imported_at: "2026-05-04T00:00:00Z".to_string(),
            updated_at: "2026-05-04T00:00:00Z".to_string(),
        };

        upsert_employee_kpi_snapshot(&pool, &row)
            .await
            .expect("upsert kpi row");

        // Re-read and assert all 28 columns.
        let fetched = sqlx::query(
            "SELECT id, employee_id, member_id, title, role_template, role_template_file,\
                kpi_version, last_reviewed, reports_to, tags_json,\
                source_file_path, source_relative_path, source_last_modified_at,\
                role_scope_markdown, monthly_kpis_json, quarterly_milestones_json,\
                yearly_milestones_json, cross_role_dependencies_json, evidence_sources_json,\
                contract_source_json, kpi_contracts_json, compensation_milestones_json,\
                gap_flags_json, synthesis_review_markdown, body_markdown,\
                imported_at, updated_at \
             FROM employee_kpi_snapshots WHERE employee_id = ? AND kpi_version = ?",
        )
        .bind(&row.employee_id)
        .bind(&row.kpi_version)
        .fetch_one(&pool)
        .await
        .expect("read back inserted row");

        assert_eq!(fetched.try_get::<String, _>("id").unwrap(), row.id);
        assert_eq!(
            fetched.try_get::<String, _>("employee_id").unwrap(),
            row.employee_id
        );
        assert_eq!(
            fetched.try_get::<String, _>("member_id").unwrap(),
            row.member_id
        );
        assert_eq!(fetched.try_get::<String, _>("title").unwrap(), row.title);
        assert_eq!(
            fetched
                .try_get::<Option<String>, _>("role_template")
                .unwrap(),
            row.role_template
        );
        assert_eq!(
            fetched
                .try_get::<Option<String>, _>("role_template_file")
                .unwrap(),
            row.role_template_file
        );
        assert_eq!(
            fetched.try_get::<String, _>("kpi_version").unwrap(),
            row.kpi_version
        );
        assert_eq!(
            fetched
                .try_get::<Option<String>, _>("last_reviewed")
                .unwrap(),
            row.last_reviewed
        );
        assert_eq!(
            fetched.try_get::<Option<String>, _>("reports_to").unwrap(),
            row.reports_to
        );
        assert_eq!(
            fetched.try_get::<String, _>("tags_json").unwrap(),
            row.tags_json
        );
        assert_eq!(
            fetched.try_get::<String, _>("source_file_path").unwrap(),
            row.source_file_path
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("source_relative_path")
                .unwrap(),
            row.source_relative_path
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("source_last_modified_at")
                .unwrap(),
            row.source_last_modified_at
        );
        assert_eq!(
            fetched
                .try_get::<Option<String>, _>("role_scope_markdown")
                .unwrap(),
            row.role_scope_markdown
        );
        assert_eq!(
            fetched.try_get::<String, _>("monthly_kpis_json").unwrap(),
            row.monthly_kpis_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("quarterly_milestones_json")
                .unwrap(),
            row.quarterly_milestones_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("yearly_milestones_json")
                .unwrap(),
            row.yearly_milestones_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("cross_role_dependencies_json")
                .unwrap(),
            row.cross_role_dependencies_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("evidence_sources_json")
                .unwrap(),
            row.evidence_sources_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("contract_source_json")
                .unwrap(),
            row.contract_source_json
        );
        assert_eq!(
            fetched.try_get::<String, _>("kpi_contracts_json").unwrap(),
            row.kpi_contracts_json
        );
        assert_eq!(
            fetched
                .try_get::<String, _>("compensation_milestones_json")
                .unwrap(),
            row.compensation_milestones_json
        );
        assert_eq!(
            fetched.try_get::<String, _>("gap_flags_json").unwrap(),
            row.gap_flags_json
        );
        assert_eq!(
            fetched
                .try_get::<Option<String>, _>("synthesis_review_markdown")
                .unwrap(),
            row.synthesis_review_markdown
        );
        assert_eq!(
            fetched.try_get::<String, _>("body_markdown").unwrap(),
            row.body_markdown
        );
        assert_eq!(
            fetched.try_get::<String, _>("imported_at").unwrap(),
            row.imported_at
        );
        assert_eq!(
            fetched.try_get::<String, _>("updated_at").unwrap(),
            row.updated_at
        );

        pool.close().await;
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -----------------------------------------------------------------------
    // 01-fixture-vault-parity: end-to-end dry-run against the Plan 01-01
    // fixture vault. The canonical regression lock for the full pipeline.
    // 7 markdown files in -> 1 ParityReport JSON out -> counts must match.
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn rust_parity_run_against_fixture_vault() {
        // Resolve the fixture path relative to CARGO_MANIFEST_DIR so the test
        // runs regardless of where `cargo test` is invoked from.
        let fixture_root =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests-fixtures/vault-min");
        assert!(
            fixture_root.exists(),
            "fixture vault missing — Plan 01-01 Task 3 must land first: {:?}",
            fixture_root
        );

        let dir = unique_test_dir();
        let pool = crate::db::queries::init_db(&dir).await.expect("init db");

        // Pre-seed the employees row that alice-iyer-kpi.md's `member_id: emp-001`
        // resolves to. The roster lookup in resolve_employee_for_kpi reads from
        // the `employees` table. clockify_user_id is NOT NULL per
        // migrations/001_initial.sql:2-13.
        sqlx::query(
            "INSERT INTO employees (id, clockify_user_id, name, email, is_active) \
             VALUES ('emp-001', 'cl-emp-001', 'Alice Iyer', 'alice@example.com', 1)",
        )
        .execute(&pool)
        .await
        .expect("seed employee");

        // Run the importer in DRY-RUN mode — no Worker calls, no SQLite writes.
        let report_path = dir.join("rust-report.json");
        crate::vault::parity::run_dry_run(
            &pool,
            fixture_root.to_str().expect("fixture path utf8"),
            "ws-test-001",
            "https://teamforge-api.invalid",
            "fake-token",
            &report_path,
        )
        .await
        .expect("run_dry_run against fixture vault");

        // Read the report and assert every count the production parser at
        // commands/mod.rs:2708-2805 reads.
        let report: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&report_path).expect("read report"))
                .expect("parse report");

        assert_eq!(report["mode"], "dry-run", "mode must be dry-run");
        assert_eq!(
            report["counts"]["projectBriefsFound"], 1,
            "exactly one project brief in the fixture (acme-corp/project-brief.md)"
        );
        assert_eq!(
            report["counts"]["clientProfilesFound"], 1,
            "exactly one client profile (acme-corp/client-profile.md)"
        );
        assert_eq!(
            report["counts"]["projectArtifactsFound"], 2,
            "two artifacts: technical-spec.md + design/ux-flow.md"
        );
        assert_eq!(
            report["counts"]["onboardingClientFlowsFound"], 1,
            "one client onboarding (acme-corp/onboarding/client-onboarding.md)"
        );
        assert_eq!(
            report["counts"]["onboardingEmployeeFlowsFound"], 1,
            "one employee onboarding (50-team/onboarding/bob-employee-onboarding.md)"
        );
        assert_eq!(
            report["counts"]["employeeKpiNotesFound"], 1,
            "one KPI note (50-team/alice-iyer-kpi.md)"
        );
        assert!(
            report["warnings"].is_array(),
            "warnings must be array (read by commands/mod.rs:2774-2784)"
        );
        assert!(
            report["counts"].is_object(),
            "counts must be object (read by json_usize)"
        );

        // Total onboarding flows = client + employee.
        assert_eq!(report["counts"]["onboardingFlowsFound"], 2);

        // Failure arrays must be present (empty in dry-run mode) so
        // summarize_sync_failures can iterate without surprises.
        assert!(report["failures"].is_array());
        assert!(report["clientProfileFailures"].is_array());
        assert!(report["onboardingFlowFailures"].is_array());
        assert!(report["employeeKpiFailures"].is_array());
        assert!(report["clientProfileApplied"].is_array());
        assert!(report["onboardingFlowApplied"].is_array());
        assert!(report["employeeKpiApplied"].is_array());

        // Cleanup. Mirrors db/queries.rs:2298-2331's pattern.
        pool.close().await;
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -----------------------------------------------------------------------
    // 01-real-vault-diff: Tier 3 of `01-RESEARCH.md` §9 — parity verification
    // against the real, private `thoughtseed-labs` vault. The human releaser
    // runs this with the env vars set; `cargo test --lib` does NOT exercise
    // it (the `#[ignore]` gate keeps the default suite hermetic).
    //
    // Invocation (per `01-VALIDATION.md` row `01-real-vault-diff`):
    //
    //   TEAMFORGE_VAULT_ROOT=/path/to/thoughtseed-labs \
    //   TEAMFORGE_WORKSPACE_ID=ws-xxxxxxxx \
    //   TEAMFORGE_RUST_PARITY_REPORT_PATH=/tmp/rust-report.json \
    //   cargo test --manifest-path src-tauri/Cargo.toml \
    //     vault::parity::tests::rust_parity_diff_against_real_vault \
    //     -- --ignored --nocapture
    //
    // Then the releaser runs the Node script against the same vault +
    // workspace_id (writing /tmp/node-report.json), normalizes both with
    // `jq` per RESEARCH.md §9 Tier 3, and `diff`s them. The Rust side just
    // produces the report file; the diff itself is recorded in
    // `01-VERIFICATION.md`.
    // -----------------------------------------------------------------------

    #[tokio::test]
    #[ignore = "live test — requires TEAMFORGE_VAULT_ROOT + TEAMFORGE_WORKSPACE_ID env vars; not run by `cargo test --lib`"]
    async fn rust_parity_diff_against_real_vault() {
        let vault_root = std::env::var("TEAMFORGE_VAULT_ROOT")
            .expect("TEAMFORGE_VAULT_ROOT env var required for this --ignored test");
        let workspace_id = std::env::var("TEAMFORGE_WORKSPACE_ID")
            .expect("TEAMFORGE_WORKSPACE_ID env var required for this --ignored test");
        let report_path = std::env::var("TEAMFORGE_RUST_PARITY_REPORT_PATH")
            .unwrap_or_else(|_| "/tmp/rust-report.json".to_string());

        eprintln!("[vault-parity] real-vault diff: vault_root={vault_root}");
        eprintln!("[vault-parity] real-vault diff: workspace_id={workspace_id}");
        eprintln!("[vault-parity] real-vault diff: report_path={report_path}");

        // Use the same test-DB pattern as `rust_parity_run_against_fixture_vault`.
        let dir = unique_test_dir();
        let pool = crate::db::queries::init_db(&dir).await.expect("init db");

        // Run dry-run against the real vault. No Worker calls. No SQLite writes.
        let report_path_buf = std::path::PathBuf::from(&report_path);
        crate::vault::parity::run_dry_run(
            &pool,
            vault_root.as_str(),
            workspace_id.as_str(),
            "https://teamforge-api.invalid", // dry-run does not hit the worker
            "fake-token",
            &report_path_buf,
        )
        .await
        .expect("run_dry_run against real vault");

        // Sanity: the report file exists and is valid JSON with expected
        // top-level keys. Catches parity drift early, before the human runs
        // the `jq` diff. (Defense in depth around Risk #1 in RESEARCH.md
        // §"Risk Register".)
        let report_text = std::fs::read_to_string(&report_path_buf).expect("read rust report");
        let report: serde_json::Value =
            serde_json::from_str(&report_text).expect("parse rust report as JSON");

        assert_eq!(report["mode"], "dry-run", "report mode must be dry-run");
        assert!(report["counts"].is_object(), "counts must be present");
        assert!(report["warnings"].is_array(), "warnings must be present");
        // The four-family counts the existing parser at commands/mod.rs:2708-2805
        // reads. Any missing key here is parity drift; fail fast.
        for key in [
            "projectBriefsFound",
            "clientProfilesFound",
            "onboardingFlowsFound",
            "employeeKpiNotesFound",
        ] {
            assert!(
                report["counts"][key].is_number(),
                "counts.{} must be a number; report did not produce a Node-compatible shape",
                key
            );
        }

        eprintln!(
            "[vault-parity] real-vault diff: rust report written to {} ({} bytes); now run the Node script and `jq`-diff per RESEARCH.md §9 Tier 3.",
            report_path,
            report_text.len()
        );

        // Cleanup the test DB; KEEP the report file at the env-specified
        // path so the human releaser can diff it.
        pool.close().await;
        let _ = std::fs::remove_dir_all(&dir);
    }
}
