import type { Env } from "../lib/env";
import { execute, executeChanges, nanoid, queryAll, queryFirst } from "../lib/db";
import type { PlexusPrincipal } from "../lib/plexus-session";
import { jsonError, jsonOk } from "../lib/response";

export const PRESENCE_LEASE_TTL_SECONDS = 60;

const PRESENCE_HEADERS = { "cache-control": "no-store" };
const MAX_OPAQUE_ID_LENGTH = 128;

type PresenceActivityKind = "available" | "focused";

interface AvailableActivity {
  state: "available";
  timerEntryId: null;
  projectId: null;
  timerStartedAt: null;
}

interface FocusedActivity {
  state: "focused";
  timerEntryId: string;
  projectId: string;
  timerStartedAt: string;
}

type PresenceActivity = AvailableActivity | FocusedActivity;

interface PresenceLeaseRow {
  workspace_id: string;
  identity_id: string;
  client_instance_id: string;
  presence_session_id: string;
  last_sequence: number;
  activity: PresenceActivityKind;
  timer_entry_id: string | null;
  timer_project_id: string | null;
  timer_started_at: string | null;
  room_kind: string | null;
  room_id: string | null;
  call_session_id: string | null;
  participant_id: string | null;
  room_project_id: string | null;
  room_observed_at: string | null;
  room_name: string | null;
  room_project_name: string | null;
  last_seen_at: string;
  expires_at: string;
  employee_id: string | null;
  display_name: string;
}

interface CanonicalIdentityRow {
  role: "employee" | "admin";
  employee_id: string | null;
  identity_active: number;
  employee_active: number | null;
}

interface JsonReadResult<T> {
  body?: T;
  response?: Response;
}

function presenceOk<T>(data: T, status = 200): Response {
  return jsonOk(data, { status, headers: PRESENCE_HEADERS });
}

function presenceError(code: string, message: string, status: number, retryable = false): Response {
  return jsonError({ code, message, retryable }, status, { headers: PRESENCE_HEADERS });
}

function requireDb(env: Env): Response | null {
  return env.TEAMFORGE_DB
    ? null
    : presenceError("db_unavailable", "Database not available.", 503, true);
}

function requirePrincipal(principal: PlexusPrincipal | null | undefined): Response | null {
  return principal
    ? null
    : presenceError("access_identity_required", "Registered Cloudflare Access identity required.", 401);
}

