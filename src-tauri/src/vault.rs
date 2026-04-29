use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::models::{Employee, VaultTeamProfileView};
use crate::db::queries;

pub const LOCAL_VAULT_ROOT_SETTING_KEY: &str = "local_vault_root";
const PRODUCT_DIR_NAME: &str = "40-products";
const TEAM_DIR_NAME: &str = "50-team";
const CLIENT_ECOSYSTEM_DIR_NAME: &str = "60-client-ecosystem";
const RESEARCH_HUB_DIR_NAME: &str = "30-research-hub";
const OBSIDIAN_DIR_NAME: &str = ".obsidian";
const RESEARCH_HUB_INBOX_DIR_NAME: &str = "inbox";
const STALE_REVIEW_NOTE_RELATIVE_PATH: &str = "00-meta/mocs/stale-needs-review.md";
const RESEARCH_HUB_README_RELATIVE_PATH: &str = "30-research-hub/README.md";
const CAPTURE_REGISTRY_RELATIVE_PATH: &str = "30-research-hub/capture-registry.md";
const THOUGHTSEED_VAULT_ENV_KEYS: &[&str] = &[
    "TEAMFORGE_VAULT_ROOT",
    "THOUGHTSEED_VAULT_ROOT",
    "OBSIDIAN_VAULT_ROOT",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDirectoryValidation {
    pub path: String,
    pub status: String,
    pub message: String,
    pub markers: Vec<String>,
    pub has_team_directory: bool,
    pub has_client_ecosystem_directory: bool,
    pub has_obsidian_directory: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderVaultSignals {
    pub portfolio_surfaces: Vec<VaultPortfolioSurface>,
    pub stale_notes: Vec<VaultStaleNoteSignal>,
    pub research_hub: VaultResearchHubSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultPortfolioSurface {
    pub id: String,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub commercial_reuse: Option<String>,
    pub client_name: Option<String>,
    pub source_relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStaleNoteSignal {
    pub title: String,
    pub source_relative_path: String,
    pub stale_signal: String,
    pub suggested_action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultResearchHubSummary {
    pub registry_relative_path: String,
    pub inbox_relative_path: String,
    pub total_captures: u32,
    pub raw_capture_count: u32,
    pub needs_triage_count: u32,
    pub routed_count: u32,
    pub promoted_count: u32,
    pub archived_count: u32,
    pub duplicate_count: u32,
    pub inbox_note_count: u32,
    pub live_research_count: u32,
    pub captures: Vec<VaultCaptureRegistryEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultCaptureRegistryEntry {
    pub captured: Option<String>,
    pub source: String,
    pub title: String,
    pub status: String,
    pub triage_owner: Option<String>,
    pub promotion_target: Option<String>,
    pub raw_note: Option<String>,
    pub destination: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ObsidianConfig {
    vaults: HashMap<String, ObsidianVaultEntry>,
}

#[derive(Debug, Deserialize)]
struct ObsidianVaultEntry {
    path: String,
    open: Option<bool>,
    ts: Option<i64>,
}

#[derive(Debug, Default)]
struct ParsedFrontmatter {
    scalars: HashMap<String, String>,
    arrays: HashMap<String, Vec<String>>,
    maps: HashMap<String, HashMap<String, String>>,
    body: String,
}

pub async fn load_team_profiles(pool: &SqlitePool) -> Result<Vec<VaultTeamProfileView>, String> {
    let employees = queries::get_employees(pool)
        .await
        .map_err(|error| format!("load employees for vault matching: {error}"))?;
    let vault_root = resolve_obsidian_vault_root(pool).await?;
    let team_root = vault_root.join(TEAM_DIR_NAME);

    if !team_root.is_dir() {
        return Err(format!(
            "Team vault folder not found at {}",
            team_root.display()
        ));
    }

    let mut note_paths = fs::read_dir(&team_root)
        .map_err(|error| format!("read Team vault folder {}: {error}", team_root.display()))?
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| is_team_profile_note(path))
        .collect::<Vec<_>>();
    note_paths.sort();

    let mut profiles = note_paths
        .iter()
        .map(|path| parse_team_profile(path, &vault_root, &employees))
        .collect::<Result<Vec<_>, _>>()?;

    profiles.sort_by(|left, right| {
        let left_department = left
            .department
            .as_deref()
            .unwrap_or("zz-unassigned")
            .to_lowercase();
        let right_department = right
            .department
            .as_deref()
            .unwrap_or("zz-unassigned")
            .to_lowercase();
        left_department.cmp(&right_department).then_with(|| {
            left.display_name
                .to_lowercase()
                .cmp(&right.display_name.to_lowercase())
        })
    });

    Ok(profiles)
}

pub fn validate_vault_directory(path: &Path) -> VaultDirectoryValidation {
    let display_path = path.to_string_lossy().to_string();

    if display_path.trim().is_empty() {
        return VaultDirectoryValidation {
            path: display_path,
            status: "error".to_string(),
            message: "Select a vault directory before validating.".to_string(),
            markers: Vec::new(),
            has_team_directory: false,
            has_client_ecosystem_directory: false,
            has_obsidian_directory: false,
        };
    }

    if !path.exists() {
        return VaultDirectoryValidation {
            path: display_path,
            status: "error".to_string(),
            message: "Directory does not exist on this machine.".to_string(),
            markers: Vec::new(),
            has_team_directory: false,
            has_client_ecosystem_directory: false,
            has_obsidian_directory: false,
        };
    }

    if !path.is_dir() {
        return VaultDirectoryValidation {
            path: display_path,
            status: "error".to_string(),
            message: "Selected path is not a directory.".to_string(),
            markers: Vec::new(),
            has_team_directory: false,
            has_client_ecosystem_directory: false,
            has_obsidian_directory: false,
        };
    }

    let has_team_directory = path.join(TEAM_DIR_NAME).is_dir();
    let has_client_ecosystem_directory = path.join(CLIENT_ECOSYSTEM_DIR_NAME).is_dir();
    let has_obsidian_directory = path.join(OBSIDIAN_DIR_NAME).is_dir();

    let mut markers = Vec::new();
    if has_team_directory {
        markers.push(TEAM_DIR_NAME.to_string());
    }
    if has_client_ecosystem_directory {
        markers.push(CLIENT_ECOSYSTEM_DIR_NAME.to_string());
    }
    if has_obsidian_directory {
        markers.push(OBSIDIAN_DIR_NAME.to_string());
    }

    let (status, message) =
        if has_team_directory || has_client_ecosystem_directory || has_obsidian_directory {
            (
                "ready".to_string(),
                "Vault directory looks usable for TeamForge.".to_string(),
            )
        } else {
            (
                "warning".to_string(),
                "Directory exists, but known Thoughtseed vault markers were not found yet."
                    .to_string(),
            )
        };

    VaultDirectoryValidation {
        path: display_path,
        status,
        message,
        markers,
        has_team_directory,
        has_client_ecosystem_directory,
        has_obsidian_directory,
    }
}

pub async fn load_founder_vault_signals(pool: &SqlitePool) -> Result<FounderVaultSignals, String> {
    let vault_root = resolve_obsidian_vault_root(pool).await?;

    Ok(FounderVaultSignals {
        portfolio_surfaces: load_portfolio_surfaces(&vault_root)?,
        stale_notes: load_stale_review_notes(&vault_root)?,
        research_hub: load_research_hub_summary(&vault_root)?,
    })
}

pub async fn resolve_local_vault_root(pool: &SqlitePool) -> Result<PathBuf, String> {
    resolve_obsidian_vault_root(pool).await
}

async fn resolve_obsidian_vault_root(pool: &SqlitePool) -> Result<PathBuf, String> {
    if let Some(saved_path) = queries::get_setting(pool, LOCAL_VAULT_ROOT_SETTING_KEY)
        .await
        .map_err(|error| format!("read saved local vault root: {error}"))?
    {
        let trimmed = saved_path.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return Ok(path);
            }
            return Err(format!(
                "Saved local vault root is not a readable directory: {}",
                path.display()
            ));
        }
    }

    for key in THOUGHTSEED_VAULT_ENV_KEYS {
        if let Some(value) = env::var_os(key) {
            let path = PathBuf::from(value);
            if path.is_dir() {
                return Ok(path);
            }
        }
    }

    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set; cannot locate Obsidian config".to_string())?;
    let config_path = home.join("Library/Application Support/obsidian/obsidian.json");
    let raw = fs::read_to_string(&config_path)
        .map_err(|error| format!("read Obsidian config {}: {error}", config_path.display()))?;
    let config: ObsidianConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("parse Obsidian config {}: {error}", config_path.display()))?;

    let mut vaults = config.vaults.into_values().collect::<Vec<_>>();
    vaults.sort_by(|left, right| {
        right
            .ts
            .unwrap_or_default()
            .cmp(&left.ts.unwrap_or_default())
    });

    if let Some(entry) = vaults.iter().find(|entry| entry.open.unwrap_or(false)) {
        let path = PathBuf::from(&entry.path);
        if path.is_dir() {
            return Ok(path);
        }
    }

    if let Some(entry) = vaults
        .iter()
        .find(|entry| entry.path.ends_with("thoughtseed-labs"))
    {
        let path = PathBuf::from(&entry.path);
        if path.is_dir() {
            return Ok(path);
        }
    }

    vaults
        .into_iter()
        .map(|entry| PathBuf::from(entry.path))
        .find(|path| path.is_dir())
        .ok_or_else(|| "No readable Obsidian vault path was found in obsidian.json".to_string())
}

fn is_team_profile_note(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !file_name.ends_with(".md") {
        return false;
    }
    if file_name.eq_ignore_ascii_case("README.md")
        || file_name.eq_ignore_ascii_case("team-member-template.md")
        || file_name.ends_with("-kpi.md")
    {
        return false;
    }
    true
}

fn parse_team_profile(
    file_path: &Path,
    vault_root: &Path,
    employees: &[Employee],
) -> Result<VaultTeamProfileView, String> {
    let contents = fs::read_to_string(file_path)
        .map_err(|error| format!("read vault team note {}: {error}", file_path.display()))?;
    let metadata = fs::metadata(file_path)
        .map_err(|error| format!("read metadata for {}: {error}", file_path.display()))?;
    let parsed = parse_frontmatter(&contents);
    let member_id = parsed.scalars.get("member_id").cloned().unwrap_or_else(|| {
        file_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string()
    });
    let matched_employee = resolve_employee_for_member(&member_id, employees);
    let display_name = parsed
        .scalars
        .get("display_name")
        .cloned()
        .or_else(|| extract_h1_title(&parsed.body))
        .unwrap_or_else(|| titleize_slug(&member_id));
    let source_relative_path = file_path
        .strip_prefix(vault_root)
        .unwrap_or(file_path)
        .to_string_lossy()
        .replace('\\', "/");
    let source_last_modified_at = metadata
        .modified()
        .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
        .unwrap_or_else(|_| Utc::now().to_rfc3339());
    let summary_markdown = extract_summary_markdown(&parsed.body);
    let role_scope_markdown = extract_section_markdown(&parsed.body, "role scope");
    let contact = parsed.maps.get("contact");

    Ok(VaultTeamProfileView {
        member_id,
        employee_id: matched_employee.map(|employee| employee.id.clone()),
        display_name,
        role: parsed.scalars.get("role").cloned(),
        role_template: parsed.scalars.get("role_template").cloned(),
        department: parsed.scalars.get("department").cloned(),
        primary_projects: parsed
            .arrays
            .get("primary_projects")
            .cloned()
            .unwrap_or_default(),
        scope: parsed.arrays.get("scope").cloned().unwrap_or_default(),
        team_tags: parsed.arrays.get("team_tags").cloned().unwrap_or_default(),
        onboarding_stage: parsed
            .arrays
            .get("onboarding_stage")
            .cloned()
            .unwrap_or_default(),
        active: parse_bool(parsed.scalars.get("active")).unwrap_or(true),
        hired_status: parsed.scalars.get("hired_status").cloned(),
        clockify_status: parsed.scalars.get("clockify_status").cloned(),
        probation: parsed.scalars.get("probation").cloned(),
        joined: parsed.scalars.get("joined").cloned(),
        contract_effective: parsed.scalars.get("contract_effective").cloned(),
        contact_email: contact
            .and_then(|map| map.get("email").cloned())
            .or_else(|| contact.and_then(|map| map.get("internal_email_channel").cloned())),
        contact_location: contact.and_then(|map| map.get("location").cloned()),
        signed_contract_on_file: parsed.scalars.get("signed_contract_on_file").cloned(),
        source: parsed.scalars.get("source").cloned(),
        source_url: parsed.scalars.get("source_url").cloned(),
        imported_at: parsed.scalars.get("imported_at").cloned(),
        summary_markdown,
        role_scope_markdown,
        source_file_path: file_path.to_string_lossy().to_string(),
        source_relative_path,
        source_last_modified_at,
    })
}

fn parse_frontmatter(contents: &str) -> ParsedFrontmatter {
    if !contents.starts_with("---\n") {
        return ParsedFrontmatter {
            body: contents.to_string(),
            ..ParsedFrontmatter::default()
        };
    }

    let Some(end_index) = contents[4..].find("\n---\n").map(|index| index + 4) else {
        return ParsedFrontmatter {
            body: contents.to_string(),
            ..ParsedFrontmatter::default()
        };
    };

    let frontmatter = &contents[4..end_index];
    let body = contents[end_index + 5..].to_string();
    let mut parsed = ParsedFrontmatter {
        body,
        ..ParsedFrontmatter::default()
    };
    let mut open_map_key: Option<String> = None;

    for line in frontmatter.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Some(map_key) = open_map_key.clone() {
            if line.starts_with("  ") || line.starts_with('\t') {
                if let Some((key, value)) = split_field(line.trim()) {
                    parsed
                        .maps
                        .entry(map_key)
                        .or_default()
                        .insert(key.to_string(), parse_scalar(value));
                    continue;
                }
            }
            open_map_key = None;
        }

        if let Some((key, value)) = split_field(line) {
            if value.trim().is_empty() {
                open_map_key = Some(key.to_string());
                parsed.maps.entry(key.to_string()).or_default();
                continue;
            }

            if let Some(array) = parse_array_literal(value) {
                parsed.arrays.insert(key.to_string(), array);
            } else {
                parsed.scalars.insert(key.to_string(), parse_scalar(value));
            }
        }
    }

    parsed
}

fn load_portfolio_surfaces(vault_root: &Path) -> Result<Vec<VaultPortfolioSurface>, String> {
    let mut files = Vec::new();
    collect_named_files(
        &vault_root.join(PRODUCT_DIR_NAME),
        "product-overview.md",
        &mut files,
    )?;
    collect_named_files(
        &vault_root.join(CLIENT_ECOSYSTEM_DIR_NAME),
        "project-brief.md",
        &mut files,
    )?;
    files.sort();

    let mut surfaces = Vec::new();
    for file_path in files {
        if file_path
            .components()
            .any(|component| component.as_os_str() == "90-archives")
        {
            continue;
        }

        let relative_path = file_path
            .strip_prefix(vault_root)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .replace('\\', "/");
        let contents = fs::read_to_string(&file_path)
            .map_err(|error| format!("read portfolio note {}: {error}", file_path.display()))?;
        let parsed = parse_frontmatter(&contents);
        let title = extract_h1_title(&parsed.body).unwrap_or_else(|| {
            file_path
                .parent()
                .and_then(|parent| parent.file_name())
                .and_then(|value| value.to_str())
                .map(titleize_slug)
                .unwrap_or_else(|| "Untitled".to_string())
        });
        let status = parsed
            .scalars
            .get("status")
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "unknown".to_string());
        let commercial_reuse = parsed
            .scalars
            .get("commercial_reuse")
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty());

        let kind = if relative_path.starts_with(&format!("{PRODUCT_DIR_NAME}/")) {
            "product".to_string()
        } else {
            "client-delivery".to_string()
        };

        let client_name = if kind == "client-delivery" {
            parsed
                .scalars
                .get("client_id")
                .map(|value| titleize_slug(value))
                .or_else(|| relative_path.split('/').nth(1).map(titleize_slug))
        } else {
            None
        };

        let id = parsed
            .scalars
            .get(if kind == "product" {
                "product_id"
            } else {
                "project_id"
            })
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| relative_path.clone());
        let project_id = if kind == "client-delivery" {
            parsed
                .scalars
                .get("project_id")
                .cloned()
                .filter(|value| !value.trim().is_empty())
        } else {
            None
        };
        let client_id = if kind == "client-delivery" {
            parsed
                .scalars
                .get("client_id")
                .cloned()
                .filter(|value| !value.trim().is_empty())
        } else {
            None
        };

        surfaces.push(VaultPortfolioSurface {
            id,
            project_id,
            client_id,
            title,
            kind,
            status,
            commercial_reuse,
            client_name,
            source_relative_path: relative_path,
        });
    }

    surfaces.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then(left.status.cmp(&right.status))
            .then(left.title.cmp(&right.title))
    });
    Ok(surfaces)
}

