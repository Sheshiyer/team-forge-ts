use reqwest::header::{ACCEPT, USER_AGENT};

use super::types::{GithubIssue, GithubMilestone};

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
}
