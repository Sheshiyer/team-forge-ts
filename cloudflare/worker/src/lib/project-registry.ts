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
  title: string;
  url: string;
  source: string;
  externalId: string | null;
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

export interface ProjectGraph {
  project: ProjectView;
  githubLinks: ProjectGithubLink[];
  hulyLinks: ProjectHulyLink[];
  artifacts: ProjectArtifact[];
  policy: ProjectSyncPolicy | null;
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
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    artifactType: row.artifact_type,
    title: row.title,
    url: row.url,
    source: row.source,
    externalId: row.external_id,
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
  };
}

async function queryProjectRows(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectRow[]> {
  if (workspaceId) {
    return queryAll<ProjectRow>(
      db,
      "SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY name",
      workspaceId,
      status,
    );
  }

  return queryAll<ProjectRow>(
    db,
    "SELECT * FROM projects WHERE status = ? ORDER BY name",
    status,
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

export async function listProjectSummaries(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectSummary[]> {
  const rows = await queryProjectSummaryRows(db, workspaceId, status);
  return rows.map(mapProjectSummary);
}

export async function listProjectGraphs(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectGraph[]> {
  const projects = await queryProjectRows(db, workspaceId, status);
  const projectIds = projects.map((project) => project.id);
  const [githubLinks, hulyLinks, artifacts, policies] = await Promise.all([
    queryGithubLinksByProjectIds(db, projectIds),
    queryHulyLinksByProjectIds(db, projectIds),
    queryArtifactsByProjectIds(db, projectIds),
    queryPoliciesByProjectIds(db, projectIds),
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

  return projects.map((project) =>
    buildProjectGraph(
      project,
      githubByProject.get(project.id) ?? [],
      hulyByProject.get(project.id) ?? [],
      artifactsByProject.get(project.id) ?? [],
      policyByProject.get(project.id) ?? null,
    ),
  );
}

export async function getProjectGraph(
  db: D1DatabaseLike,
  projectId: string,
): Promise<ProjectGraph | null> {
  const project = await queryFirst<ProjectRow>(db, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return null;

  const [githubLinks, hulyLinks, artifacts, policy] = await Promise.all([
    queryAll<ProjectGithubLinkRow>(db, "SELECT * FROM project_github_links WHERE project_id = ? ORDER BY is_primary DESC, repo_owner, repo_name", projectId),
    queryAll<ProjectHulyLinkRow>(db, "SELECT * FROM project_huly_links WHERE project_id = ? ORDER BY huly_project_id", projectId),
    queryAll<ProjectArtifactRow>(db, "SELECT * FROM project_artifacts WHERE project_id = ? ORDER BY is_primary DESC, title", projectId),
    queryFirst<ProjectSyncPolicyRow>(db, "SELECT * FROM project_sync_policies WHERE project_id = ?", projectId),
  ]);

  return buildProjectGraph(project, githubLinks, hulyLinks, artifacts, policy);
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

  await execute(db, "BEGIN TRANSACTION");
  try {
    await upsertProjectMetadata(db, projectId, {
      ...projectInput,
      workspaceId: resolvedWorkspaceId,
    });
    await replaceProjectGithubLinks(db, projectId, resolvedWorkspaceId, input.githubLinks ?? []);
    await replaceProjectHulyLinks(db, projectId, resolvedWorkspaceId, input.hulyLinks ?? []);
    await replaceProjectArtifacts(db, projectId, resolvedWorkspaceId, input.artifacts ?? []);
    await upsertProjectSyncPolicy(db, projectId, resolvedWorkspaceId, input.policy);
    await execute(db, "COMMIT");
  } catch (error) {
    await execute(db, "ROLLBACK");
    throw error;
  }

  const graph = await getProjectGraph(db, projectId);
  if (!graph) {
    throw new Error(`Project graph ${projectId} was not found after upsert.`);
  }
  return graph;
}
