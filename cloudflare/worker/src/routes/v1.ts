/**
 * V1 API Router — Safety Audit Note (2026-06-10)
 *
 * Route classification (read-only vs mutation):
 *  READ  — GET  /bootstrap, /remote-config, /projects, /client-profiles, /onboarding-flows,
 *               /project-mappings, /project-mappings/issues, /project-mappings/:id/control-plane,
 *               /credentials, /connections, /sync/jobs/:id, /sync/runs, /ota/check,
 *               /team/snapshot, /huly/normalization/history, /handoffs, /handoffs/:id,
 *               /agent-feed/export, /projects/:id/closeout
 *  WRITE — PUT  /projects/:id, /client-profiles/:id, /onboarding-flows, /project-mappings/:id
 *          POST /projects/scaffold, /project-mappings/:id/actions, /connections/:id/test,
 *               /sync/jobs, /team/refresh, /huly/normalization/preview, /huly/normalization/apply,
 *               /ota/install-events, /handoffs, /handoffs/:id
 *
 * Auth: All app routes require Bearer (TF_CREDENTIAL_ENVELOPE_KEY) or internal secret.
 * GET /whoami is Access-JWT-only and fail-closed (401 without a verified identity) since WS5.
 * Internal routes (/agent-feed/*, /projects/scaffold, /closeout) use TF_WEBHOOK_HMAC_SECRET.
 * No destructive operations without authentication. No unscoped DELETE endpoints.
 * Health check lives at GET /healthz (index.ts), outside this router.
 */

import type { Env } from "../lib/env";
import { requireBearerAuth, requireInternalAuth } from "../lib/auth";
import { jsonError, jsonNotImplemented, jsonOk } from "../lib/response";
import { verifyAccessJwt } from "../lib/access";
import { handleGetTimeEntries, handlePostTimeEntries } from "./time-entries";
import { handleBackfillClockify } from "./clockify-backfill";
import { handleAgentFeedExport, handleProjectCloseout, handleProjectScaffold } from "./agent-feed";
import { handleGetConnections, handleTestConnection } from "./connections";
import { handleGetCredentials } from "./credentials";
import { handleGetNormalizationHistory, handleNormalizationApply, handleNormalizationPreview } from "./normalization";
import { handleOtaCheck, handleOtaInstallEvent } from "./ota";
import {
  handleGetClientProfile,
  handleGetClientProfiles,
  handleGetOnboardingFlows,
  handleGetProjectControlPlane,
  handleGetProjectMappingIssues,
  handleGetProjectMappings,
  handleGetProjects,
  handlePostProjectAction,
  handlePutClientProfile,
  handlePutOnboardingFlows,
  handlePutProject,
  handlePutProjectMappings,
} from "./projects";
import {
  createHandoff,
  getHandoffById,
  listHandoffs,
  updateHandoffStatus,
  type HandoffInput,
} from "../lib/project-registry";
import { handleGetSyncJob, handleGetSyncRuns, handlePostSyncJob } from "./sync";
import { handleGetTeamSnapshot, handlePostTeamRefresh } from "./team";
import { queryFirst, queryAll, execute } from "../lib/db";

interface DatabaseStatus {
  available: boolean;
  schemaReady: boolean;
}