fn load_stale_review_notes(vault_root: &Path) -> Result<Vec<VaultStaleNoteSignal>, String> {
    let path = vault_root.join(STALE_REVIEW_NOTE_RELATIVE_PATH);
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("read stale review note {}: {error}", path.display()))?;
    let mut rows = Vec::new();

    for cells in extract_markdown_table_rows(
        &contents,
        "| File | Folder | Stale signal | Suggested action |",
    ) {
        if cells.len() < 4 {
            continue;
        }
        let (title, source_relative_path) = parse_wiki_link_cell(&cells[0]);
        if title.is_empty() && source_relative_path.is_empty() {
            continue;
        }
        rows.push(VaultStaleNoteSignal {
            title,
            source_relative_path,
            stale_signal: clean_markdown_cell(&cells[2]),
            suggested_action: clean_markdown_cell(&cells[3]),
        });
    }

    Ok(rows)
}

fn load_research_hub_summary(vault_root: &Path) -> Result<VaultResearchHubSummary, String> {
    let registry_relative_path = CAPTURE_REGISTRY_RELATIVE_PATH.to_string();
    let inbox_relative_path = format!("{RESEARCH_HUB_DIR_NAME}/{RESEARCH_HUB_INBOX_DIR_NAME}");

    let inbox_root = vault_root.join(&inbox_relative_path);
    let inbox_note_count = count_markdown_notes(&inbox_root)?;

    let live_research_count =
        read_optional_file(&vault_root.join(RESEARCH_HUB_README_RELATIVE_PATH))
            .map(|contents| {
                extract_markdown_table_rows(
                    &contents,
                    "| Research line | Note | Current interpretation |",
                )
                .len() as u32
            })
            .unwrap_or(0);

    let mut summary = VaultResearchHubSummary {
        registry_relative_path,
        inbox_relative_path,
        total_captures: 0,
        raw_capture_count: 0,
        needs_triage_count: 0,
        routed_count: 0,
        promoted_count: 0,
        archived_count: 0,
        duplicate_count: 0,
        inbox_note_count,
        live_research_count,
        captures: Vec::new(),
    };

    let Some(contents) = read_optional_file(&vault_root.join(CAPTURE_REGISTRY_RELATIVE_PATH))
    else {
        return Ok(summary);
    };

    for cells in extract_markdown_table_rows(
        &contents,
        "| Captured | Source | Title / slug | Status | Triage owner | Promotion target | Raw note | Destination |",
    ) {
        if cells.len() < 8 {
            continue;
        }
        let title = clean_markdown_cell(&cells[2]);
        if title.is_empty() {
            continue;
        }

        let status = clean_markdown_cell(&cells[3]).to_lowercase();
        summary.total_captures += 1;
        match status.as_str() {
            "raw-capture" => summary.raw_capture_count += 1,
            "needs-triage" => summary.needs_triage_count += 1,
            "routed" => summary.routed_count += 1,
            "promoted" => summary.promoted_count += 1,
            "archived" => summary.archived_count += 1,
            "duplicate" => summary.duplicate_count += 1,
            _ => {}
        }

        summary.captures.push(VaultCaptureRegistryEntry {
            captured: optional_clean_markdown_cell(&cells[0]),
            source: clean_markdown_cell(&cells[1]),
            title,
            status,
            triage_owner: optional_clean_markdown_cell(&cells[4]),
            promotion_target: optional_clean_markdown_cell(&cells[5]),
            raw_note: optional_clean_markdown_cell(&cells[6]),
            destination: optional_clean_markdown_cell(&cells[7]),
        });
    }

    Ok(summary)
}

