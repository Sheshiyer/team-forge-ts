use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::client::SlackClient;
use super::types::{SlackConversation, SlackMessage, SlackUser};
use crate::db::models::{Employee, IdentityMapEntry, SlackMessageActivity, SyncState};
use crate::db::queries;

const DEFAULT_BACKFILL_DAYS: i64 = 7;
const BACKFILL_DAYS_SETTING_KEY: &str = "slack_sync_backfill_days";
const CHANNEL_FILTERS_SETTING_KEY: &str = "slack_channel_filters";
const SYNC_SOURCE_SLACK: &str = "slack";
const SYNC_ENTITY_MESSAGES_DELTA: &str = "messages_delta";
const CHANNEL_ENTITY_PREFIX: &str = "messages_channel:";

#[derive(Debug, Clone, Default)]
pub struct SlackDeltaSyncReport {
    pub channels_total: u32,
    pub channels_synced: u32,
    pub messages_scanned: u32,
    pub messages_persisted: u32,
    pub max_lag_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SlackCursorCheckpoint {
    #[serde(default)]
    cursor: Option<String>,
    #[serde(default)]
    oldest_ts: Option<String>,
    #[serde(default)]
    last_message_ts: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ChannelDeltaOutcome {
    messages_scanned: u32,
    messages_persisted: u32,
    max_message_ts: Option<String>,
    lag_seconds: Option<i64>,
}

/// Coordinates incremental Slack ingestion with durable cursor checkpoints.
pub struct SlackSyncEngine {
    client: Arc<SlackClient>,
    pool: SqlitePool,
}

impl SlackSyncEngine {
    pub fn new(client: Arc<SlackClient>, pool: SqlitePool) -> Self {
        Self { client, pool }
    }

    /// Sync Slack messages incrementally per channel using persisted cursor checkpoints.
    pub async fn sync_message_deltas(&self) -> Result<SlackDeltaSyncReport, String> {
        let now = Utc::now();
        let now_epoch_ms = now.timestamp_millis();
        let backfill_days = load_backfill_days(&self.pool).await?;
        let default_oldest = build_bootstrap_oldest_ts(now, backfill_days);

        let channel_filters = queries::get_setting(&self.pool, CHANNEL_FILTERS_SETTING_KEY)
            .await
            .map_err(|e| format!("read {CHANNEL_FILTERS_SETTING_KEY}: {e}"))?
            .unwrap_or_default();
        let channels = filter_slack_channels(self.client.list_channels().await?, &channel_filters);

        queries::seed_identity_map_from_employees(&self.pool)
            .await
            .map_err(|e| format!("seed identity map from employees: {e}"))?;
        let employees = queries::get_employees(&self.pool)
            .await
            .map_err(|e| format!("load employees for slack sync: {e}"))?;
        let slack_users = self.client.list_users().await?;
        let slack_user_to_employee = self
            .build_slack_user_employee_map(&employees, &slack_users)
            .await?;

        let mut report = SlackDeltaSyncReport {
            channels_total: channels.len() as u32,
            ..SlackDeltaSyncReport::default()
        };

        for channel in &channels {
            let channel_result = self
                .sync_channel(
                    channel,
                    &default_oldest,
                    now_epoch_ms,
                    &slack_user_to_employee,
                )
                .await?;
            report.channels_synced += 1;
            report.messages_scanned += channel_result.messages_scanned;
            report.messages_persisted += channel_result.messages_persisted;
            report.max_lag_seconds =
                max_option_i64(report.max_lag_seconds, channel_result.lag_seconds);
        }

        let summary_payload = serde_json::json!({
            "channels_total": report.channels_total,
            "channels_synced": report.channels_synced,
            "messages_scanned": report.messages_scanned,
            "messages_persisted": report.messages_persisted,
            "max_lag_seconds": report.max_lag_seconds,
            "backfill_days": backfill_days,
        });
        let summary_state = SyncState {
            source: SYNC_SOURCE_SLACK.to_string(),
            entity: SYNC_ENTITY_MESSAGES_DELTA.to_string(),
            last_sync_at: now.format("%Y-%m-%dT%H:%M:%S").to_string(),
            last_cursor: Some(summary_payload.to_string()),
        };
        queries::set_sync_state(&self.pool, &summary_state)
            .await
            .map_err(|e| format!("set slack summary sync state: {e}"))?;

        Ok(report)
    }

    async fn sync_channel(
        &self,
        channel: &SlackConversation,
        default_oldest: &str,
        now_epoch_ms: i64,
        slack_user_to_employee: &HashMap<String, String>,
    ) -> Result<ChannelDeltaOutcome, String> {
        let entity = channel_sync_entity(&channel.id);
        let state = queries::get_sync_state(&self.pool, SYNC_SOURCE_SLACK, &entity)
            .await
            .map_err(|e| format!("load slack sync checkpoint for {}: {e}", channel.id))?;
        let checkpoint = parse_checkpoint(
            state
                .as_ref()
                .and_then(|value| value.last_cursor.as_deref()),
        );
        let mut page_cursor = checkpoint.cursor.clone();
        let oldest_ts = checkpoint
            .oldest_ts
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| default_oldest.to_string());
        let mut max_message_ts = checkpoint
            .last_message_ts
            .clone()
            .filter(|value| !value.trim().is_empty());

        let mut outcome = ChannelDeltaOutcome::default();

        loop {
            let page = self
                .client
                .get_channel_messages_page(&channel.id, &oldest_ts, page_cursor.as_deref())
                .await?;

            for message in page.messages {
                if message.bot_id.is_some() || message.subtype.as_deref() == Some("bot_message") {
                    continue;
                }
                outcome.messages_scanned += 1;

                let employee_id = message
                    .user
                    .as_deref()
                    .and_then(|user_id| slack_user_to_employee.get(user_id))
                    .map(|value| value.as_str());
                self.persist_slack_message_activity(
                    &channel.id,
                    channel.name.as_deref(),
                    message.user.as_deref(),
                    employee_id,
                    &message,
                )
                .await?;
                outcome.messages_persisted += 1;

                if slack_ts_gt(&message.ts, max_message_ts.as_deref()) {
                    max_message_ts = Some(message.ts.clone());
                }
            }

            let interim_checkpoint = SlackCursorCheckpoint {
                cursor: page.next_cursor.clone(),
                oldest_ts: Some(oldest_ts.clone()),
                last_message_ts: max_message_ts.clone(),
            };
            persist_channel_checkpoint(
                &self.pool,
                &channel.id,
                &interim_checkpoint,
                Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
            )
            .await?;

            if page.next_cursor.is_none() {
                break;
            }
            page_cursor = page.next_cursor;
        }

        let final_oldest = max_message_ts
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(oldest_ts);
        let final_checkpoint = SlackCursorCheckpoint {
            cursor: None,
            oldest_ts: Some(final_oldest.clone()),
            last_message_ts: max_message_ts.clone(),
        };
        persist_channel_checkpoint(
            &self.pool,
            &channel.id,
            &final_checkpoint,
            Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        )
        .await?;

        outcome.max_message_ts = max_message_ts;
        outcome.lag_seconds = lag_seconds_from_ts(&final_oldest, now_epoch_ms);
        Ok(outcome)
    }

    async fn persist_slack_message_activity(
        &self,
        channel_id: &str,
        channel_name: Option<&str>,
        slack_user_id: Option<&str>,
        employee_id: Option<&str>,
        message: &SlackMessage,
    ) -> Result<(), String> {
        let activity = SlackMessageActivity {
            id: None,
            message_key: slack_message_key(channel_id, &message.ts),
            slack_channel_id: channel_id.to_string(),
            slack_channel_name: channel_name.map(|value| value.to_string()),
            slack_user_id: slack_user_id.map(|value| value.to_string()),
            employee_id: employee_id.map(|value| value.to_string()),
            message_ts: message.ts.clone(),
            message_ts_ms: slack_ts_to_millis(&message.ts),
            content_preview: slack_content_preview(message.text.as_deref()),
            detected_at: Utc::now().to_rfc3339(),
        };

        queries::upsert_slack_message_activity(&self.pool, &activity)
            .await
            .map_err(|e| format!("persist slack message activity: {e}"))
    }

    async fn build_slack_user_employee_map(
        &self,
        employees: &[Employee],
        slack_users: &[SlackUser],
    ) -> Result<HashMap<String, String>, String> {
        let active_employees: Vec<&Employee> = employees
            .iter()
            .filter(|employee| employee.is_active)
            .collect();
        let employee_by_email: HashMap<String, String> = active_employees
            .iter()
            .map(|employee| (normalize_email(&employee.email), employee.id.clone()))
            .collect();
        let mut employee_name_aliases: HashMap<String, String> = HashMap::new();
        for employee in &active_employees {
            for alias in [
                normalize_person_key(&employee.name),
                person_token_signature(&employee.name),
            ] {
                if !alias.is_empty() {
                    employee_name_aliases.insert(alias, employee.id.clone());
                }
            }
        }

        let now = Utc::now().to_rfc3339();
        let mut mapping = HashMap::new();
        for user in slack_users
            .iter()
            .filter(|user| !user.deleted && !user.is_bot)
        {
            if let Some(employee_id) =
                queries::resolve_employee_id_by_identity(&self.pool, SYNC_SOURCE_SLACK, &user.id)
                    .await
                    .map_err(|e| format!("resolve slack identity {}: {e}", user.id))?
            {
                mapping.insert(user.id.clone(), employee_id.clone());
                let entry = IdentityMapEntry {
                    id: None,
                    source: SYNC_SOURCE_SLACK.to_string(),
                    external_id: user.id.clone(),
                    employee_id: Some(employee_id),
                    confidence: 1.0,
                    resolution_status: "linked".to_string(),
                    match_method: Some("identity_map.existing".to_string()),
                    is_override: false,
                    override_by: None,
                    override_reason: None,
                    override_at: None,
                    first_seen_at: now.clone(),
                    last_seen_at: now.clone(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };
                queries::upsert_identity_map_entry(&self.pool, &entry)
                    .await
                    .map_err(|e| format!("touch slack identity map entry {}: {e}", user.id))?;
                continue;
            }

            let mut heuristic_match: Option<(String, &'static str, f64)> = None;
            if let Some(email) = user
                .profile
                .as_ref()
                .and_then(|profile| profile.email.as_ref())
                .map(|value| normalize_email(value))
            {
                if let Some(employee_id) = employee_by_email.get(&email) {
                    heuristic_match = Some((employee_id.clone(), "heuristic.email", 0.98));
                }
            }
            if heuristic_match.is_none() {
                'outer: for display_name in slack_user_display_names(user) {
                    for alias in [
                        normalize_person_key(&display_name),
                        person_token_signature(&display_name),
                    ] {
                        if let Some(employee_id) = employee_name_aliases.get(&alias) {
                            heuristic_match =
                                Some((employee_id.clone(), "heuristic.name_alias", 0.75));
                            break 'outer;
                        }
                    }
                }
            }

            match heuristic_match {
                Some((employee_id, match_method, confidence)) => {
                    mapping.insert(user.id.clone(), employee_id.clone());
                    let entry = IdentityMapEntry {
                        id: None,
                        source: SYNC_SOURCE_SLACK.to_string(),
                        external_id: user.id.clone(),
                        employee_id: Some(employee_id),
                        confidence,
                        resolution_status: "linked".to_string(),
                        match_method: Some(match_method.to_string()),
                        is_override: false,
                        override_by: None,
                        override_reason: None,
                        override_at: None,
                        first_seen_at: now.clone(),
                        last_seen_at: now.clone(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    };
                    queries::upsert_identity_map_entry(&self.pool, &entry)
                        .await
                        .map_err(|e| format!("upsert slack linked identity {}: {e}", user.id))?;
                }
                None => {
                    let orphan = IdentityMapEntry {
                        id: None,
                        source: SYNC_SOURCE_SLACK.to_string(),
                        external_id: user.id.clone(),
                        employee_id: None,
                        confidence: 0.0,
                        resolution_status: "orphaned".to_string(),
                        match_method: Some("slack.delta.unmatched".to_string()),
                        is_override: false,
                        override_by: None,
                        override_reason: None,
                        override_at: None,
                        first_seen_at: now.clone(),
                        last_seen_at: now.clone(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    };
                    queries::upsert_identity_map_entry(&self.pool, &orphan)
                        .await
                        .map_err(|e| format!("upsert slack orphan identity {}: {e}", user.id))?;
                }
            }
        }

        Ok(mapping)
    }
}

async fn persist_channel_checkpoint(
    pool: &SqlitePool,
    channel_id: &str,
    checkpoint: &SlackCursorCheckpoint,
    last_sync_at: String,
) -> Result<(), String> {
    let serialized = serde_json::to_string(checkpoint)
        .map_err(|e| format!("serialize slack checkpoint: {e}"))?;
    let state = SyncState {
        source: SYNC_SOURCE_SLACK.to_string(),
        entity: channel_sync_entity(channel_id),
        last_sync_at,
        last_cursor: Some(serialized),
    };
    queries::set_sync_state(pool, &state)
        .await
        .map_err(|e| format!("persist slack checkpoint: {e}"))
}

fn channel_sync_entity(channel_id: &str) -> String {
    format!("{CHANNEL_ENTITY_PREFIX}{}", channel_id.trim())
}

fn parse_checkpoint(raw: Option<&str>) -> SlackCursorCheckpoint {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return SlackCursorCheckpoint::default();
    };

    if value.starts_with('{') {
        serde_json::from_str::<SlackCursorCheckpoint>(value).unwrap_or_default()
    } else {
        SlackCursorCheckpoint {
            cursor: Some(value.to_string()),
            oldest_ts: None,
            last_message_ts: None,
        }
    }
}

async fn load_backfill_days(pool: &SqlitePool) -> Result<i64, String> {
    let configured = queries::get_setting(pool, BACKFILL_DAYS_SETTING_KEY)
        .await
        .map_err(|e| format!("read {BACKFILL_DAYS_SETTING_KEY}: {e}"))?;

    let parsed = configured
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_BACKFILL_DAYS);
    Ok(parsed.min(90))
}

fn build_bootstrap_oldest_ts(now: chrono::DateTime<Utc>, backfill_days: i64) -> String {
    let oldest = now
        .checked_sub_signed(Duration::days(backfill_days))
        .unwrap_or(now)
        .timestamp();
    format!("{oldest}.000000")
}

fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_person_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn person_token_signature(value: &str) -> String {
    let mut tokens: Vec<String> = value
        .split(|ch: char| !ch.is_alphanumeric())
        .map(|token| token.trim().to_lowercase())
        .filter(|token| !token.is_empty())
        .collect();
    tokens.sort();
    tokens.join("|")
}

fn parse_multi_value_setting(value: &str) -> Vec<String> {
    value
        .split(|ch: char| ch == ',' || ch == '\n' || ch == ';')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn slack_user_display_names(user: &SlackUser) -> Vec<String> {
    let mut names = Vec::new();
    for candidate in [
        user.profile
            .as_ref()
            .and_then(|profile| profile.display_name.as_deref()),
        user.profile
            .as_ref()
            .and_then(|profile| profile.real_name.as_deref()),
        user.real_name.as_deref(),
        user.name.as_deref(),
    ] {
        if let Some(value) = candidate {
            let trimmed = value.trim();
            if !trimmed.is_empty() && !names.iter().any(|existing| existing == trimmed) {
                names.push(trimmed.to_string());
            }
        }
    }
    names
}

fn filter_slack_channels(
    channels: Vec<SlackConversation>,
    raw_filters: &str,
) -> Vec<SlackConversation> {
    let filters = parse_multi_value_setting(raw_filters);
    if filters.is_empty() {
        return channels;
    }

    let allowed: HashSet<String> = filters
        .into_iter()
        .map(|value| normalize_person_key(&value))
        .collect();

    channels
        .into_iter()
        .filter(|channel| {
            allowed.contains(&normalize_person_key(&channel.id))
                || channel
                    .name
                    .as_ref()
                    .map(|name| allowed.contains(&normalize_person_key(name)))
                    .unwrap_or(false)
        })
        .collect()
}

fn slack_message_key(channel_id: &str, ts: &str) -> String {
    format!("slack:{}:{}", channel_id.trim(), ts.trim())
}

fn slack_content_preview(text: Option<&str>) -> Option<String> {
    text.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(280).collect())
}

fn slack_ts_to_millis(ts: &str) -> Option<i64> {
    let mut parts = ts.trim().split('.');
    let seconds = parts.next()?.parse::<i64>().ok()?;
    let millis_part = parts
        .next()
        .map(|fraction| {
            let mut digits = fraction.chars().take(3).collect::<String>();
            while digits.len() < 3 {
                digits.push('0');
            }
            digits
        })
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    Some(
        seconds
            .saturating_mul(1000)
            .saturating_add(millis_part.min(999)),
    )
}

fn slack_ts_gt(candidate: &str, current: Option<&str>) -> bool {
    match (
        slack_ts_to_millis(candidate),
        current.and_then(slack_ts_to_millis),
    ) {
        (Some(candidate_ms), Some(current_ms)) => candidate_ms > current_ms,
        (Some(_), None) => true,
        _ => false,
    }
}

fn lag_seconds_from_ts(ts: &str, now_epoch_ms: i64) -> Option<i64> {
    let timestamp_ms = slack_ts_to_millis(ts)?;
    Some(((now_epoch_ms - timestamp_ms).max(0)) / 1000)
}

fn max_option_i64(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(l), Some(r)) => Some(l.max(r)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_checkpoint_supports_json_payload() {
        let parsed = parse_checkpoint(Some(
            r#"{"cursor":"abc","oldest_ts":"1744410000.000000","last_message_ts":"1744413600.000000"}"#,
        ));
        assert_eq!(parsed.cursor.as_deref(), Some("abc"));
        assert_eq!(parsed.oldest_ts.as_deref(), Some("1744410000.000000"));
        assert_eq!(parsed.last_message_ts.as_deref(), Some("1744413600.000000"));
    }

    #[test]
    fn parse_checkpoint_supports_legacy_raw_cursor() {
        let parsed = parse_checkpoint(Some("next-cursor-token"));
        assert_eq!(parsed.cursor.as_deref(), Some("next-cursor-token"));
        assert!(parsed.oldest_ts.is_none());
    }

    #[test]
    fn slack_timestamp_parser_handles_fractional_seconds() {
        assert_eq!(
            slack_ts_to_millis("1744467000.123456"),
            Some(1_744_467_000_123)
        );
        assert_eq!(slack_ts_to_millis("1744467000"), Some(1_744_467_000_000));
    }
}
