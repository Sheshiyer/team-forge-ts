import type { Env } from "../lib/env";
import {
  listProjectGraphs,
  listProjectSummaries,
  upsertProjectGraph,
  upsertProjectMetadata,
  type ProjectGraphInput,
  type ProjectMetadataInput,
} from "../lib/project-registry";
import {
  getProjectControlPlaneDetail,
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
  clientName?: string | null;
  projectType?: string | null;
  status?: string;
  visibility?: string;
  syncMode?: string;
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
    clientName: project.clientName ?? body.clientName,
    projectType: project.projectType ?? body.projectType,
    status: project.status ?? body.status,
    visibility: project.visibility ?? body.visibility,
    syncMode: project.syncMode ?? body.syncMode,
  };
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

export async function handleGetProjectMappings(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");
  const status = url.searchParams.get("status") ?? "active";
  const projects = await listProjectGraphs(env.TEAMFORGE_DB, workspaceId, status);
  return jsonOk({ projects, total: projects.length });
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