fn collect_named_files(
    root: &Path,
    target_name: &str,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(root)
        .map_err(|error| format!("read vault directory {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("read entry in {}: {error}", root.display()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_named_files(&path, target_name, files)?;
            continue;
        }

        if path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case(target_name))
            .unwrap_or(false)
        {
            files.push(path);
        }
    }

    Ok(())
}

fn count_markdown_notes(root: &Path) -> Result<u32, String> {
    let mut files = Vec::new();
    collect_markdown_files(root, &mut files)?;
    Ok(files
        .into_iter()
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(|value| !value.eq_ignore_ascii_case("README.md"))
                .unwrap_or(false)
        })
        .count() as u32)
}

fn collect_markdown_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(root)
        .map_err(|error| format!("read vault directory {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("read entry in {}: {error}", root.display()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_markdown_files(&path, files)?;
            continue;
        }

        let is_markdown = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        if is_markdown {
            files.push(path);
        }
    }

    Ok(())
}

fn read_optional_file(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    fs::read_to_string(path).ok()
}

fn extract_markdown_table_rows(contents: &str, header_prefix: &str) -> Vec<Vec<String>> {
    let mut collecting = false;
    let mut rows = Vec::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if !collecting {
            if trimmed.starts_with(header_prefix) {
                collecting = true;
            }
            continue;
        }

        if trimmed.starts_with("|---") {
            continue;
        }

        if !trimmed.starts_with('|') {
            if !rows.is_empty() {
                break;
            }
            continue;
        }

        let cells = split_markdown_row(trimmed);
        if !cells.is_empty() {
            rows.push(cells);
        }
    }

    rows
}

