use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use super::types::*;

const DEFAULT_BASE_URL: &str = "https://huly.app";
const CORE_CLASS_TX_CREATE_DOC: &str = "core:class:TxCreateDoc";
const CORE_CLASS_TX_UPDATE_DOC: &str = "core:class:TxUpdateDoc";
const CORE_CLASS_TX_REMOVE_DOC: &str = "core:class:TxRemoveDoc";
const CORE_SPACE_TX: &str = "core:space:Tx";

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

        eprintln!(
            "[huly] selectWorkspace status={status}, body length={}",
            body.len()
        );

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
        let result = rpc_resp.get("result").ok_or_else(|| {
            format!(
                "selectWorkspace response missing 'result': {}",
                &body[..body.len().min(500)]
            )
        })?;

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

    pub fn workspace_id(&self) -> &str {
        &self.workspace_id
    }

    fn build_auth_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        request.header("Authorization", format!("Bearer {}", self.token))
    }

    // ── Public API methods ─────────────────────────────────────

    /// Generic find-all query against the Huly REST transactor API.
    pub async fn find_all(
        &self,
        class: &str,
        query: Value,
        limit: Option<u32>,
    ) -> Result<Vec<Value>, String> {
        let options = FindAllOptions { limit, sort: None };
        let url = format!("{}/api/v1/find-all/{}", self.endpoint, self.workspace_id);

        let query_str =
            serde_json::to_string(&query).map_err(|e| format!("serialize query: {e}"))?;
        let options_str =
            serde_json::to_string(&options).map_err(|e| format!("serialize options: {e}"))?;

        eprintln!("[huly] find_all class={class}, query={query_str}, options={options_str}");

        let resp = self
            .build_auth_request(self.http.get(&url))
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
                "find_all class={class} returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        // Response may be a plain array OR a TotalArray: { dataType, total, value: [...] }
        let results: Vec<Value> = match serde_json::from_str::<Vec<Value>>(&body) {
            Ok(arr) => arr,
            Err(_) => {
                // Try parsing as TotalArray wrapper
                let wrapper: Value = serde_json::from_str(&body).map_err(|e| {
                    format!(
                        "failed to parse find_all response: {e} (body: {})",
                        &body[..body.len().min(300)]
                    )
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

    pub async fn find_all_typed<T>(
        &self,
        class: &str,
        query: Value,
        limit: Option<u32>,
    ) -> Result<Vec<T>, String>
    where
        T: DeserializeOwned,
    {
        let docs = self.find_all(class, query, limit).await?;
        let mut parsed = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<T>(doc) {
                Ok(value) => parsed.push(value),
                Err(err) => eprintln!("[huly] warning: could not parse {class}: {err}"),
            }
        }
        Ok(parsed)
    }

    async fn find_all_typed_optional_class<T>(
        &self,
        class: &str,
        query: Value,
        limit: Option<u32>,
    ) -> Result<Vec<T>, String>
    where
        T: DeserializeOwned,
    {
        match self.find_all_typed(class, query, limit).await {
            Ok(items) => Ok(items),
            Err(error) if is_invalid_class_error(&error) => {
                eprintln!(
                    "[huly] optional class {class} is unavailable in this workspace: {error}"
                );
                Ok(vec![])
            }
            Err(error) => Err(error),
        }
    }

    pub async fn post_tx_value(&self, tx: &Value) -> Result<Value, String> {
        let url = format!("{}/api/v1/tx/{}", self.endpoint, self.workspace_id);
        let resp = self
            .build_auth_request(self.http.post(&url))
            .header("Content-Type", "application/json")
            .json(tx)
            .send()
            .await
            .map_err(|e| format!("tx request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read tx response: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "tx returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        serde_json::from_str(&body).map_err(|e| format!("failed to parse tx response: {e}"))
    }

    pub async fn create_doc(
        &self,
        actor_social_id: &str,
        class: &str,
        object_space: &str,
        attributes: Value,
        object_id: Option<String>,
    ) -> Result<String, String> {
        let object_id = object_id.unwrap_or_else(generate_huly_id);
        let tx = json!({
            "_id": generate_huly_id(),
            "_class": CORE_CLASS_TX_CREATE_DOC,
            "space": CORE_SPACE_TX,
            "objectId": object_id,
            "objectClass": class,
            "objectSpace": object_space,
            "modifiedOn": current_millis(),
            "modifiedBy": actor_social_id,
            "createdBy": actor_social_id,
            "attributes": attributes,
        });

        self.post_tx_value(&tx).await?;
        Ok(object_id)
    }

    pub async fn update_doc(
        &self,
        actor_social_id: &str,
        class: &str,
        object_space: &str,
        object_id: &str,
        operations: Value,
        retrieve: Option<bool>,
    ) -> Result<Value, String> {
        let tx = json!({
            "_id": generate_huly_id(),
            "_class": CORE_CLASS_TX_UPDATE_DOC,
            "space": CORE_SPACE_TX,
            "modifiedBy": actor_social_id,
            "modifiedOn": current_millis(),
            "objectId": object_id,
            "objectClass": class,
            "objectSpace": object_space,
            "operations": operations,
            "retrieve": retrieve,
        });

        self.post_tx_value(&tx).await
    }

    pub async fn remove_doc(
        &self,
        actor_social_id: &str,
        class: &str,
        object_space: &str,
        object_id: &str,
    ) -> Result<Value, String> {
        let tx = json!({
            "_id": generate_huly_id(),
            "_class": CORE_CLASS_TX_REMOVE_DOC,
            "space": CORE_SPACE_TX,
            "modifiedBy": actor_social_id,
            "modifiedOn": current_millis(),
            "objectId": object_id,
            "objectClass": class,
            "objectSpace": object_space,
        });

        self.post_tx_value(&tx).await
    }

    /// Fetch tracker issues, optionally only those modified since a given
    /// timestamp (milliseconds since epoch).
    pub async fn get_issues(&self, modified_since: Option<i64>) -> Result<Vec<HulyIssue>, String> {
        let query = if let Some(ts) = modified_since {
            json!({ "modifiedOn": { "$gte": ts } })
        } else {
            json!({})
        };

        self.find_all_typed("tracker:class:Issue", query, Some(500))
            .await
    }

    /// Fetch all persons from the Huly contact module.
    pub async fn get_persons(&self) -> Result<Vec<HulyPerson>, String> {
        self.find_all_typed("contact:class:Person", json!({}), Some(500))
            .await
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
                eprintln!(
                    "[huly] contact:class:Member returned nothing, trying contact:mixin:Employee"
                );
                self.find_all("contact:mixin:Employee", json!({}), Some(500))
                    .await
                    .unwrap_or_default()
            }
        };

        let mut members = Vec::with_capacity(docs.len());
        for doc in docs {
            match serde_json::from_value::<HulyMember>(doc) {
                Ok(m) => members.push(m),
                Err(e) => {
                    eprintln!("[huly] warning: could not parse member: {e}");
                }
            }
        }
        Ok(members)
    }

    pub async fn get_employees(&self) -> Result<Vec<HulyEmployee>, String> {
        self.find_all_typed("contact:mixin:Employee", json!({}), Some(500))
            .await
    }

    pub async fn get_projects(&self) -> Result<Vec<HulyProject>, String> {
        self.find_all_typed("tracker:class:Project", json!({}), Some(200))
            .await
    }

    /// Get account info for the current workspace.
    pub async fn get_account_info(&self) -> Result<HulyAccountInfo, String> {
        let url = format!("{}/api/v1/account/{}", self.endpoint, self.workspace_id);

        let resp = self
            .build_auth_request(self.http.get(&url))
            .send()
            .await
            .map_err(|e| format!("get_account_info failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("read account info: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "account info returned {status}: {}",
                &body[..body.len().min(500)]
            ));
        }

        serde_json::from_str(&body).map_err(|e| format!("parse account info: {e}"))
    }

    /// Fetch tracker milestones.
    pub async fn get_milestones(&self) -> Result<Vec<HulyMilestone>, String> {
        self.find_all_typed("tracker:class:Milestone", json!({}), Some(200))
            .await
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

        self.find_all_typed("tracker:class:TimeSpendReport", query, Some(1000))
            .await
    }

    /// Fetch HR departments.
    pub async fn get_departments(&self) -> Result<Vec<HulyDepartment>, String> {
        self.find_all_typed_optional_class("hr:class:Department", json!({}), Some(100))
            .await
    }

    /// Fetch HR leave requests.
    pub async fn get_leave_requests(&self) -> Result<Vec<HulyLeaveRequest>, String> {
        self.find_all_typed_optional_class("hr:class:Request", json!({}), Some(500))
            .await
    }

    /// Fetch HR holidays.
    pub async fn get_holidays(&self) -> Result<Vec<HulyHoliday>, String> {
        self.find_all_typed_optional_class("hr:class:Holiday", json!({}), Some(200))
            .await
    }

    /// Fetch chunter channels.
    pub async fn get_channels(&self) -> Result<Vec<HulyChannel>, String> {
        self.find_all_typed("chunter:class:Channel", json!({}), Some(200))
            .await
    }

    pub async fn get_documents(&self) -> Result<Vec<HulyDocument>, String> {
        self.find_all_typed("document:class:Document", json!({}), Some(500))
            .await
    }

    pub async fn get_boards(&self) -> Result<Vec<HulyBoard>, String> {
        self.find_all_typed("board:class:Board", json!({}), Some(100))
            .await
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
            match serde_json::from_value::<HulyChatMessage>(doc) {
                Ok(m) => items.push(m),
                Err(e) => eprintln!("[huly] warning: could not parse chat message: {e}"),
            }
        }
        Ok(items)
    }

    /// Fetch board cards.
    pub async fn get_board_cards(&self) -> Result<Vec<HulyBoardCard>, String> {
        self.find_all_typed("board:class:Card", json!({}), Some(500))
            .await
    }

    /// Fetch calendar events.
    pub async fn get_calendar_events(&self) -> Result<Vec<HulyCalendarEvent>, String> {
        self.find_all_typed("calendar:class:Event", json!({}), Some(500))
            .await
    }

    /// Quick connectivity check: get account info and return a summary string.
    pub async fn test_connection(&self) -> Result<String, String> {
        let info = self.get_account_info().await?;
        let email = info.email.as_deref().unwrap_or("unknown");
        Ok(format!(
            "Connected to workspace {} as {}",
            self.workspace_id, email
        ))
    }
}

// ─── Minimal base64 decoder (no extra crate needed) ────────────

fn current_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or_default()
}

