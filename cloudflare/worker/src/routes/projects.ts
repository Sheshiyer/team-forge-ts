import type { Env } from "../lib/env";
import {
  getClientProfileDetail,
  listClientProfiles,
  listOnboardingFlows,
  listProjectGraphs,
  listProjectSummaries,
  replaceOnboardingFlows,
  upsertProjectGraph,
  upsertClientProfile,
  upsertProjectMetadata,
  type ClientProfileInput,
  type OnboardingFlowInput,
  type OnboardingTaskInput,
  type ProjectGraphInput,
  type ProjectMetadataInput,
} from "../lib/project-registry";
import {
  getProjectControlPlaneDetail,
  listProjectIssueFeed,
  performProjectAction,
  type ProjectActionRequest,
} from "../lib/sync-control-plane";
import { jsonError, jsonOk } from "../lib/response";

interface ProjectMetadataRequest {
  workspaceId?: string;
  project?: ProjectMetadataInput;
  name?: string;
  slug?: string | null;
  portfolioName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  clockifyProjectId?: string | null;
  projectType?: string | null;
  status?: string;
  visibility?: string;
  syncMode?: string;
}

interface ClientProfileRequest {
  workspaceId?: string;
  clientProfile?: Partial<ClientProfileInput> & {
    sourceRelativePath?: string | null;
  };
  clientId?: string;
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
  sourceRelativePath?: string | null;
}

interface OnboardingTaskRequest extends Partial<OnboardingTaskInput> {
  order?: number;
}

interface OnboardingFlowRequest extends Omit<Partial<OnboardingFlowInput>, "tasks"> {
  tasks?: OnboardingTaskRequest[];
  sourceRelativePath?: string | null;
}

interface OnboardingFlowReplaceRequest {
  workspaceId?: string;
  flows?: OnboardingFlowRequest[];
  onboardingFlows?: OnboardingFlowRequest[];
}

function mapError(error: unknown, fallbackCode = "project_registry_error"): Response {
  const message = error instanceof Error ? error.message : "Unexpected project registry error.";
  return jsonError(
    {
      code: fallbackCode,
      message,
      retryable: false,
    },
    400,
  );
}

function normalizeProjectMetadataRequest(body: ProjectMetadataRequest): ProjectMetadataInput {
  const project = body.project ?? {};
  return {
    workspaceId: project.workspaceId ?? body.workspaceId,
    name: project.name ?? body.name,
    slug: project.slug ?? body.slug,
    portfolioName: project.portfolioName ?? body.portfolioName,
    clientId: project.clientId ?? body.clientId,
    clientName: project.clientName ?? body.clientName,
    clockifyProjectId: project.clockifyProjectId ?? body.clockifyProjectId,
    projectType: project.projectType ?? body.projectType,
    status: project.status ?? body.status,
    visibility: project.visibility ?? body.visibility,
    syncMode: project.syncMode ?? body.syncMode,
  };
}

function normalizeClientProfileRequest(body: ClientProfileRequest, clientId: string): ClientProfileInput {
  const clientProfile = body.clientProfile ?? {};
  return {
    workspaceId: clientProfile.workspaceId ?? body.workspaceId ?? "",
    clientId,
    clientName: clientProfile.clientName ?? body.clientName,
    engagementModel: clientProfile.engagementModel ?? body.engagementModel,
    industry: clientProfile.industry ?? body.industry,
    primaryContact: clientProfile.primaryContact ?? body.primaryContact,
    active: clientProfile.active ?? body.active,
    onboarded: clientProfile.onboarded ?? body.onboarded,
    projectIds: clientProfile.projectIds ?? body.projectIds,
    stakeholders: clientProfile.stakeholders ?? body.stakeholders,
    strategicFit: clientProfile.strategicFit ?? body.strategicFit,
    risks: clientProfile.risks ?? body.risks,
    resourceLinks: clientProfile.resourceLinks ?? body.resourceLinks,
    tags: clientProfile.tags ?? body.tags,
    sourcePath:
      clientProfile.sourcePath ??
      clientProfile.sourceRelativePath ??
      body.sourcePath ??
      body.sourceRelativePath,
  };
}

function normalizeOnboardingFlowsRequest(body: OnboardingFlowReplaceRequest): {
  workspaceId: string;
  flows: OnboardingFlowInput[];
} {
  if (!Array.isArray(body.flows) && !Array.isArray(body.onboardingFlows)) {
    throw new Error("flows is required and must be an array.");
  }
  const rawFlows = body.flows ?? body.onboardingFlows ?? [];
  return {
    workspaceId: body.workspaceId ?? "",
    flows: rawFlows.map((flow) => ({
      id: flow.id,
      flowId: flow.flowId ?? "",
      audience: flow.audience as "client" | "employee",
      status: flow.status,
      owner: flow.owner,
      startsOn: flow.startsOn,
      clientId: flow.clientId,
      memberId: flow.memberId,
      projectIds: flow.projectIds,
      primaryContact: flow.primaryContact,
      workspaceReady: flow.workspaceReady,
      manager: flow.manager,
      department: flow.department,
      joinedOn: flow.joinedOn,
      sourcePath: flow.sourcePath ?? flow.sourceRelativePath,
      tasks: (flow.tasks ?? []).map((task) => ({
        id: task.id,
        taskId: task.taskId ?? "",
        title: task.title ?? "",
        completed: task.completed,
        completedAt: task.completedAt,
        resourceCreated: task.resourceCreated,
        notes: task.notes,
        position: task.position ?? task.order,
      })),
    })),
  };
}