fn split_markdown_row(line: &str) -> Vec<String> {
    let trimmed = line.trim().trim_start_matches('|').trim_end_matches('|');
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut in_wiki_link = false;
    let mut chars = trimmed.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '[' && chars.peek() == Some(&'[') {
            in_wiki_link = true;
            current.push(ch);
            current.push(chars.next().unwrap_or('['));
            continue;
        }

        if ch == ']' && chars.peek() == Some(&']') {
            current.push(ch);
            current.push(chars.next().unwrap_or(']'));
            in_wiki_link = false;
            continue;
        }

        if ch == '|' && !in_wiki_link {
            cells.push(current.trim().to_string());
            current.clear();
            continue;
        }

        current.push(ch);
    }

    cells.push(current.trim().to_string());

    cells
}

fn parse_wiki_link_cell(cell: &str) -> (String, String) {
    let trimmed = cell.trim();
    if let Some(start) = trimmed.find("[[") {
        if let Some(end) = trimmed[start + 2..].find("]]") {
            let inner = &trimmed[start + 2..start + 2 + end];
            if let Some((path, label)) = inner.split_once('|') {
                return (clean_markdown_cell(label), clean_markdown_cell(path));
            }
            let path = clean_markdown_cell(inner);
            let title = path
                .rsplit('/')
                .next()
                .map(|value| titleize_slug(value.trim_end_matches(".md")))
                .unwrap_or_else(|| path.clone());
            return (title, path);
        }
    }

    let cleaned = clean_markdown_cell(trimmed);
    (cleaned.clone(), cleaned)
}