export async function handleV1Request(request: Request, env: Env, url: URL): Promise<Response> {
  const { method, pathname } = { method: request.method, pathname: url.pathname };

  // Per-employee identity (Cloudflare Access). Live since WS5: TF_ACCESS_TEAM_DOMAIN +
  // TF_ACCESS_AUD are set, so a valid Cf-Access-Jwt-Assertion resolves to the caller's email.
  // Returns null for m2m callers (workers.dev path, no JWT) — they use internal/Bearer below.
  const accessIdentity = await verifyAccessJwt(request, env);

  // Combined auth for app routes — three tiers so neither Plexus nor Hermes regresses:
  //   1) a verified Cloudflare Access identity, else
  //   2) the temporary internal shared secret (m2m: parity/Hermes; header X-TeamForge-Internal-Secret), else
  //   3) the normal app Bearer (TF_CREDENTIAL_ENVELOPE_KEY).
  // The request must still pass the upstream Cloudflare Access policy (e.g. via IP bypass on allowed machines).
  const requireAppOrInternalAuth = () => {
    if (accessIdentity) return null; // Cloudflare Access identity verified → authorized
    const internalFailure = requireInternalAuth(request, env.TF_INTERNAL_SHARED_SECRET);
    if (internalFailure) {
      return internalFailure; // internal header present but invalid
    }

    const providedInternal = request.headers.get("x-teamforge-internal-secret");
    const hasValidInternal =
      providedInternal &&
      env.TF_INTERNAL_SHARED_SECRET &&
      providedInternal === env.TF_INTERNAL_SHARED_SECRET;

    if (hasValidInternal) {
      return null; // internal auth succeeded — bypass bearer requirement
    }

    // No (valid) internal header — require the standard app Bearer
    return requireBearerAuth(
      request,
      env.TF_CREDENTIAL_ENVELOPE_KEY,
      "app",
    );
  };

  // Agent feed (Paperclip bridge) — auth required, shared HMAC secret
  if (method === "GET" && pathname === "/v1/agent-feed/export") {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleAgentFeedExport(env);
  }
  if (method === "POST" && pathname === "/v1/projects/scaffold") {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleProjectScaffold(env, request);
  }
  const closeoutMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/closeout$/);
  if (method === "GET" && closeoutMatch) {
    const authFailure = requireBearerAuth(request, env.TF_WEBHOOK_HMAC_SECRET, "internal");
    if (authFailure) return authFailure;
    return handleProjectCloseout(env, closeoutMatch[1]);
  }

  // Bootstrap & config
  if (method === "GET" && pathname === "/v1/bootstrap") {
    return jsonOk(await buildBootstrapPayload(env));
  }
  if (method === "GET" && pathname === "/v1/remote-config") {
    return jsonOk({
      workspaceMode: "shadow",
      ota: {
        defaultChannel: env.TF_DEFAULT_OTA_CHANNEL ?? "stable",
        startupChecksEnabled: false,
      },
      features: {
        backendBridgeEnabled: false,
        remoteProjectMappingsEnabled: true,
        hulyNormalizationEnabled: false,
      },
    });
  }

  // Identity — whoami. Access-JWT-only and fail-closed (WS5): per-employee identity must come
  // from a verified Cloudflare Access JWT; Bearer/internal callers have no identity to return.
  if (method === "GET" && pathname === "/v1/whoami") {
    if (!accessIdentity) {
      return jsonError(
        {
          code: "access_identity_required",
          message: "A verified Cloudflare Access identity is required.",
          retryable: false,
        },
        401,
      );
    }
    return jsonOk({ email: accessIdentity.email, access: true });
  }

  // Time entries (Plexus employee tracker → canonical store) + one-time Clockify cutover backfill
  if (method === "POST" && pathname === "/v1/time-entries/backfill-clockify") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleBackfillClockify(env, request, url);
  }
  if (method === "POST" && pathname === "/v1/time-entries") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostTimeEntries(env, request);
  }
  if (method === "GET" && pathname === "/v1/time-entries") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetTimeEntries(env, url);
  }

  // Projects
  if (method === "GET" && pathname === "/v1/projects") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjects(env, url);
  }
  const projectMatch = pathname.match(/^\/v1\/projects\/([^/]+)$/);
  if (method === "PUT" && projectMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutProject(env, projectMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/client-profiles") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfiles(env, url);
  }
  const clientProfileMatch = pathname.match(/^\/v1\/client-profiles\/([^/]+)$/);
  if (method === "GET" && clientProfileMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfile(env, clientProfileMatch[1], url);
  }
  if (method === "PUT" && clientProfileMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutClientProfile(env, clientProfileMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetOnboardingFlows(env, url);
  }
  if (method === "PUT" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutOnboardingFlows(env, request);
  }

  // Project mappings — alias to projects with mapping context
  if (method === "GET" && pathname === "/v1/project-mappings") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappings(env, url);
  }
  if (method === "GET" && pathname === "/v1/project-mappings/issues") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappingIssues(env, url);
  }
  const mappingMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)$/);
  if (method === "PUT" && mappingMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePutProjectMappings(env, mappingMatch[1], request);
  }
  const controlPlaneMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/control-plane$/);
  if (method === "GET" && controlPlaneMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetProjectControlPlane(env, controlPlaneMatch[1]);
  }
  const projectActionMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/actions$/);
  if (method === "POST" && projectActionMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostProjectAction(env, projectActionMatch[1], request);
  }

  // Credentials (shared integration tokens)
  if (method === "GET" && pathname === "/v1/credentials") {
    return handleGetCredentials(env, url, request);
  }

  // Connections
  if (method === "GET" && pathname === "/v1/connections") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetConnections(env, url);
  }
  const connTestMatch = pathname.match(/^\/v1\/connections\/([^/]+)\/test$/);
  if (method === "POST" && connTestMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleTestConnection(env, connTestMatch[1], request);
  }

  // Sync
  if (method === "POST" && pathname === "/v1/sync/jobs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostSyncJob(env, request);
  }
  const syncJobMatch = pathname.match(/^\/v1\/sync\/jobs\/([^/]+)$/);
  if (method === "GET" && syncJobMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetSyncJob(env, syncJobMatch[1]);
  }
  if (method === "GET" && pathname === "/v1/sync/runs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetSyncRuns(env, url);
  }

  // OTA
  if (method === "GET" && pathname === "/v1/ota/check") {
    return handleOtaCheck(env, url);
  }
  if (method === "POST" && pathname === "/v1/ota/install-events") {
    return handleOtaInstallEvent(env, request);
  }

  // Team snapshot
  if (method === "GET" && pathname === "/v1/team/snapshot") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetTeamSnapshot(env, url);
  }
  if (method === "POST" && pathname === "/v1/team/refresh") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handlePostTeamRefresh(env, request);
  }

  // Huly normalization
  if (method === "POST" && pathname === "/v1/huly/normalization/preview") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleNormalizationPreview(env, request);
  }
  if (method === "POST" && pathname === "/v1/huly/normalization/apply") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleNormalizationApply(env, request);
  }
  if (method === "GET" && pathname === "/v1/huly/normalization/history") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    return handleGetNormalizationHistory(env, url);
  }

  // Handoffs — 2026-06-09 (Hermes Telegram command surface + vault handoffs/ protocol)
  // Auth: app-level Bearer (after CF Access edge protection for MultiCA/Hermes callers)
  const DEFAULT_WORKSPACE_ID = "thoughtseed-primary";

  if (method === "GET" && pathname === "/v1/handoffs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const statusParam = url.searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    const handoffs = await listHandoffs(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, statusParam || undefined);
    return jsonOk({ handoffs });
  }

  const handoffMatch = pathname.match(/^\/v1\/handoffs\/([^/]+)$/);
  if (method === "GET" && handoffMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const handoff = await getHandoffById(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, handoffMatch[1]);
    if (!handoff) {
      return jsonError({ code: "not_found", message: "Handoff not found", retryable: false }, 404);
    }
    return jsonOk(handoff);
  }

  if (method === "PUT" && handoffMatch) {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const body = (await request.json()) as { status?: "approved" | "rejected"; reason?: string | null };
    try {
      const updated = await updateHandoffStatus(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, handoffMatch[1], {
        status: body.status,
      });
      return jsonOk(updated);
    } catch (err: any) {
      return jsonError({ code: "invalid_transition", message: err?.message || "Invalid status transition", retryable: false }, 400);
    }
  }

  if (method === "POST" && pathname === "/v1/handoffs") {
    const authFailure = requireAppOrInternalAuth();
    if (authFailure) return authFailure;
    const body = (await request.json()) as HandoffInput;
    const created = await createHandoff(env.TEAMFORGE_DB!, DEFAULT_WORKSPACE_ID, body);
    return jsonOk(created);
  }

  // ── Phase 7: Member Provisioning ────────────────────────────────
  // Returns a scoped member bundle (id, name, Paperclip repo root, MultiCA
  // config) so the Plexus client can run setup-member.sh without storing
  // device secrets. Requires a verified Cloudflare Access identity.
  if (method === "GET" && pathname === "/v1/member/provision") {
    if (!accessIdentity) {
      return jsonError(
        { code: "access_identity_required", message: "Cloudflare Access identity required for provisioning.", retryable: false },
        401,
      );
    }
    const email = accessIdentity.email.toLowerCase();
    const employee = await queryFirst(
      env.TEAMFORGE_DB!,
      "SELECT id, display_name, workspace_id FROM employees WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1",
      email,
    );
    if (!employee) {
      return jsonError(
        { code: "employee_not_found", message: `No active employee with email ${email}.`, retryable: false },
        404,
      );
    }
    return jsonOk({
      memberId: employee.id,
      memberName: employee.display_name,
      workspaceId: employee.workspace_id,
      paperclipRepoRoot: env.TF_PAPERCLIP_REPO_ROOT || undefined,
      multica: {
        apiUrl: env.MULTICA_API_URL || undefined,
        appUrl: env.MULTICA_APP_URL || undefined,
        workspaceId: env.MULTICA_WORKSPACE_ID || undefined,
      },
      features: {
        agentFabricEnabled: true,
        standupEnabled: true,
        weeklyReportEnabled: true,
      },
    });
  }

  // ── Phase 9: Member Preferences ─────────────────────────────────
  if (method === "PUT" && pathname === "/v1/member/preferences") {
    if (!accessIdentity) {
      return jsonError(
        { code: "access_identity_required", message: "Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    const email = accessIdentity.email.toLowerCase();
    const employee = await queryFirst(
      env.TEAMFORGE_DB!,
      "SELECT id, workspace_id FROM employees WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1",
      email,
    );
    if (!employee) {
      return jsonError(
        { code: "employee_not_found", message: `No active employee with email ${email}.`, retryable: false },
        404,
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const prefsJson = JSON.stringify(body);
    const now = new Date().toISOString();
    await execute(
      env.TEAMFORGE_DB!,
      `INSERT INTO employee_preferences (id, employee_id, workspace_id, preferences_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id) DO UPDATE SET
         preferences_json = excluded.preferences_json,
         updated_at = excluded.updated_at`,
      [crypto.randomUUID(), employee.id, employee.workspace_id, prefsJson, now, now],
    );
    return jsonOk({ saved: true, employeeId: employee.id });
  }

  if (method === "GET" && pathname === "/v1/member/preferences") {
    if (!accessIdentity) {
      return jsonError(
        { code: "access_identity_required", message: "Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    const email = accessIdentity.email.toLowerCase();
    const row = await queryFirst<{ preferences_json?: string }>(
      env.TEAMFORGE_DB!,
      `SELECT p.preferences_json
       FROM employee_preferences p
       JOIN employees e ON e.id = p.employee_id
       WHERE LOWER(e.email) = ? AND e.is_active = 1
       LIMIT 1`,
      email,
    );
    if (!row || !row.preferences_json) return jsonOk({});
    try { return jsonOk(JSON.parse(row.preferences_json)); } catch { return jsonOk({}); }
  }

  // ── Phase 8: Member KPI Summary (canonical D1 data) ─────────────
  if (method === "GET" && pathname === "/v1/member/kpi") {
    if (!accessIdentity) {
      return jsonError(
        { code: "access_identity_required", message: "Cloudflare Access identity required.", retryable: false },
        401,
      );
    }
    const email = accessIdentity.email.toLowerCase();
    const emp = await queryFirst<{ id: string; workspace_id: string }>(
      env.TEAMFORGE_DB!,
      "SELECT id, workspace_id FROM employees WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1",
      email,
    );
    if (!emp) {
      return jsonError(
        { code: "employee_not_found", message: `No active employee with email ${email}.`, retryable: false },
        404,
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const ws = weekStart.toISOString().slice(0, 10);

    const todaySeconds = await queryFirst<{ total: number }>(
      env.TEAMFORGE_DB!,
      "SELECT COALESCE(SUM(duration_seconds),0) as total FROM time_entries WHERE employee_id = ? AND start_time >= ? AND start_time < ?",
      [emp.id, `${today}T00:00:00Z`, `${today}T23:59:59Z`],
    );
    const weekSeconds = await queryFirst<{ total: number }>(
      env.TEAMFORGE_DB!,
      "SELECT COALESCE(SUM(duration_seconds),0) as total FROM time_entries WHERE employee_id = ? AND start_time >= ? AND start_time < ?",
      [emp.id, `${ws}T00:00:00Z`, `${today}T23:59:59Z`],
    );
    const projectBreakdown = await queryAll<{ project_id: string; total: number }>(
      env.TEAMFORGE_DB!,
      `SELECT project_id, SUM(duration_seconds) as total FROM time_entries
       WHERE employee_id = ? AND start_time >= ? AND start_time < ?
       GROUP BY project_id ORDER BY total DESC LIMIT 10`,
      [emp.id, `${ws}T00:00:00Z`, `${today}T23:59:59Z`],
    );

    return jsonOk({
      todaySeconds: todaySeconds?.total ?? 0,
      weekSeconds: weekSeconds?.total ?? 0,
      projectBreakdown: Object.fromEntries(projectBreakdown.map((r) => [r.project_id || 'untagged', r.total])),
      standupCompliant: (todaySeconds?.total ?? 0) > 0,
    });
  }

  return jsonNotImplemented(pathname, method);
}

async function buildBootstrapPayload(env: Env): Promise<Record<string, unknown>> {
  const database = await probeDatabase(env);
  return {
    service: "teamforge-api",
    phase: "phase-2-wave-3",
    environment: env.TF_ENV,
    defaultOtaChannel: env.TF_DEFAULT_OTA_CHANNEL ?? "stable",
    bindings: {
      d1Available: database.available,
      schemaReady: database.schemaReady,
      artifactsBound: Boolean(env.TEAMFORGE_ARTIFACTS),
      syncQueueBound: Boolean(env.SYNC_QUEUE),
      workspaceLocksBound: Boolean(env.WORKSPACE_LOCKS),
    },
    routeStatus: {
      bootstrap: "live",
      remoteConfig: "live",
      projects: "live",
      clientProfiles: "live",
      onboardingFlows: "live",
      projectMappings: "live",
      connections: "live",
      sync: "live",
      teamSnapshot: "live",
      hulyNormalization: "live",
      ota: "live",
      handoffs: "live",
      timeEntries: "live",
      whoami: "live",
    },
  };
}

async function probeDatabase(env: Env): Promise<DatabaseStatus> {
  if (!env.TEAMFORGE_DB) return { available: false, schemaReady: false };
  try {
    const row = await env.TEAMFORGE_DB.prepare(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'organizations') AS schema_ready",
    ).first<{ schema_ready?: number }>();
    return { available: true, schemaReady: Boolean(row?.schema_ready) };
  } catch {
    return { available: false, schemaReady: false };
  }
}
