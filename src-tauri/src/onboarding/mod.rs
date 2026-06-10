use serde::{Deserialize, Serialize};

// ─── Onboarding step states ──────────────────────────────────────

/// Granular step state for Phase 4 flow tracking.
/// Replaces the boolean `completed` field with three states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnboardingStepState {
    NotStarted,
    InProgress,
    Done,
}

impl OnboardingStepState {
    #[allow(dead_code)]
    pub fn label(&self) -> &'static str {
        match self {
            OnboardingStepState::NotStarted => "not-started",
            OnboardingStepState::InProgress => "in-progress",
            OnboardingStepState::Done => "done",
        }
    }

    pub fn from_label(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "not-started" | "not_started" | "notstarted" | "not started" => {
                Some(OnboardingStepState::NotStarted)
            }
            "in-progress" | "in_progress" | "inprogress" | "in progress" => {
                Some(OnboardingStepState::InProgress)
            }
            "done" | "completed" | "complete" => Some(OnboardingStepState::Done),
            _ => None,
        }
    }

    pub fn is_done(&self) -> bool {
        matches!(self, OnboardingStepState::Done)
    }

    pub fn is_active(&self) -> bool {
        matches!(self, OnboardingStepState::InProgress)
    }
}

// ─── Client onboarding template ────────────────────────────────

/// A reusable template for onboarding new clients.
/// Stored in the local SQLite cache and synced to the Cloudflare Worker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingTemplate {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub steps: Vec<ClientOnboardingTemplateStep>,
    pub created_at: String,
    pub updated_at: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingTemplateStep {
    pub step_id: String,
    pub sort_order: i64,
    pub title: String,
    pub description: Option<String>,
    pub estimated_days: Option<u32>,
    pub required: bool,
    pub auto_trigger: Option<String>,
}

// ─── Client onboarding flow (instance) ─────────────────────────

/// A client onboarding flow instance created from a template.
/// Tracks per-client progress through the template steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingFlow {
    #[serde(rename = "_id")]
    pub id: String,
    pub client_id: String,
    pub client_name: String,
    pub template_id: String,
    pub template_name: String,
    pub steps: Vec<ClientOnboardingFlowStep>,
    pub status: ClientOnboardingFlowStatus,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub assigned_to: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingFlowStep {
    pub step_id: String,
    pub title: String,
    pub state: OnboardingStepState,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub notes: Option<String>,
    pub assigned_to: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClientOnboardingFlowStatus {
    NotStarted,
    InProgress,
    Completed,
    Stalled,
}

impl ClientOnboardingFlowStatus {
    pub fn label(&self) -> &'static str {
        match self {
            ClientOnboardingFlowStatus::NotStarted => "not-started",
            ClientOnboardingFlowStatus::InProgress => "in-progress",
            ClientOnboardingFlowStatus::Completed => "completed",
            ClientOnboardingFlowStatus::Stalled => "stalled",
        }
    }

    pub fn from_label(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "not-started" | "not_started" | "notstarted" => {
                Some(ClientOnboardingFlowStatus::NotStarted)
            }
            "in-progress" | "in_progress" | "inprogress" => {
                Some(ClientOnboardingFlowStatus::InProgress)
            }
            "completed" | "complete" => Some(ClientOnboardingFlowStatus::Completed),
            "stalled" => Some(ClientOnboardingFlowStatus::Stalled),
            _ => None,
        }
    }
}

// ─── Summary views for frontend ─────────────────────────────────

/// Summary of a template for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingTemplateSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub step_count: u32,
    pub is_default: bool,
    pub updated_at: String,
}

/// Summary of a client onboarding flow for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOnboardingFlowSummary {
    pub id: String,
    pub client_id: String,
    pub client_name: String,
    pub template_name: String,
    pub status: String,
    pub progress_percent: f64,
    pub steps_done: u32,
    pub steps_total: u32,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub assigned_to: Option<String>,
}

/// Input for creating a new client onboarding flow from a template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClientOnboardingFlowInput {
    pub client_id: String,
    pub client_name: String,
    pub template_id: String,
    pub assigned_to: Option<String>,
    pub notes: Option<String>,
}

/// Input for updating a step state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOnboardingStepInput {
    pub flow_id: String,
    pub step_id: String,
    pub state: String,
    pub notes: Option<String>,
    pub assigned_to: Option<String>,
}