fn clean_markdown_cell(value: &str) -> String {
    value.trim().trim_matches('`').trim().to_string()
}

fn optional_clean_markdown_cell(value: &str) -> Option<String> {
    let cleaned = clean_markdown_cell(value);
    if cleaned.is_empty() || cleaned == "—" {
        None
    } else {
        Some(cleaned)
    }
}

fn split_field(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim()))
}

fn parse_scalar(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        trimmed[1..trimmed.len() - 1].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_array_literal(value: &str) -> Option<Vec<String>> {
    let trimmed = value.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }

    let inner = &trimmed[1..trimmed.len() - 1];
    if inner.trim().is_empty() {
        return Some(Vec::new());
    }

    Some(
        inner
            .split(',')
            .map(parse_scalar)
            .filter(|item| !item.is_empty())
            .collect(),
    )
}

fn parse_bool(value: Option<&String>) -> Option<bool> {
    match value.map(|item| item.trim().to_lowercase()) {
        Some(value) if value == "true" => Some(true),
        Some(value) if value == "false" => Some(false),
        _ => None,
    }
}

fn extract_h1_title(body: &str) -> Option<String> {
    body.lines()
        .find_map(|line| {
            line.trim_start()
                .strip_prefix("# ")
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn extract_summary_markdown(body: &str) -> Option<String> {
    let mut seen_h1 = false;
    let mut lines = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if !seen_h1 {
            if trimmed.starts_with("# ") {
                seen_h1 = true;
            }
            continue;
        }

        if trimmed.starts_with("## ") {
            break;
        }

        if trimmed.is_empty() {
            if !lines.is_empty() {
                lines.push(String::new());
            }
            continue;
        }

        lines.push(trimmed.to_string());
    }

    join_markdown_lines(lines)
}

fn extract_section_markdown(body: &str, section_name: &str) -> Option<String> {
    let target = normalize_heading(section_name);
    let mut current_heading: Option<String> = None;
    let mut lines = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            if current_heading.as_deref() == Some(target.as_str()) && !lines.is_empty() {
                break;
            }
            current_heading = Some(normalize_heading(heading));
            continue;
        }
        if trimmed.starts_with("### ") && current_heading.as_deref() == Some(target.as_str()) {
            if !lines.is_empty() {
                break;
            }
            continue;
        }
        if current_heading.as_deref() == Some(target.as_str()) {
            lines.push(trimmed.to_string());
        }
    }

    join_markdown_lines(lines)
}

