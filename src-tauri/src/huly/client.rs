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

        // Step 2: select workspace via JSON-RPC call to accounts URL
        let workspace_slug = workspace_from_jwt
            .as_deref()
            .ok_or_else(|| "could not extract workspace from JWT".to_string())?;

        eprintln!("[huly] JSON-RPC selectWorkspace to {}", config.accounts_url);

        // Huly uses JSON-RPC: POST { method, params } to the accounts URL root
        let rpc_body = json!({
            "method": "selectWorkspace",
            "params": {
                "workspaceUrl": workspace_slug,
                "kind": "external"
            }
        });

        let resp = http
            .post(&config.accounts_url)
            .header("Authorization", format!("Bearer {user_token}"))
            .header("Content-Type", "application/json")
            .json(&rpc_body)
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

        // JSON-RPC response: { "result": { endpoint, token, workspace } }
        let rpc_resp: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("failed to parse selectWorkspace response: {e}"))?;

        // Check for RPC error
        if let Some(err) = rpc_resp.get("error") {
            return Err(format!("selectWorkspace RPC error: {err}"));
        }

        // Extract result
        let result = rpc_resp.get("result")
            .ok_or_else(|| format!("selectWorkspace response missing 'result': {}", &body[..body.len().min(500)]))?;

        let login_info: WorkspaceLoginInfo = serde_json::from_value(result.clone())
            .map_err(|e| format!("failed to parse workspace login info: {e}"))?;

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

        // Response may be a plain array OR a TotalArray: { dataType, total, value: [...] }
        let results: Vec<serde_json::Value> = match serde_json::from_str::<Vec<serde_json::Value>>(&body) {
            Ok(arr) => arr,
            Err(_) => {
                // Try parsing as TotalArray wrapper
                let wrapper: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
                    format!("failed to parse find_all response: {e} (body: {})", &body[..body.len().min(300)])
                })?;
                if let Some(arr) = wrapper.get("value").and_then(|v| v.as_array()) {
                    arr.clone()
                } else {
                    return Err(format!(
                        "find_all response has no 'value' array: {}",
                        &body[..body.len().min(300)]
                    ));
                }
            }
        };

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

    /// Fetch tracker milestones.
    pub async fn get_milestones(&self) -> Result<Vec<HulyMilestone>, String> {
        let docs = self
            .find_all("tracker:class:Milestone", json!({}), Some(200))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyMilestone>(doc.clone()) {
                Ok(m) => items.push(m),
                Err(e) => eprintln!("[huly] warning: could not parse milestone: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch time spend reports, optionally since a given timestamp (ms epoch).
    pub async fn get_time_reports(
        &self,
        since: Option<i64>,
    ) -> Result<Vec<HulyTimeSpendReport>, String> {
        let query = if let Some(ts) = since {
            json!({ "modifiedOn": { "$gte": ts } })
        } else {
            json!({})
        };

        let docs = self
            .find_all("tracker:class:TimeSpendReport", query, Some(1000))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyTimeSpendReport>(doc.clone()) {
                Ok(r) => items.push(r),
                Err(e) => eprintln!("[huly] warning: could not parse time report: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch HR departments.
    pub async fn get_departments(&self) -> Result<Vec<HulyDepartment>, String> {
        let docs = self
            .find_all("hr:class:Department", json!({}), Some(100))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyDepartment>(doc.clone()) {
                Ok(d) => items.push(d),
                Err(e) => eprintln!("[huly] warning: could not parse department: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch HR leave requests.
    pub async fn get_leave_requests(&self) -> Result<Vec<HulyLeaveRequest>, String> {
        let docs = self
            .find_all("hr:class:Request", json!({}), Some(500))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyLeaveRequest>(doc.clone()) {
                Ok(r) => items.push(r),
                Err(e) => eprintln!("[huly] warning: could not parse leave request: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch HR holidays.
    pub async fn get_holidays(&self) -> Result<Vec<HulyHoliday>, String> {
        let docs = self
            .find_all("hr:class:Holiday", json!({}), Some(200))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyHoliday>(doc.clone()) {
                Ok(h) => items.push(h),
                Err(e) => eprintln!("[huly] warning: could not parse holiday: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch chunter channels.
    pub async fn get_channels(&self) -> Result<Vec<HulyChannel>, String> {
        let docs = self
            .find_all("chunter:class:Channel", json!({}), Some(200))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyChannel>(doc.clone()) {
                Ok(c) => items.push(c),
                Err(e) => eprintln!("[huly] warning: could not parse channel: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch chat messages, optionally since a given timestamp (ms epoch).
    /// Tries ChunterMessage first, falls back to ThreadMessage.
    pub async fn get_chat_messages(
        &self,
        since: Option<i64>,
    ) -> Result<Vec<HulyChatMessage>, String> {
        let query = if let Some(ts) = since {
            json!({ "createdOn": { "$gte": ts } })
        } else {
            json!({})
        };

        let docs = self
            .find_all("chunter:class:ChunterMessage", query.clone(), Some(1000))
            .await?;

        let docs = if docs.is_empty() {
            eprintln!("[huly] ChunterMessage returned nothing, trying ThreadMessage");
            self.find_all("chunter:class:ThreadMessage", query, Some(1000))
                .await
                .unwrap_or_default()
        } else {
            docs
        };

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyChatMessage>(doc.clone()) {
                Ok(m) => items.push(m),
                Err(e) => eprintln!("[huly] warning: could not parse chat message: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch board cards.
    pub async fn get_board_cards(&self) -> Result<Vec<HulyBoardCard>, String> {
        let docs = self
            .find_all("board:class:Card", json!({}), Some(500))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyBoardCard>(doc.clone()) {
                Ok(c) => items.push(c),
                Err(e) => eprintln!("[huly] warning: could not parse board card: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch calendar events.
    pub async fn get_calendar_events(&self) -> Result<Vec<HulyCalendarEvent>, String> {
        let docs = self
            .find_all("calendar:class:Event", json!({}), Some(500))
            .await?;

        let mut items = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyCalendarEvent>(doc.clone()) {
                Ok(e) => items.push(e),
                Err(err) => eprintln!("[huly] warning: could not parse calendar event: {err}"),
            }
        }
        Ok(items)
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