function parseBooleanQueryValue(value: string | null, field: string): boolean | undefined {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(`${field} must be true or false.`);
}

function parseAudienceQueryValue(value: string | null): "client" | "employee" | undefined {
  if (value === null) return undefined;
  if (value === "client" || value === "employee") return value;
  throw new Error("audience must be client or employee.");
}

export async function handleGetProjects(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");
  const status = url.searchParams.get("status") ?? "active";
  const projects = await listProjectSummaries(env.TEAMFORGE_DB, workspaceId, status);
  return jsonOk({ projects, total: projects.length });
}

export async function handlePutProject(env: Env, projectId: string, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: ProjectMetadataRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  try {
    const project = await upsertProjectMetadata(
      env.TEAMFORGE_DB,
      projectId,
      normalizeProjectMetadataRequest(body),
    );
    return jsonOk({ project });
  } catch (error) {
    return mapError(error, "invalid_project_metadata");
  }
}

export async function handleGetClientProfiles(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  try {
    const workspaceId = url.searchParams.get("workspace_id");
    const active = parseBooleanQueryValue(url.searchParams.get("active"), "active");
    const clientProfiles = await listClientProfiles(env.TEAMFORGE_DB, workspaceId, active);
    return jsonOk({ clientProfiles, total: clientProfiles.length });
  } catch (error) {
    return mapError(error, "invalid_client_profile_query");
  }
}

export async function handleGetClientProfile(
  env: Env,
  clientId: string,
  url: URL,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  try {
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return jsonError(
        {
          code: "missing_workspace_id",
          message: "workspace_id query parameter is required.",
          retryable: false,
        },
        400,
      );
    }
    const detail = await getClientProfileDetail(env.TEAMFORGE_DB, clientId, workspaceId);
    if (!detail) {
      return jsonError(
        { code: "not_found", message: `Client profile ${clientId} not found.`, retryable: false },
        404,
      );
    }
    return jsonOk(detail);
  } catch (error) {
    return mapError(error, "invalid_client_profile_query");
  }
}

export async function handlePutClientProfile(
  env: Env,
  clientId: string,
  request: Request,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: ClientProfileRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  try {
    const clientProfile = await upsertClientProfile(
      env.TEAMFORGE_DB,
      normalizeClientProfileRequest(body, clientId),
    );
    const detail = await getClientProfileDetail(env.TEAMFORGE_DB, clientId, clientProfile.workspaceId);
    return jsonOk(detail ?? { clientProfile, linkedProjects: [] });
  } catch (error) {
    return mapError(error, "invalid_client_profile");
  }
}

export async function handleGetOnboardingFlows(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  try {
    const workspaceId = url.searchParams.get("workspace_id");
    const audience = parseAudienceQueryValue(url.searchParams.get("audience"));
    const status = url.searchParams.get("status");
    const flows = await listOnboardingFlows(env.TEAMFORGE_DB, workspaceId, { audience, status });
    return jsonOk({ flows, total: flows.length });
  } catch (error) {
    return mapError(error, "invalid_onboarding_query");
  }
}

export async function handlePutOnboardingFlows(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: OnboardingFlowReplaceRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  try {
    const { workspaceId, flows } = normalizeOnboardingFlowsRequest(body);
    const records = await replaceOnboardingFlows(env.TEAMFORGE_DB, workspaceId, flows);
    return jsonOk({ flows: records, total: records.length });
  } catch (error) {
    return mapError(error, "invalid_onboarding_flow");
  }
}

export async function handleGetProjectMappings(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");
  const status = url.searchParams.get("status") ?? "active";
  const projects = await listProjectGraphs(env.TEAMFORGE_DB, workspaceId, status);
  return jsonOk({ projects, total: projects.length });
}

export async function handleGetProjectMappingIssues(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");
  const status = url.searchParams.get("status") ?? "active";
  const issues = await listProjectIssueFeed(env.TEAMFORGE_DB, workspaceId, status);
  return jsonOk({ issues, total: issues.length });
}

export async function handlePutProjectMappings(
  env: Env,
  projectId: string,
  request: Request,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: ProjectGraphInput;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  try {
    const project = await upsertProjectGraph(env.TEAMFORGE_DB, projectId, body);
    return jsonOk({ project });
  } catch (error) {
    return mapError(error, "invalid_project_graph");
  }
}

export async function handleGetProjectControlPlane(
  env: Env,
  projectId: string,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const detail = await getProjectControlPlaneDetail(env.TEAMFORGE_DB, projectId);
  if (!detail) {
    return jsonError({ code: "not_found", message: `Project ${projectId} not found.`, retryable: false }, 404);
  }

  return jsonOk({ detail });
}

export async function handlePostProjectAction(
  env: Env,
  projectId: string,
  request: Request,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: ProjectActionRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  try {
    const result = await performProjectAction(env.TEAMFORGE_DB, env, projectId, body);
    return jsonOk(result);
  } catch (error) {
    return mapError(error, "project_action_failed");
  }
}