fn join_markdown_lines(lines: Vec<String>) -> Option<String> {
    let joined = lines.join("\n").trim().to_string();
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn normalize_heading(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || ch.is_whitespace() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn resolve_employee_for_member<'a>(
    member_id: &str,
    employees: &'a [Employee],
) -> Option<&'a Employee> {
    let target_keys = build_member_target_keys(member_id);
    let exact_matches = employees
        .iter()
        .filter(|employee| {
            build_employee_alias_candidates(employee)
                .iter()
                .any(|alias| target_keys.contains(alias))
        })
        .collect::<Vec<_>>();

    if exact_matches.len() == 1 {
        return exact_matches.into_iter().next();
    }
    if exact_matches.len() > 1 {
        return None;
    }

    let prefix_matches = employees
        .iter()
        .filter(|employee| {
            build_employee_alias_candidates(employee)
                .iter()
                .any(|alias| {
                    target_keys.iter().any(|target| {
                        target.len() >= 4
                            && (alias.starts_with(target) || target.starts_with(alias))
                    })
                })
        })
        .collect::<Vec<_>>();

    if prefix_matches.len() == 1 {
        prefix_matches.into_iter().next()
    } else {
        None
    }
}

fn build_member_target_keys(member_id: &str) -> HashSet<String> {
    let mut keys = HashSet::new();
    let normalized = normalize_key(member_id);
    if !normalized.is_empty() {
        keys.insert(normalized.clone());
        keys.insert(normalized.replace(' ', ""));
        keys.insert(normalize_slug(member_id));
    }
    keys
}