fn to_hex(value: u64, chars: usize) -> String {
    format!("{value:0chars$x}")
}

fn huly_random_segment() -> &'static str {
    static RANDOM_SEGMENT: OnceLock<String> = OnceLock::new();
    RANDOM_SEGMENT.get_or_init(|| {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let mixed = now ^ (std::process::id() as u128);
        format!(
            "{}{}",
            to_hex(((mixed >> 16) & 0x00ff_ffff) as u64, 6),
            to_hex((mixed & 0x0000_ffff) as u64, 4)
        )
    })
}

fn generate_huly_id() -> String {
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let count = COUNTER.fetch_add(1, Ordering::Relaxed) & 0x00ff_ffff;

    format!(
        "{}{}{}",
        to_hex(seconds, 8),
        huly_random_segment(),
        to_hex(count as u64, 6)
    )
}

fn is_invalid_class_error(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    normalized.contains("invalid class name") || normalized.contains("404")
}

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

#[cfg(test)]
mod tests {
    use super::{generate_huly_id, is_invalid_class_error};

    #[test]
    fn generated_huly_ids_match_expected_shape() {
        let first = generate_huly_id();
        let second = generate_huly_id();

        assert_eq!(first.len(), 24);
        assert_eq!(second.len(), 24);
        assert!(first
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));
        assert!(second
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));
        assert_ne!(first, second);
    }

    #[test]
    fn invalid_class_errors_are_detected() {
        assert!(is_invalid_class_error(
            "find_all class=hr:class:Holiday returned 404 NOT FOUND: {\"error\":\"INVALID CLASS NAME IS PASSED. FAILED TO FINDALL.\"}"
        ));
        assert!(!is_invalid_class_error("network timeout"));
    }
}
