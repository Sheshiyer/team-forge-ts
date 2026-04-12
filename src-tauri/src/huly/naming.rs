/// Issue #13 — Task Naming Convention System
///
/// Format: `[PROJECT]-[TYPE]-[COMPONENT]-[ID]: Description`
///
/// Project codes: AXT, TUY, BZL, VBX, OAS, INT
/// Type codes:    FEAT, BUG, TASK, DOC, RESEARCH, SETUP
///
/// Examples:
///   AXT-FEAT-AUTH-001: Implement OAuth login
///   TUY-BUG-API-042: Fix rate limit handling
///   INT-SETUP-CI-003: Configure GitHub Actions
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProjectCode {
    Axt,
    Tuy,
    Bzl,
    Vbx,
    Oas,
    Int,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TypeCode {
    Feat,
    Bug,
    Task,
    Doc,
    Research,
    Setup,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTaskName {
    /// Whether the title follows the convention
    pub compliant: bool,
    /// Extracted project code (e.g. "AXT")
    pub project_code: Option<String>,
    /// Extracted type code (e.g. "FEAT")
    pub type_code: Option<String>,
    /// Extracted component (e.g. "AUTH")
    pub component: Option<String>,
    /// Extracted numeric ID (e.g. "001")
    pub task_id: Option<String>,
    /// The description part after the colon
    pub description: Option<String>,
    /// Compliance score 0.0–1.0
    pub compliance_score: f32,
}

const VALID_PROJECT_CODES: &[&str] = &["AXT", "TUY", "BZL", "VBX", "OAS", "INT"];
const VALID_TYPE_CODES: &[&str] = &["FEAT", "BUG", "TASK", "DOC", "RESEARCH", "SETUP"];

/// Parse a Huly issue title against the naming convention.
pub fn parse_task_name(title: &str) -> ParsedTaskName {
    let title = title.trim();

    // Split on first ": " to separate prefix from description
    let (prefix, description) = if let Some(pos) = title.find(": ") {
        (&title[..pos], Some(title[pos + 2..].trim().to_string()))
    } else {
        (title, None)
    };

    // Split prefix on "-"
    let parts: Vec<&str> = prefix.split('-').collect();

    if parts.len() < 3 {
        return ParsedTaskName {
            compliant: false,
            project_code: None,
            type_code: None,
            component: None,
            task_id: None,
            description,
            compliance_score: 0.0,
        };
    }

    let project_code = parts[0].to_uppercase();
    let type_code = parts[1].to_uppercase();
    let component = parts[2].to_uppercase();
    let task_id = parts.get(3).map(|s| s.to_string());

    let project_valid = VALID_PROJECT_CODES.contains(&project_code.as_str());
    let type_valid = VALID_TYPE_CODES.contains(&type_code.as_str());
    let component_valid = !component.is_empty() && component.chars().all(|c| c.is_alphanumeric());
    let id_valid = task_id
        .as_ref()
        .map(|id| id.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(true); // ID is optional
    let has_description = description.as_ref().map(|d| !d.is_empty()).unwrap_or(false);

    let score_parts = [
        project_valid,
        type_valid,
        component_valid,
        id_valid,
        has_description,
    ];
    let score = score_parts.iter().filter(|&&v| v).count() as f32 / score_parts.len() as f32;
    let compliant = project_valid && type_valid && component_valid && has_description;

    ParsedTaskName {
        compliant,
        project_code: Some(project_code),
        type_code: Some(type_code),
        component: Some(component),
        task_id,
        description,
        compliance_score: score,
    }
}

/// Compute naming convention compliance stats for a list of issue titles.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamingComplianceStats {
    pub total: u32,
    pub compliant: u32,
    pub compliance_percent: f64,
    pub by_project: Vec<ProjectCompliance>,
    pub by_type: Vec<TypeCompliance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCompliance {
    pub project_code: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeCompliance {
    pub type_code: String,
    pub count: u32,
}

pub fn compute_compliance_stats(titles: &[String]) -> NamingComplianceStats {
    use std::collections::HashMap;

    let mut compliant_count = 0u32;
    let mut by_project: HashMap<String, u32> = HashMap::new();
    let mut by_type: HashMap<String, u32> = HashMap::new();

    for title in titles {
        let parsed = parse_task_name(title);
        if parsed.compliant {
            compliant_count += 1;
        }
        if let Some(proj) = &parsed.project_code {
            if VALID_PROJECT_CODES.contains(&proj.as_str()) {
                *by_project.entry(proj.clone()).or_default() += 1;
            }
        }
        if let Some(typ) = &parsed.type_code {
            if VALID_TYPE_CODES.contains(&typ.as_str()) {
                *by_type.entry(typ.clone()).or_default() += 1;
            }
        }
    }

    let total = titles.len() as u32;
    let compliance_percent = if total > 0 {
        (compliant_count as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    let mut by_project: Vec<ProjectCompliance> = by_project
        .into_iter()
        .map(|(project_code, count)| ProjectCompliance {
            project_code,
            count,
        })
        .collect();
    by_project.sort_by(|a, b| b.count.cmp(&a.count));

    let mut by_type: Vec<TypeCompliance> = by_type
        .into_iter()
        .map(|(type_code, count)| TypeCompliance { type_code, count })
        .collect();
    by_type.sort_by(|a, b| b.count.cmp(&a.count));

    NamingComplianceStats {
        total,
        compliant: compliant_count,
        compliance_percent,
        by_project,
        by_type,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fully_compliant_title() {
        let p = parse_task_name("AXT-FEAT-AUTH-001: Implement OAuth login");
        assert!(p.compliant);
        assert_eq!(p.project_code.as_deref(), Some("AXT"));
        assert_eq!(p.type_code.as_deref(), Some("FEAT"));
        assert_eq!(p.component.as_deref(), Some("AUTH"));
        assert_eq!(p.task_id.as_deref(), Some("001"));
        assert_eq!(p.description.as_deref(), Some("Implement OAuth login"));
    }

    #[test]
    fn parses_without_id() {
        let p = parse_task_name("TUY-BUG-API: Fix rate limit handling");
        assert!(p.compliant);
        assert_eq!(p.project_code.as_deref(), Some("TUY"));
        assert_eq!(p.type_code.as_deref(), Some("BUG"));
        assert!(p.task_id.is_none());
    }

    #[test]
    fn non_compliant_title() {
        let p = parse_task_name("Fix the login bug");
        assert!(!p.compliant);
        assert!(p.compliance_score < 0.5);
    }

    #[test]
    fn invalid_project_code_not_compliant() {
        let p = parse_task_name("XYZ-FEAT-AUTH: Something");
        assert!(!p.compliant);
    }

    #[test]
    fn compliance_stats() {
        let titles = vec![
            "AXT-FEAT-AUTH-001: Login".to_string(),
            "TUY-BUG-API: Fix".to_string(),
            "Random title".to_string(),
        ];
        let stats = compute_compliance_stats(&titles);
        assert_eq!(stats.total, 3);
        assert_eq!(stats.compliant, 2);
        assert!((stats.compliance_percent - 66.666).abs() < 0.1);
    }
}
