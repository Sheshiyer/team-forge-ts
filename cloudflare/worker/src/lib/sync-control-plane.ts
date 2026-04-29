import { GithubApiClient, type GithubIssue, type GithubMilestone } from "./github-api";
import {
  HULY_ISSUE_CLASS,
  HULY_MILESTONE_CLASS,
  HulyApiClient,
  resolveHulyActorSocialId,
  type HulyIssue,
  type HulyMilestone,
} from "./huly-api";
import { acquireProjectLock } from "./locks";
import { execute, nanoid, now, queryAll, queryFirst } from "./db";
import type { D1DatabaseLike, Env } from "./env";
import { getProjectGraph, type ProjectGraph } from "./project-registry";

type OwnershipDomain = "engineering" | "execution_admin" | "milestone";
type MappingStatus = "mapped" | "needs_review" | "paused" | "promotion_pending" | "error";
type ClassificationSource = "rule" | "manual_override" | "promotion";

interface SyncEntityMappingRow {
  id: string;
  workspace_id: string;
  project_id: string;
  entity_type: string;
  title: string;
  status: string | null;
  ownership_domain: OwnershipDomain;
  classification_source: ClassificationSource;
  classification_reason: string | null;
  override_actor: string | null;
  override_at: string | null;
  mapping_status: MappingStatus;
  source_url: string | null;
  github_repo: string | null;
  github_number: number | null;
  github_node_id: string | null;
  huly_project_id: string | null;
  huly_entity_id: string | null;
  last_source: string | null;
  last_source_version: string | null;
  last_github_hash: string | null;
  last_huly_hash: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

interface SyncJournalRow {
  id: string;
  workspace_id: string;
  project_id: string;
  entity_mapping_id: string | null;
  entity_type: string;
  source_system: string;
  destination_system: string;
  action: string;
  status: string;
  source_ref: string | null;
  destination_ref: string | null;
  payload_hash: string;
  payload_json: string | null;
  retry_count: number;
  conflict_id: string | null;
  job_id: string | null;
  error_code: string | null;
  error_message: string | null;
  actor_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface SyncConflictRow {
  id: string;
  workspace_id: string;
  project_id: string;
  entity_mapping_id: string | null;
  entity_type: string;
  conflict_type: string;
  canonical_source: string;
  detected_source: string;
  status: string;
  summary: string;
  github_payload_json: string | null;
  huly_payload_json: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface ProjectSyncPolicyControlRow {
  project_id: string;
  sync_state: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_job_id: string | null;
  paused_at: string | null;
  paused_by: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
}

interface ProjectIssueFeedRow {
  id: string;
  workspace_id: string;
  project_id: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  project_status: string;
  github_repo: string;
  github_number: number;
  title: string;
  issue_state: string | null;
  source_url: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  last_source_version: string | null;
  last_synced_at: string | null;
}

export interface SyncEntityMapping {
  id: string;
  entityType: string;
  title: string;
  status: string | null;
  ownershipDomain: OwnershipDomain;
  classificationSource: ClassificationSource;
  classificationReason: string | null;
  mappingStatus: MappingStatus;
  sourceUrl: string | null;
  githubRepo: string | null;
  githubNumber: number | null;
  hulyProjectId: string | null;
  hulyEntityId: string | null;
  lastSource: string | null;
  lastSourceVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
}

export interface SyncJournalEntry {
  id: string;
  entityMappingId: string | null;
  entityType: string;
  sourceSystem: string;
  destinationSystem: string;
  action: string;
  status: string;
  sourceRef: string | null;
  destinationRef: string | null;
  payloadHash: string;
  payloadJson: string | null;
  retryCount: number;
  conflictId: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  actorId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SyncConflict {
  id: string;
  entityMappingId: string | null;
  entityType: string;
  conflictType: string;
  canonicalSource: string;
  detectedSource: string;
  status: string;
  summary: string;
  githubPayloadJson: string | null;
  hulyPayloadJson: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ProjectControlPlaneDetail {
  project: ProjectGraph;
  policyState: {
    syncState: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncJobId: string | null;
    pausedAt: string | null;
    pausedBy: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
  entityMappings: SyncEntityMapping[];
  journal: SyncJournalEntry[];
  conflicts: SyncConflict[];
  summary: {
    openConflicts: number;
    mappedMilestones: number;
    engineeringIssues: number;
    executionIssues: number;
    recentFailures: number;
  };
}

export interface ProjectIssueFeedItem {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  projectStatus: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  url: string;
  milestoneNumber: number | null;
  labels: string[];
  assignees: string[];
  priority: string | null;
  track: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  lastSyncedAt: string | null;
}

export interface ProjectActionRequest {
  action:
    | "sync_now"
    | "retry"
    | "pause"
    | "resume"
    | "set_classification"
    | "resolve_conflict";
  actorId?: string | null;
  mappingId?: string | null;
  ownershipDomain?: OwnershipDomain | null;
  reason?: string | null;
  conflictId?: string | null;
  resolutionNote?: string | null;
}

interface SyncContext {
  db: D1DatabaseLike;
  env: Env;
  graph: ProjectGraph;
  workspaceId: string;
  actorId: string;
  jobId: string;
  runId: string;
  stats: {
    updatedMappings: number;
    conflictsOpened: number;
    journalCompleted: number;
    journalFailed: number;
  };
  githubClient: GithubApiClient | null;
  hulyClient: HulyApiClient | null;
  hulyActorSocialId: string | null;
}

interface GithubIssuePayload {
  repo?: unknown;
  number?: unknown;
  title?: unknown;
  description?: unknown;
  state?: unknown;
  url?: unknown;
  milestoneNumber?: unknown;
  milestoneTitle?: unknown;
  labels?: unknown;
  assignees?: unknown;
  priority?: unknown;
  track?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  closedAt?: unknown;
  hulyProjectId?: unknown;
}

export async function getProjectControlPlaneDetail(
  db: D1DatabaseLike,
  projectId: string,
): Promise<ProjectControlPlaneDetail | null> {
  const project = await getProjectGraph(db, projectId);
  if (!project) return null;

  const [policyState, entityMappings, journal, conflicts] = await Promise.all([
    queryFirst<ProjectSyncPolicyControlRow>(
      db,
      `SELECT project_id, sync_state, last_sync_at, last_sync_status, last_sync_job_id, paused_at, paused_by, last_error_code, last_error_message
       FROM project_sync_policies
       WHERE project_id = ?`,
      projectId,
    ),
    listEntityMappings(db, projectId),
    listJournalEntries(db, projectId, 40),
    listConflicts(db, projectId),
  ]);

  return {
    project,
    policyState: {
      syncState: policyState?.sync_state ?? "active",
      lastSyncAt: policyState?.last_sync_at ?? null,
      lastSyncStatus: policyState?.last_sync_status ?? null,
      lastSyncJobId: policyState?.last_sync_job_id ?? null,
      pausedAt: policyState?.paused_at ?? null,
      pausedBy: policyState?.paused_by ?? null,
      lastErrorCode: policyState?.last_error_code ?? null,
      lastErrorMessage: policyState?.last_error_message ?? null,
    },
    entityMappings,
    journal,
    conflicts,
    summary: {
      openConflicts: conflicts.filter((item) => item.status === "open").length,
      mappedMilestones: entityMappings.filter((item) => item.entityType === "milestone").length,
      engineeringIssues: entityMappings.filter(
        (item) => item.entityType === "issue" && item.ownershipDomain === "engineering",
      ).length,
      executionIssues: entityMappings.filter(
        (item) => item.entityType === "issue" && item.ownershipDomain === "execution_admin",
      ).length,
      recentFailures: journal.filter((item) => item.status === "failed").length,
    },
  };
}

export async function listProjectIssueFeed(
  db: D1DatabaseLike,
  workspaceId?: string | null,
  status = "active",
): Promise<ProjectIssueFeedItem[]> {
  let sql = `
    SELECT
      m.id,
      m.workspace_id,
      m.project_id,
      p.name AS project_name,
      p.client_id,
      p.client_name,
      p.status AS project_status,
      m.github_repo,
      m.github_number,
      m.title,
      m.status AS issue_state,
      m.source_url,
      m.payload_json,
      m.created_at,
      m.updated_at,
      m.last_source_version,
      m.last_synced_at
    FROM sync_entity_mappings m
    JOIN projects p ON p.id = m.project_id
    WHERE m.entity_type = 'issue'
      AND m.ownership_domain = 'engineering'
      AND m.github_repo IS NOT NULL
      AND m.github_number IS NOT NULL
  `;
  const params: unknown[] = [];

  if (workspaceId?.trim()) {
    sql += " AND m.workspace_id = ?";
    params.push(workspaceId.trim());
  }

  if (status.trim()) {
    sql += " AND p.status = ?";
    params.push(status.trim());
  }

  sql += `
    ORDER BY
      p.name COLLATE NOCASE,
      CASE WHEN LOWER(COALESCE(m.status, 'open')) = 'open' THEN 0 ELSE 1 END,
      COALESCE(m.last_source_version, m.updated_at, m.created_at) DESC,
      m.github_number DESC
  `;

  const rows = await queryAll<ProjectIssueFeedRow>(db, sql, ...params);
  return rows.map(mapProjectIssueFeedRow);
}

export async function performProjectAction(
  db: D1DatabaseLike,
  env: Env,
  projectId: string,
  request: ProjectActionRequest,
): Promise<{ ok: true; jobId?: string; detail: ProjectControlPlaneDetail }> {
  const project = await getProjectGraph(db, projectId);
  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }

  switch (request.action) {
    case "pause":
      await setProjectSyncState(db, projectId, "paused", request.actorId ?? "operator");
      break;
    case "resume":
      await setProjectSyncState(db, projectId, "active", request.actorId ?? "operator");
      break;
    case "resolve_conflict":
      await resolveConflict(
        db,
        projectId,
        request.conflictId,
        request.actorId ?? "operator",
        request.resolutionNote ?? "Resolved by operator.",
      );
      break;
    case "set_classification":
      await applyClassificationOverride(db, env, project, request);
      break;
    case "retry":
    case "sync_now": {
      const jobId = await runProjectSync(db, env, project, request.actorId ?? "operator");
      const detail = await getProjectControlPlaneDetail(db, projectId);
      if (!detail) {
        throw new Error(`Project ${projectId} disappeared after sync.`);
      }
      return { ok: true, jobId, detail };
    }
    default:
      throw new Error(`Unsupported project action: ${request.action}`);
  }

  const detail = await getProjectControlPlaneDetail(db, projectId);
  if (!detail) {
    throw new Error(`Project ${projectId} disappeared after action.`);
  }
  return { ok: true, detail };
}

async function applyClassificationOverride(
  db: D1DatabaseLike,
  env: Env,
  project: ProjectGraph,
  request: ProjectActionRequest,
): Promise<void> {
  if (!request.mappingId || !request.ownershipDomain) {
    throw new Error("mappingId and ownershipDomain are required for set_classification.");
  }

  const mapping = await queryFirst<SyncEntityMappingRow>(
    db,
    "SELECT * FROM sync_entity_mappings WHERE id = ? AND project_id = ?",
    request.mappingId,
    project.project.id,
  );
  if (!mapping) {
    throw new Error(`Entity mapping ${request.mappingId} was not found.`);
  }

  const ts = now();
  await execute(
    db,
    `UPDATE sync_entity_mappings
     SET ownership_domain = ?, classification_source = ?, classification_reason = ?, override_actor = ?, override_at = ?, mapping_status = ?, updated_at = ?
     WHERE id = ?`,
    request.ownershipDomain,
    request.ownershipDomain === "engineering" && !mapping.github_repo ? "promotion" : "manual_override",
    request.reason ?? "Operator override",
    request.actorId ?? "operator",
    ts,
    request.ownershipDomain === "engineering" && !mapping.github_repo ? "promotion_pending" : "mapped",
    ts,
    mapping.id,
  );

  if (request.ownershipDomain === "engineering" && !mapping.github_repo) {
    const primaryRepo = project.githubLinks.find((link) => link.isPrimary) ?? project.githubLinks[0];
    if (!primaryRepo) {
      throw new Error("Project has no linked GitHub repo for issue promotion.");
    }
    if (!env.TF_GITHUB_TOKEN_GLOBAL?.trim()) {
      throw new Error("TF_GITHUB_TOKEN_GLOBAL is required for GitHub promotion.");
    }

    const client = new GithubApiClient(env.TF_GITHUB_TOKEN_GLOBAL);
    const created = await client.createIssue(`${primaryRepo.repoOwner}/${primaryRepo.repoName}`, {
      title: mapping.title,
      body: buildPromotionBody(mapping),
      labels: ["source:teamforge", "promoted:execution"],
    });
    const githubHash = await sha256Json({
      title: created.title,
      state: created.state,
      milestone: created.milestone?.number ?? null,
    });
    await execute(
      db,
      `UPDATE sync_entity_mappings
       SET github_repo = ?, github_number = ?, github_node_id = ?, source_url = ?, last_github_hash = ?, last_source = ?, last_source_version = ?, mapping_status = ?, updated_at = ?, last_synced_at = ?
       WHERE id = ?`,
      `${primaryRepo.repoOwner}/${primaryRepo.repoName}`,
      created.number,
      created.node_id ?? null,
      created.html_url,
      githubHash,
      "github",
      created.updated_at ?? ts,
      "mapped",
      ts,
      ts,
      mapping.id,
    );
    await createJournalEntry(db, {
      workspaceId: mapping.workspace_id,
      projectId: mapping.project_id,
      entityMappingId: mapping.id,
      entityType: mapping.entity_type,
      sourceSystem: "teamforge",
      destinationSystem: "github",
      action: "promote_issue",
      status: "completed",
      sourceRef: mapping.huly_entity_id,
      destinationRef: `${primaryRepo.repoOwner}/${primaryRepo.repoName}#${created.number}`,
      payload: created,
      actorId: request.actorId ?? "operator",
    });
  }
}

function buildPromotionBody(mapping: SyncEntityMappingRow): string {
  const payload = safeJsonParse<Record<string, unknown>>(mapping.payload_json) ?? {};
  const body = typeof payload.description === "string" ? payload.description : "";
  return `${body}\n\n---\nPromoted from TeamForge execution item${mapping.huly_entity_id ? ` (${mapping.huly_entity_id})` : ""}.`;
}

async function runProjectSync(
  db: D1DatabaseLike,
  env: Env,
  project: ProjectGraph,
  actorId: string,
): Promise<string> {
  const workspaceId = project.project.workspaceId;
  const policyState = await queryFirst<ProjectSyncPolicyControlRow>(
    db,
    "SELECT project_id, sync_state, last_sync_at, last_sync_status, last_sync_job_id, paused_at, paused_by, last_error_code, last_error_message FROM project_sync_policies WHERE project_id = ?",
    project.project.id,
  );
  if ((policyState?.sync_state ?? "active") === "paused") {
    throw new Error("Project sync is paused. Resume it before syncing.");
  }

  const jobId = nanoid();
  const runId = nanoid();
  const ts = now();

  await execute(
    db,
    `INSERT INTO sync_jobs
      (id, workspace_id, source, job_type, status, payload_json, requested_by, created_at, updated_at, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    jobId,
    workspaceId,
    "internal",
    "project_control_plane_sync",
    "running",
    JSON.stringify({ projectId: project.project.id }),
    actorId,
    ts,
    ts,
    ts,
  );

  await execute(
    db,
    `INSERT INTO sync_runs
      (id, workspace_id, source, job_id, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    runId,
    workspaceId,
    "project_control_plane",
    jobId,
    "running",
    ts,
    ts,
  );

  await execute(
    db,
    `UPDATE project_sync_policies
     SET sync_state = ?, last_sync_at = ?, last_sync_status = ?, last_sync_job_id = ?, last_error_code = NULL, last_error_message = NULL, updated_at = ?
     WHERE project_id = ?`,
    "active",
    ts,
    "running",
    jobId,
    ts,
    project.project.id,
  );

  const lock = await acquireProjectLock(env, project.project.id, jobId);
  try {
    const githubClient = env.TF_GITHUB_TOKEN_GLOBAL?.trim()
      ? new GithubApiClient(env.TF_GITHUB_TOKEN_GLOBAL)
      : null;

    let hulyClient: HulyApiClient | null = null;
    let hulyActorSocialId: string | null = null;
    if (project.hulyLinks.length > 0 && env.TF_HULY_USER_TOKEN_GLOBAL?.trim()) {
      hulyClient = await HulyApiClient.connect(env.TF_HULY_USER_TOKEN_GLOBAL);
      const account = await hulyClient.getAccountInfo();
      hulyActorSocialId = resolveHulyActorSocialId(account);
    }

    const context: SyncContext = {
      db,
      env,
      graph: project,
      workspaceId,
      actorId,
      jobId,
      runId,
      githubClient,
      hulyClient,
      hulyActorSocialId,
      stats: {
        updatedMappings: 0,
        conflictsOpened: 0,
        journalCompleted: 0,
        journalFailed: 0,
      },
    };

    if (githubClient) {
      await syncGithubMilestones(context);
      await syncGithubEngineeringIssues(context);
    }
    if (hulyClient) {
      await syncHulyExecutionIssues(context);
      await detectHulyMilestoneDrift(context);
    }

    const finishedAt = now();
    await execute(
      db,
      "UPDATE sync_jobs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?",
      "completed",
      finishedAt,
      finishedAt,
      jobId,
    );
    await execute(
      db,
      "UPDATE sync_runs SET status = ?, stats_json = ?, finished_at = ? WHERE id = ?",
      "completed",
      JSON.stringify(context.stats),
      finishedAt,
      runId,
    );
    await execute(
      db,
      `UPDATE project_sync_policies
       SET last_sync_at = ?, last_sync_status = ?, last_sync_job_id = ?, updated_at = ?
       WHERE project_id = ?`,
      finishedAt,
      "completed",
      jobId,
      finishedAt,
      project.project.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    const finishedAt = now();
    await execute(
      db,
      "UPDATE sync_jobs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?",
      "failed",
      finishedAt,
      finishedAt,
      jobId,
    );
    await execute(
      db,
      "UPDATE sync_runs SET status = ?, error_code = ?, error_message = ?, finished_at = ? WHERE id = ?",
      "failed",
      "sync_failed",
      message,
      finishedAt,
      runId,
    );
    await execute(
      db,
      `UPDATE project_sync_policies
       SET last_sync_at = ?, last_sync_status = ?, last_sync_job_id = ?, last_error_code = ?, last_error_message = ?, updated_at = ?
       WHERE project_id = ?`,
      finishedAt,
      "failed",
      jobId,
      "sync_failed",
      message,
      finishedAt,
      project.project.id,
    );
    throw error;
  } finally {
    await lock.release();
  }

  return jobId;
}

async function syncGithubMilestones(context: SyncContext): Promise<void> {
  const targetHulyLink = context.graph.hulyLinks.find((link) => link.syncMilestones) ?? null;
  let hulyMilestones: HulyMilestone[] | null = null;
  if (context.hulyClient && targetHulyLink) {
    hulyMilestones = await context.hulyClient.getMilestones();
  }

  for (const link of context.graph.githubLinks.filter((item) => item.syncMilestones)) {
    const repo = `${link.repoOwner}/${link.repoName}`;
    const milestones = await context.githubClient!.getMilestones(repo);
    for (const milestone of milestones) {
      const payload = buildGithubMilestonePayload(repo, milestone, targetHulyLink?.hulyProjectId ?? null);
      const payloadHash = await sha256Json(payload);
      const existing = await findMappingByGithubRef(context.db, context.graph.project.id, "milestone", repo, milestone.number);
      const mapping = await upsertMapping(context.db, {
        id: existing?.id,
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityType: "milestone",
        title: payload.title,
        status: payload.status,
        ownershipDomain: "milestone",
        classificationSource: existing?.classification_source ?? "rule",
        classificationReason: existing?.classification_reason ?? "GitHub milestone authority",
        mappingStatus: existing?.mapping_status === "paused" ? "paused" : "mapped",
        sourceUrl: payload.url,
        githubRepo: repo,
        githubNumber: milestone.number,
        githubNodeId: null,
        hulyProjectId: existing?.huly_project_id ?? targetHulyLink?.hulyProjectId ?? null,
        hulyEntityId: existing?.huly_entity_id ?? null,
        lastSource: "github",
        lastSourceVersion: milestone.updated_at ?? now(),
        lastGithubHash: payloadHash,
        lastHulyHash: existing?.last_huly_hash ?? null,
        payload: payload,
        overrideActor: existing?.override_actor ?? null,
        overrideAt: existing?.override_at ?? null,
      });
      context.stats.updatedMappings += 1;

      const journal = await createJournalEntry(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: mapping.id,
        entityType: "milestone",
        sourceSystem: "github",
        destinationSystem: "teamforge",
        action: "pull_milestone",
        status: "completed",
        sourceRef: `${repo}#${milestone.number}`,
        destinationRef: mapping.id,
        payload,
        actorId: context.actorId,
        jobId: context.jobId,
      });
      context.stats.journalCompleted += 1;

      if (!context.hulyClient || !targetHulyLink || !context.hulyActorSocialId) {
        continue;
      }

      const existingHuly = hulyMilestones?.find((item) =>
        item._id === mapping.huly_entity_id ||
        (!!item.label && item.label.trim() === payload.title.trim() && item.space === targetHulyLink.hulyProjectId),
      );
      const existingHulyPayload = existingHuly ? buildHulyMilestonePayload(existingHuly) : null;
      const existingHulyHash = existingHulyPayload ? await sha256Json(existingHulyPayload) : null;

      if (mapping.last_huly_hash && existingHulyHash && mapping.last_huly_hash !== existingHulyHash) {
        const conflict = await openConflict(context.db, {
          workspaceId: context.workspaceId,
          projectId: context.graph.project.id,
          entityMappingId: mapping.id,
          entityType: "milestone",
          conflictType: "remote_drift",
          canonicalSource: "github",
          detectedSource: "huly",
          summary: `Huly milestone drift detected for ${payload.title}.`,
          githubPayload: payload,
          hulyPayload: existingHulyPayload,
        });
        await markJournalNeedsReview(context.db, journal.id, conflict.id);
        await setMappingStatus(context.db, mapping.id, "needs_review");
        context.stats.conflictsOpened += 1;
        continue;
      }

      if (existingHuly) {
        await context.hulyClient.updateDoc(
          context.hulyActorSocialId,
          HULY_MILESTONE_CLASS,
          targetHulyLink.hulyProjectId,
          existingHuly._id,
          {
            label: payload.title,
            targetDate: payload.targetDate,
            status: payload.status,
            space: targetHulyLink.hulyProjectId,
          },
        );
        await finalizePropagation(context.db, mapping.id, journal.id, {
          destinationSystem: "huly",
          action: "push_milestone",
          destinationRef: existingHuly._id,
          hulyProjectId: targetHulyLink.hulyProjectId,
          hulyEntityId: existingHuly._id,
          lastHulyHash: await sha256Json(buildHulyMilestonePayload(existingHuly, payload)),
        });
      } else {
        const createdId = await context.hulyClient.createDoc(
          context.hulyActorSocialId,
          HULY_MILESTONE_CLASS,
          targetHulyLink.hulyProjectId,
          {
            label: payload.title,
            targetDate: payload.targetDate,
            status: payload.status,
            space: targetHulyLink.hulyProjectId,
          },
        );
        await finalizePropagation(context.db, mapping.id, journal.id, {
          destinationSystem: "huly",
          action: "push_milestone",
          destinationRef: createdId,
          hulyProjectId: targetHulyLink.hulyProjectId,
          hulyEntityId: createdId,
          lastHulyHash: await sha256Json({
            label: payload.title,
            status: payload.status,
            targetDate: payload.targetDate,
            space: targetHulyLink.hulyProjectId,
          }),
        });
      }
    }
  }
}

async function syncGithubEngineeringIssues(context: SyncContext): Promise<void> {
  const targetHulyLink = context.graph.hulyLinks.find((link) => link.syncIssues) ?? null;
  let hulyIssues: HulyIssue[] | null = null;
  if (context.hulyClient && targetHulyLink) {
    hulyIssues = (await context.hulyClient.getIssues()).filter((item) => item.space === targetHulyLink.hulyProjectId);
  }

  for (const link of context.graph.githubLinks.filter((item) => item.syncIssues)) {
    const repo = `${link.repoOwner}/${link.repoName}`;
    const issues = await context.githubClient!.getIssues(repo);
    for (const issue of issues) {
      const classification = classifyGithubIssue(link.repoRole, issue);
      if (classification !== "engineering") continue;

      const payload = buildGithubIssuePayload(repo, issue, targetHulyLink?.hulyProjectId ?? null);
      const payloadHash = await sha256Json(payload);
      const existing = await findMappingByGithubRef(context.db, context.graph.project.id, "issue", repo, issue.number);
      const manualSource = existing?.classification_source === "manual_override" || existing?.classification_source === "promotion";
      const mapping = await upsertMapping(context.db, {
        id: existing?.id,
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityType: "issue",
        title: payload.title,
        status: payload.state,
        ownershipDomain: manualSource ? existing!.ownership_domain : "engineering",
        classificationSource: manualSource ? existing!.classification_source : "rule",
        classificationReason: manualSource
          ? existing!.classification_reason
          : "GitHub engineering issue by repo role/labels",
        mappingStatus: existing?.mapping_status === "paused" ? "paused" : "mapped",
        sourceUrl: payload.url,
        githubRepo: repo,
        githubNumber: issue.number,
        githubNodeId: issue.node_id ?? null,
        hulyProjectId: existing?.huly_project_id ?? targetHulyLink?.hulyProjectId ?? null,
        hulyEntityId: existing?.huly_entity_id ?? null,
        lastSource: "github",
        lastSourceVersion: issue.updated_at ?? now(),
        lastGithubHash: payloadHash,
        lastHulyHash: existing?.last_huly_hash ?? null,
        payload,
        overrideActor: existing?.override_actor ?? null,
        overrideAt: existing?.override_at ?? null,
      });
      context.stats.updatedMappings += 1;

      const journal = await createJournalEntry(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: mapping.id,
        entityType: "issue",
        sourceSystem: "github",
        destinationSystem: "teamforge",
        action: "pull_issue",
        status: "completed",
        sourceRef: `${repo}#${issue.number}`,
        destinationRef: mapping.id,
        payload,
        actorId: context.actorId,
        jobId: context.jobId,
      });
      context.stats.journalCompleted += 1;

      if (!context.hulyClient || !targetHulyLink || !context.hulyActorSocialId) {
        continue;
      }

      const existingHuly = hulyIssues?.find((item) =>
        item._id === mapping.huly_entity_id ||
        (!!item.title && item.title.trim() === payload.title.trim()),
      );
      const existingHulyPayload = existingHuly ? buildHulyIssuePayload(existingHuly) : null;
      const existingHulyHash = existingHulyPayload ? await sha256Json(existingHulyPayload) : null;

      if (mapping.last_huly_hash && existingHulyHash && mapping.last_huly_hash !== existingHulyHash) {
        const conflict = await openConflict(context.db, {
          workspaceId: context.workspaceId,
          projectId: context.graph.project.id,
          entityMappingId: mapping.id,
          entityType: "issue",
          conflictType: "ownership_violation",
          canonicalSource: "github",
          detectedSource: "huly",
          summary: `Huly edited GitHub-owned issue ${payload.title}.`,
          githubPayload: payload,
          hulyPayload: existingHulyPayload,
        });
        await markJournalNeedsReview(context.db, journal.id, conflict.id);
        await setMappingStatus(context.db, mapping.id, "needs_review");
        context.stats.conflictsOpened += 1;
        continue;
      }

      if (existingHuly) {
        await context.hulyClient.updateDoc(
          context.hulyActorSocialId,
          HULY_ISSUE_CLASS,
          targetHulyLink.hulyProjectId,
          existingHuly._id,
          {
            title: payload.title,
            description: payload.description,
            space: targetHulyLink.hulyProjectId,
          },
        );
        await finalizePropagation(context.db, mapping.id, journal.id, {
          destinationSystem: "huly",
          action: "push_issue",
          destinationRef: existingHuly._id,
          hulyProjectId: targetHulyLink.hulyProjectId,
          hulyEntityId: existingHuly._id,
          lastHulyHash: await sha256Json({
            title: payload.title,
            description: payload.description,
            space: targetHulyLink.hulyProjectId,
          }),
        });
      } else {
        const createdId = await context.hulyClient.createDoc(
          context.hulyActorSocialId,
          HULY_ISSUE_CLASS,
          targetHulyLink.hulyProjectId,
          {
            title: payload.title,
            description: payload.description,
            space: targetHulyLink.hulyProjectId,
          },
        );
        await finalizePropagation(context.db, mapping.id, journal.id, {
          destinationSystem: "huly",
          action: "push_issue",
          destinationRef: createdId,
          hulyProjectId: targetHulyLink.hulyProjectId,
          hulyEntityId: createdId,
          lastHulyHash: await sha256Json({
            title: payload.title,
            description: payload.description,
            space: targetHulyLink.hulyProjectId,
          }),
        });
      }
    }
  }
}

async function syncHulyExecutionIssues(context: SyncContext): Promise<void> {
  if (!context.hulyClient) return;
  const hulyIssues = await context.hulyClient.getIssues();
  const linkedProjectIds = new Set(context.graph.hulyLinks.map((link) => link.hulyProjectId));

  for (const issue of hulyIssues.filter((item) => item.space && linkedProjectIds.has(item.space))) {
    const payload = buildHulyIssuePayload(issue);
    const hulyHash = await sha256Json(payload);
    const existing = await findMappingByHulyRef(
      context.db,
      context.graph.project.id,
      "issue",
      issue.space ?? null,
      issue._id,
    );
    const ownership = existing?.ownership_domain ?? "execution_admin";

    const journal = await createJournalEntry(context.db, {
      workspaceId: context.workspaceId,
      projectId: context.graph.project.id,
      entityMappingId: existing?.id ?? null,
      entityType: "issue",
      sourceSystem: "huly",
      destinationSystem: "teamforge",
      action: "pull_issue",
      status: "completed",
      sourceRef: issue._id,
      destinationRef: existing?.id ?? null,
      payload,
      actorId: context.actorId,
      jobId: context.jobId,
    });

    if (ownership === "engineering" && existing?.last_huly_hash && existing.last_huly_hash !== hulyHash) {
      const conflict = await openConflict(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: existing.id,
        entityType: "issue",
        conflictType: "ownership_violation",
        canonicalSource: "github",
        detectedSource: "huly",
        summary: `Huly changed engineering issue ${payload.title}.`,
        githubPayload: safeJsonParse(existing.payload_json),
        hulyPayload: payload,
      });
      await markJournalNeedsReview(context.db, journal.id, conflict.id);
      await setMappingStatus(context.db, existing.id, "needs_review");
      context.stats.conflictsOpened += 1;
      continue;
    }

    await upsertMapping(context.db, {
      id: existing?.id,
      workspaceId: context.workspaceId,
      projectId: context.graph.project.id,
      entityType: "issue",
      title: payload.title,
      status: payload.state,
      ownershipDomain: ownership,
      classificationSource:
        existing?.classification_source === "manual_override" || existing?.classification_source === "promotion"
          ? existing.classification_source
          : "rule",
      classificationReason:
        existing?.classification_source === "manual_override" || existing?.classification_source === "promotion"
          ? existing.classification_reason
          : "Huly execution/admin issue",
      mappingStatus: ownership === "engineering" ? "needs_review" : "mapped",
      sourceUrl: existing?.source_url ?? null,
      githubRepo: existing?.github_repo ?? null,
      githubNumber: existing?.github_number ?? null,
      githubNodeId: existing?.github_node_id ?? null,
      hulyProjectId: issue.space ?? existing?.huly_project_id ?? null,
      hulyEntityId: issue._id,
      lastSource: "huly",
      lastSourceVersion: issue.modifiedOn ? new Date(issue.modifiedOn).toISOString() : now(),
      lastGithubHash: existing?.last_github_hash ?? null,
      lastHulyHash: hulyHash,
      payload,
      overrideActor: existing?.override_actor ?? null,
      overrideAt: existing?.override_at ?? null,
    });
    context.stats.updatedMappings += 1;
    context.stats.journalCompleted += 1;
  }
}

async function detectHulyMilestoneDrift(context: SyncContext): Promise<void> {
  if (!context.hulyClient) return;
  const hulyMilestones = await context.hulyClient.getMilestones();
  const linkedProjectIds = new Set(context.graph.hulyLinks.map((link) => link.hulyProjectId));

  for (const milestone of hulyMilestones.filter((item) => item.space && linkedProjectIds.has(item.space))) {
    const payload = buildHulyMilestonePayload(milestone);
    const hulyHash = await sha256Json(payload);
    const existing = await findMappingByHulyRef(
      context.db,
      context.graph.project.id,
      "milestone",
      milestone.space ?? null,
      milestone._id,
    );

    if (!existing) {
      const conflict = await openConflict(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: null,
        entityType: "milestone",
        conflictType: "remote_drift",
        canonicalSource: "github",
        detectedSource: "huly",
        summary: `Unmapped Huly milestone ${payload.title} requires review.`,
        githubPayload: null,
        hulyPayload: payload,
      });
      await createJournalEntry(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: null,
        entityType: "milestone",
        sourceSystem: "huly",
        destinationSystem: "teamforge",
        action: "detect_drift",
        status: "needs_review",
        sourceRef: milestone._id,
        destinationRef: null,
        payload,
        actorId: context.actorId,
        jobId: context.jobId,
        conflictId: conflict.id,
      });
      context.stats.conflictsOpened += 1;
      continue;
    }

    if (existing.last_huly_hash && existing.last_huly_hash !== hulyHash) {
      const conflict = await openConflict(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: existing.id,
        entityType: "milestone",
        conflictType: "remote_drift",
        canonicalSource: "github",
        detectedSource: "huly",
        summary: `Huly milestone drift detected for ${payload.title}.`,
        githubPayload: safeJsonParse(existing.payload_json),
        hulyPayload: payload,
      });
      await createJournalEntry(context.db, {
        workspaceId: context.workspaceId,
        projectId: context.graph.project.id,
        entityMappingId: existing.id,
        entityType: "milestone",
        sourceSystem: "huly",
        destinationSystem: "teamforge",
        action: "detect_drift",
        status: "needs_review",
        sourceRef: milestone._id,
        destinationRef: existing.id,
        payload,
        actorId: context.actorId,
        jobId: context.jobId,
        conflictId: conflict.id,
      });
      await setMappingStatus(context.db, existing.id, "needs_review");
      context.stats.conflictsOpened += 1;
    }
  }
}

function classifyGithubIssue(repoRole: string, issue: GithubIssue): OwnershipDomain {
  const labels = issue.labels.map((label) => label.name.toLowerCase());
  const title = issue.title.toLowerCase();
  if (
    repoRole === "ops" ||
    repoRole === "legal" ||
    labels.some((label) => /(^|:)(ops|admin|client|delivery|legal)(:|$)/.test(label)) ||
    /\bops\b|\badmin\b|\blegal\b|\bclient\b/.test(title)
  ) {
    return "execution_admin";
  }
  return "engineering";
}

function buildGithubIssuePayload(repo: string, issue: GithubIssue, hulyProjectId: string | null) {
  const labels = issue.labels.map((label) => label.name);
  return {
    repo,
    number: issue.number,
    title: issue.title,
    description: issue.body ?? "",
    state: issue.state,
    url: issue.html_url,
    milestoneNumber: issue.milestone?.number ?? null,
    milestoneTitle: issue.milestone?.title ?? null,
    labels,
    assignees: issue.assignees.map((assignee) => assignee.login),
    priority: priorityFromLabels(labels),
    track: trackFromIssue(issue.title, labels),
    createdAt: issue.created_at ?? null,
    updatedAt: issue.updated_at ?? null,
    closedAt: issue.closed_at ?? null,
    hulyProjectId,
  };
}

function buildGithubMilestonePayload(repo: string, milestone: GithubMilestone, hulyProjectId: string | null) {
  return {
    repo,
    number: milestone.number,
    title: milestone.title,
    description: milestone.description ?? "",
    status: milestone.state,
    dueOn: milestone.due_on ?? null,
    targetDate: milestone.due_on ? Date.parse(milestone.due_on) : null,
    url: milestone.html_url ?? null,
    hulyProjectId,
  };
}

function buildHulyIssuePayload(issue: HulyIssue) {
  return {
    title: issue.title ?? `Huly issue ${issue._id}`,
    description: issue.description ?? "",
    state: normalizeHulyStatus(issue.status),
    space: issue.space ?? null,
    identifier: issue.identifier ?? null,
  };
}

function buildHulyMilestonePayload(milestone: HulyMilestone, override?: { title?: string; status?: string; targetDate?: number | null }) {
  return {
    title: override?.title ?? milestone.label ?? `Huly milestone ${milestone._id}`,
    status: override?.status ?? milestone.status ?? "planned",
    targetDate: override?.targetDate ?? milestone.targetDate ?? null,
    space: milestone.space ?? null,
  };
}

function normalizeHulyStatus(status: HulyIssue["status"]): string {
  if (!status) return "unknown";
  if (typeof status === "string") return status;
  if ("name" in status && typeof status.name === "string") return status.name;
  if ("label" in status && typeof status.label === "string") return status.label;
  if ("title" in status && typeof status.title === "string") return status.title;
  return JSON.stringify(status);
}

async function finalizePropagation(
  db: D1DatabaseLike,
  mappingId: string,
  journalId: string,
  input: {
    destinationSystem: string;
    action: string;
    destinationRef: string;
    hulyProjectId: string;
    hulyEntityId: string;
    lastHulyHash: string;
  },
): Promise<void> {
  const ts = now();
  await execute(
    db,
    `UPDATE sync_entity_mappings
     SET huly_project_id = ?, huly_entity_id = ?, last_huly_hash = ?, mapping_status = ?, updated_at = ?, last_synced_at = ?
     WHERE id = ?`,
    input.hulyProjectId,
    input.hulyEntityId,
    input.lastHulyHash,
    "mapped",
    ts,
    ts,
    mappingId,
  );
  await execute(
    db,
    `UPDATE sync_journal
     SET destination_system = ?, action = ?, status = ?, destination_ref = ?, updated_at = ?, finished_at = ?
     WHERE id = ?`,
    input.destinationSystem,
    input.action,
    "completed",
    input.destinationRef,
    ts,
    ts,
    journalId,
  );
}

async function markJournalNeedsReview(
  db: D1DatabaseLike,
  journalId: string,
  conflictId: string,
): Promise<void> {
  const ts = now();
  await execute(
    db,
    `UPDATE sync_journal
     SET status = ?, conflict_id = ?, updated_at = ?, finished_at = ?
     WHERE id = ?`,
    "needs_review",
    conflictId,
    ts,
    ts,
    journalId,
  );
}

async function createJournalEntry(
  db: D1DatabaseLike,
  input: {
    workspaceId: string;
    projectId: string;
    entityMappingId: string | null;
    entityType: string;
    sourceSystem: string;
    destinationSystem: string;
    action: string;
    status: string;
    sourceRef: string | null;
    destinationRef: string | null;
    payload: unknown;
    actorId: string | null;
    jobId?: string | null;
    conflictId?: string | null;
  },
): Promise<SyncJournalRow> {
  const ts = now();
  const payloadJson = JSON.stringify(input.payload);
  const payloadHash = await sha256Json(input.payload);
  const id = nanoid();
  await execute(
    db,
    `INSERT INTO sync_journal
      (id, workspace_id, project_id, entity_mapping_id, entity_type, source_system, destination_system, action, status, source_ref, destination_ref, payload_hash, payload_json, retry_count, conflict_id, job_id, actor_id, created_at, updated_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.workspaceId,
    input.projectId,
    input.entityMappingId,
    input.entityType,
    input.sourceSystem,
    input.destinationSystem,
    input.action,
    input.status,
    input.sourceRef,
    input.destinationRef,
    payloadHash,
    payloadJson,
    0,
    input.conflictId ?? null,
    input.jobId ?? null,
    input.actorId,
    ts,
    ts,
    ts,
    input.status === "completed" ? ts : null,
  );
  return (await queryFirst<SyncJournalRow>(db, "SELECT * FROM sync_journal WHERE id = ?", id))!;
}

async function openConflict(
  db: D1DatabaseLike,
  input: {
    workspaceId: string;
    projectId: string;
    entityMappingId: string | null;
    entityType: string;
    conflictType: string;
    canonicalSource: string;
    detectedSource: string;
    summary: string;
    githubPayload: unknown;
    hulyPayload: unknown;
  },
): Promise<SyncConflictRow> {
  const existing = await queryFirst<SyncConflictRow>(
    db,
    `SELECT * FROM sync_conflicts
     WHERE project_id = ? AND entity_mapping_id IS ? AND conflict_type = ? AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    input.projectId,
    input.entityMappingId,
    input.conflictType,
  );
  const ts = now();
  if (existing) {
    await execute(
      db,
      `UPDATE sync_conflicts
       SET summary = ?, github_payload_json = ?, huly_payload_json = ?, updated_at = ?
       WHERE id = ?`,
      input.summary,
      JSON.stringify(input.githubPayload ?? null),
      JSON.stringify(input.hulyPayload ?? null),
      ts,
      existing.id,
    );
    return (await queryFirst<SyncConflictRow>(db, "SELECT * FROM sync_conflicts WHERE id = ?", existing.id))!;
  }

  const id = nanoid();
  await execute(
    db,
    `INSERT INTO sync_conflicts
      (id, workspace_id, project_id, entity_mapping_id, entity_type, conflict_type, canonical_source, detected_source, status, summary, github_payload_json, huly_payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.workspaceId,
    input.projectId,
    input.entityMappingId,
    input.entityType,
    input.conflictType,
    input.canonicalSource,
    input.detectedSource,
    "open",
    input.summary,
    JSON.stringify(input.githubPayload ?? null),
    JSON.stringify(input.hulyPayload ?? null),
    ts,
    ts,
  );
  return (await queryFirst<SyncConflictRow>(db, "SELECT * FROM sync_conflicts WHERE id = ?", id))!;
}

async function resolveConflict(
  db: D1DatabaseLike,
  projectId: string,
  conflictId: string | null | undefined,
  actorId: string,
  resolutionNote: string,
): Promise<void> {
  if (!conflictId) {
    throw new Error("conflictId is required for resolve_conflict.");
  }
  const ts = now();
  await execute(
    db,
    `UPDATE sync_conflicts
     SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`,
    "resolved",
    resolutionNote,
    actorId,
    ts,
    ts,
    conflictId,
    projectId,
  );
}

async function setProjectSyncState(
  db: D1DatabaseLike,
  projectId: string,
  syncState: "active" | "paused",
  actorId: string,
): Promise<void> {
  const ts = now();
  await execute(
    db,
    `UPDATE project_sync_policies
     SET sync_state = ?, paused_at = ?, paused_by = ?, updated_at = ?
     WHERE project_id = ?`,
    syncState,
    syncState === "paused" ? ts : null,
    syncState === "paused" ? actorId : null,
    ts,
    projectId,
  );
}

async function setMappingStatus(
  db: D1DatabaseLike,
  mappingId: string,
  status: MappingStatus,
): Promise<void> {
  await execute(
    db,
    "UPDATE sync_entity_mappings SET mapping_status = ?, updated_at = ? WHERE id = ?",
    status,
    now(),
    mappingId,
  );
}

async function upsertMapping(
  db: D1DatabaseLike,
  input: {
    id?: string | null;
    workspaceId: string;
    projectId: string;
    entityType: string;
    title: string;
    status: string | null;
    ownershipDomain: OwnershipDomain;
    classificationSource: ClassificationSource;
    classificationReason: string | null;
    mappingStatus: MappingStatus;
    sourceUrl: string | null;
    githubRepo: string | null;
    githubNumber: number | null;
    githubNodeId: string | null;
    hulyProjectId: string | null;
    hulyEntityId: string | null;
    lastSource: string;
    lastSourceVersion: string;
    lastGithubHash: string | null;
    lastHulyHash: string | null;
    payload: unknown;
    overrideActor: string | null;
    overrideAt: string | null;
  },
): Promise<SyncEntityMappingRow> {
  const id = input.id ?? nanoid();
  const ts = now();
  const payloadJson = JSON.stringify(input.payload);
  const existing = await queryFirst<SyncEntityMappingRow>(db, "SELECT * FROM sync_entity_mappings WHERE id = ?", id);
  if (existing) {
    await execute(
      db,
      `UPDATE sync_entity_mappings
       SET title = ?, status = ?, ownership_domain = ?, classification_source = ?, classification_reason = ?, override_actor = ?, override_at = ?, mapping_status = ?, source_url = ?, github_repo = ?, github_number = ?, github_node_id = ?, huly_project_id = ?, huly_entity_id = ?, last_source = ?, last_source_version = ?, last_github_hash = ?, last_huly_hash = ?, payload_json = ?, updated_at = ?, last_synced_at = ?
       WHERE id = ?`,
      input.title,
      input.status,
      input.ownershipDomain,
      input.classificationSource,
      input.classificationReason,
      input.overrideActor,
      input.overrideAt,
      input.mappingStatus,
      input.sourceUrl,
      input.githubRepo,
      input.githubNumber,
      input.githubNodeId,
      input.hulyProjectId,
      input.hulyEntityId,
      input.lastSource,
      input.lastSourceVersion,
      input.lastGithubHash,
      input.lastHulyHash,
      payloadJson,
      ts,
      ts,
      id,
    );
  } else {
    await execute(
      db,
      `INSERT INTO sync_entity_mappings
        (id, workspace_id, project_id, entity_type, title, status, ownership_domain, classification_source, classification_reason, override_actor, override_at, mapping_status, source_url, github_repo, github_number, github_node_id, huly_project_id, huly_entity_id, last_source, last_source_version, last_github_hash, last_huly_hash, payload_json, created_at, updated_at, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.workspaceId,
      input.projectId,
      input.entityType,
      input.title,
      input.status,
      input.ownershipDomain,
      input.classificationSource,
      input.classificationReason,
      input.overrideActor,
      input.overrideAt,
      input.mappingStatus,
      input.sourceUrl,
      input.githubRepo,
      input.githubNumber,
      input.githubNodeId,
      input.hulyProjectId,
      input.hulyEntityId,
      input.lastSource,
      input.lastSourceVersion,
      input.lastGithubHash,
      input.lastHulyHash,
      payloadJson,
      ts,
      ts,
      ts,
    );
  }
  return (await queryFirst<SyncEntityMappingRow>(db, "SELECT * FROM sync_entity_mappings WHERE id = ?", id))!;
}

async function findMappingByGithubRef(
  db: D1DatabaseLike,
  projectId: string,
  entityType: string,
  repo: string,
  number: number,
): Promise<SyncEntityMappingRow | null> {
  return queryFirst<SyncEntityMappingRow>(
    db,
    `SELECT * FROM sync_entity_mappings
     WHERE project_id = ? AND entity_type = ? AND github_repo = ? AND github_number = ?`,
    projectId,
    entityType,
    repo,
    number,
  );
}

async function findMappingByHulyRef(
  db: D1DatabaseLike,
  projectId: string,
  entityType: string,
  hulyProjectId: string | null,
  hulyEntityId: string,
): Promise<SyncEntityMappingRow | null> {
  return queryFirst<SyncEntityMappingRow>(
    db,
    `SELECT * FROM sync_entity_mappings
     WHERE project_id = ? AND entity_type = ? AND huly_project_id IS ? AND huly_entity_id = ?`,
    projectId,
    entityType,
    hulyProjectId,
    hulyEntityId,
  );
}

async function listEntityMappings(
  db: D1DatabaseLike,
  projectId: string,
): Promise<SyncEntityMapping[]> {
  const rows = await queryAll<SyncEntityMappingRow>(
    db,
    `SELECT * FROM sync_entity_mappings
     WHERE project_id = ?
     ORDER BY entity_type, ownership_domain, updated_at DESC, title`,
    projectId,
  );
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    title: row.title,
    status: row.status,
    ownershipDomain: row.ownership_domain,
    classificationSource: row.classification_source,
    classificationReason: row.classification_reason,
    mappingStatus: row.mapping_status,
    sourceUrl: row.source_url,
    githubRepo: row.github_repo,
    githubNumber: row.github_number,
    hulyProjectId: row.huly_project_id,
    hulyEntityId: row.huly_entity_id,
    lastSource: row.last_source,
    lastSourceVersion: row.last_source_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
  }));
}

