use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Serialize;

use super::types::{
    GithubBranch, GithubCheckRun, GithubCheckRunsResponse, GithubIssue, GithubIssueComment,
    GithubMilestone, GithubPullRequest,
};

const MAX_BRANCH_CHECK_REFS: usize = 50;

pub struct GithubClient {
    token: String,
    http: reqwest::Client,
}

impl GithubClient {
    pub fn new(token: String) -> Self {
        Self {
            token,
            http: reqwest::Client::new(),
        }
    }

    pub async fn get_issues(&self, repo: &str) -> Result<Vec<GithubIssue>, String> {
        let mut page = 1u32;
        let mut issues = Vec::new();

        loop {
            let url = format!(
                "https://api.github.com/repos/{repo}/issues?state=all&per_page=100&page={page}"
            );
            let mut batch: Vec<GithubIssue> = self.get_json(&url).await?;
            let fetched = batch.len();
            issues.append(&mut batch);
            if fetched < 100 {
                break;
            }
            page += 1;
        }

        Ok(issues
            .into_iter()
            .filter(|issue| issue.pull_request.is_none())
            .collect())
    }

    pub async fn get_milestones(&self, repo: &str) -> Result<Vec<GithubMilestone>, String> {
        let url = format!("https://api.github.com/repos/{repo}/milestones?state=all&per_page=100");
        self.get_json(&url).await
    }

    pub async fn get_issue(&self, repo: &str, number: i64) -> Result<GithubIssue, String> {
        let url = format!("https://api.github.com/repos/{repo}/issues/{number}");
        self.get_json(&url).await
    }

    pub async fn get_issue_comments(
        &self,
        repo: &str,
        number: i64,
    ) -> Result<Vec<GithubIssueComment>, String> {
        let mut page = 1u32;
        let mut comments = Vec::new();

        loop {
            let url = format!(
                "https://api.github.com/repos/{repo}/issues/{number}/comments?per_page=100&page={page}"
            );
            let mut batch: Vec<GithubIssueComment> = self.get_json(&url).await?;
            let fetched = batch.len();
            comments.append(&mut batch);
            if fetched < 100 {
                break;
            }
            page += 1;
        }

        Ok(comments)
    }

    pub async fn create_issue_comment(
        &self,
        repo: &str,
        number: i64,
        body: &str,
    ) -> Result<GithubIssueComment, String> {
        let url = format!("https://api.github.com/repos/{repo}/issues/{number}/comments");
        self.post_json(&url, &serde_json::json!({ "body": body }))
            .await
    }

    pub async fn update_issue<B: Serialize>(
        &self,
        repo: &str,
        number: i64,
        body: &B,
    ) -> Result<GithubIssue, String> {
        let url = format!("https://api.github.com/repos/{repo}/issues/{number}");
        self.patch_json(&url, body).await
    }

    pub async fn get_pull_requests(&self, repo: &str) -> Result<Vec<GithubPullRequest>, String> {
        let mut page = 1u32;
        let mut prs = Vec::new();

        loop {
            let url = format!(
                "https://api.github.com/repos/{repo}/pulls?state=all&per_page=100&page={page}"
            );
            let mut batch: Vec<GithubPullRequest> = self.get_json(&url).await?;
            let fetched = batch.len();
            prs.append(&mut batch);
            if fetched < 100 {
                break;
            }
            page += 1;
        }

        Ok(prs)
    }

    pub async fn get_branches(&self, repo: &str) -> Result<Vec<GithubBranch>, String> {
        let mut page = 1u32;
        let mut branches = Vec::new();

        loop {
            let url =
                format!("https://api.github.com/repos/{repo}/branches?per_page=100&page={page}");
            let mut batch: Vec<GithubBranch> = self.get_json(&url).await?;
            let fetched = batch.len();
            branches.append(&mut batch);
            if fetched < 100 {
                break;
            }
            page += 1;
        }

        Ok(branches)
    }

    pub async fn get_check_runs_for_ref(
        &self,
        repo: &str,
        branch_name: &str,
        sha: &str,
    ) -> Result<Vec<GithubCheckRun>, String> {
        let mut page = 1u32;
        let mut check_runs = Vec::new();

        loop {
            let url = format!(
                "https://api.github.com/repos/{repo}/commits/{sha}/check-runs?per_page=100&page={page}"
            );
            let mut response: GithubCheckRunsResponse = self.get_json(&url).await?;
            let fetched = response.check_runs.len();
            for check_run in response.check_runs.iter_mut() {
                if check_run.head_sha.is_empty() {
                    check_run.head_sha = sha.to_string();
                }
            }
            check_runs.append(&mut response.check_runs);
            if fetched < 100 {
                break;
            }
            page += 1;
        }

        let _ = branch_name;
        Ok(check_runs)
    }

    pub fn max_branch_check_refs() -> usize {
        MAX_BRANCH_CHECK_REFS
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, String> {
        let resp = self
            .http
            .get(url)
            .bearer_auth(self.token.trim())
            .header(USER_AGENT, "TeamForge")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| format!("github request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("read github response failed: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "github returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        serde_json::from_str(&body).map_err(|e| format!("parse github response failed: {e}"))
    }

    async fn post_json<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        url: &str,
        body: &B,
    ) -> Result<T, String> {
        self.send_json(reqwest::Method::POST, url, body).await
    }

    async fn patch_json<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        url: &str,
        body: &B,
    ) -> Result<T, String> {
        self.send_json(reqwest::Method::PATCH, url, body).await
    }

    async fn send_json<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        method: reqwest::Method,
        url: &str,
        body: &B,
    ) -> Result<T, String> {
        let resp = self
            .http
            .request(method, url)
            .bearer_auth(self.token.trim())
            .header(USER_AGENT, "TeamForge")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(body)
            .send()
            .await
            .map_err(|e| format!("github request failed: {e}"))?;

        let status = resp.status();
        let response_body = resp
            .text()
            .await
            .map_err(|e| format!("read github response failed: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "github returned {status}: {}",
                &response_body[..response_body.len().min(500)]
            ));
        }

        serde_json::from_str(&response_body)
            .map_err(|e| format!("parse github response failed: {e}"))
    }
}
