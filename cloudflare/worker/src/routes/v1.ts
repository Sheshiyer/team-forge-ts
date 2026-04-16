import type { Env } from "../lib/env";
import { jsonNotImplemented, jsonOk } from "../lib/response";
import { handleGetConnections, handleTestConnection } from "./connections";
import { handleGetCredentials } from "./credentials";
import { handleGetNormalizationHistory, handleNormalizationApply, handleNormalizationPreview } from "./normalization";
import { handleOtaCheck, handleOtaInstallEvent } from "./ota";
import {
  handleGetProjectMappings,
  handleGetProjects,
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
    return handleGetProjects(env, url);
  }
  const projectMatch = pathname.match(/^\/v1\/projects\/([^/]+)$/);
  if (method === "PUT" && projectMatch) {
    return handlePutProject(env, projectMatch[1], request);
  }

  // Project mappings — alias to projects with mapping context
  if (method === "GET" && pathname === "/v1/project-mappings") {
    return handleGetProjectMappings(env, url);
  }
  const mappingMatch = pathname.match(/^\/v1\/project-mappings\/([^/]+)$/);
  if (method === "PUT" && mappingMatch) {
    return handlePutProjectMappings(env, mappingMatch[1], request);
  }

  // Credentials (shared integration tokens)
  if (method === "GET" && pathname === "/v1/credentials") {
    return handleGetCredentials(env, url, request);
  }

  // Connections
  if (method === "GET" && pathname === "/v1/connections") {
    return handleGetConnections(env, url);
  }
  const connTestMatch = pathname.match(/^\/v1\/connections\/([^/]+)\/test$/);
  if (method === "POST" && connTestMatch) {
    return handleTestConnection(env, connTestMatch[1], request);
  }

  // Sync
  if (method === "POST" && pathname === "/v1/sync/jobs") {
    return handlePostSyncJob(env, request);
  }
  const syncJobMatch = pathname.match(/^\/v1\/sync\/jobs\/([^/]+)$/);
  if (method === "GET" && syncJobMatch) {
    return handleGetSyncJob(env, syncJobMatch[1]);
  }
  if (method === "GET" && pathname === "/v1/sync/runs") {
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
  if (method === "GET" && pathname === "/v1/team/snapshot") return handleGetTeamSnapshot(env, url);
  if (method === "POST" && pathname === "/v1/team/refresh") return handlePostTeamRefresh(env, request);

  // Huly normalization
  if (method === "POST" && pathname === "/v1/huly/normalization/preview") return handleNormalizationPreview(env, request);
  if (method === "POST" && pathname === "/v1/huly/normalization/apply") return handleNormalizationApply(env, request);
  if (method === "GET" && pathname === "/v1/huly/normalization/history") return handleGetNormalizationHistory(env, url);

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
