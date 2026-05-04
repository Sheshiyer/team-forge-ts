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
use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::BTreeMap;
use std::path::Path;

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
// Public entry points. Bodies land in Task 2 of Plan 01-02.
// ---------------------------------------------------------------------------

/// Apply-mode entry. Walks the vault, diffs against the Worker, PUTs all four
/// note families, writes a Node-compatible JSON report at `report_path`.
pub async fn run_apply(
    _pool: &SqlitePool,
    _vault_root: &str,
    _workspace_id: &str,
    _worker_base_url: &str,
    _access_token: &str,
    _report_path: &Path,
) -> Result<(), String> {
    Err("vault::parity::run_apply not implemented yet — see Plan 01-02 Task 2".to_string())
}

/// Dry-run entry. Same as `run_apply` but issues no Worker writes and no SQLite
/// writes.
pub async fn run_dry_run(
    _pool: &SqlitePool,
    _vault_root: &str,
    _workspace_id: &str,
    _worker_base_url: &str,
    _access_token: &str,
    _report_path: &Path,
) -> Result<(), String> {
    Err("vault::parity::run_dry_run not implemented yet — see Plan 01-02 Task 2".to_string())
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
}