async function readJson<T>(request: Request): Promise<JsonReadResult<T>> {
  try {
    return { body: (await request.json()) as T };
  } catch {
    return { response: presenceError("invalid_json", "Request body must be valid JSON.", 400) };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = new Set(allowed);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function boundedString(value: unknown, max = MAX_OPAQUE_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function parseActivity(value: unknown): PresenceActivity | null {
  if (!isObject(value) || !hasExactKeys(value, ["state", "timerEntryId", "projectId", "timerStartedAt"])) {
    return null;
  }
  if (value.state === "available") {
    return value.timerEntryId === null && value.projectId === null && value.timerStartedAt === null
      ? { state: "available", timerEntryId: null, projectId: null, timerStartedAt: null }
      : null;
  }
  if (value.state !== "focused") return null;
  const timerEntryId = boundedString(value.timerEntryId);
  const projectId = boundedString(value.projectId);
  const timerStartedAt = boundedString(value.timerStartedAt, 64);
  if (!timerEntryId || !projectId || !timerStartedAt || !Number.isFinite(Date.parse(timerStartedAt))) return null;
  return { state: "focused", timerEntryId, projectId, timerStartedAt };
}

function serverTime(): { observedAt: string; expiresAt: string } {
  const observed = Date.now();
  return {
    observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(observed + PRESENCE_LEASE_TTL_SECONDS * 1_000).toISOString(),
  };
}

function opaquePresenceSessionId(): string {
  return `prs_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function canonicalIdentityFailure(env: Env, principal: PlexusPrincipal): Promise<Response | null> {
  const row = await queryFirst<CanonicalIdentityRow>(
    env.TEAMFORGE_DB!,
    `SELECT i.role, i.employee_id, i.is_active AS identity_active, e.is_active AS employee_active
       FROM plexus_identities i
       LEFT JOIN employees e ON e.id = i.employee_id AND e.workspace_id = i.workspace_id
      WHERE i.id = ? AND i.workspace_id = ?
      LIMIT 1`,
    principal.identityId,
    principal.workspaceId,
  );
  const authorized = row?.identity_active === 1
    && (row.role === "admin" || (row.employee_id !== null && row.employee_active === 1));
  return authorized
    ? null
    : presenceError("presence_identity_inactive", "An active canonical employee identity is required.", 403);
}

export async function handleCreatePresenceSession(
  env: Env,
  request: Request,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbFailure = requireDb(env);
  if (dbFailure) return dbFailure;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const identityFailure = await canonicalIdentityFailure(env, principal!);
  if (identityFailure) return identityFailure;

  const parsed = await readJson<Record<string, unknown>>(request);
  if (parsed.response) return parsed.response;
  if (!isObject(parsed.body) || !hasExactKeys(parsed.body, ["clientInstanceId"])) {
    return presenceError("presence_session_invalid", "clientInstanceId is the only accepted field.", 400);
  }
  const clientInstanceId = boundedString(parsed.body.clientInstanceId);
  if (!clientInstanceId) {
    return presenceError("presence_client_invalid", "clientInstanceId must contain 1 to 128 characters.", 400);
  }

  const { observedAt, expiresAt } = serverTime();
  const presenceSessionId = opaquePresenceSessionId();
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO plexus_app_presence_leases (
       id, workspace_id, identity_id, client_instance_id, presence_session_id,
       last_sequence, activity, timer_entry_id, timer_project_id, timer_started_at,
       room_kind, room_id, call_session_id, participant_id, room_project_id, room_observed_at,
       last_seen_at, expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 0, 'available', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, identity_id, client_instance_id) DO UPDATE SET
       presence_session_id = excluded.presence_session_id,
       last_sequence = 0,
       activity = 'available',
       timer_entry_id = NULL,
       timer_project_id = NULL,
       timer_started_at = NULL,
       room_kind = NULL,
       room_id = NULL,
       call_session_id = NULL,
       participant_id = NULL,
       room_project_id = NULL,
       room_observed_at = NULL,
       last_seen_at = excluded.last_seen_at,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
    `presence_${nanoid()}`,
    principal!.workspaceId,
    principal!.identityId,
    clientInstanceId,
    presenceSessionId,
    observedAt,
    expiresAt,
    observedAt,
    observedAt,
  );

  return presenceOk({ presenceSessionId, lastSeenAt: observedAt, expiresAt, leaseTtlSeconds: PRESENCE_LEASE_TTL_SECONDS }, 201);
}

export async function handlePresenceHeartbeat(
  env: Env,
  request: Request,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbFailure = requireDb(env);
  if (dbFailure) return dbFailure;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const identityFailure = await canonicalIdentityFailure(env, principal!);
  if (identityFailure) return identityFailure;

  const parsed = await readJson<Record<string, unknown>>(request);
  if (parsed.response) return parsed.response;
  if (!isObject(parsed.body) || !hasExactKeys(parsed.body, ["clientInstanceId", "presenceSessionId", "sequence", "activity"])) {
    return presenceError("presence_heartbeat_invalid", "Heartbeat contains unsupported or missing fields.", 400);
  }
  const clientInstanceId = boundedString(parsed.body.clientInstanceId);
  const presenceSessionId = boundedString(parsed.body.presenceSessionId);
  const sequence = parsed.body.sequence;
  const activity = parseActivity(parsed.body.activity);
  if (!clientInstanceId || !presenceSessionId || !Number.isSafeInteger(sequence) || Number(sequence) <= 0 || !activity) {
    return presenceError("presence_heartbeat_invalid", "Heartbeat identity, sequence, or activity is invalid.", 400);
  }

  const { observedAt, expiresAt } = serverTime();
  await execute(
    env.TEAMFORGE_DB!,
    "DELETE FROM plexus_app_presence_leases WHERE workspace_id = ? AND expires_at <= ?",
    principal!.workspaceId,
    observedAt,
  );
  const changes = await executeChanges(
    env.TEAMFORGE_DB!,
    `UPDATE plexus_app_presence_leases
        SET last_sequence = ?,
            activity = ?,
            timer_entry_id = ?,
            timer_project_id = ?,
            timer_started_at = ?,
            last_seen_at = ?,
            expires_at = ?,
            updated_at = ?
      WHERE workspace_id = ?
        AND identity_id = ?
        AND client_instance_id = ?
        AND presence_session_id = ?
        AND expires_at > ?
        AND last_sequence < ?`,
    sequence,
    activity.state,
    activity.timerEntryId,
    activity.projectId,
    activity.timerStartedAt,
    observedAt,
    expiresAt,
    observedAt,
    principal!.workspaceId,
    principal!.identityId,
    clientInstanceId,
    presenceSessionId,
    observedAt,
    sequence,
  );
  if (changes !== 1) {
    const current = await queryFirst<{ presence_session_id: string; expires_at: string; last_sequence: number }>(
      env.TEAMFORGE_DB!,
      `SELECT presence_session_id, expires_at, last_sequence
         FROM plexus_app_presence_leases
        WHERE workspace_id = ? AND identity_id = ? AND client_instance_id = ?
        LIMIT 1`,
      principal!.workspaceId,
      principal!.identityId,
      clientInstanceId,
    );
    if (!current || current.presence_session_id !== presenceSessionId || current.expires_at <= observedAt) {
      return presenceError("presence_session_stale", "Presence session is not current and fresh.", 409);
    }
    return presenceError("presence_sequence_stale", "Heartbeat sequence must be greater than the current sequence.", 409);
  }

  return presenceOk({ accepted: true, sequence, lastSeenAt: observedAt, expiresAt });
}

function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function publicRoomKind(roomKind: string | null): "lounge" | "project" {
  return roomKind === "workspace_lobby" ? "lounge" : "project";
}

function newest(rows: PresenceLeaseRow[], field: "last_seen_at" | "expires_at" | "room_observed_at"): PresenceLeaseRow {
  return [...rows].sort((a, b) => {
    const byTime = String(b[field] ?? "").localeCompare(String(a[field] ?? ""));
    return byTime || a.client_instance_id.localeCompare(b.client_instance_id);
  })[0];
}

export async function handleGetPresence(
  env: Env,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbFailure = requireDb(env);
  if (dbFailure) return dbFailure;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const identityFailure = await canonicalIdentityFailure(env, principal!);
  if (identityFailure) return identityFailure;
  const { observedAt } = serverTime();
  const rows = await queryAll<PresenceLeaseRow>(
    env.TEAMFORGE_DB!,
    `SELECT l.*, i.employee_id, i.display_name,
            r.name AS room_name, rp.name AS room_project_name
       FROM plexus_app_presence_leases l
       JOIN plexus_identities i
         ON i.id = l.identity_id AND i.workspace_id = l.workspace_id
       LEFT JOIN employees e
         ON e.id = i.employee_id AND e.workspace_id = i.workspace_id
       LEFT JOIN realtime_rooms r
         ON r.id = l.room_id AND r.workspace_id = l.workspace_id
       LEFT JOIN projects rp
         ON rp.id = l.room_project_id AND rp.workspace_id = l.workspace_id
      WHERE l.workspace_id = ?
        AND l.expires_at > ?
        AND i.is_active = 1
        AND (i.role = 'admin' OR (i.employee_id IS NOT NULL AND e.is_active = 1))
      ORDER BY i.display_name, l.identity_id, l.last_seen_at DESC, l.client_instance_id`,
    principal!.workspaceId,
    observedAt,
  );

  const grouped = new Map<string, PresenceLeaseRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.identity_id) ?? [];
    group.push(row);
    grouped.set(row.identity_id, group);
  }
  const members = [...grouped.values()].map((clients) => {
    const lastSeen = newest(clients, "last_seen_at");
    const expiry = newest(clients, "expires_at");
    const focusedClients = clients.filter((client) => client.activity === "focused");
    const activitySource = focusedClients.length ? newest(focusedClients, "last_seen_at") : lastSeen;
    const roomClients = clients.filter((client) => client.room_observed_at !== null);
    const roomSource = roomClients.length ? newest(roomClients, "room_observed_at") : null;
    return {
      identityId: lastSeen.identity_id,
      employeeId: lastSeen.employee_id,
      displayName: lastSeen.display_name,
      initials: initials(lastSeen.display_name),
      activity: {
        state: activitySource.activity,
        timerEntryId: activitySource.timer_entry_id,
        projectId: activitySource.timer_project_id,
        timerStartedAt: activitySource.timer_started_at,
      },
      room: roomSource
        ? {
          kind: publicRoomKind(roomSource.room_kind),
          roomId: roomSource.room_id,
          roomName: roomSource.room_name,
          projectId: roomSource.room_project_id,
          projectName: roomSource.room_project_name,
          callId: roomSource.call_session_id,
          participantId: roomSource.participant_id,
        }
        : null,
      lastSeenAt: lastSeen.last_seen_at,
      expiresAt: expiry.expires_at,
      activeClientCount: clients.length,
      presenceProof: "authenticated_app_lease" as const,
      observedAt,
    };
  });
  return presenceOk({ members, observedAt });
}

export async function handleDeletePresenceSession(
  env: Env,
  clientInstanceIdValue: string,
  presenceSessionIdValue: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbFailure = requireDb(env);
  if (dbFailure) return dbFailure;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const clientInstanceId = boundedString(clientInstanceIdValue);
  const presenceSessionId = boundedString(presenceSessionIdValue);
  if (!clientInstanceId || !presenceSessionId) {
    return presenceError("presence_disconnect_invalid", "Client and presence session IDs must contain 1 to 128 characters.", 400);
  }
  const changes = await executeChanges(
    env.TEAMFORGE_DB!,
    `DELETE FROM plexus_app_presence_leases
      WHERE workspace_id = ? AND identity_id = ? AND client_instance_id = ? AND presence_session_id = ?`,
    principal!.workspaceId,
    principal!.identityId,
    clientInstanceId,
    presenceSessionId,
  );
  if (changes !== 1) {
    return presenceError("presence_session_stale", "Presence session is not current.", 409);
  }
  return presenceOk({ disconnected: true });
}
