use serde::{Deserialize, Serialize};

// ─── Huly relation types ───────────────────────────────────────

/// The 8 entity-relation types defined in Phase 3 (DATA-01).
/// These map to Huly's internal relation model and are surfaced in
/// Insights (dependency chains), Sprints (burndown), and Clients
/// (revenue-by-project reporting).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HulyRelationType {
    /// Issue A blocks Issue B (B cannot proceed until A is resolved).
    Blocks,
    /// Generic bidirectional relation between two issues.
    RelatesTo,
    /// Issue A is a duplicate of Issue B.
    Duplicates,
    /// Issue A creates a resource (document, asset, etc.).
    CreatesResource,
    /// Issue A is documented in Document B.
    DocumentsIn,
    /// Issue A involves Device B.
    InvolvesDevice,
    /// Issue A is part of Sprint B.
    PartOfSprint,
    /// Project A is assigned to Client B.
    ClientAssignment,
}

impl HulyRelationType {
    /// Human-readable label used in UI surfaces.
    pub fn label(&self) -> &'static str {
        match self {
            HulyRelationType::Blocks => "blocks",
            HulyRelationType::RelatesTo => "relates to",
            HulyRelationType::Duplicates => "duplicates",
            HulyRelationType::CreatesResource => "creates resource",
            HulyRelationType::DocumentsIn => "documents in",
            HulyRelationType::InvolvesDevice => "involves device",
            HulyRelationType::PartOfSprint => "part of sprint",
            HulyRelationType::ClientAssignment => "client assignment",
        }
    }

    /// Huly internal class name for storing this relation.
    /// All relations use the same base class; the type is stored in
    /// the `type` attribute.
    pub fn huly_class(&self) -> &'static str {
        "tracker:class:IssueRelation"
    }

    /// Whether this relation is directional (has a clear source→target
    /// semantic) or bidirectional.
    #[allow(dead_code)]
    pub fn is_directional(&self) -> bool {
        matches!(
            self,
            HulyRelationType::Blocks
                | HulyRelationType::CreatesResource
                | HulyRelationType::DocumentsIn
                | HulyRelationType::InvolvesDevice
                | HulyRelationType::PartOfSprint
                | HulyRelationType::ClientAssignment
        )
    }
}

/// A relation instance between two Huly entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyRelation {
    #[serde(rename = "_id")]
    pub id: String,
    /// The relation type (Blocks, RelatesTo, etc.).
    pub relation_type: HulyRelationType,
    /// ID of the source entity (the "from" side).
    pub source_id: String,
    /// Huly class of the source entity.
    pub source_class: String,
    /// ID of the target entity (the "to" side).
    pub target_id: String,
    /// Huly class of the target entity.
    pub target_class: String,
    /// Optional metadata (e.g. sprint name, client name for display).
    pub metadata: Option<serde_json::Value>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

/// Query filter for finding relations.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation_type: Option<HulyRelationType>,
}

/// Summary of relations for a given entity, grouped by type.
/// Returned to the frontend for dependency-chain views.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyRelationSummary {
    pub entity_id: String,
    pub entity_class: String,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
    pub relates_to: Vec<String>,
    pub duplicates: Vec<String>,
    pub creates_resources: Vec<String>,
    pub documents_in: Vec<String>,
    pub involves_devices: Vec<String>,
    pub part_of_sprints: Vec<String>,
    pub client_assignments: Vec<String>,
}

impl HulyRelationSummary {
    pub fn empty(entity_id: String, entity_class: String) -> Self {
        Self {
            entity_id,
            entity_class,
            blocks: vec![],
            blocked_by: vec![],
            relates_to: vec![],
            duplicates: vec![],
            creates_resources: vec![],
            documents_in: vec![],
            involves_devices: vec![],
            part_of_sprints: vec![],
            client_assignments: vec![],
        }
    }
}

/// A dependency chain (transitive closure of "blocks" relations).
/// Used by the Insights page to render blocked-task views.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyDependencyChain {
    pub root_issue_id: String,
    pub chain: Vec<ChainLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainLink {
    pub issue_id: String,
    pub title: Option<String>,
    pub depth: u32,
    pub blocked_by: Vec<String>,
}
