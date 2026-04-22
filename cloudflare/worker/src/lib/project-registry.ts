import type { D1DatabaseLike } from "./env";
import { execute, nanoid, now, queryAll, queryFirst } from "./db";

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string | null;
  code: string | null;
  portfolio_name: string | null;
  client_name: string | null;
  project_type: string | null;
  status: string;
  visibility: string;
  sync_mode: string;
  created_at: string;
  updated_at: string;
}

interface ProjectSummaryRow extends ProjectRow {
  github_repo_count: number | null;
  huly_link_count: number | null;
  artifact_count: number | null;
  issue_ownership_mode: string | null;
  milestone_authority: string | null;
  sync_health: string | null;
}

interface ProjectGithubLinkRow {
  id: string;
  project_id: string;
  workspace_id: string;
  repo_owner: string;
  repo_name: string;
  repo_role: string;
  display_name: string | null;
  sync_issues: number;
  sync_milestones: number;
  sync_labels: number;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

interface ProjectHulyLinkRow {
  id: string;
  project_id: string;
  workspace_id: string;
  huly_project_id: string;
  sync_issues: number;
  sync_milestones: number;
  sync_components: number;
  sync_templates: number;
  created_at: string;
  updated_at: string;
}

interface ProjectArtifactRow {
  id: string;
  project_id: string;
  workspace_id: string;
  artifact_type: string;
  title: string;
  url: string;
  source: string;
  external_id: string | null;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

interface ProjectSyncPolicyRow {
  id: string;
  project_id: string;
  workspace_id: string;
  issues_enabled: number;
  milestones_enabled: number;
  components_enabled: number;
  templates_enabled: number;
  issue_ownership_mode: string;
  engineering_source: string;
  execution_source: string;
  milestone_authority: string;
  issue_classification_mode: string;
  direction_mode: string;
  rule_config_json: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientProfileRow {
  id: string;
  workspace_id: string;
  client_id: string;
  client_name: string;
  engagement_model: string;
  industry: string | null;
  primary_contact: string | null;
  active: number;
  onboarded: string | null;
  project_ids_json: string | null;
  stakeholders_json: string | null;
  strategic_fit_json: string | null;
  risks_json: string | null;
  resource_links_json: string | null;
  tags_json: string | null;
  source_path: string | null;
  created_at: string;
  updated_at: string;
}

interface OnboardingFlowRow {
  id: string;
  workspace_id: string;
  flow_id: string;
  audience: string;
  status: string;
  owner: string | null;
  starts_on: string | null;
  client_id: string | null;
  member_id: string | null;
  project_ids_json: string | null;
  primary_contact: string | null;
  workspace_ready: number | null;
  manager: string | null;
  department: string | null;
  joined_on: string | null;
  source_path: string | null;
  created_at: string;
  updated_at: string;
}

interface OnboardingFlowQueryRow extends OnboardingFlowRow {
  client_profile_name: string | null;
}

interface OnboardingTaskRow {
  id: string;
  onboarding_flow_id: string;
  workspace_id: string;
  task_id: string;
  title: string;
  completed: number;
  completed_at: string | null;
  resource_created: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary {
  id: string;
  workspaceId: string;
  slug: string | null;
  name: string;
  portfolioName: string | null;
  clientName: string | null;
  projectType: string | null;
  status: string;
  visibility: string;
  syncMode: string;
  githubRepoCount: number;
  hulyLinkCount: number;
  artifactCount: number;
  issueOwnershipMode: string;
  milestoneAuthority: string;
  syncHealth: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectView {
  id: string;
  workspaceId: string;
  slug: string | null;
  name: string;
  portfolioName: string | null;
  clientName: string | null;
  projectType: string | null;
  status: string;
  visibility: string;
  syncMode: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGithubLink {
  id: string;
  projectId: string;
  workspaceId: string;
  repo: string;
  repoOwner: string;
  repoName: string;
  repoRole: string;
  displayName: string | null;
  syncIssues: boolean;
  syncMilestones: boolean;
  syncLabels: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectHulyLink {
  id: string;
  projectId: string;
  workspaceId: string;
  hulyProjectId: string;
  syncIssues: boolean;
  syncMilestones: boolean;
  syncComponents: boolean;
  syncTemplates: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectArtifact {
  id: string;
  projectId: string;
  workspaceId: string;
  artifactType: string;
  artifactFamily: string;
  isVaultArtifact: boolean;
  title: string;
  url: string;
  source: string;
  externalId: string | null;
  sourcePath: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSyncPolicy {
  id: string;
  projectId: string;
  workspaceId: string;
  issuesEnabled: boolean;
  milestonesEnabled: boolean;
  componentsEnabled: boolean;
  templatesEnabled: boolean;
  issueOwnershipMode: string;
  engineeringSource: string;
  executionSource: string;
  milestoneAuthority: string;
  issueClassificationMode: string;
  directionMode: string;
  ruleConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectClientProfileMatchSource = "project_id" | "client_name" | "project_slug";

export interface ProjectClientProfileSummary {
  id: string;
  workspaceId: string;
  clientId: string;
  clientName: string;
  engagementModel: string;
  industry: string | null;
  primaryContact: string | null;
  active: boolean;
  onboarded: string | null;
  projectIds: string[];
  sourcePath: string | null;
  matchedBy: ProjectClientProfileMatchSource;
}

export interface ClientProfile {
  id: string;
  workspaceId: string;
  clientId: string;
  clientName: string;
  engagementModel: string;
  industry: string | null;
  primaryContact: string | null;
  active: boolean;
  onboarded: string | null;
  projectIds: string[];
  stakeholders: string[];
  strategicFit: string[];
  risks: string[];
  resourceLinks: string[];
  tags: string[];
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientProfileProjectLink {
  id: string;
  workspaceId: string;
  slug: string | null;
  name: string;
  status: string;
  projectType: string | null;
  clientName: string | null;
  matchSource: ProjectClientProfileMatchSource;
}

export interface ClientProfileDetail {
  clientProfile: ClientProfile;
  linkedProjects: ClientProfileProjectLink[];
}

export interface OnboardingTask {
  id: string;
  flowId: string;
  workspaceId: string;
  taskId: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  resourceCreated: string | null;
  notes: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingFlow {
  id: string;
  workspaceId: string;
  flowId: string;
  audience: string;
  status: string;
  owner: string | null;
  startsOn: string | null;
  subjectId: string | null;
  subjectName: string | null;
  clientId: string | null;
  memberId: string | null;
  projectIds: string[];
  primaryContact: string | null;
  workspaceReady: boolean | null;
  manager: string | null;
  department: string | null;
  joinedOn: string | null;
  sourcePath: string | null;
  totalTasks: number;
  completedTasks: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingFlowWithTasks {
  flow: OnboardingFlow;
  tasks: OnboardingTask[];
}

export interface ProjectGraph {
  project: ProjectView;
  githubLinks: ProjectGithubLink[];
  hulyLinks: ProjectHulyLink[];
  artifacts: ProjectArtifact[];
  policy: ProjectSyncPolicy | null;
  clientProfile: ProjectClientProfileSummary | null;
}

export interface ProjectMetadataInput {
  workspaceId?: string;
  name?: string;
  slug?: string | null;
  portfolioName?: string | null;
  clientName?: string | null;
  projectType?: string | null;
  status?: string;
  visibility?: string;
  syncMode?: string;
}

export interface ProjectGithubLinkInput {
  repo?: string;
  repoOwner?: string;
  repoName?: string;
  repoRole?: string;
  displayName?: string | null;
  syncIssues?: boolean;
  syncMilestones?: boolean;
  syncLabels?: boolean;
  isPrimary?: boolean;
}

export interface ProjectHulyLinkInput {
  hulyProjectId: string;
  syncIssues?: boolean;
  syncMilestones?: boolean;
  syncComponents?: boolean;
  syncTemplates?: boolean;
}

export interface ProjectArtifactInput {
  id?: string;
  artifactType: string;
  title: string;
  url: string;
  source: string;
  externalId?: string | null;
  isPrimary?: boolean;
}

export interface ProjectSyncPolicyInput {
  issuesEnabled?: boolean;
  milestonesEnabled?: boolean;
  componentsEnabled?: boolean;
  templatesEnabled?: boolean;
  issueOwnershipMode?: string;
  engineeringSource?: string;
  executionSource?: string;
  milestoneAuthority?: string;
  issueClassificationMode?: string;
  directionMode?: string;
  ruleConfig?: Record<string, unknown> | null;
}

export interface ClientProfileInput {
  id?: string;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  engagementModel?: string;
  industry?: string | null;
  primaryContact?: string | null;
  active?: boolean;
  onboarded?: string | null;
  projectIds?: string[];
  stakeholders?: string[];
  strategicFit?: string[];
  risks?: string[];
  resourceLinks?: string[];
  tags?: string[];
  sourcePath?: string | null;
}

export interface OnboardingTaskInput {
  id?: string;
  taskId: string;
  title: string;
  completed?: boolean;
  completedAt?: string | null;
  resourceCreated?: string | null;
  notes?: string | null;
  position?: number;
}

export interface OnboardingFlowInput {
  id?: string;
  flowId: string;
  audience: "client" | "employee";
  status?: string;
  owner?: string | null;
  startsOn?: string | null;
  clientId?: string | null;
  memberId?: string | null;
  projectIds?: string[];
  primaryContact?: string | null;
  workspaceReady?: boolean | null;
  manager?: string | null;
  department?: string | null;
  joinedOn?: string | null;
  sourcePath?: string | null;
  tasks?: OnboardingTaskInput[];
}

export interface ProjectGraphInput {
  workspaceId?: string;
  project?: ProjectMetadataInput;
  githubLinks?: ProjectGithubLinkInput[];
  hulyLinks?: ProjectHulyLinkInput[];
  artifacts?: ProjectArtifactInput[];
  policy?: ProjectSyncPolicyInput | null;
}

function toBool(value: number | null | undefined): boolean {
  return Boolean(value);
}

function safeJsonParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapProject(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    portfolioName: row.portfolio_name,
    clientName: row.client_name,
    projectType: row.project_type,
    status: row.status,
    visibility: row.visibility,
    syncMode: row.sync_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectSummary(row: ProjectSummaryRow): ProjectSummary {
  return {
    ...mapProject(row),
    githubRepoCount: row.github_repo_count ?? 0,
    hulyLinkCount: row.huly_link_count ?? 0,
    artifactCount: row.artifact_count ?? 0,
    issueOwnershipMode: row.issue_ownership_mode ?? "split",
    milestoneAuthority: row.milestone_authority ?? "github",
    syncHealth: row.sync_health ?? "healthy",
  };
}

function mapGithubLink(row: ProjectGithubLinkRow): ProjectGithubLink {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    repo: `${row.repo_owner}/${row.repo_name}`,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    repoRole: row.repo_role,
    displayName: row.display_name,
    syncIssues: toBool(row.sync_issues),
    syncMilestones: toBool(row.sync_milestones),
    syncLabels: toBool(row.sync_labels),
    isPrimary: toBool(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHulyLink(row: ProjectHulyLinkRow): ProjectHulyLink {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    hulyProjectId: row.huly_project_id,
    syncIssues: toBool(row.sync_issues),
    syncMilestones: toBool(row.sync_milestones),
    syncComponents: toBool(row.sync_components),
    syncTemplates: toBool(row.sync_templates),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArtifact(row: ProjectArtifactRow): ProjectArtifact {
  const artifactType = row.artifact_type;
  const isVaultArtifact = artifactType.startsWith("vault-") || row.source === "vault";
  let artifactFamily = "general";
  if (artifactType === "vault-project-brief") artifactFamily = "project_brief";
  if (artifactType === "vault-technical-spec") artifactFamily = "technical_spec";
  if (artifactType === "vault-design-doc") artifactFamily = "design";
  if (artifactType === "vault-research-doc") artifactFamily = "research";
  if (artifactType === "vault-closeout-doc") artifactFamily = "closeout";

  const externalPath = normalizeOptionalString(row.external_id);
  const urlPath = normalizeOptionalString(row.url)?.endsWith(".md")
    ? normalizeOptionalString(row.url)
    : null;
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    artifactType,
    artifactFamily,
    isVaultArtifact,
    title: row.title,
    url: row.url,
    source: row.source,
    externalId: row.external_id,
    sourcePath: externalPath ?? (isVaultArtifact ? urlPath : null),
    isPrimary: toBool(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPolicy(row: ProjectSyncPolicyRow): ProjectSyncPolicy {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    issuesEnabled: toBool(row.issues_enabled),
    milestonesEnabled: toBool(row.milestones_enabled),
    componentsEnabled: toBool(row.components_enabled),
    templatesEnabled: toBool(row.templates_enabled),
    issueOwnershipMode: row.issue_ownership_mode,
    engineeringSource: row.engineering_source,
    executionSource: row.execution_source,
    milestoneAuthority: row.milestone_authority,
    issueClassificationMode: row.issue_classification_mode,
    directionMode: row.direction_mode,
    ruleConfig: safeJsonParse(row.rule_config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stringifyStringArray(values: string[] | undefined, fallback?: string | null): string {
  if (values === undefined) {
    return fallback ?? "[]";
  }
  return JSON.stringify(
    values
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function mapClientProfile(row: ClientProfileRow): ClientProfile {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    clientName: row.client_name,
    engagementModel: row.engagement_model,
    industry: row.industry,
    primaryContact: row.primary_contact,
    active: toBool(row.active),
    onboarded: row.onboarded,
    projectIds: parseStringArray(row.project_ids_json),
    stakeholders: parseStringArray(row.stakeholders_json),
    strategicFit: parseStringArray(row.strategic_fit_json),
    risks: parseStringArray(row.risks_json),
    resourceLinks: parseStringArray(row.resource_links_json),
    tags: parseStringArray(row.tags_json),
    sourcePath: row.source_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildProjectClientProfileSummary(
  profile: ClientProfile,
  matchedBy: ProjectClientProfileMatchSource,
): ProjectClientProfileSummary {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    clientId: profile.clientId,
    clientName: profile.clientName,
    engagementModel: profile.engagementModel,
    industry: profile.industry,
    primaryContact: profile.primaryContact,
    active: profile.active,
    onboarded: profile.onboarded,
    projectIds: profile.projectIds,
    sourcePath: profile.sourcePath,
    matchedBy,
  };
}

function mapOnboardingTask(row: OnboardingTaskRow, flowId: string): OnboardingTask {
  return {
    id: row.id,
    flowId,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    title: row.title,
    completed: toBool(row.completed),
    completedAt: row.completed_at,
    resourceCreated: row.resource_created,
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOnboardingFlow(
  row: OnboardingFlowQueryRow,
  tasks: OnboardingTask[],
): OnboardingFlowWithTasks {
  const subjectId = row.audience === "client" ? row.client_id : row.member_id;
  const subjectName = row.audience === "client"
    ? normalizeOptionalString(row.client_profile_name) ?? normalizeOptionalString(row.client_id)
    : normalizeOptionalString(row.member_id);
  const completedTasks = tasks.filter((task) => task.completed).length;

  return {
    flow: {
      id: row.id,
      workspaceId: row.workspace_id,
      flowId: row.flow_id,
      audience: row.audience,
      status: row.status,
      owner: row.owner,
      startsOn: row.starts_on,
      subjectId,
      subjectName,
      clientId: row.client_id,
      memberId: row.member_id,
      projectIds: parseStringArray(row.project_ids_json),
      primaryContact: row.primary_contact,
      workspaceReady: row.workspace_ready === null ? null : toBool(row.workspace_ready),
      manager: row.manager,
      department: row.department,
      joinedOn: row.joined_on,
      sourcePath: row.source_path,
      totalTasks: tasks.length,
      completedTasks,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    tasks,
  };
}

function normalizeLookupKey(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
}

function resolveBoolean(
  preferred: boolean | undefined,
  existing: number | undefined,
  fallback: boolean,
): boolean {
  if (preferred !== undefined) return preferred;
  if (existing !== undefined) return existing === 1;
  return fallback;
}

function normalizeRepoParts(input: ProjectGithubLinkInput): { repoOwner: string; repoName: string } {
  const repo = normalizeOptionalString(input.repo);
  if (repo) {
    const [repoOwner, repoName, ...rest] = repo.split("/").map((part) => part.trim()).filter(Boolean);
    if (!repoOwner || !repoName || rest.length > 0) {
      throw new Error("GitHub repo must be in owner/repo format.");
    }
    return { repoOwner, repoName };
  }

  return {
    repoOwner: normalizeRequiredString(input.repoOwner, "repoOwner"),
    repoName: normalizeRequiredString(input.repoName, "repoName"),
  };
}

function matchProjectToClientProfile(
  project: ProjectView,
  profile: ClientProfile,
): ProjectClientProfileMatchSource | null {
  const projectSlug = normalizeLookupKey(project.slug);
  const projectClientName = normalizeLookupKey(project.clientName);
  const clientId = normalizeLookupKey(profile.clientId);
  const clientName = normalizeLookupKey(profile.clientName);
  const projectIds = new Set(profile.projectIds.map((value) => normalizeLookupKey(value)).filter(Boolean));

  if (projectSlug && projectIds.has(projectSlug)) {
    return "project_id";
  }
  if (projectClientName && (projectClientName === clientId || projectClientName === clientName)) {
    return "client_name";
  }
  if (projectSlug && (projectSlug === clientId || projectSlug === clientName)) {
    return "project_slug";
  }

  return null;
}

function matchPriority(matchSource: ProjectClientProfileMatchSource): number {
  if (matchSource === "project_id") return 0;
  if (matchSource === "client_name") return 1;
  return 2;
}

function findClientProfileSummaryForProject(
  project: ProjectView,
  clientProfiles: ClientProfile[],
): ProjectClientProfileSummary | null {
  let bestMatch: { profile: ClientProfile; matchSource: ProjectClientProfileMatchSource } | null = null;

  for (const profile of clientProfiles) {
    const matchSource = matchProjectToClientProfile(project, profile);
    if (!matchSource) continue;

    if (!bestMatch) {
      bestMatch = { profile, matchSource };
      continue;
    }

    const currentPriority = matchPriority(matchSource);
    const bestPriority = matchPriority(bestMatch.matchSource);
    if (currentPriority < bestPriority) {
      bestMatch = { profile, matchSource };
      continue;
    }
    if (currentPriority === bestPriority) {
      if (profile.active && !bestMatch.profile.active) {
        bestMatch = { profile, matchSource };
        continue;
      }
      if (profile.updatedAt > bestMatch.profile.updatedAt) {
        bestMatch = { profile, matchSource };
      }
    }
  }

  return bestMatch
    ? buildProjectClientProfileSummary(bestMatch.profile, bestMatch.matchSource)
    : null;
}

export function enrichProjectGraphWithClientProfiles(
  graph: ProjectGraph,
  clientProfiles: ClientProfile[],
): ProjectGraph {
  return {
    ...graph,
    clientProfile: findClientProfileSummaryForProject(graph.project, clientProfiles),
  };
}

export function enrichProjectGraphsWithClientProfiles(
  graphs: ProjectGraph[],
  clientProfiles: ClientProfile[],
): ProjectGraph[] {
  return graphs.map((graph) => enrichProjectGraphWithClientProfiles(graph, clientProfiles));
}

function buildProjectGraph(
  project: ProjectRow,
  githubLinks: ProjectGithubLinkRow[],
  hulyLinks: ProjectHulyLinkRow[],
  artifacts: ProjectArtifactRow[],
  policy: ProjectSyncPolicyRow | null,
): ProjectGraph {
  return {
    project: mapProject(project),
    githubLinks: githubLinks.map(mapGithubLink),
    hulyLinks: hulyLinks.map(mapHulyLink),
    artifacts: artifacts.map(mapArtifact),
    policy: policy ? mapPolicy(policy) : null,
    clientProfile: null,
  };
}

async function queryProjectRows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status: string | null = "active",
): Promise<ProjectRow[]> {
  if (workspaceId && status) {
    return queryAll<ProjectRow>(
      db,
      "SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY name",
      workspaceId,
      status,
    );
  }
  if (workspaceId) {
    return queryAll<ProjectRow>(
      db,
      "SELECT * FROM projects WHERE workspace_id = ? ORDER BY name",
      workspaceId,
    );
  }

  if (status) {
    return queryAll<ProjectRow>(
      db,
      "SELECT * FROM projects WHERE status = ? ORDER BY name",
      status,
    );
  }

  return queryAll<ProjectRow>(
    db,
    "SELECT * FROM projects ORDER BY name",
  );
}

async function queryGithubLinksByProjectIds(
  db: D1DatabaseLike,
  projectIds: string[],
): Promise<ProjectGithubLinkRow[]> {
  if (projectIds.length === 0) return [];
  return queryAll<ProjectGithubLinkRow>(
    db,
    `SELECT * FROM project_github_links WHERE project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY is_primary DESC, repo_owner, repo_name`,
    ...projectIds,
  );
}

async function queryHulyLinksByProjectIds(
  db: D1DatabaseLike,
  projectIds: string[],
): Promise<ProjectHulyLinkRow[]> {
  if (projectIds.length === 0) return [];
  return queryAll<ProjectHulyLinkRow>(
    db,
    `SELECT * FROM project_huly_links WHERE project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY huly_project_id`,
    ...projectIds,
  );
}

async function queryArtifactsByProjectIds(
  db: D1DatabaseLike,
  projectIds: string[],
): Promise<ProjectArtifactRow[]> {
  if (projectIds.length === 0) return [];
  return queryAll<ProjectArtifactRow>(
    db,
    `SELECT * FROM project_artifacts WHERE project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY is_primary DESC, title`,
    ...projectIds,
  );
}

async function queryPoliciesByProjectIds(
  db: D1DatabaseLike,
  projectIds: string[],
): Promise<ProjectSyncPolicyRow[]> {
  if (projectIds.length === 0) return [];
  return queryAll<ProjectSyncPolicyRow>(
    db,
    `SELECT * FROM project_sync_policies WHERE project_id IN (${projectIds.map(() => "?").join(",")})`,
    ...projectIds,
  );
}

async function queryClientProfileRows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  active?: boolean,
): Promise<ClientProfileRow[]> {
  let sql = "SELECT * FROM client_profiles";
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (workspaceId) {
    conditions.push("workspace_id = ?");
    params.push(workspaceId);
  }
  if (active !== undefined) {
    conditions.push("active = ?");
    params.push(active ? 1 : 0);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += " ORDER BY client_name";
  return queryAll<ClientProfileRow>(db, sql, ...params);
}

async function queryOnboardingFlowRows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  audience?: string | null,
  status?: string | null,
): Promise<OnboardingFlowQueryRow[]> {
  let sql = `
    SELECT
      flow.*,
      profile.client_name AS client_profile_name
    FROM onboarding_flows flow
    LEFT JOIN client_profiles profile
      ON profile.workspace_id = flow.workspace_id
      AND profile.client_id = flow.client_id
  `;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (workspaceId) {
    conditions.push("flow.workspace_id = ?");
    params.push(workspaceId);
  }
  if (audience) {
    conditions.push("flow.audience = ?");
    params.push(audience);
  }
  if (status) {
    conditions.push("flow.status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += " ORDER BY flow.starts_on DESC, flow.flow_id";
  return queryAll<OnboardingFlowQueryRow>(db, sql, ...params);
}

async function queryOnboardingTasksByFlowIds(
  db: D1DatabaseLike,
  onboardingFlowIds: string[],
): Promise<OnboardingTaskRow[]> {
  if (onboardingFlowIds.length === 0) return [];
  return queryAll<OnboardingTaskRow>(
    db,
    `SELECT * FROM onboarding_tasks WHERE onboarding_flow_id IN (${onboardingFlowIds.map(() => "?").join(",")}) ORDER BY position, task_id`,
    ...onboardingFlowIds,
  );
}

async function queryProjectSummaryRows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectSummaryRow[]> {
  let sql = `
    SELECT
      p.*,
      (SELECT COUNT(*) FROM project_github_links g WHERE g.project_id = p.id) AS github_repo_count,
      (SELECT COUNT(*) FROM project_huly_links h WHERE h.project_id = p.id) AS huly_link_count,
      (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id = p.id) AS artifact_count,
      psp.issue_ownership_mode AS issue_ownership_mode,
      psp.milestone_authority AS milestone_authority,
      CASE
        WHEN
          (SELECT COUNT(*) FROM project_github_links g WHERE g.project_id = p.id) = 0
          AND (SELECT COUNT(*) FROM project_huly_links h WHERE h.project_id = p.id) = 0
        THEN 'needs_setup'
        ELSE 'healthy'
      END AS sync_health
    FROM projects p
    LEFT JOIN project_sync_policies psp ON psp.project_id = p.id
  `;
  const params: unknown[] = [];
  const conditions: string[] = ["p.status = ?"];
  params.push(status);

  if (workspaceId) {
    conditions.push("p.workspace_id = ?");
    params.push(workspaceId);
  }

  sql += ` WHERE ${conditions.join(" AND ")} ORDER BY p.name`;
  return queryAll<ProjectSummaryRow>(db, sql, ...params);
}

async function ensureWorkspaceExists(
  db: D1DatabaseLike,
  workspaceId: string,
): Promise<void> {
  const workspace = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM workspaces WHERE id = ?",
    workspaceId,
  );
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} does not exist.`);
  }
}

interface BatchCapableDatabase extends D1DatabaseLike {
  batch?(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown[]>;
}

function prepareRunnableStatement(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): { run(): Promise<unknown> } {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound as unknown as { run(): Promise<unknown> };
}

async function executeAtomicStatements(
  db: D1DatabaseLike,
  statements: Array<{ sql: string; params?: unknown[] }>,
): Promise<void> {
  const batchDb = db as BatchCapableDatabase;
  if (typeof batchDb.batch === "function") {
    await batchDb.batch(
      statements.map(({ sql, params = [] }) => prepareRunnableStatement(db, sql, ...params)),
    );
    return;
  }

  let transactionStarted = false;
  try {
    await execute(db, "BEGIN IMMEDIATE TRANSACTION");
    transactionStarted = true;
    for (const { sql, params = [] } of statements) {
      await execute(db, sql, ...params);
    }
    await execute(db, "COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await execute(db, "ROLLBACK");
      } catch {
        // Best-effort rollback only.
      }
    }
    throw error;
  }
}

export async function listProjectSummaries(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectSummary[]> {
  const rows = await queryProjectSummaryRows(db, workspaceId, status);
  return rows.map(mapProjectSummary);
}

export async function listClientProfiles(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  active?: boolean,
): Promise<ClientProfile[]> {
  const rows = await queryClientProfileRows(db, workspaceId, active);
  return rows.map(mapClientProfile);
}

export async function getClientProfile(
  db: D1DatabaseLike,
  clientId: string,
  workspaceId?: string | null,
): Promise<ClientProfile | null> {
  const normalizedClientId = normalizeRequiredString(clientId, "clientId");
  const row = workspaceId
    ? await queryFirst<ClientProfileRow>(
        db,
        "SELECT * FROM client_profiles WHERE workspace_id = ? AND client_id = ?",
        workspaceId,
        normalizedClientId,
      )
    : await queryFirst<ClientProfileRow>(
        db,
        "SELECT * FROM client_profiles WHERE client_id = ? ORDER BY updated_at DESC",
        normalizedClientId,
      );
  return row ? mapClientProfile(row) : null;
}

export async function getClientProfileDetail(
  db: D1DatabaseLike,
  clientId: string,
  workspaceId?: string | null,
): Promise<ClientProfileDetail | null> {
  const clientProfile = await getClientProfile(db, clientId, workspaceId);
  if (!clientProfile) return null;

  const projects = await queryProjectRows(db, clientProfile.workspaceId, null);
  const linkedProjects = projects
    .map((project) => {
      const matchSource = matchProjectToClientProfile(mapProject(project), clientProfile);
      if (!matchSource) return null;
      return {
        id: project.id,
        workspaceId: project.workspace_id,
        slug: project.slug,
        name: project.name,
        status: project.status,
        projectType: project.project_type,
        clientName: project.client_name,
        matchSource,
      } satisfies ClientProfileProjectLink;
    })
    .filter((project): project is ClientProfileProjectLink => project !== null);

  return {
    clientProfile,
    linkedProjects,
  };
}

export async function listOnboardingFlows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  filters: { audience?: "client" | "employee" | null; status?: string | null } = {},
): Promise<OnboardingFlowWithTasks[]> {
  const flowRows = await queryOnboardingFlowRows(db, workspaceId, filters.audience, filters.status);
  const taskRows = await queryOnboardingTasksByFlowIds(
    db,
    flowRows.map((flow) => flow.id),
  );
  const tasksByFlowId = new Map<string, OnboardingTask[]>();
  const flowIdByRowId = new Map(flowRows.map((flow) => [flow.id, flow.flow_id]));

  for (const row of taskRows) {
    const flowId = flowIdByRowId.get(row.onboarding_flow_id);
    if (!flowId) continue;
    const tasks = tasksByFlowId.get(row.onboarding_flow_id) ?? [];
    tasks.push(mapOnboardingTask(row, flowId));
    tasksByFlowId.set(row.onboarding_flow_id, tasks);
  }

  return flowRows.map((row) =>
    mapOnboardingFlow(row, tasksByFlowId.get(row.id) ?? []),
  );
}

export async function listProjectGraphs(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectGraph[]> {
  const projects = await queryProjectRows(db, workspaceId, status);
  const projectIds = projects.map((project) => project.id);
  const [githubLinks, hulyLinks, artifacts, policies, clientProfiles] = await Promise.all([
    queryGithubLinksByProjectIds(db, projectIds),
    queryHulyLinksByProjectIds(db, projectIds),
    queryArtifactsByProjectIds(db, projectIds),
    queryPoliciesByProjectIds(db, projectIds),
    listClientProfiles(db, workspaceId),
  ]);

  const githubByProject = new Map<string, ProjectGithubLinkRow[]>();
  for (const row of githubLinks) {
    const list = githubByProject.get(row.project_id) ?? [];
    list.push(row);
    githubByProject.set(row.project_id, list);
  }

  const hulyByProject = new Map<string, ProjectHulyLinkRow[]>();
  for (const row of hulyLinks) {
    const list = hulyByProject.get(row.project_id) ?? [];
    list.push(row);
    hulyByProject.set(row.project_id, list);
  }

  const artifactsByProject = new Map<string, ProjectArtifactRow[]>();
  for (const row of artifacts) {
    const list = artifactsByProject.get(row.project_id) ?? [];
    list.push(row);
    artifactsByProject.set(row.project_id, list);
  }

  const policyByProject = new Map<string, ProjectSyncPolicyRow>();
  for (const row of policies) {
    policyByProject.set(row.project_id, row);
  }

  return enrichProjectGraphsWithClientProfiles(projects.map((project) =>
    buildProjectGraph(
      project,
      githubByProject.get(project.id) ?? [],
      hulyByProject.get(project.id) ?? [],
      artifactsByProject.get(project.id) ?? [],
      policyByProject.get(project.id) ?? null,
    ),
  ), clientProfiles);
}

export async function getProjectGraph(
  db: D1DatabaseLike,
  projectId: string,
): Promise<ProjectGraph | null> {
  const project = await queryFirst<ProjectRow>(db, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return null;

  const [githubLinks, hulyLinks, artifacts, policy, clientProfiles] = await Promise.all([
    queryAll<ProjectGithubLinkRow>(db, "SELECT * FROM project_github_links WHERE project_id = ? ORDER BY is_primary DESC, repo_owner, repo_name", projectId),
    queryAll<ProjectHulyLinkRow>(db, "SELECT * FROM project_huly_links WHERE project_id = ? ORDER BY huly_project_id", projectId),
    queryAll<ProjectArtifactRow>(db, "SELECT * FROM project_artifacts WHERE project_id = ? ORDER BY is_primary DESC, title", projectId),
    queryFirst<ProjectSyncPolicyRow>(db, "SELECT * FROM project_sync_policies WHERE project_id = ?", projectId),
    listClientProfiles(db, project.workspace_id),
  ]);

  return enrichProjectGraphWithClientProfiles(
    buildProjectGraph(project, githubLinks, hulyLinks, artifacts, policy),
    clientProfiles,
  );
}

export async function upsertClientProfile(
  db: D1DatabaseLike,
  input: ClientProfileInput,
): Promise<ClientProfile> {
  const workspaceId = normalizeRequiredString(input.workspaceId, "workspaceId");
  const clientId = normalizeRequiredString(input.clientId, "clientId");
  await ensureWorkspaceExists(db, workspaceId);

  const existing = await queryFirst<ClientProfileRow>(
    db,
    "SELECT * FROM client_profiles WHERE workspace_id = ? AND client_id = ?",
    workspaceId,
    clientId,
  );
  const ts = now();

  const clientName = input.clientName ?? existing?.client_name;
  const engagementModel = input.engagementModel ?? existing?.engagement_model;
  if (!clientName) {
    throw new Error("clientName is required.");
  }
  if (!engagementModel) {
    throw new Error("engagementModel is required.");
  }

  await execute(
    db,
    `INSERT INTO client_profiles
      (id, workspace_id, client_id, client_name, engagement_model, industry, primary_contact, active, onboarded, project_ids_json, stakeholders_json, strategic_fit_json, risks_json, resource_links_json, tags_json, source_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, client_id) DO UPDATE SET
       client_name = excluded.client_name,
       engagement_model = excluded.engagement_model,
       industry = excluded.industry,
       primary_contact = excluded.primary_contact,
       active = excluded.active,
       onboarded = excluded.onboarded,
       project_ids_json = excluded.project_ids_json,
       stakeholders_json = excluded.stakeholders_json,
       strategic_fit_json = excluded.strategic_fit_json,
       risks_json = excluded.risks_json,
       resource_links_json = excluded.resource_links_json,
       tags_json = excluded.tags_json,
       source_path = excluded.source_path,
       updated_at = excluded.updated_at`,
    normalizeOptionalString(input.id) ?? existing?.id ?? nanoid(),
    workspaceId,
    clientId,
    normalizeRequiredString(clientName, "clientName"),
    normalizeRequiredString(engagementModel, "engagementModel"),
    input.industry === undefined ? existing?.industry ?? null : normalizeOptionalString(input.industry),
    input.primaryContact === undefined
      ? existing?.primary_contact ?? null
      : normalizeOptionalString(input.primaryContact),
    input.active ?? (existing ? toBool(existing.active) : true) ? 1 : 0,
    input.onboarded === undefined ? existing?.onboarded ?? null : normalizeOptionalString(input.onboarded),
    stringifyStringArray(input.projectIds, existing?.project_ids_json),
    stringifyStringArray(input.stakeholders, existing?.stakeholders_json),
    stringifyStringArray(input.strategicFit, existing?.strategic_fit_json),
    stringifyStringArray(input.risks, existing?.risks_json),
    stringifyStringArray(input.resourceLinks, existing?.resource_links_json),
    stringifyStringArray(input.tags, existing?.tags_json),
    input.sourcePath === undefined ? existing?.source_path ?? null : normalizeOptionalString(input.sourcePath),
    existing?.created_at ?? ts,
    ts,
  );

  const profile = await getClientProfile(db, clientId, workspaceId);
  if (!profile) {
    throw new Error(`Client profile ${clientId} was not found after upsert.`);
  }
  return profile;
}

export async function replaceOnboardingFlows(
  db: D1DatabaseLike,
  workspaceId: string,
  flows: OnboardingFlowInput[] = [],
): Promise<OnboardingFlowWithTasks[]> {
  const normalizedWorkspaceId = normalizeRequiredString(workspaceId, "workspaceId");
  await ensureWorkspaceExists(db, normalizedWorkspaceId);

  const ts = now();
  const statements: Array<{ sql: string; params?: unknown[] }> = [
    {
      sql: "DELETE FROM onboarding_flows WHERE workspace_id = ?",
      params: [normalizedWorkspaceId],
    },
  ];

  for (const flow of flows) {
    const flowId = normalizeRequiredString(flow.flowId, "flowId");
    const audience = flow.audience;
    if (audience !== "client" && audience !== "employee") {
      throw new Error(`Unsupported onboarding audience: ${audience}`);
    }

    const onboardingFlowId = normalizeOptionalString(flow.id) ?? nanoid();
    const clientId = audience === "client"
      ? normalizeRequiredString(flow.clientId ?? undefined, "clientId")
      : null;
    const memberId = audience === "employee"
      ? normalizeRequiredString(flow.memberId ?? undefined, "memberId")
      : null;

    statements.push({
      sql: `INSERT INTO onboarding_flows
        (id, workspace_id, flow_id, audience, status, owner, starts_on, client_id, member_id, project_ids_json, primary_contact, workspace_ready, manager, department, joined_on, source_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        onboardingFlowId,
        normalizedWorkspaceId,
        flowId,
        audience,
        normalizeOptionalString(flow.status) ?? "draft",
        normalizeOptionalString(flow.owner),
        normalizeOptionalString(flow.startsOn),
        clientId,
        memberId,
        stringifyStringArray(flow.projectIds),
        normalizeOptionalString(flow.primaryContact),
        flow.workspaceReady === null || flow.workspaceReady === undefined ? null : flow.workspaceReady ? 1 : 0,
        normalizeOptionalString(flow.manager),
        normalizeOptionalString(flow.department),
        normalizeOptionalString(flow.joinedOn),
        normalizeOptionalString(flow.sourcePath),
        ts,
        ts,
      ],
    });

    const tasks = flow.tasks ?? [];
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      statements.push({
        sql: `INSERT INTO onboarding_tasks
          (id, onboarding_flow_id, workspace_id, task_id, title, completed, completed_at, resource_created, notes, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          normalizeOptionalString(task.id) ?? nanoid(),
          onboardingFlowId,
          normalizedWorkspaceId,
          normalizeRequiredString(task.taskId, "taskId"),
          normalizeRequiredString(task.title, "title"),
          task.completed ? 1 : 0,
          normalizeOptionalString(task.completedAt),
          normalizeOptionalString(task.resourceCreated),
          normalizeOptionalString(task.notes),
          task.position ?? index,
          ts,
          ts,
        ],
      });
    }
  }

  await executeAtomicStatements(db, statements);
  return listOnboardingFlows(db, normalizedWorkspaceId);
}

export async function upsertProjectMetadata(
  db: D1DatabaseLike,
  projectId: string,
  input: ProjectMetadataInput,
): Promise<ProjectView> {
  const existing = await queryFirst<ProjectRow>(db, "SELECT * FROM projects WHERE id = ?", projectId);
  const ts = now();

  if (existing) {
    await execute(
      db,
      `UPDATE projects
       SET name = ?, slug = ?, portfolio_name = ?, client_name = ?, project_type = ?, status = ?, visibility = ?, sync_mode = ?, updated_at = ?
       WHERE id = ?`,
      input.name ?? existing.name,
      input.slug ?? existing.slug,
      input.portfolioName ?? existing.portfolio_name,
      input.clientName ?? existing.client_name,
      input.projectType ?? existing.project_type,
      input.status ?? existing.status,
      input.visibility ?? existing.visibility,
      input.syncMode ?? existing.sync_mode,
      ts,
      projectId,
    );
  } else {
    const workspaceId = normalizeRequiredString(input.workspaceId, "workspaceId");
    const name = normalizeRequiredString(input.name, "name");
    await execute(
      db,
      `INSERT INTO projects
        (id, workspace_id, name, slug, code, portfolio_name, client_name, project_type, status, visibility, sync_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId,
      workspaceId,
      name,
      input.slug ?? null,
      null,
      input.portfolioName ?? null,
      input.clientName ?? null,
      input.projectType ?? null,
      input.status ?? "active",
      input.visibility ?? "workspace",
      input.syncMode ?? "manual",
      ts,
      ts,
    );
  }

  const updated = await queryFirst<ProjectRow>(db, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!updated) {
    throw new Error(`Project ${projectId} was not found after upsert.`);
  }
  return mapProject(updated);
}

export async function replaceProjectGithubLinks(
  db: D1DatabaseLike,
  projectId: string,
  workspaceId: string,
  links: ProjectGithubLinkInput[] = [],
): Promise<void> {
  await execute(db, "DELETE FROM project_github_links WHERE project_id = ?", projectId);
  const ts = now();

  for (const link of links) {
    const { repoOwner, repoName } = normalizeRepoParts(link);
    await execute(
      db,
      `INSERT INTO project_github_links
        (id, project_id, workspace_id, repo_owner, repo_name, repo_role, display_name, sync_issues, sync_milestones, sync_labels, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      nanoid(),
      projectId,
      workspaceId,
      repoOwner,
      repoName,
      normalizeOptionalString(link.repoRole) ?? "primary",
      normalizeOptionalString(link.displayName),
      link.syncIssues === false ? 0 : 1,
      link.syncMilestones === false ? 0 : 1,
      link.syncLabels === false ? 0 : 1,
      link.isPrimary ? 1 : 0,
      ts,
      ts,
    );
  }
}

export async function replaceProjectHulyLinks(
  db: D1DatabaseLike,
  projectId: string,
  workspaceId: string,
  links: ProjectHulyLinkInput[] = [],
): Promise<void> {
  await execute(db, "DELETE FROM project_huly_links WHERE project_id = ?", projectId);
  const ts = now();

  for (const link of links) {
    await execute(
      db,
      `INSERT INTO project_huly_links
        (id, project_id, workspace_id, huly_project_id, sync_issues, sync_milestones, sync_components, sync_templates, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      nanoid(),
      projectId,
      workspaceId,
      normalizeRequiredString(link.hulyProjectId, "hulyProjectId"),
      link.syncIssues === false ? 0 : 1,
      link.syncMilestones === false ? 0 : 1,
      link.syncComponents ? 1 : 0,
      link.syncTemplates ? 1 : 0,
      ts,
      ts,
    );
  }
}

export async function replaceProjectArtifacts(
  db: D1DatabaseLike,
  projectId: string,
  workspaceId: string,
  artifacts: ProjectArtifactInput[] = [],
): Promise<void> {
  await execute(db, "DELETE FROM project_artifacts WHERE project_id = ?", projectId);
  const ts = now();

  for (const artifact of artifacts) {
    await execute(
      db,
      `INSERT INTO project_artifacts
        (id, project_id, workspace_id, artifact_type, title, url, source, external_id, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      normalizeOptionalString(artifact.id) ?? nanoid(),
      projectId,
      workspaceId,
      normalizeRequiredString(artifact.artifactType, "artifactType"),
      normalizeRequiredString(artifact.title, "title"),
      normalizeRequiredString(artifact.url, "url"),
      normalizeRequiredString(artifact.source, "source"),
      normalizeOptionalString(artifact.externalId),
      artifact.isPrimary ? 1 : 0,
      ts,
      ts,
    );
  }
}

export async function upsertProjectSyncPolicy(
  db: D1DatabaseLike,
  projectId: string,
  workspaceId: string,
  policy: ProjectSyncPolicyInput | null | undefined,
): Promise<void> {
  const existing = await queryFirst<ProjectSyncPolicyRow>(
    db,
    "SELECT * FROM project_sync_policies WHERE project_id = ?",
    projectId,
  );
  const ts = now();
  const issuesEnabled = resolveBoolean(policy?.issuesEnabled, existing?.issues_enabled, true);
  const milestonesEnabled = resolveBoolean(policy?.milestonesEnabled, existing?.milestones_enabled, true);
  const componentsEnabled = resolveBoolean(policy?.componentsEnabled, existing?.components_enabled, false);
  const templatesEnabled = resolveBoolean(policy?.templatesEnabled, existing?.templates_enabled, false);
  const issueOwnershipMode = policy?.issueOwnershipMode ?? existing?.issue_ownership_mode ?? "split";
  const engineeringSource = policy?.engineeringSource ?? existing?.engineering_source ?? "github";
  const executionSource = policy?.executionSource ?? existing?.execution_source ?? "huly";
  const milestoneAuthority = policy?.milestoneAuthority ?? existing?.milestone_authority ?? "github";
  const issueClassificationMode =
    policy?.issueClassificationMode ?? existing?.issue_classification_mode ?? "hybrid";
  const directionMode = policy?.directionMode ?? existing?.direction_mode ?? "review_gate";
  const ruleConfigJson = policy?.ruleConfig === undefined
    ? existing?.rule_config_json ?? null
    : JSON.stringify(policy.ruleConfig ?? {});

  if (existing) {
    await execute(
      db,
      `UPDATE project_sync_policies
       SET workspace_id = ?, issues_enabled = ?, milestones_enabled = ?, components_enabled = ?, templates_enabled = ?, issue_ownership_mode = ?, engineering_source = ?, execution_source = ?, milestone_authority = ?, issue_classification_mode = ?, direction_mode = ?, rule_config_json = ?, updated_at = ?
       WHERE project_id = ?`,
      workspaceId,
      issuesEnabled ? 1 : 0,
      milestonesEnabled ? 1 : 0,
      componentsEnabled ? 1 : 0,
      templatesEnabled ? 1 : 0,
      issueOwnershipMode,
      engineeringSource,
      executionSource,
      milestoneAuthority,
      issueClassificationMode,
      directionMode,
      ruleConfigJson,
      ts,
      projectId,
    );
    return;
  }

  await execute(
    db,
    `INSERT INTO project_sync_policies
      (id, project_id, workspace_id, issues_enabled, milestones_enabled, components_enabled, templates_enabled, issue_ownership_mode, engineering_source, execution_source, milestone_authority, issue_classification_mode, direction_mode, rule_config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    nanoid(),
    projectId,
    workspaceId,
    issuesEnabled ? 1 : 0,
    milestonesEnabled ? 1 : 0,
    componentsEnabled ? 1 : 0,
    templatesEnabled ? 1 : 0,
    issueOwnershipMode,
    engineeringSource,
    executionSource,
    milestoneAuthority,
    issueClassificationMode,
    directionMode,
    ruleConfigJson,
    ts,
    ts,
  );
}

export async function upsertProjectGraph(
  db: D1DatabaseLike,
  projectId: string,
  input: ProjectGraphInput,
): Promise<ProjectGraph> {
  const projectInput = input.project ?? input;
  const workspaceId =
    normalizeOptionalString(projectInput.workspaceId) ?? normalizeOptionalString(input.workspaceId);
  const existing = await queryFirst<ProjectRow>(db, "SELECT * FROM projects WHERE id = ?", projectId);
  const resolvedWorkspaceId = workspaceId ?? existing?.workspace_id ?? null;

  if (!resolvedWorkspaceId) {
    throw new Error("workspaceId is required.");
  }

  await ensureWorkspaceExists(db, resolvedWorkspaceId);
  await upsertProjectMetadata(db, projectId, {
    ...projectInput,
    workspaceId: resolvedWorkspaceId,
  });
  await replaceProjectGithubLinks(db, projectId, resolvedWorkspaceId, input.githubLinks ?? []);
  await replaceProjectHulyLinks(db, projectId, resolvedWorkspaceId, input.hulyLinks ?? []);
  await replaceProjectArtifacts(db, projectId, resolvedWorkspaceId, input.artifacts ?? []);
  await upsertProjectSyncPolicy(db, projectId, resolvedWorkspaceId, input.policy);

  const graph = await getProjectGraph(db, projectId);
  if (!graph) {
    throw new Error(`Project graph ${projectId} was not found after upsert.`);
  }
  return graph;
}