fn build_employee_alias_candidates(employee: &Employee) -> HashSet<String> {
    let mut aliases = HashSet::new();

    add_alias(&mut aliases, &employee.name);
    if let Some(local_part) = employee.email.split('@').next() {
        add_alias(&mut aliases, local_part);
    }

    let name_tokens = normalize_key(&employee.name)
        .split_whitespace()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    if let Some(first) = name_tokens.first() {
        add_alias(&mut aliases, first);
    }
    if name_tokens.len() >= 2 {
        add_alias(
            &mut aliases,
            &format!("{} {}", name_tokens[0], name_tokens[1]),
        );
    }

    aliases
}

fn add_alias(target: &mut HashSet<String>, value: &str) {
    let normalized = normalize_key(value);
    if normalized.is_empty() {
        return;
    }
    target.insert(normalized.clone());
    target.insert(normalized.replace(' ', ""));
    target.insert(normalize_slug(value));
}

fn normalize_key(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_ascii_lowercase()
            } else if ch.is_whitespace() || ch == '-' || ch == '_' || ch == '.' {
                ' '
            } else {
                '\0'
            }
        })
        .filter(|ch| *ch != '\0')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_slug(value: &str) -> String {
    normalize_key(value).replace(' ', "-")
}

fn titleize_slug(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|segment| !segment.trim().is_empty())
        .map(|segment| {
            let trimmed = segment.trim();
            let mut chars = trimmed.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
