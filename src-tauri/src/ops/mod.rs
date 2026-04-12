pub const OPS_EVENT_SCHEMA_VERSION: &str = "ops_event/v1";

#[derive(Debug, Clone)]
pub struct OpsSyncKeyInput<'a> {
    pub source: &'a str,
    pub event_type: &'a str,
    pub entity_type: &'a str,
    pub entity_id: &'a str,
    pub actor_employee_id: Option<&'a str>,
    pub actor_clockify_user_id: Option<&'a str>,
    pub actor_huly_person_id: Option<&'a str>,
    pub actor_slack_user_id: Option<&'a str>,
    pub occurred_at: &'a str,
}

fn normalize_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.trim().to_lowercase().chars() {
        match ch {
            'a'..='z' | '0'..='9' | '-' | '_' | '.' => out.push(ch),
            _ => out.push('_'),
        }
    }

    if out.is_empty() {
        "na".to_string()
    } else {
        out
    }
}

fn normalize_optional_segment(value: Option<&str>) -> String {
    match value {
        Some(raw) if !raw.trim().is_empty() => normalize_segment(raw),
        _ => "na".to_string(),
    }
}

pub fn build_sync_key(input: &OpsSyncKeyInput<'_>) -> String {
    let parts = [
        "v1".to_string(),
        normalize_segment(input.source),
        normalize_segment(input.event_type),
        normalize_segment(input.entity_type),
        normalize_segment(input.entity_id),
        normalize_optional_segment(input.actor_employee_id),
        normalize_optional_segment(input.actor_clockify_user_id),
        normalize_optional_segment(input.actor_huly_person_id),
        normalize_optional_segment(input.actor_slack_user_id),
        normalize_segment(input.occurred_at),
    ];

    format!("ops:{}", parts.join(":"))
}

#[cfg(test)]
mod tests {
    use super::{build_sync_key, OpsSyncKeyInput};

    #[test]
    fn sync_key_is_deterministic_for_same_input() {
        let input = OpsSyncKeyInput {
            source: "Clockify",
            event_type: "clockify.time_entry.logged",
            entity_type: "clockify_time_entry",
            entity_id: "te_123",
            actor_employee_id: Some("emp_1"),
            actor_clockify_user_id: Some("clockify_1"),
            actor_huly_person_id: None,
            actor_slack_user_id: None,
            occurred_at: "2026-04-12T16:55:00Z",
        };

        let first = build_sync_key(&input);
        let second = build_sync_key(&input);
        assert_eq!(first, second);
    }

    #[test]
    fn sync_key_changes_when_occurrence_changes() {
        let first = build_sync_key(&OpsSyncKeyInput {
            source: "huly",
            event_type: "huly.issue.modified",
            entity_type: "huly_issue",
            entity_id: "issue-1",
            actor_employee_id: Some("emp-1"),
            actor_clockify_user_id: None,
            actor_huly_person_id: Some("person-1"),
            actor_slack_user_id: None,
            occurred_at: "2026-04-12T16:55:00Z",
        });
        let second = build_sync_key(&OpsSyncKeyInput {
            source: "huly",
            event_type: "huly.issue.modified",
            entity_type: "huly_issue",
            entity_id: "issue-1",
            actor_employee_id: Some("emp-1"),
            actor_clockify_user_id: None,
            actor_huly_person_id: Some("person-1"),
            actor_slack_user_id: None,
            occurred_at: "2026-04-12T16:56:00Z",
        });

        assert_ne!(first, second);
    }
}
