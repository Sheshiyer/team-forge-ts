import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface Project {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  project_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProjectExternalId {
  source: string;
  external_id: string;
}

interface ProjectWithMappings extends Project {
  external_ids: ProjectExternalId[];
}

export async function handleGetProjects(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const workspaceId = url.searchParams.get("workspace_id");
  const status = url.searchParams.get("status") ?? "active";

  const projects = workspaceId
    ? await queryAll<Project>(env.TEAMFORGE_DB, "SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY name", workspaceId, status)
    : await queryAll<Project>(env.TEAMFORGE_DB, "SELECT * FROM projects WHERE status = ? ORDER BY name", status);

  const ids = projects.map((p) => p.id);
  const externalIds = ids.length
    ? await queryAll<ProjectExternalId & { project_id: string }>(
        env.TEAMFORGE_DB,
        `SELECT project_id, source, external_id FROM project_external_ids WHERE project_id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];

  const byProject = new Map<string, ProjectExternalId[]>();
  for (const row of externalIds) {
    const list = byProject.get(row.project_id) ?? [];
    list.push({ source: row.source, external_id: row.external_id });
    byProject.set(row.project_id, list);
  }

  const result: ProjectWithMappings[] = projects.map((p) => ({
    ...p,
    external_ids: byProject.get(p.id) ?? [],
  }));

  return jsonOk({ projects: result, total: result.length });
}

export async function handlePutProject(env: Env, projectId: string, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  let body: Partial<Project & { external_ids?: ProjectExternalId[] }>;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  const existing = await queryFirst<Project>(env.TEAMFORGE_DB, "SELECT * FROM projects WHERE id = ?", projectId);

  if (existing) {
    await execute(
      env.TEAMFORGE_DB,
      "UPDATE projects SET name = ?, code = ?, project_type = ?, status = ?, updated_at = ? WHERE id = ?",
      body.name ?? existing.name,
      body.code ?? existing.code,
      body.project_type ?? existing.project_type,
      body.status ?? existing.status,
      now(),
      projectId,
    );
  } else {
    if (!body.workspace_id || !body.name) {
      return jsonError({ code: "missing_fields", message: "workspace_id and name are required for new projects.", retryable: false }, 400);
    }
    await execute(
      env.TEAMFORGE_DB,
      "INSERT INTO projects (id, workspace_id, name, code, project_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      projectId,
      body.workspace_id,
      body.name,
      body.code ?? null,
      body.project_type ?? null,
      body.status ?? "active",
      now(),
      now(),
    );
  }

  if (body.external_ids?.length) {
    for (const ext of body.external_ids) {
      await execute(
        env.TEAMFORGE_DB,
        "INSERT INTO project_external_ids (id, project_id, source, external_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(source, external_id) DO UPDATE SET project_id = excluded.project_id",
        nanoid(),
        projectId,
        ext.source,
        ext.external_id,
        now(),
      );
    }
  }

  const updated = await queryFirst<Project>(env.TEAMFORGE_DB, "SELECT * FROM projects WHERE id = ?", projectId);
  return jsonOk({ project: updated });
}
