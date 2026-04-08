use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SlackResponseMetadata {
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackEnvelope<T> {
    pub ok: bool,
    pub error: Option<String>,
    pub needed: Option<String>,
    pub provided: Option<String>,
    pub response_metadata: Option<SlackResponseMetadata>,
    #[serde(flatten)]
    pub data: T,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SlackAuthTestData {
    pub user_id: String,
    pub user: String,
    pub team: Option<String>,
    pub team_id: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SlackConversationsData {
    #[serde(default)]
    pub channels: Vec<SlackConversation>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackConversation {
    pub id: String,
    pub name: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SlackUsersData {
    #[serde(default)]
    pub members: Vec<SlackUser>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackUser {
    pub id: String,
    pub name: Option<String>,
    pub real_name: Option<String>,
    pub profile: Option<SlackUserProfile>,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub is_bot: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackUserProfile {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub real_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SlackHistoryData {
    #[serde(default)]
    pub messages: Vec<SlackMessage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackMessage {
    pub user: Option<String>,
    pub ts: String,
    pub subtype: Option<String>,
    pub bot_id: Option<String>,
}
