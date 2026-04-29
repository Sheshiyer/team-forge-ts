import type { Env } from "../lib/env";
import { requireBearerAuth } from "../lib/auth";
import { jsonNotImplemented, jsonOk } from "../lib/response";
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
import { handleGetSyncJob, handleGetSyncRuns, handlePostSyncJob } from "./sync";
import { handleGetTeamSnapshot, handlePostTeamRefresh } from "./team";

interface DatabaseStatus {
  available: boolean;
  schemaReady: boolean;
}

export async function handleV1Request(request: Request, env: Env, url: URL): Promise<Response> {
  const { method, pathname } = { method: request.method, pathname: url.pathname };
  const requireAppAuth = () =>
    requireBearerAuth(
      request,
      env.TF_CREDENTIAL_ENVELOPE_KEY,
      "app",
    );

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

  // Projects
  if (method === "GET" && pathname === "/v1/projects") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetProjects(env, url);
  }
  const projectMatch = pathname.match(/^\/v1\/projects\/([^/]+)$/);
  if (method === "PUT" && projectMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePutProject(env, projectMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/client-profiles") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfiles(env, url);
  }
  const clientProfileMatch = pathname.match(/^\/v1\/client-profiles\/([^/]+)$/);
  if (method === "GET" && clientProfileMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetClientProfile(env, clientProfileMatch[1], url);
  }
  if (method === "PUT" && clientProfileMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePutClientProfile(env, clientProfileMatch[1], request);
  }
  if (method === "GET" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetOnboardingFlows(env, url);
  }
  if (method === "PUT" && pathname === "/v1/onboarding-flows") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePutOnboardingFlows(env, request);
  }

  // Project mappings — alias to projects with mapping context
  if (method === "GET" && pathname === "/v1/project-mappings") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappings(env, url);
  }
  if (method === "GET" && pathname === "/v1/project-mappings/issues") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetProjectMappingIssues(env, url);
  }
  const mappingMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)$/);
  if (method === "PUT" && mappingMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePutProjectMappings(env, mappingMatch[1], request);
  }
  const controlPlaneMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/control-plane$/);
  if (method === "GET" && controlPlaneMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetProjectControlPlane(env, controlPlaneMatch[1]);
  }
  const projectActionMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)\/actions$/);
  if (method === "POST" && projectActionMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePostProjectAction(env, projectActionMatch[1], request);
  }

  // Credentials (shared integration tokens)
  if (method === "GET" && pathname === "/v1/credentials") {
    return handleGetCredentials(env, url, request);
  }

  // Connections
  if (method === "GET" && pathname === "/v1/connections") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetConnections(env, url);
  }
  const connTestMatch = pathname.match(/^\/v1\/connections\/([^/]+)\/test$/);
  if (method === "POST" && connTestMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleTestConnection(env, connTestMatch[1], request);
  }

  // Sync
  if (method === "POST" && pathname === "/v1/sync/jobs") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePostSyncJob(env, request);
  }
  const syncJobMatch = pathname.match(/^\/v1\/sync\/jobs\/([^/]+)$/);
  if (method === "GET" && syncJobMatch) {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetSyncJob(env, syncJobMatch[1]);
  }
  if (method === "GET" && pathname === "/v1/sync/runs") {
    const authFailure = requireAppAuth();
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
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetTeamSnapshot(env, url);
  }
  if (method === "POST" && pathname === "/v1/team/refresh") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handlePostTeamRefresh(env, request);
  }

  // Huly normalization
  if (method === "POST" && pathname === "/v1/huly/normalization/preview") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleNormalizationPreview(env, request);
  }
  if (method === "POST" && pathname === "/v1/huly/normalization/apply") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleNormalizationApply(env, request);
  }
  if (method === "GET" && pathname === "/v1/huly/normalization/history") {
    const authFailure = requireAppAuth();
    if (authFailure) return authFailure;
    return handleGetNormalizationHistory(env, url);
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
