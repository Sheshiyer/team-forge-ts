use serde_json::json;

use super::types::*;

const DEFAULT_BASE_URL: &str = "https://huly.app";

/// Huly REST API client that talks directly to the transactor endpoint.
pub struct HulyClient {
    http: reqwest::Client,
    /// Transactor HTTP endpoint (converted from wss:// to https://).
    endpoint: String,
    /// Workspace UUID.
    workspace_id: String,
    /// Bearer token for the workspace session.
    token: String,
}

impl HulyClient {
    /// Connect to Huly by:
    /// 1. Fetching config.json from `base_url` to discover ACCOUNTS_URL
    /// 2. POSTing to selectWorkspace with the user token
    /// 3. Converting the wss:// transactor endpoint to https://
    pub async fn connect(base_url: Option<&str>, user_token: &str) -> Result<Self, String> {
        let base = base_url.unwrap_or(DEFAULT_BASE_URL);
        let http = reqwest::Client::new();

        // Step 1: fetch platform config
        let config_url = format!("{}/config.json", base.trim_end_matches('/'));
        eprintln!("[huly] fetching config from {config_url}");
        let config: HulyConfig = http
            .get(&config_url)
            .send()
            .await
            .map_err(|e| format!("failed to fetch config.json: {e}"))?
            .json()
            .await
            .map_err(|e| format!("failed to parse config.json: {e}"))?;

        eprintln!("[huly] ACCOUNTS_URL = {}", config.accounts_url);

        // Decode workspace from JWT payload (middle segment)
        let workspace_from_jwt = Self::extract_workspace_from_jwt(user_token);
        eprintln!("[huly] workspace from JWT: {:?}", workspace_from_jwt);

        // Step 2: select workspace
        let workspace_slug = workspace_from_jwt
            .as_deref()
            .ok_or_else(|| "could not extract workspace from JWT".to_string())?;

        let select_url = format!("{}/api/v1/selectWorkspace", config.accounts_url);
        eprintln!("[huly] POSTing to {select_url}");

        let resp = http
            .post(&select_url)
            .header("Authorization", format!("Bearer {user_token}"))
            .json(&SelectWorkspaceRequest {
                workspace: workspace_slug.to_string(),
            })
            .send()
            .await
            .map_err(|e| format!("selectWorkspace request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read selectWorkspace response: {e}"))?;

        eprintln!("[huly] selectWorkspace status={status}, body length={}", body.len());

        if !status.is_success() {
            return Err(format!(
                "selectWorkspace returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        // Try parsing the response (it may be nested under "result" or flat)
        let accounts_resp: AccountsResponse = serde_json::from_str(&body)
            .map_err(|e| format!("failed to parse selectWorkspace response: {e}"))?;

        let login_info = accounts_resp
            .into_login_info()
            .ok_or_else(|| {
                format!(
                    "selectWorkspace returned unexpected shape: {}",
                    &body[..body.len().min(500)]
                )
            })?;

        // Step 3: convert wss:// endpoint to https://
        let endpoint = login_info
            .endpoint
            .replace("wss://", "https://")
            .replace("ws://", "http://");

        eprintln!(
            "[huly] connected: endpoint={}, workspace={}",
            endpoint, login_info.workspace
        );

        Ok(Self {
            http,
            endpoint,
            workspace_id: login_info.workspace,
            token: login_info.token,
        })
    }

    /// Extract the workspace UUID from the JWT token's payload.
    fn extract_workspace_from_jwt(token: &str) -> Option<String> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        // Decode base64url payload
        let payload = parts[1];
        // base64url -> standard base64
        let padded = match payload.len() % 4 {
            2 => format!("{payload}=="),
            3 => format!("{payload}="),
            _ => payload.to_string(),
        };
        let decoded = padded.replace('-', "+").replace('_', "/");
        let bytes = base64_decode(&decoded)?;
        let json_str = String::from_utf8(bytes).ok()?;
        let val: serde_json::Value = serde_json::from_str(&json_str).ok()?;
        val.get("workspace")
            .and_then(|w| w.as_str())
            .map(|s| s.to_string())
    }

    // ── Public API methods ─────────────────────────────────────

    /// Generic find-all query against the Huly REST transactor API.
    pub async fn find_all(
        &self,
        class: &str,
        query: serde_json::Value,
        limit: Option<u32>,
    ) -> Result<Vec<serde_json::Value>, String> {
        let options = FindAllOptions {
            limit,
            sort: None,
        };
        let url = format!(
            "{}/api/v1/find-all/{}",
            self.endpoint, self.workspace_id
        );

        let query_str =
            serde_json::to_string(&query).map_err(|e| format!("serialize query: {e}"))?;
        let options_str =
            serde_json::to_string(&options).map_err(|e| format!("serialize options: {e}"))?;

        eprintln!("[huly] find_all class={class}, query={query_str}, options={options_str}");

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Content-Type", "application/json")
            .query(&[
                ("class", class),
                ("query", &query_str),
                ("options", &options_str),
            ])
            .send()
            .await
            .map_err(|e| format!("find_all request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read find_all response: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "find_all returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        // The response should be a JSON array
        let results: Vec<serde_json::Value> = serde_json::from_str(&body).map_err(|e| {
            format!(
                "failed to parse find_all response as array: {e} (body: {})",
                &body[..body.len().min(300)]
            )
        })?;

        eprintln!("[huly] find_all returned {} documents", results.len());
        Ok(results)
    }

    /// Fetch tracker issues, optionally only those modified since a given
    /// timestamp (milliseconds since epoch).
    pub async fn get_issues(
        &self,
        modified_since: Option<i64>,
    ) -> Result<Vec<HulyIssue>, String> {
        let query = if let Some(ts) = modified_since {
            json!({ "modifiedOn": { "$gte": ts } })
        } else {
            json!({})
        };

        let docs = self.find_all("tracker:class:Issue", query, Some(500)).await?;

        let mut issues = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyIssue>(doc.clone()) {
                Ok(issue) => issues.push(issue),
                Err(e) => {
                    eprintln!("[huly] warning: could not parse issue: {e}");
                }
            }
        }
        Ok(issues)
    }

    /// Fetch all persons from the Huly contact module.
    pub async fn get_persons(&self) -> Result<Vec<HulyPerson>, String> {
        let docs = self
            .find_all("contact:class:Person", json!({}), Some(500))
            .await?;

        let mut persons = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyPerson>(doc.clone()) {
                Ok(p) => persons.push(p),
                Err(e) => {
                    eprintln!("[huly] warning: could not parse person: {e}");
                }
            }
        }
        Ok(persons)
    }

    /// Fetch members (try contact:class:Member first, fall back to contact:mixin:Employee).
    pub async fn get_members(&self) -> Result<Vec<HulyMember>, String> {
        // Try contact:class:Member first
        let docs = self
            .find_all("contact:class:Member", json!({}), Some(500))
            .await;

        let docs = match docs {
            Ok(d) if !d.is_empty() => d,
            _ => {
                eprintln!("[huly] contact:class:Member returned nothing, trying contact:mixin:Employee");
                self.find_all("contact:mixin:Employee", json!({}), Some(500))
                    .await
                    .unwrap_or_default()
            }
        };

        let mut members = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyMember>(doc.clone()) {
                Ok(m) => members.push(m),
                Err(e) => {
                    eprintln!("[huly] warning: could not parse member: {e}");
                }
            }
        }
        Ok(members)
    }

    /// Get account info for the current workspace.
    pub async fn get_account_info(&self) -> Result<serde_json::Value, String> {
        let url = format!(
            "{}/api/v1/account/{}",
            self.endpoint, self.workspace_id
        );

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|e| format!("get_account_info failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("read account info: {e}"))?;

        if !status.is_success() {
            return Err(format!("account info returned {status}: {}", &body[..body.len().min(500)]));
        }

        serde_json::from_str(&body)
            .map_err(|e| format!("parse account info: {e}"))
    }

    /// Quick connectivity check: get account info and return a summary string.
    pub async fn test_connection(&self) -> Result<String, String> {
        let info = self.get_account_info().await?;
        let email = info
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        Ok(format!(
            "Connected to workspace {} as {}",
            self.workspace_id, email
        ))
    }
}

// ─── Minimal base64 decoder (no extra crate needed) ────────────

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let bytes: Vec<u8> = input.bytes().filter(|&b| b != b'=').collect();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for b in bytes {
        let val = TABLE.iter().position(|&c| c == b)? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}
