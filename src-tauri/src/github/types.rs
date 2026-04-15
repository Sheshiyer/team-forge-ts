use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct GithubLabel {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubUser {
    pub login: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubIssueMilestone {
    pub number: i64,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubPullRequestMarker {}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubIssue {
    pub node_id: Option<String>,
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub labels: Vec<GithubLabel>,
    pub assignees: Vec<GithubUser>,
    pub milestone: Option<GithubIssueMilestone>,
    pub html_url: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub pull_request: Option<GithubPullRequestMarker>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubMilestone {
    pub number: i64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub due_on: Option<String>,
    pub html_url: Option<String>,
    pub open_issues: i64,
    pub closed_issues: i64,
    pub updated_at: Option<String>,
}

pub fn github_project_id(repo: &str, milestone_number: i64) -> String {
    format!("github:{repo}:milestone:{milestone_number}")
}

pub fn github_issue_id(repo: &str, number: i64) -> String {
    format!("github:{repo}:issue:{number}")
}

pub fn labels_to_names(labels: &[GithubLabel]) -> Vec<String> {
    labels.iter().map(|label| label.name.clone()).collect()
}

pub fn assignees_to_logins(assignees: &[GithubUser]) -> Vec<String> {
    assignees.iter().map(|user| user.login.clone()).collect()
}

pub fn issue_body_excerpt(body: Option<&str>) -> Option<String> {
    body.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(500).collect())
}

pub fn priority_from_labels(labels: &[String]) -> Option<String> {
    labels
        .iter()
        .find_map(|label| label.strip_prefix("priority:").map(str::to_string))
}

pub fn track_from_issue(title: &str, labels: &[String]) -> Option<String> {
    labels
        .iter()
        .find_map(|label| label.strip_prefix("track:").map(str::to_string))
        .or_else(|| {
            title
                .split_whitespace()
                .find(|part| part.starts_with("track-"))
                .map(|value| {
                    value
                        .trim_matches(|ch: char| !ch.is_alphanumeric() && ch != '-')
                        .to_string()
                })
        })
}

pub fn event_type_for_issue(previous_state: Option<&str>, current_state: &str) -> &'static str {
    match previous_state {
        None if current_state.eq_ignore_ascii_case("closed") => "github.issue.closed",
        None => "github.issue.opened",
        Some(prev)
            if !prev.eq_ignore_ascii_case(current_state)
                && current_state.eq_ignore_ascii_case("closed") =>
        {
            "github.issue.closed"
        }
        Some(prev)
            if !prev.eq_ignore_ascii_case(current_state)
                && current_state.eq_ignore_ascii_case("open") =>
        {
            "github.issue.reopened"
        }
        _ => "github.issue.updated",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_project_identity_uses_repo_and_milestone() {
        assert_eq!(
            github_project_id("Sheshiyer/parkarea-aleph", 1),
            "github:Sheshiyer/parkarea-aleph:milestone:1"
        );
    }

    #[test]
    fn parses_priority_and_track_from_labels_and_title() {
        let labels = vec!["priority:p0".to_string(), "wave:1".to_string()];
        assert_eq!(priority_from_labels(&labels), Some("p0".to_string()));
        assert_eq!(
            track_from_issue("[Track T-002] track-backend-core", &labels),
            Some("track-backend-core".to_string())
        );
    }

    #[test]
    fn issue_event_type_tracks_state_transitions() {
        assert_eq!(event_type_for_issue(None, "open"), "github.issue.opened");
        assert_eq!(event_type_for_issue(None, "closed"), "github.issue.closed");
        assert_eq!(
            event_type_for_issue(Some("open"), "closed"),
            "github.issue.closed"
        );
        assert_eq!(
            event_type_for_issue(Some("closed"), "open"),
            "github.issue.reopened"
        );
        assert_eq!(
            event_type_for_issue(Some("open"), "open"),
            "github.issue.updated"
        );
    }
}
