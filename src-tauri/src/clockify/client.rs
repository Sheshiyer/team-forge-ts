use std::sync::Arc;
use tokio::sync::Semaphore;

use super::types::*;

const BASE_URL: &str = "https://api.clockify.me/api/v1";
const PAGE_SIZE: u32 = 50;

/// Clockify HTTP client with built-in rate limiting (10 req/s).
pub struct ClockifyClient {
    http: reqwest::Client,
    api_key: String,
    base_url: String,
    rate_limiter: Arc<Semaphore>,
}

impl ClockifyClient {
    /// Create a new client. The rate limiter uses 10 permits that each
    /// take 100 ms to refill, enforcing the 10-requests-per-second cap.
    pub fn new(api_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_key,
            base_url: BASE_URL.to_string(),
            rate_limiter: Arc::new(Semaphore::new(10)),
        }
    }

    // ── Internal request helper ─────────────────────────────────

    /// Send a GET request with rate limiting and automatic retry on 429.
    async fn request(&self, url: &str) -> Result<reqwest::Response, String> {
        // Acquire a rate-limit permit.
        let permit = self
            .rate_limiter
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("rate limiter error: {e}"))?;

        // Release the permit after 100 ms so at most 10 fire per second.
        let limiter = self.rate_limiter.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            drop(permit);
            // Ensure the semaphore reference is kept alive until the permit drops.
            let _ = limiter;
        });

        let resp = self
            .http
            .get(url)
            .header("X-Api-Key", &self.api_key)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {e}"))?;

        // Retry once on 429 Too Many Requests.
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            eprintln!("[clockify] rate limited, retrying after 1 s");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;

            let retry_resp = self
                .http
                .get(url)
                .header("X-Api-Key", &self.api_key)
                .send()
                .await
                .map_err(|e| format!("HTTP retry failed: {e}"))?;

            if !retry_resp.status().is_success() {
                return Err(format!(
                    "Clockify API error {} on retry: {}",
                    retry_resp.status(),
                    retry_resp.text().await.unwrap_or_else(|_| "no body".into())
                ));
            }
            return Ok(retry_resp);
        }

        if !resp.status().is_success() {
            return Err(format!(
                "Clockify API error {}: {}",
                resp.status(),
                resp.text().await.unwrap_or_else(|_| "no body".into())
            ));
        }

        Ok(resp)
    }

    // ── Public API methods ──────────────────────────────────────

    /// Validate the API key by fetching the current user.
    pub async fn get_current_user(&self) -> Result<ClockifyUser, String> {
        let url = format!("{}/user", self.base_url);
        let resp = self.request(&url).await?;
        resp.json::<ClockifyUser>()
            .await
            .map_err(|e| format!("failed to parse user response: {e}"))
    }

    /// List all workspaces the API key has access to.
    pub async fn get_workspaces(&self) -> Result<Vec<ClockifyWorkspace>, String> {
        let url = format!("{}/workspaces", self.base_url);
        let resp = self.request(&url).await?;
        resp.json::<Vec<ClockifyWorkspace>>()
            .await
            .map_err(|e| format!("failed to parse workspaces: {e}"))
    }

    /// List active users in a workspace.
    pub async fn get_users(&self, workspace_id: &str) -> Result<Vec<ClockifyUser>, String> {
        let url = format!(
            "{}/workspaces/{}/users?status=ACTIVE",
            self.base_url, workspace_id
        );
        let resp = self.request(&url).await?;
        resp.json::<Vec<ClockifyUser>>()
            .await
            .map_err(|e| format!("failed to parse users: {e}"))
    }

    /// Fetch all active (non-archived) projects, handling pagination.
    pub async fn get_projects(&self, workspace_id: &str) -> Result<Vec<ClockifyProject>, String> {
        let mut all = Vec::new();
        let mut page = 1u32;

        loop {
            let url = format!(
                "{}/workspaces/{}/projects?archived=false&page={}&page-size={}",
                self.base_url, workspace_id, page, PAGE_SIZE
            );
            let resp = self.request(&url).await?;

            let is_last = resp
                .headers()
                .get("Last-Page")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.eq_ignore_ascii_case("true"))
                .unwrap_or(true);

            let batch: Vec<ClockifyProject> = resp
                .json()
                .await
                .map_err(|e| format!("failed to parse projects page {page}: {e}"))?;

            let done = batch.is_empty() || is_last;
            all.extend(batch);

            if done {
                break;
            }
            page += 1;
        }

        Ok(all)
    }

    /// Fetch all time entries for a user in a date range, handling pagination.
    /// `start` and `end` are ISO 8601 datetime strings.
    pub async fn get_time_entries(
        &self,
        workspace_id: &str,
        user_id: &str,
        start: &str,
        end: &str,
    ) -> Result<Vec<ClockifyTimeEntry>, String> {
        let mut all = Vec::new();
        let mut page = 1u32;

        loop {
            let url = format!(
                "{}/workspaces/{}/user/{}/time-entries?start={}&end={}&page={}&page-size={}",
                self.base_url, workspace_id, user_id, start, end, page, PAGE_SIZE
            );
            let resp = self.request(&url).await?;

            let is_last = resp
                .headers()
                .get("Last-Page")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.eq_ignore_ascii_case("true"))
                .unwrap_or(true);

            let batch: Vec<ClockifyTimeEntry> = resp
                .json()
                .await
                .map_err(|e| format!("failed to parse time entries page {page}: {e}"))?;

            let done = batch.is_empty() || is_last;
            all.extend(batch);

            if done {
                break;
            }
            page += 1;
        }

        Ok(all)
    }

    /// For each user, check if they have an active timer (most recent entry
    /// with no end time). Returns `(user_id, active_entry)` pairs.
    pub async fn get_active_timers(
        &self,
        workspace_id: &str,
        user_ids: &[String],
    ) -> Result<Vec<(String, ClockifyTimeEntry)>, String> {
        let mut active = Vec::new();

        for uid in user_ids {
            // Fetch just the latest entry (page 1, size 1).
            let url = format!(
                "{}/workspaces/{}/user/{}/time-entries?page=1&page-size=1",
                self.base_url, workspace_id, uid
            );
            let resp = self.request(&url).await?;
            let entries: Vec<ClockifyTimeEntry> = resp
                .json()
                .await
                .map_err(|e| format!("failed to parse timer check for {uid}: {e}"))?;

            if let Some(entry) = entries.into_iter().next() {
                if entry.time_interval.end.is_none() {
                    active.push((uid.clone(), entry));
                }
            }
        }

        Ok(active)
    }
}
