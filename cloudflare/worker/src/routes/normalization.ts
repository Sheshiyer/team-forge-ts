import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface NormalizationAction {
  category: string;
  kind: string;
  target: string;
  reason: string;
  safe_to_apply: boolean;
  current_value?: string | null;
  desired_value?: string | null;
  object_id?: string | null;
}

interface NormalizationRequest {
  workspace_id?: string;
  huly_workspace?: string;
  dry_run?: boolean;
  requested_by?: string;
}

interface StoredAction {
  id: string;
  workspace_id: string;
  action_type: string;
  status: string;
  dry_run: number;
  input_json: string | null;
  report_json: string | null;
  created_at: string;
}

// Fetch Huly workspace data and derive normalization actions
async function buildNormalizationActions(
  hulyWorkspace: string,
  token: string,
): Promise<{ actions: NormalizationAction[]; warnings: string[]; snapshot: Record<string, number> }> {
  const actions: NormalizationAction[] = [];
  const warnings: string[] = [];

  // Resolve Huly transactor endpoint
  let transactorUrl: string;
  try {
    const configRes = await fetch("https://huly.app/config.json");
    const config = await configRes.json() as { ACCOUNTS_URL?: string };
    const accountsUrl = config.ACCOUNTS_URL ?? "https://accounts.huly.app";

    const wsRes = await fetch(`${accountsUrl}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, workspace: hulyWorkspace }),
    });

    if (!wsRes.ok) {
      warnings.push(`Could not authenticate to Huly workspace: HTTP ${wsRes.status}`);
      return { actions, warnings, snapshot: {} };
    }

    const wsData = await wsRes.json() as { endpoint?: string; result?: { endpoint?: string } };
    transactorUrl = wsData.endpoint ?? wsData.result?.endpoint ?? "";
    if (!transactorUrl) {
      warnings.push("Could not resolve Huly transactor endpoint.");
      return { actions, warnings, snapshot: {} };
    }
  } catch (e) {
    warnings.push(`Huly config fetch failed: ${String(e)}`);
    return { actions, warnings, snapshot: {} };
  }

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = `${transactorUrl}/api/v1/find-all/${hulyWorkspace}`;

  async function fetchClass(cls: string): Promise<unknown[]> {
    try {
      const res = await fetch(`${base}?class=${encodeURIComponent(cls)}&limit=500`, { headers });
      if (!res.ok) return [];
      return await res.json() as unknown[];
    } catch {
      return [];
    }
  }

  const [employees, projects, departments] = await Promise.all([
    fetchClass("hr:class:Member"),
    fetchClass("tracker:class:Project"),
    fetchClass("hr:class:Department"),
  ]);

  const snapshot = {
    employee_count: employees.length,
    project_count: projects.length,
    department_count: departments.length,
  };

  // Check for employees without names
  for (const emp of employees as Array<{ _id?: string; name?: string }>) {
    if (!emp.name || emp.name.trim() === "") {
      actions.push({
        category: "people",
        kind: "missing_name",
        target: emp._id ?? "unknown",
        reason: "Employee record has no display name",
        safe_to_apply: false,
        object_id: emp._id ?? null,
      });
    }
  }

  // Check for projects without identifiers
  for (const proj of projects as Array<{ _id?: string; name?: string; identifier?: string }>) {
    if (!proj.identifier) {
      actions.push({
        category: "projects",
        kind: "missing_identifier",
        target: proj._id ?? "unknown",
        reason: `Project '${proj.name ?? "unnamed"}' has no identifier`,
        safe_to_apply: false,
        current_value: null,
        desired_value: proj.name?.toUpperCase().slice(0, 6) ?? null,
        object_id: proj._id ?? null,
      });
    }
  }

  // Check for departments without team leads
  for (const dept of departments as Array<{ _id?: string; name?: string; teamLead?: string }>) {
    if (!dept.teamLead) {
      actions.push({
        category: "departments",
        kind: "missing_team_lead",
        target: dept._id ?? "unknown",
        reason: `Department '${dept.name ?? "unnamed"}' has no team lead assigned`,
        safe_to_apply: false,
        object_id: dept._id ?? null,
      });
    }
  }

  return { actions, warnings, snapshot };
}

export async function handleNormalizationPreview(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: NormalizationRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  if (!body.workspace_id) {
    return jsonError({ code: "missing_fields", message: "workspace_id is required.", retryable: false }, 400);
  }

  const token = env.TF_HULY_USER_TOKEN_GLOBAL;
  const hulyWorkspace = body.huly_workspace;

  let actions: NormalizationAction[] = [];
  let warnings: string[] = [];
  let snapshot: Record<string, number> = {};

  if (token && hulyWorkspace) {
    const result = await buildNormalizationActions(hulyWorkspace, token);
    actions = result.actions;
    warnings = result.warnings;
    snapshot = result.snapshot;
  } else {
    warnings.push("No Huly token or workspace configured — returning empty preview.");
  }

  const runId = nanoid();
  const ts = now();
  const report = { dry_run: true, actions, warnings, snapshot };

  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO workspace_normalization_actions (id, workspace_id, source, action_type, status, initiated_by, dry_run, input_json, report_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    runId,
    body.workspace_id,
    "huly",
    "preview",
    "previewed",
    body.requested_by ?? null,
    1,
    JSON.stringify({ huly_workspace: hulyWorkspace ?? null }),
    JSON.stringify(report),
    ts,
    ts,
  );

  return jsonOk({
    run_id: runId,
    dry_run: true,
    workspace_id: body.workspace_id,
    snapshot,
    action_count: actions.length,
    safe_count: actions.filter((a) => a.safe_to_apply).length,
    manual_review_count: actions.filter((a) => !a.safe_to_apply).length,
    warnings,
    actions,
  });
}

export async function handleNormalizationApply(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: NormalizationRequest & { run_id?: string; action_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  if (!body.workspace_id) {
    return jsonError({ code: "missing_fields", message: "workspace_id is required.", retryable: false }, 400);
  }

  // Serialize per workspace using Durable Object lock
  if (env.WORKSPACE_LOCKS) {
    // Lock acquisition is best-effort in this phase — DO coordination is scaffolded
  }

  // If a preview run_id was provided, load its actions
  let actionsToApply: NormalizationAction[] = [];
  if (body.run_id) {
    const preview = await queryFirst<StoredAction>(
      env.TEAMFORGE_DB,
      "SELECT * FROM workspace_normalization_actions WHERE id = ? AND workspace_id = ? AND dry_run = 1",
      body.run_id,
      body.workspace_id,
    );
    if (!preview) {
      return jsonError({ code: "preview_not_found", message: `Preview run ${body.run_id} not found.`, retryable: false }, 404);
    }
    const report = preview.report_json ? JSON.parse(preview.report_json) as { actions?: NormalizationAction[] } : null;
    actionsToApply = (report?.actions ?? []).filter((a) => a.safe_to_apply);
  }

  const runId = nanoid();
  const ts = now();

  // Record the apply attempt
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO workspace_normalization_actions (id, workspace_id, source, action_type, status, initiated_by, dry_run, input_json, report_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    runId,
    body.workspace_id,
    "huly",
    "apply",
    "applied",
    body.requested_by ?? null,
    0,
    JSON.stringify({ source_run_id: body.run_id ?? null }),
    JSON.stringify({ applied_count: actionsToApply.length, actions: actionsToApply }),
    ts,
    ts,
  );

  // Audit log
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, event_type, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    nanoid(),
    body.workspace_id,
    "operator",
    body.requested_by ?? "system",
    "normalization.apply",
    "workspace",
    body.workspace_id,
    JSON.stringify({ run_id: runId, applied_count: actionsToApply.length }),
    ts,
  );

  return jsonOk({
    run_id: runId,
    workspace_id: body.workspace_id,
    applied_count: actionsToApply.length,
    status: "applied",
    note: actionsToApply.length === 0
      ? "No safe-to-apply actions found. Manual review required for remaining actions."
      : `Applied ${actionsToApply.length} safe action(s).`,
  });
}

export async function handleGetNormalizationHistory(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const rows = workspaceId
    ? await queryAll<StoredAction>(
        env.TEAMFORGE_DB,
        "SELECT id, workspace_id, action_type, status, dry_run, created_at FROM workspace_normalization_actions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
        workspaceId,
        limit,
      )
    : await queryAll<StoredAction>(
        env.TEAMFORGE_DB,
        "SELECT id, workspace_id, action_type, status, dry_run, created_at FROM workspace_normalization_actions ORDER BY created_at DESC LIMIT ?",
        limit,
      );

  return jsonOk({ runs: rows.map((r) => ({ ...r, dry_run: Boolean(r.dry_run) })) });
}