async function listJournalEntries(
  db: D1DatabaseLike,
  projectId: string,
  limit: number,
): Promise<SyncJournalEntry[]> {
  const rows = await queryAll<SyncJournalRow>(
    db,
    `SELECT * FROM sync_journal
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    projectId,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    entityMappingId: row.entity_mapping_id,
    entityType: row.entity_type,
    sourceSystem: row.source_system,
    destinationSystem: row.destination_system,
    action: row.action,
    status: row.status,
    sourceRef: row.source_ref,
    destinationRef: row.destination_ref,
    payloadHash: row.payload_hash,
    payloadJson: row.payload_json,
    retryCount: row.retry_count,
    conflictId: row.conflict_id,
    jobId: row.job_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    actorId: row.actor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

async function listConflicts(
  db: D1DatabaseLike,
  projectId: string,
): Promise<SyncConflict[]> {
  const rows = await queryAll<SyncConflictRow>(
    db,
    `SELECT * FROM sync_conflicts
     WHERE project_id = ?
     ORDER BY status = 'open' DESC, created_at DESC`,
    projectId,
  );
  return rows.map((row) => ({
    id: row.id,
    entityMappingId: row.entity_mapping_id,
    entityType: row.entity_type,
    conflictType: row.conflict_type,
    canonicalSource: row.canonical_source,
    detectedSource: row.detected_source,
    status: row.status,
    summary: row.summary,
    githubPayloadJson: row.github_payload_json,
    hulyPayloadJson: row.huly_payload_json,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }));
}

async function sha256Json(value: unknown): Promise<string> {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function priorityFromLabels(labels: string[]): string | null {
  return labels.find((label) => label.startsWith("priority:"))?.slice("priority:".length) ?? null;
}

function trackFromIssue(title: string, labels: string[]): string | null {
  const fromLabel = labels.find((label) => label.startsWith("track:"))?.slice("track:".length);
  if (fromLabel) return fromLabel;
  const fromTitle = title
    .split(/\s+/)
    .find((part) => part.startsWith("track-"))
    ?.replace(/^[^a-z0-9-]+|[^a-z0-9-]+$/gi, "");
  return fromTitle?.trim() || null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapProjectIssueFeedRow(row: ProjectIssueFeedRow): ProjectIssueFeedItem {
  const payload = safeJsonParse<GithubIssuePayload>(row.payload_json);
  const state = readString(payload?.state) ?? readString(row.issue_state) ?? "open";
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectName: row.project_name,
    clientId: row.client_id,
    clientName: row.client_name,
    projectStatus: row.project_status,
    repo: row.github_repo,
    number: row.github_number,
    title: row.title,
    state,
    url:
      readString(payload?.url) ??
      readString(row.source_url) ??
      `https://github.com/${row.github_repo}/issues/${row.github_number}`,
    milestoneNumber: readNumber(payload?.milestoneNumber),
    labels: readStringArray(payload?.labels),
    assignees: readStringArray(payload?.assignees),
    priority: readString(payload?.priority),
    track: readString(payload?.track),
    createdAt: readString(payload?.createdAt) ?? null,
    updatedAt: readString(payload?.updatedAt) ?? readString(row.last_source_version) ?? readString(row.updated_at),
    closedAt:
      readString(payload?.closedAt) ??
      (state.toLowerCase() === "closed"
        ? readString(row.last_source_version) ?? readString(row.updated_at)
        : null),
    lastSyncedAt: readString(row.last_synced_at),
  };
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
