use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaiMissionEntry {
    pub slug: String,
    pub date_prefix: String,
    pub iso_timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaiMissionSummary {
    pub total_work_entries: usize,
    pub last_30_days: usize,
    pub last_7_days: usize,
    pub today: usize,
    pub recent: Vec<PaiMissionEntry>,
}

fn parse_work_dir_name(name: &str) -> Option<PaiMissionEntry> {
    // Expected format: YYYYMMDD-HHMMSS_slug-name
    let (date_part, slug_part) = name.split_once('_')?;
    if date_part.len() != 15 || &date_part[8..9] != "-" {
        return None;
    }
    let year = &date_part[0..4];
    let month = &date_part[4..6];
    let day = &date_part[6..8];
    let hour = &date_part[9..11];
    let min = &date_part[11..13];
    let sec = &date_part[13..15];
    let iso = format!("{}-{}-{}T{}:{}:{}", year, month, day, hour, min, sec);
    Some(PaiMissionEntry {
        slug: slug_part.to_string(),
        date_prefix: date_part.to_string(),
        iso_timestamp: iso,
    })
}

#[tauri::command]
pub fn get_recent_pai_missions(limit: Option<u32>) -> Result<PaiMissionSummary, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Unable to resolve home directory".to_string())?;
    let work_dir = PathBuf::from(home).join(".claude").join("MEMORY").join("WORK");

    if !work_dir.exists() {
        return Ok(PaiMissionSummary {
            total_work_entries: 0,
            last_30_days: 0,
            last_7_days: 0,
            today: 0,
            recent: Vec::new(),
        });
    }

    let now = chrono::Utc::now();
    let today_start: chrono::DateTime<chrono::Utc> = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|naive| chrono::DateTime::from_naive_utc_and_offset(naive, chrono::Utc))
        .unwrap_or_else(|| chrono::DateTime::UNIX_EPOCH);
    let seven_days_ago = now - chrono::Duration::days(7);
    let thirty_days_ago = now - chrono::Duration::days(30);

    let mut entries: Vec<PaiMissionEntry> = Vec::new();

    for entry in std::fs::read_dir(&work_dir).map_err(|e| format!("read WORK dir: {e}"))? {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(parsed) = parse_work_dir_name(&name) {
            entries.push(parsed);
        }
    }

    // Sort descending by date prefix
    entries.sort_by(|a, b| b.date_prefix.cmp(&a.date_prefix));

    let total = entries.len();
    let last_30 = entries
        .iter()
        .filter(|e| {
            chrono::DateTime::parse_from_rfc3339(&format!("{}Z", e.iso_timestamp))
                .map(|dt| dt >= thirty_days_ago)
                .unwrap_or(false)
        })
        .count();
    let last_7 = entries
        .iter()
        .filter(|e| {
            chrono::DateTime::parse_from_rfc3339(&format!("{}Z", e.iso_timestamp))
                .map(|dt| dt >= seven_days_ago)
                .unwrap_or(false)
        })
        .count();
    let today = entries
        .iter()
        .filter(|e| {
            chrono::DateTime::parse_from_rfc3339(&format!("{}Z", e.iso_timestamp))
                .map(|dt| dt >= today_start)
                .unwrap_or(false)
        })
        .count();

    let limit = limit.unwrap_or(8) as usize;
    let recent = entries.into_iter().take(limit).collect();

    Ok(PaiMissionSummary {
        total_work_entries: total,
        last_30_days: last_30,
        last_7_days: last_7,
        today,
        recent,
    })
}
