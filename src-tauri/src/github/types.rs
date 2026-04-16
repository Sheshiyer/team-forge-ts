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
pub struct GithubPullRequestRef {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubPullRequestBase {
    #[serde(rename = "ref")]
    pub ref_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubPullRequest {
    pub node_id: Option<String>,
    pub number: i64,
    pub title: String,
    pub state: String,
    #[serde(default)]
    pub draft: bool,
    pub html_url: String,
    pub head: GithubPullRequestRef,
    pub base: GithubPullRequestBase,
    pub user: Option<GithubUser>,
    #[serde(default)]
    pub labels: Vec<GithubLabel>,
    #[serde(default)]
    pub assignees: Vec<GithubUser>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubBranchCommit {
    pub sha: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubBranch {
    pub name: String,
    pub commit: GithubBranchCommit,
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubCheckRunApp {
    pub slug: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubCheckRun {
    pub id: i64,
    pub name: String,
    pub head_sha: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: Option<String>,
    pub details_url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub app: Option<GithubCheckRunApp>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubCheckRunsResponse {
    #[allow(dead_code)]
    pub total_count: i64,
    pub check_runs: Vec<GithubCheckRun>,
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

pub fn github_pull_request_id(repo: &str, number: i64) -> String {
    format!("github:{repo}:pull:{number}")
}

pub fn github_branch_id(repo: &str, name: &str) -> String {
    format!("github:{repo}:branch:{name}")
}

pub fn github_check_run_id(repo: &str, check_run_id: i64) -> String {
    format!("github:{repo}:check_run:{check_run_id}")
}

pub fn normalize_github_repo_input(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else if let Some(index) = trimmed.find("github.com/") {
        &trimmed[index + "github.com/".len()..]
    } else {
        trimmed
    };

    let candidate = candidate
        .trim_start_matches('/')
        .trim_end_matches('/')
        .trim_end_matches(".git");
    let mut parts = candidate.split('/').filter(|part| !part.is_empty());
    let owner = parts.next()?;
    let repo = parts.next()?;

    if !is_valid_github_path_part(owner) || !is_valid_github_path_part(repo) {
        return None;
    }

    Some(format!("{owner}/{repo}"))
}

fn is_valid_github_path_part(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
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

pub fn event_type_for_pull_request(
    previous_state: Option<&str>,
    previous_merged_at: Option<&str>,
    current_state: &str,
    current_merged_at: Option<&str>,
) -> &'static str {
    if previous_merged_at.is_none() && current_merged_at.is_some() {
        return "github.pull_request.merged";
    }

    match previous_state {
        None if current_state.eq_ignore_ascii_case("closed") => "github.pull_request.closed",
        None => "github.pull_request.opened",
        Some(prev)
            if !prev.eq_ignore_ascii_case(current_state)
                && current_state.eq_ignore_ascii_case("closed") =>
        {
            "github.pull_request.closed"
        }
        Some(prev)
            if !prev.eq_ignore_ascii_case(current_state)
                && current_state.eq_ignore_ascii_case("open") =>
        {
            "github.pull_request.reopened"
        }
        _ => "github.pull_request.updated",
    }
}

pub fn event_type_for_check_run(status: &str, conclusion: Option<&str>) -> &'static str {
    if status.eq_ignore_ascii_case("completed") {
        match conclusion.unwrap_or_default().to_ascii_lowercase().as_str() {
            "success" => "github.check_run.succeeded",
            "failure" | "timed_out" | "cancelled" | "action_required" => "github.check_run.failed",
            _ => "github.check_run.completed",
        }
    } else {
        "github.check_run.updated"
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

    #[test]
    fn normalizes_github_repo_inputs_from_slugs_and_urls() {
        let cases = [
            ("Sheshiyer/parkarea-aleph", Some("Sheshiyer/parkarea-aleph")),
            (
                "https://github.com/Sheshiyer/parkarea-aleph",
                Some("Sheshiyer/parkarea-aleph"),
            ),
            (
                "https://github.com/Sheshiyer/parkarea-aleph/issues/12",
                Some("Sheshiyer/parkarea-aleph"),
            ),
            (
                "https://github.com/Sheshiyer/parkarea-aleph/pull/3",
                Some("Sheshiyer/parkarea-aleph"),
            ),
            (
                "git@github.com:Sheshiyer/parkarea-aleph.git",
                Some("Sheshiyer/parkarea-aleph"),
            ),
            ("not a repo", None),
        ];

        for (input, expected) in cases {
            assert_eq!(normalize_github_repo_input(input).as_deref(), expected);
        }
    }

    #[test]
    fn pull_request_and_check_run_event_types_track_state() {
        assert_eq!(
            event_type_for_pull_request(None, None, "open", None),
            "github.pull_request.opened"
        );
        assert_eq!(
            event_type_for_pull_request(Some("open"), None, "closed", Some("2026-04-16T00:00:00Z")),
            "github.pull_request.merged"
        );
        assert_eq!(
            event_type_for_pull_request(Some("closed"), None, "open", None),
            "github.pull_request.reopened"
        );
        assert_eq!(
            event_type_for_check_run("completed", Some("success")),
            "github.check_run.succeeded"
        );
        assert_eq!(
            event_type_for_check_run("completed", Some("failure")),
            "github.check_run.failed"
        );
    }
}
