use serde::de::DeserializeOwned;

use super::types::{
    SlackAuthTestData, SlackConversation, SlackConversationsData, SlackEnvelope, SlackHistoryData,
    SlackMessage, SlackUser, SlackUsersData,
};

const BASE_URL: &str = "https://slack.com/api";
const PAGE_SIZE: usize = 200;
const MAX_RATE_LIMIT_RETRIES: u8 = 5;
const MAX_SERVER_RETRIES: u8 = 3;

#[derive(Debug, Clone)]
pub struct SlackHistoryPage {
    pub messages: Vec<SlackMessage>,
    pub next_cursor: Option<String>,
}

pub struct SlackClient {
    http: reqwest::Client,
    bot_token: String,
    base_url: String,
}

impl SlackClient {
    pub fn new(bot_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            bot_token,
            base_url: BASE_URL.to_string(),
        }
    }

    async fn get<T>(
        &self,
        method: &str,
        query: &[(&str, String)],
    ) -> Result<SlackEnvelope<T>, String>
    where
        T: DeserializeOwned,
    {
        let url = format!("{}/{}", self.base_url, method);
        let mut rate_limit_retries = 0u8;
        let mut server_retries = 0u8;

        let response = loop {
            let response = self
                .http
                .get(&url)
                .bearer_auth(&self.bot_token)
                .query(query)
                .send()
                .await
                .map_err(|e| format!("Slack request failed for {method}: {e}"))?;

            if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                if rate_limit_retries >= MAX_RATE_LIMIT_RETRIES {
                    return Err(format!(
                        "Slack API rate limited {method} after {MAX_RATE_LIMIT_RETRIES} retries"
                    ));
                }
                let wait_seconds = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .filter(|value| *value > 0)
                    .unwrap_or(1);
                rate_limit_retries += 1;
                tokio::time::sleep(std::time::Duration::from_secs(wait_seconds)).await;
                continue;
            }

            if response.status().is_server_error() {
                if server_retries >= MAX_SERVER_RETRIES {
                    return Err(format!(
                        "Slack API server error {} for {} after {} retries",
                        response.status(),
                        method,
                        MAX_SERVER_RETRIES
                    ));
                }
                let backoff_seconds = 1u64 << server_retries;
                server_retries += 1;
                tokio::time::sleep(std::time::Duration::from_secs(backoff_seconds)).await;
                continue;
            }

            break response;
        };

        if !response.status().is_success() {
            return Err(format!(
                "Slack API error {} for {}: {}",
                response.status(),
                method,
                response
                    .text()
                    .await
                    .unwrap_or_else(|_| "no body".to_string())
            ));
        }

        let envelope = response
            .json::<SlackEnvelope<T>>()
            .await
            .map_err(|e| format!("failed to parse Slack response for {method}: {e}"))?;

        if !envelope.ok {
            let mut parts = vec![format!(
                "Slack API rejected {}: {}",
                method,
                envelope
                    .error
                    .clone()
                    .unwrap_or_else(|| "unknown_error".to_string())
            )];
            if let Some(needed) = envelope
                .needed
                .clone()
                .filter(|value| !value.trim().is_empty())
            {
                parts.push(format!("needed={needed}"));
            }
            if let Some(provided) = envelope
                .provided
                .clone()
                .filter(|value| !value.trim().is_empty())
            {
                parts.push(format!("provided={provided}"));
            }
            return Err(parts.join(" | "));
        }

        Ok(envelope)
    }

    pub async fn test_connection(&self) -> Result<SlackAuthTestData, String> {
        let auth = self.auth_test().await?;

        let channel_probe = vec![
            ("limit", "1".to_string()),
            ("exclude_archived", "true".to_string()),
            ("types", "public_channel,private_channel".to_string()),
        ];
        let user_probe = vec![("limit", "1".to_string())];

        self.get::<SlackConversationsData>("conversations.list", &channel_probe)
            .await?;
        self.get::<SlackUsersData>("users.list", &user_probe)
            .await?;

        Ok(auth)
    }

    pub async fn auth_test(&self) -> Result<SlackAuthTestData, String> {
        Ok(self.get::<SlackAuthTestData>("auth.test", &[]).await?.data)
    }

    pub async fn list_channels(&self) -> Result<Vec<SlackConversation>, String> {
        let mut channels = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut query = vec![
                ("limit", PAGE_SIZE.to_string()),
                ("exclude_archived", "true".to_string()),
                ("types", "public_channel,private_channel".to_string()),
            ];
            if let Some(current_cursor) = cursor.clone() {
                query.push(("cursor", current_cursor));
            }

            let envelope = self
                .get::<SlackConversationsData>("conversations.list", &query)
                .await?;
            channels.extend(
                envelope
                    .data
                    .channels
                    .into_iter()
                    .filter(|channel| !channel.is_archived),
            );

            cursor = envelope
                .response_metadata
                .and_then(|metadata| metadata.next_cursor)
                .filter(|value| !value.is_empty());

            if cursor.is_none() {
                break;
            }
        }

        Ok(channels)
    }

    pub async fn list_users(&self) -> Result<Vec<SlackUser>, String> {
        let mut users = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut query = vec![("limit", PAGE_SIZE.to_string())];
            if let Some(current_cursor) = cursor.clone() {
                query.push(("cursor", current_cursor));
            }

            let envelope = self.get::<SlackUsersData>("users.list", &query).await?;
            users.extend(envelope.data.members);

            cursor = envelope
                .response_metadata
                .and_then(|metadata| metadata.next_cursor)
                .filter(|value| !value.is_empty());

            if cursor.is_none() {
                break;
            }
        }

        Ok(users)
    }

    pub async fn get_channel_messages_since(
        &self,
        channel_id: &str,
        oldest_ts: &str,
    ) -> Result<Vec<SlackMessage>, String> {
        let mut messages = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let page = self
                .get_channel_messages_page(channel_id, oldest_ts, cursor.as_deref())
                .await?;
            messages.extend(page.messages);
            cursor = page.next_cursor;

            if cursor.is_none() {
                break;
            }
        }

        Ok(messages)
    }

    pub async fn get_channel_messages_page(
        &self,
        channel_id: &str,
        oldest_ts: &str,
        cursor: Option<&str>,
    ) -> Result<SlackHistoryPage, String> {
        let mut query = vec![
            ("channel", channel_id.to_string()),
            ("limit", PAGE_SIZE.to_string()),
            ("oldest", oldest_ts.to_string()),
            ("inclusive", "true".to_string()),
        ];
        if let Some(current_cursor) = cursor
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
        {
            query.push(("cursor", current_cursor));
        }

        let envelope = self
            .get::<SlackHistoryData>("conversations.history", &query)
            .await?;
        let next_cursor = envelope
            .response_metadata
            .and_then(|metadata| metadata.next_cursor)
            .filter(|value| !value.is_empty());
        Ok(SlackHistoryPage {
            messages: envelope.data.messages,
            next_cursor,
        })
    }
}
