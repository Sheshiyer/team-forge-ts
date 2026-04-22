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
const TEAM_DIR_NAME: &str = "50-team";
const CLIENT_ECOSYSTEM_DIR_NAME: &str = "60-client-ecosystem";
const OBSIDIAN_DIR_NAME: &str = ".obsidian";
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
