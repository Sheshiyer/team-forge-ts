import type { Env } from "./env";

interface DatabaseStatus {
  available: boolean;
  schemaReady: boolean;
}

export interface BootstrapPayload {
  service: string;
  phase: string;
  environment: string;
  defaultOtaChannel: string;
  bindings: {
    d1Available: boolean;
    schemaReady: boolean;
    artifactsBound: boolean;
    syncQueueBound: boolean;
    workspaceLocksBound: boolean;
  };
  routeStatus: {
    bootstrap: "live";
    remoteConfig: "live";
    projects: "live";
    clientProfiles: "live";
    onboardingFlows: "live";
    projectMappings: "live";
    connections: "live";
    sync: "live";
    teamSnapshot: "live";
    realtime: "live";
    hulyNormalization: "live";
    ota: "live";
    handoffs: "live";
    timeEntries: "live";
    whoami: "live";
  };
}

export interface TsStatusSnapshot {
  summary: {
    overall: "healthy" | "degraded";
    message: string;
  };
  service: {
    name: string;
    phase: string;
    environment: string;
    default_ota_channel: string;
  };
  bindings: {
    d1_available: boolean;
    schema_ready: boolean;
    artifacts_bound: boolean;
    sync_queue_bound: boolean;
    workspace_locks_bound: boolean;
  };
  routes: {
    bootstrap: "live";
    projects: "live";
    handoffs: "live";
    time_entries: "live";
    whoami: "live";
  };
  auth_gates: {
    whoami: "cf_access_only";
    commands_intent: "app_or_internal_auth";
  };
  source_refs: string[];
  telegram_summary: string;
}

export async function buildBootstrapPayload(env: Env): Promise<BootstrapPayload> {
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
      realtime: "live",
      hulyNormalization: "live",
      ota: "live",
      handoffs: "live",
      timeEntries: "live",
      whoami: "live",
    },
  };
}

export async function buildTsStatusSnapshot(env: Env): Promise<TsStatusSnapshot> {
  const bootstrap = await buildBootstrapPayload(env);
  const bindings = {
    d1_available: bootstrap.bindings.d1Available,
    schema_ready: bootstrap.bindings.schemaReady,
    artifacts_bound: bootstrap.bindings.artifactsBound,
    sync_queue_bound: bootstrap.bindings.syncQueueBound,
    workspace_locks_bound: bootstrap.bindings.workspaceLocksBound,
  };
  const routes = {
    bootstrap: bootstrap.routeStatus.bootstrap,
    projects: bootstrap.routeStatus.projects,
    handoffs: bootstrap.routeStatus.handoffs,
    time_entries: bootstrap.routeStatus.timeEntries,
    whoami: bootstrap.routeStatus.whoami,
  };

  const overall =
    Object.values(bindings).every(Boolean) &&
    Object.values(routes).every((status) => status === "live")
      ? "healthy"
      : "degraded";
  const message =
    overall === "healthy"
      ? "TeamForge control plane reachable and read routes are live."
      : "TeamForge control plane responded, but one or more bindings or routes need attention.";

  const snapshot: Omit<TsStatusSnapshot, "telegram_summary"> = {
    summary: { overall, message },
    service: {
      name: bootstrap.service,
      phase: bootstrap.phase,
      environment: bootstrap.environment,
      default_ota_channel: bootstrap.defaultOtaChannel,
    },
    bindings,
    routes,
    auth_gates: {
      whoami: "cf_access_only",
      commands_intent: "app_or_internal_auth",
    },
    source_refs: [
      "cloudflare/worker/src/lib/control-plane-status.ts#buildBootstrapPayload",
      "cloudflare/worker/src/routes/v1.ts#whoami",
      "cloudflare/worker/src/routes/commands.ts#handleCommandIntent",
    ],
  };

  return {
    ...snapshot,
    telegram_summary: formatTsStatusFounderSummary(snapshot),
  };
}

export function formatTsStatusFounderSummary(
  snapshot: Omit<TsStatusSnapshot, "telegram_summary"> | TsStatusSnapshot,
): string {
  const bindings = [
    ["d1", snapshot.bindings.d1_available],
    ["schema", snapshot.bindings.schema_ready],
    ["artifacts", snapshot.bindings.artifacts_bound],
    ["queue", snapshot.bindings.sync_queue_bound],
    ["locks", snapshot.bindings.workspace_locks_bound],
  ]
    .map(([label, ok]) => `${label} ${ok ? "ok" : "attention"}`)
    .join(", ");

  const routes = [
    ["bootstrap", snapshot.routes.bootstrap],
    ["projects", snapshot.routes.projects],
    ["handoffs", snapshot.routes.handoffs],
    ["time entries", snapshot.routes.time_entries],
    ["whoami", snapshot.routes.whoami],
  ]
    .map(([label, status]) => `${label} ${status}`)
    .join(", ");

  return [
    "TEAMFORGE STATUS",
    `service: ${snapshot.service.name} / ${snapshot.service.phase} / ${snapshot.service.environment}`,
    `bindings: ${bindings}`,
    `routes: ${routes}`,
    `auth: whoami=${snapshot.auth_gates.whoami}, commands=${snapshot.auth_gates.commands_intent}`,
    `overall: ${snapshot.summary.overall}`,
  ].join("\n");
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
