import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";
import type { PlexusPrincipal } from "../lib/plexus-session";

type RoomType = "workspace_lobby" | "project_room" | "ad_hoc";
type RoomState = "open" | "archived";
type CallState = "live" | "ended" | "failed";
type ParticipantRole = "host" | "participant" | "viewer" | "agent_observer";
type ParticipantState = "joined" | "left" | "removed";
type TrackKind = "audio" | "camera" | "screen";
type TrackDirection = "publish" | "subscribe";
type TrackState = "live" | "closed" | "failed";

interface ProjectLiteRow {
  id: string;
  name: string;
  slug: string | null;
  workspace_id: string;
  status: string;
}

interface RealtimeRoomRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  project_name?: string | null;
  name: string;
  slug: string;
  room_type: RoomType;
  state: RoomState;
  visibility: string;
  created_by_identity_id: string | null;
  active_call_id: string | null;
  metadata_json: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

interface RealtimeCallRow {
  id: string;
  workspace_id: string;
  room_id: string;
  project_id: string | null;
  state: CallState;
  created_by_identity_id: string;
  meeting_record_id: string | null;
  provider: string;
  metadata_json: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RealtimeParticipantRow {
  id: string;
  workspace_id: string;
  room_id: string;
  call_session_id: string;
  identity_id: string;
  employee_id: string | null;
  display_name: string;
  role: ParticipantRole;
  state: ParticipantState;
  client_instance_id: string;
  cloudflare_session_id: string | null;
  audio_enabled: number;
  video_enabled: number;
  screen_share_enabled: number;
  joined_at: string;
  left_at: string | null;
  last_seen_at: string;
  metadata_json: string | null;
}

interface RealtimeTrackRow {
  id: string;
  workspace_id: string;
  room_id: string;
  call_session_id: string;
  participant_id: string;
  identity_id: string;
  track_kind: TrackKind;
  direction: TrackDirection;
  state: TrackState;
  label: string | null;
  source_id: string | null;
  cloudflare_session_id: string | null;
  cloudflare_track_id: string | null;
  target_track_ids_json: string | null;
  metadata_json: string | null;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
}

interface RealtimeMeetingRow {
  id: string;
  workspace_id: string;
  room_id: string;
  call_session_id: string;
  project_id: string | null;
  time_entry_id: string | null;
  title: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  manual_notes: string;
  decisions_json: string | null;
  action_items_json: string | null;
  participant_snapshot_json: string | null;
  linked_time_entry_ids_json: string | null;
  linked_issue_ids_json: string | null;
  screen_share_summary_json: string | null;
  paperclip_status: string;
  paperclip_payload_json: string | null;
  paperclip_artifact_ref: string | null;
  transcript_ref: string | null;
  recording_ref: string | null;
  created_by_identity_id: string;
  created_at: string;
  updated_at: string;
}

interface JsonReadResult<T> {
  body?: T;
  response?: Response;
}

interface JoinBody {
  clientInstanceId?: string;
  intent?: "presence_only" | "media";
  sessionDescription?: unknown;
  media?: {
    audio?: boolean;
    video?: boolean;
    screen?: boolean;
  };
}

interface TrackBody {
  participantId?: string;
  trackKind?: TrackKind;
  direction?: TrackDirection;
  sdp?: string;
  label?: string;
  sourceId?: string | null;
  cloudflareSessionId?: string | null;
  cloudflareTrackId?: string | null;
  targetTrackIds?: string[];
  metadata?: Record<string, unknown>;
}

interface CloseoutBody {
  title?: string;
  manualNotes?: string;
  decisions?: unknown[];
  actionItems?: unknown[];
  linkedTimeEntryIds?: string[];
  linkedIssueIds?: string[];
  timeEntryId?: string | null;
  sendToPaperclip?: boolean;
}

const STUN_URLS = ["stun:stun.cloudflare.com:3478"];

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `room-${nanoid().slice(0, 8)}`;
}

function stableRoomId(prefix: string, id: string): string {
  return `room_${prefix}_${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function resolveWorkspaceId(principal: PlexusPrincipal | null | undefined, candidate?: string | null): string | null {
  return principal?.workspaceId ?? candidate?.trim() ?? null;
}

async function readJson<T>(request: Request): Promise<JsonReadResult<T>> {
  try {
    return { body: (await request.json()) as T };
  } catch {
    return {
      response: jsonError(
        { code: "invalid_json", message: "Request body must be valid JSON.", retryable: false },
        400,
      ),
    };
  }
}

function missingDb(env: Env): Response | null {
  if (env.TEAMFORGE_DB) return null;
  return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
}

function requirePrincipal(principal: PlexusPrincipal | null | undefined): Response | null {
  if (principal) return null;
  return jsonError(
    { code: "access_identity_required", message: "Registered Cloudflare Access identity required.", retryable: false },
    401,
  );
}

function mapRoom(row: RealtimeRoomRow, presence: { participants: number; screenShares: number }, activeCall: RealtimeCallRow | null) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    name: row.name,
    slug: row.slug,
    roomType: row.room_type,
    state: row.state,
    visibility: row.visibility,
    activeCallId: activeCall?.id ?? null,
    activeCall: activeCall ? mapCall(activeCall) : null,
    presence,
    metadata: safeJsonParse(row.metadata_json, {}),
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCall(row: RealtimeCallRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    projectId: row.project_id,
    state: row.state,
    createdByIdentityId: row.created_by_identity_id,
    meetingRecordId: row.meeting_record_id,
    provider: row.provider,
    metadata: safeJsonParse(row.metadata_json, {}),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapParticipant(row: RealtimeParticipantRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    callSessionId: row.call_session_id,
    identityId: row.identity_id,
    employeeId: row.employee_id,
    displayName: row.display_name,
    role: row.role,
    state: row.state,
    clientInstanceId: row.client_instance_id,
    cloudflareSessionId: row.cloudflare_session_id,
    media: {
      audio: Boolean(row.audio_enabled),
      video: Boolean(row.video_enabled),
      screen: Boolean(row.screen_share_enabled),
    },
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    lastSeenAt: row.last_seen_at,
    metadata: safeJsonParse(row.metadata_json, {}),
  };
}

function mapTrack(row: RealtimeTrackRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    callSessionId: row.call_session_id,
    participantId: row.participant_id,
    identityId: row.identity_id,
    trackKind: row.track_kind,
    direction: row.direction,
    state: row.state,
    label: row.label,
    sourceId: row.source_id,
    cloudflareSessionId: row.cloudflare_session_id,
    cloudflareTrackId: row.cloudflare_track_id,
    targetTrackIds: safeJsonParse<string[]>(row.target_track_ids_json, []),
    metadata: safeJsonParse(row.metadata_json, {}),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    updatedAt: row.updated_at,
  };
}

function mapMeeting(row: RealtimeMeetingRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    callSessionId: row.call_session_id,
    projectId: row.project_id,
    timeEntryId: row.time_entry_id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    manualNotes: row.manual_notes,
    decisions: safeJsonParse<unknown[]>(row.decisions_json, []),
    actionItems: safeJsonParse<unknown[]>(row.action_items_json, []),
    participantSnapshot: safeJsonParse<unknown[]>(row.participant_snapshot_json, []),
    linkedTimeEntryIds: safeJsonParse<string[]>(row.linked_time_entry_ids_json, []),
    linkedIssueIds: safeJsonParse<string[]>(row.linked_issue_ids_json, []),
    screenShareSummary: safeJsonParse<unknown[]>(row.screen_share_summary_json, []),
    paperclipStatus: row.paperclip_status,
    paperclipPayload: safeJsonParse(row.paperclip_payload_json, {}),
    paperclipArtifactRef: row.paperclip_artifact_ref,
    transcriptRef: row.transcript_ref,
    recordingRef: row.recording_ref,
    createdByIdentityId: row.created_by_identity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function appendEvent(
  env: Env,
  workspaceId: string,
  roomId: string | null,
  callSessionId: string | null,
  actorIdentityId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO realtime_events
       (id, workspace_id, room_id, call_session_id, actor_identity_id, event_type, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    `rte_${nanoid()}`,
    workspaceId,
    roomId,
    callSessionId,
    actorIdentityId,
    eventType,
    stringifyJson(payload),
    now(),
  );
}

async function ensureDefaultRooms(env: Env, workspaceId: string, actorIdentityId?: string | null): Promise<void> {
  const ts = now();
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT OR IGNORE INTO realtime_rooms
       (id, workspace_id, project_id, name, slug, room_type, state, visibility, created_by_identity_id,
        active_call_id, metadata_json, last_activity_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'workspace_lobby', 'open', 'workspace', ?, NULL, '{}', ?, ?, ?)`,
    stableRoomId("workspace", workspaceId),
    workspaceId,
    "Workspace Lobby",
    "workspace-lobby",
    actorIdentityId ?? null,
    ts,
    ts,
    ts,
  );

  const projects = await queryAll<ProjectLiteRow>(
    env.TEAMFORGE_DB!,
    `SELECT id, workspace_id, name, slug, status FROM projects
     WHERE workspace_id = ? AND status = 'active'
     ORDER BY name LIMIT 100`,
    workspaceId,
  );

  for (const project of projects) {
    const roomId = stableRoomId("project", project.id);
    await execute(
      env.TEAMFORGE_DB!,
      `INSERT OR IGNORE INTO realtime_rooms
         (id, workspace_id, project_id, name, slug, room_type, state, visibility, created_by_identity_id,
          active_call_id, metadata_json, last_activity_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'project_room', 'open', 'project', ?, NULL, ?, ?, ?, ?)`,
      roomId,
      workspaceId,
      project.id,
      project.name,
      project.slug ? `project-${project.slug}` : slugify(project.name),
      actorIdentityId ?? null,
      stringifyJson({ source: "project_catalog" }),
      ts,
      ts,
      ts,
    );
  }
}

async function getRoom(env: Env, workspaceId: string, roomId: string): Promise<RealtimeRoomRow | null> {
  return queryFirst<RealtimeRoomRow>(
    env.TEAMFORGE_DB!,
    `SELECT r.*, p.name AS project_name
     FROM realtime_rooms r
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.workspace_id = ? AND r.id = ?
     LIMIT 1`,
    workspaceId,
    roomId,
  );
}

async function getCall(env: Env, workspaceId: string, callId: string): Promise<RealtimeCallRow | null> {
  return queryFirst<RealtimeCallRow>(
    env.TEAMFORGE_DB!,
    `SELECT * FROM realtime_call_sessions
     WHERE workspace_id = ? AND id = ?
     LIMIT 1`,
    workspaceId,
    callId,
  );
}

async function getActiveCall(env: Env, roomId: string): Promise<RealtimeCallRow | null> {
  return queryFirst<RealtimeCallRow>(
    env.TEAMFORGE_DB!,
    `SELECT * FROM realtime_call_sessions
     WHERE room_id = ? AND state = 'live'
     ORDER BY started_at DESC LIMIT 1`,
    roomId,
  );
}

async function getPresence(env: Env, callId: string | null): Promise<{ participants: number; screenShares: number }> {
  if (!callId) return { participants: 0, screenShares: 0 };
  const participants = await queryFirst<{ count: number }>(
    env.TEAMFORGE_DB!,
    "SELECT COUNT(*) AS count FROM realtime_participants WHERE call_session_id = ? AND state = 'joined'",
    callId,
  );
  const screens = await queryFirst<{ count: number }>(
    env.TEAMFORGE_DB!,
    "SELECT COUNT(*) AS count FROM realtime_media_tracks WHERE call_session_id = ? AND track_kind = 'screen' AND state = 'live'",
    callId,
  );
  return {
    participants: Number(participants?.count ?? 0),
    screenShares: Number(screens?.count ?? 0),
  };
}

async function roomPayload(env: Env, row: RealtimeRoomRow) {
  const activeCall = row.active_call_id
    ? await getCall(env, row.workspace_id, row.active_call_id)
    : await getActiveCall(env, row.id);
  const presence = await getPresence(env, activeCall?.id ?? null);
  return mapRoom(row, presence, activeCall);
}

async function listParticipants(env: Env, callId: string): Promise<RealtimeParticipantRow[]> {
  return queryAll<RealtimeParticipantRow>(
    env.TEAMFORGE_DB!,
    `SELECT * FROM realtime_participants
     WHERE call_session_id = ?
     ORDER BY state = 'joined' DESC, joined_at ASC`,
    callId,
  );
}

async function listTracks(env: Env, callId: string): Promise<RealtimeTrackRow[]> {
  return queryAll<RealtimeTrackRow>(
    env.TEAMFORGE_DB!,
    `SELECT * FROM realtime_media_tracks
     WHERE call_session_id = ?
     ORDER BY state = 'live' DESC, started_at ASC`,
    callId,
  );
}

async function createCloudflareSession(env: Env, sessionDescription: unknown): Promise<Record<string, unknown>> {
  const appId = env.CF_REALTIME_APP_ID;
  const token = env.CF_REALTIME_API_TOKEN ?? env.CF_REALTIME_APP_TOKEN;
  if (!appId || !token || !sessionDescription) {
    return {
      configured: Boolean(appId && token),
      appId: appId ?? null,
      sessionId: null,
      sessionDescription: null,
      stunUrls: STUN_URLS,
      negotiation: sessionDescription ? "provider_unavailable" : "client_offer_required",
    };
  }

  const base = (env.CF_REALTIME_API_BASE_URL ?? "https://rtc.live.cloudflare.com").replace(/\/+$/, "");
  const endpoint = `${base}/v1/apps/${encodeURIComponent(appId)}/sessions/new`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ sessionDescription }),
  });
  const providerBody = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) {
    const message = typeof providerBody?.message === "string" ? providerBody.message : `Cloudflare Realtime responded ${res.status}.`;
    throw new Error(message);
  }
  return {
    configured: true,
    appId,
    sessionId: providerBody?.sessionId ?? providerBody?.id ?? null,
    sessionDescription: providerBody?.sessionDescription ?? null,
    stunUrls: STUN_URLS,
    negotiation: "session_created",
  };
}

export async function handleGetRealtimeRooms(
  env: Env,
  url: URL,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;

  const workspaceId = resolveWorkspaceId(principal, url.searchParams.get("workspace_id"));
  if (!workspaceId) {
    return jsonError({ code: "missing_workspace", message: "workspace_id is required.", retryable: false }, 400);
  }

  await ensureDefaultRooms(env, workspaceId, principal?.identityId);

  const includeArchived = principal?.role === "admin" && url.searchParams.get("includeArchived") === "true";
  const projectId = url.searchParams.get("projectId") ?? url.searchParams.get("project_id");
  const clauses = ["r.workspace_id = ?"];
  const params: unknown[] = [workspaceId];
  if (!includeArchived) clauses.push("r.state = 'open'");
  if (projectId) {
    clauses.push("r.project_id = ?");
    params.push(projectId);
  }

  const rows = await queryAll<RealtimeRoomRow>(
    env.TEAMFORGE_DB!,
    `SELECT r.*, p.name AS project_name
     FROM realtime_rooms r
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY r.room_type = 'workspace_lobby' DESC, COALESCE(p.name, r.name) ASC
     LIMIT 200`,
    ...params,
  );

  const rooms = [];
  for (const row of rows) rooms.push(await roomPayload(env, row));
  return jsonOk({ rooms, total: rooms.length });
}

export async function handlePostRealtimeRoom(
  env: Env,
  request: Request,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  if (principal!.role !== "admin") {
    return jsonError({ code: "realtime_room_forbidden", message: "Admin role required to create ad-hoc rooms.", retryable: false }, 403);
  }

  const parsed = await readJson<{ projectId?: string | null; name?: string; roomType?: RoomType; metadata?: Record<string, unknown> }>(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body!;
  const name = body.name?.trim();
  if (!name) {
    return jsonError({ code: "realtime_room_invalid", message: "Room name is required.", retryable: false }, 400);
  }

  const workspaceId = principal!.workspaceId;
  const roomType = body.roomType ?? (body.projectId ? "project_room" : "ad_hoc");
  const project = body.projectId
    ? await queryFirst<ProjectLiteRow>(
      env.TEAMFORGE_DB!,
      "SELECT id, workspace_id, name, slug, status FROM projects WHERE id = ? LIMIT 1",
      body.projectId,
    )
    : null;
  if (body.projectId && project?.workspace_id !== workspaceId) {
    return jsonError({ code: "realtime_project_not_visible", message: "Project is not visible in this workspace.", retryable: false }, 404);
  }

  const ts = now();
  const roomId = `room_${nanoid()}`;
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO realtime_rooms
       (id, workspace_id, project_id, name, slug, room_type, state, visibility, created_by_identity_id,
        active_call_id, metadata_json, last_activity_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, ?, ?, ?, ?)`,
    roomId,
    workspaceId,
    project?.id ?? null,
    name,
    slugify(name),
    roomType,
    project ? "project" : "workspace",
    principal!.identityId,
    stringifyJson(body.metadata ?? {}),
    ts,
    ts,
    ts,
  );
  await appendEvent(env, workspaceId, roomId, null, principal!.identityId, "room_created", { roomType });

  const row = await getRoom(env, workspaceId, roomId);
  return jsonOk({ room: row ? await roomPayload(env, row) : null }, { status: 201 });
}

export async function handleGetRealtimeRoom(
  env: Env,
  roomId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const workspaceId = resolveWorkspaceId(principal, null);
  if (!workspaceId) return requirePrincipal(principal)!;

  const room = await getRoom(env, workspaceId, roomId);
  if (!room) {
    return jsonError({ code: "not_found", message: "Realtime room not found.", retryable: false }, 404);
  }

  const activeCall = room.active_call_id ? await getCall(env, workspaceId, room.active_call_id) : await getActiveCall(env, room.id);
  const participants = activeCall ? (await listParticipants(env, activeCall.id)).map(mapParticipant) : [];
  const tracks = activeCall ? (await listTracks(env, activeCall.id)).map(mapTrack) : [];
  return jsonOk({
    room: await roomPayload(env, room),
    call: activeCall ? mapCall(activeCall) : null,
    participants,
    tracks,
  });
}

export async function handleJoinRealtimeRoom(
  env: Env,
  request: Request,
  roomId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;

  const parsed = await readJson<JoinBody>(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const workspaceId = principal!.workspaceId;
  const room = await getRoom(env, workspaceId, roomId);
  if (!room) {
    return jsonError({ code: "not_found", message: "Realtime room not found.", retryable: false }, 404);
  }
  if (room.state !== "open") {
    return jsonError({ code: "realtime_room_closed", message: "Realtime room is closed.", retryable: false }, 409);
  }

  const ts = now();
  let call = await getActiveCall(env, room.id);
  if (!call) {
    const callId = `call_${nanoid()}`;
    await execute(
      env.TEAMFORGE_DB!,
      `INSERT INTO realtime_call_sessions
         (id, workspace_id, room_id, project_id, state, created_by_identity_id, meeting_record_id,
          provider, metadata_json, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'live', ?, NULL, 'cloudflare_realtime', '{}', ?, NULL, ?, ?)`,
      callId,
      workspaceId,
      room.id,
      room.project_id,
      principal!.identityId,
      ts,
      ts,
      ts,
    );
    await execute(
      env.TEAMFORGE_DB!,
      "UPDATE realtime_rooms SET active_call_id = ?, last_activity_at = ?, updated_at = ? WHERE id = ?",
      callId,
      ts,
      ts,
      room.id,
    );
    await appendEvent(env, workspaceId, room.id, callId, principal!.identityId, "call_started", {});
    call = await getCall(env, workspaceId, callId);
  }
  if (!call) {
    return jsonError({ code: "realtime_join_denied", message: "Unable to create realtime call.", retryable: true }, 500);
  }

  let cloudflare: Record<string, unknown>;
  try {
    cloudflare = await createCloudflareSession(env, body.sessionDescription);
  } catch (error) {
    return jsonError(
      { code: "realtime_provider_unavailable", message: error instanceof Error ? error.message : "Cloudflare Realtime unavailable.", retryable: true },
      502,
    );
  }

  const clientInstanceId = body.clientInstanceId?.trim() || `client_${nanoid()}`;
  const existingParticipant = await queryFirst<RealtimeParticipantRow>(
    env.TEAMFORGE_DB!,
    `SELECT * FROM realtime_participants
     WHERE call_session_id = ? AND identity_id = ? AND client_instance_id = ?
     LIMIT 1`,
    call.id,
    principal!.identityId,
    clientInstanceId,
  );
  const participantId = existingParticipant?.id ?? `rtp_${nanoid()}`;
  const cloudflareSessionId = typeof cloudflare.sessionId === "string" ? cloudflare.sessionId : existingParticipant?.cloudflare_session_id ?? null;
  const role: ParticipantRole = call.created_by_identity_id === principal!.identityId ? "host" : "participant";
  const media = body.media ?? {};
  if (existingParticipant) {
    await execute(
      env.TEAMFORGE_DB!,
      `UPDATE realtime_participants
       SET state = 'joined', left_at = NULL, cloudflare_session_id = ?,
           audio_enabled = ?, video_enabled = ?, screen_share_enabled = ?,
           last_seen_at = ?, metadata_json = ?
       WHERE id = ?`,
      cloudflareSessionId,
      media.audio ? 1 : existingParticipant.audio_enabled,
      media.video ? 1 : existingParticipant.video_enabled,
      media.screen ? 1 : existingParticipant.screen_share_enabled,
      ts,
      stringifyJson({ intent: body.intent ?? "media" }),
      participantId,
    );
  } else {
    await execute(
      env.TEAMFORGE_DB!,
      `INSERT INTO realtime_participants
         (id, workspace_id, room_id, call_session_id, identity_id, employee_id, display_name, role, state,
          client_instance_id, cloudflare_session_id, audio_enabled, video_enabled, screen_share_enabled,
          joined_at, left_at, last_seen_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'joined', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      participantId,
      workspaceId,
      room.id,
      call.id,
      principal!.identityId,
      principal!.employeeId,
      principal!.displayName,
      role,
      clientInstanceId,
      cloudflareSessionId,
      media.audio ? 1 : 0,
      media.video ? 1 : 0,
      media.screen ? 1 : 0,
      ts,
      ts,
      stringifyJson({ intent: body.intent ?? "media" }),
    );
  }

  await appendEvent(env, workspaceId, room.id, call.id, principal!.identityId, "participant_joined", {
    participantId,
    clientInstanceId,
    intent: body.intent ?? "media",
  });

  const participant = await queryFirst<RealtimeParticipantRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_participants WHERE id = ? LIMIT 1",
    participantId,
  );
  const refreshedRoom = await getRoom(env, workspaceId, room.id);
  return jsonOk({
    room: refreshedRoom ? await roomPayload(env, refreshedRoom) : await roomPayload(env, room),
    call: mapCall(call),
    participant: participant ? mapParticipant(participant) : null,
    cloudflare,
  }, { status: 201 });
}

export async function handlePostRealtimeTrack(
  env: Env,
  request: Request,
  callId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;

  const parsed = await readJson<TrackBody>(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const workspaceId = principal!.workspaceId;
  const call = await getCall(env, workspaceId, callId);
  if (!call || call.state !== "live") {
    return jsonError({ code: "realtime_track_stale", message: "Live realtime call not found.", retryable: false }, 404);
  }

  const trackKind = body.trackKind;
  if (trackKind !== "audio" && trackKind !== "camera" && trackKind !== "screen") {
    return jsonError({ code: "realtime_track_forbidden", message: "trackKind must be audio, camera, or screen.", retryable: false }, 400);
  }

  const participant = body.participantId
    ? await queryFirst<RealtimeParticipantRow>(
      env.TEAMFORGE_DB!,
      "SELECT * FROM realtime_participants WHERE id = ? AND call_session_id = ? LIMIT 1",
      body.participantId,
      call.id,
    )
    : await queryFirst<RealtimeParticipantRow>(
      env.TEAMFORGE_DB!,
      `SELECT * FROM realtime_participants
       WHERE call_session_id = ? AND identity_id = ? AND state = 'joined'
       ORDER BY joined_at DESC LIMIT 1`,
      call.id,
      principal!.identityId,
    );

  if (!participant || participant.identity_id !== principal!.identityId || participant.state !== "joined") {
    return jsonError({ code: "realtime_track_forbidden", message: "Cannot publish tracks for this participant.", retryable: false }, 403);
  }

  const trackId = `trk_${nanoid()}`;
  const ts = now();
  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO realtime_media_tracks
       (id, workspace_id, room_id, call_session_id, participant_id, identity_id, track_kind, direction, state,
        label, source_id, cloudflare_session_id, cloudflare_track_id, target_track_ids_json, metadata_json,
        started_at, ended_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    trackId,
    workspaceId,
    call.room_id,
    call.id,
    participant.id,
    principal!.identityId,
    trackKind,
    body.direction ?? "publish",
    body.label ?? null,
    body.sourceId ?? null,
    body.cloudflareSessionId ?? participant.cloudflare_session_id,
    body.cloudflareTrackId ?? null,
    stringifyJson(body.targetTrackIds ?? []),
    stringifyJson(body.metadata ?? {}),
    ts,
    ts,
  );

  if (trackKind === "audio" || trackKind === "camera" || trackKind === "screen") {
    await execute(
      env.TEAMFORGE_DB!,
      `UPDATE realtime_participants
       SET audio_enabled = CASE WHEN ? = 'audio' THEN 1 ELSE audio_enabled END,
           video_enabled = CASE WHEN ? = 'camera' THEN 1 ELSE video_enabled END,
           screen_share_enabled = CASE WHEN ? = 'screen' THEN 1 ELSE screen_share_enabled END,
           last_seen_at = ?
       WHERE id = ?`,
      trackKind,
      trackKind,
      trackKind,
      ts,
      participant.id,
    );
  }

  await appendEvent(env, workspaceId, call.room_id, call.id, principal!.identityId, "track_published", {
    trackId,
    trackKind,
    direction: body.direction ?? "publish",
  });

  const track = await queryFirst<RealtimeTrackRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_media_tracks WHERE id = ? LIMIT 1",
    trackId,
  );
  return jsonOk({
    track: track ? mapTrack(track) : null,
    cloudflare: {
      appId: env.CF_REALTIME_APP_ID ?? null,
      stunUrls: STUN_URLS,
      negotiation: body.sdp ? "track_metadata_recorded" : "client_local_track_recorded",
    },
  }, { status: 201 });
}

export async function handleCloseRealtimeTrack(
  env: Env,
  callId: string,
  trackId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const workspaceId = principal!.workspaceId;
  const call = await getCall(env, workspaceId, callId);
  const track = await queryFirst<RealtimeTrackRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_media_tracks WHERE id = ? AND call_session_id = ? LIMIT 1",
    trackId,
    callId,
  );
  if (!call || !track) {
    return jsonError({ code: "realtime_track_stale", message: "Realtime track not found.", retryable: false }, 404);
  }
  if (track.identity_id !== principal!.identityId && principal!.role !== "admin" && call.created_by_identity_id !== principal!.identityId) {
    return jsonError({ code: "realtime_track_forbidden", message: "Cannot close another participant's track.", retryable: false }, 403);
  }

  const ts = now();
  await execute(
    env.TEAMFORGE_DB!,
    "UPDATE realtime_media_tracks SET state = 'closed', ended_at = ?, updated_at = ? WHERE id = ?",
    ts,
    ts,
    trackId,
  );
  await appendEvent(env, workspaceId, call.room_id, call.id, principal!.identityId, "track_closed", { trackId });
  const updated = await queryFirst<RealtimeTrackRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_media_tracks WHERE id = ? LIMIT 1",
    trackId,
  );
  return jsonOk({ track: updated ? mapTrack(updated) : null });
}

export async function handleLeaveRealtimeCall(
  env: Env,
  request: Request,
  callId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const parsed = await readJson<{ participantId?: string }>(request);
  if (parsed.response) return parsed.response;

  const workspaceId = principal!.workspaceId;
  const call = await getCall(env, workspaceId, callId);
  if (!call) {
    return jsonError({ code: "not_found", message: "Realtime call not found.", retryable: false }, 404);
  }
  const participant = parsed.body?.participantId
    ? await queryFirst<RealtimeParticipantRow>(
      env.TEAMFORGE_DB!,
      "SELECT * FROM realtime_participants WHERE id = ? AND call_session_id = ? LIMIT 1",
      parsed.body.participantId,
      callId,
    )
    : await queryFirst<RealtimeParticipantRow>(
      env.TEAMFORGE_DB!,
      `SELECT * FROM realtime_participants
       WHERE call_session_id = ? AND identity_id = ? AND state = 'joined'
       ORDER BY joined_at DESC LIMIT 1`,
      callId,
      principal!.identityId,
    );

  if (!participant || participant.identity_id !== principal!.identityId) {
    return jsonError({ code: "realtime_join_denied", message: "Participant is not joined to this call.", retryable: false }, 403);
  }

  const ts = now();
  await execute(
    env.TEAMFORGE_DB!,
    "UPDATE realtime_participants SET state = 'left', left_at = ?, last_seen_at = ? WHERE id = ?",
    ts,
    ts,
    participant.id,
  );
  await execute(
    env.TEAMFORGE_DB!,
    "UPDATE realtime_media_tracks SET state = 'closed', ended_at = ?, updated_at = ? WHERE call_session_id = ? AND participant_id = ? AND state = 'live'",
    ts,
    ts,
    callId,
    participant.id,
  );
  await appendEvent(env, workspaceId, call.room_id, call.id, principal!.identityId, "participant_left", {
    participantId: participant.id,
  });

  const remaining = await queryFirst<{ count: number }>(
    env.TEAMFORGE_DB!,
    "SELECT COUNT(*) AS count FROM realtime_participants WHERE call_session_id = ? AND state = 'joined'",
    callId,
  );
  let ended = false;
  if (Number(remaining?.count ?? 0) === 0) {
    ended = true;
    await execute(
      env.TEAMFORGE_DB!,
      "UPDATE realtime_call_sessions SET state = 'ended', ended_at = ?, updated_at = ? WHERE id = ?",
      ts,
      ts,
      callId,
    );
    await execute(
      env.TEAMFORGE_DB!,
      "UPDATE realtime_rooms SET active_call_id = NULL, last_activity_at = ?, updated_at = ? WHERE id = ?",
      ts,
      ts,
      call.room_id,
    );
    await appendEvent(env, workspaceId, call.room_id, call.id, principal!.identityId, "call_ended_empty", {});
  }

  return jsonOk({ left: true, ended });
}

export async function handleEndRealtimeCall(
  env: Env,
  callId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const workspaceId = principal!.workspaceId;
  const call = await getCall(env, workspaceId, callId);
  if (!call) {
    return jsonError({ code: "not_found", message: "Realtime call not found.", retryable: false }, 404);
  }
  if (principal!.role !== "admin" && call.created_by_identity_id !== principal!.identityId) {
    return jsonError({ code: "realtime_join_denied", message: "Only the host or admin can end the call.", retryable: false }, 403);
  }

  const ts = now();
  await execute(env.TEAMFORGE_DB!, "UPDATE realtime_participants SET state = 'left', left_at = ?, last_seen_at = ? WHERE call_session_id = ? AND state = 'joined'", ts, ts, callId);
  await execute(env.TEAMFORGE_DB!, "UPDATE realtime_media_tracks SET state = 'closed', ended_at = ?, updated_at = ? WHERE call_session_id = ? AND state = 'live'", ts, ts, callId);
  await execute(env.TEAMFORGE_DB!, "UPDATE realtime_call_sessions SET state = 'ended', ended_at = ?, updated_at = ? WHERE id = ?", ts, ts, callId);
  await execute(env.TEAMFORGE_DB!, "UPDATE realtime_rooms SET active_call_id = NULL, last_activity_at = ?, updated_at = ? WHERE id = ?", ts, ts, call.room_id);
  await appendEvent(env, workspaceId, call.room_id, call.id, principal!.identityId, "call_ended", {});
  return jsonOk({ ended: true });
}

export async function handleRealtimeCloseout(
  env: Env,
  request: Request,
  callId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const principalFailure = requirePrincipal(principal);
  if (principalFailure) return principalFailure;
  const parsed = await readJson<CloseoutBody>(request);
  if (parsed.response) return parsed.response;

  const body = parsed.body ?? {};
  const workspaceId = principal!.workspaceId;
  const call = await getCall(env, workspaceId, callId);
  if (!call) {
    return jsonError({ code: "not_found", message: "Realtime call not found.", retryable: false }, 404);
  }
  const room = await getRoom(env, workspaceId, call.room_id);
  if (!room) {
    return jsonError({ code: "not_found", message: "Realtime room not found.", retryable: false }, 404);
  }

  const participants = (await listParticipants(env, call.id)).map(mapParticipant);
  const tracks = (await listTracks(env, call.id)).map(mapTrack);
  const screenShareSummary = tracks
    .filter((track) => track.trackKind === "screen")
    .map((track) => ({
      trackId: track.id,
      participantId: track.participantId,
      label: track.label,
      startedAt: track.startedAt,
      endedAt: track.endedAt,
      state: track.state,
    }));

  const ts = now();
  const endedAt = call.ended_at ?? ts;
  const durationSeconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(call.started_at).getTime()) / 1000));
  const meetingId = call.meeting_record_id ?? `meet_${nanoid()}`;
  const paperclipPayload = body.sendToPaperclip
    ? {
      kind: "realtime_meeting_memory",
      callSessionId: call.id,
      roomId: room.id,
      projectId: room.project_id,
      title: body.title ?? room.name,
      manualNotes: body.manualNotes ?? "",
      decisions: body.decisions ?? [],
      actionItems: body.actionItems ?? [],
      linkedIssueIds: body.linkedIssueIds ?? [],
      linkedTimeEntryIds: body.linkedTimeEntryIds ?? [],
      participants,
      transcriptIncluded: false,
    }
    : {};

  await execute(
    env.TEAMFORGE_DB!,
    `INSERT INTO realtime_meeting_records
       (id, workspace_id, room_id, call_session_id, project_id, time_entry_id, title, started_at, ended_at,
        duration_seconds, manual_notes, decisions_json, action_items_json, participant_snapshot_json,
        linked_time_entry_ids_json, linked_issue_ids_json, screen_share_summary_json, paperclip_status,
        paperclip_payload_json, paperclip_artifact_ref, transcript_ref, recording_ref, created_by_identity_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
     ON CONFLICT(call_session_id) DO UPDATE SET
       time_entry_id = excluded.time_entry_id,
       title = excluded.title,
       ended_at = excluded.ended_at,
       duration_seconds = excluded.duration_seconds,
       manual_notes = excluded.manual_notes,
       decisions_json = excluded.decisions_json,
       action_items_json = excluded.action_items_json,
       participant_snapshot_json = excluded.participant_snapshot_json,
       linked_time_entry_ids_json = excluded.linked_time_entry_ids_json,
       linked_issue_ids_json = excluded.linked_issue_ids_json,
       screen_share_summary_json = excluded.screen_share_summary_json,
       paperclip_status = excluded.paperclip_status,
       paperclip_payload_json = excluded.paperclip_payload_json,
       transcript_ref = NULL,
       recording_ref = NULL,
       updated_at = excluded.updated_at`,
    meetingId,
    workspaceId,
    room.id,
    call.id,
    room.project_id,
    body.timeEntryId ?? null,
    body.title?.trim() || room.name,
    call.started_at,
    endedAt,
    durationSeconds,
    body.manualNotes ?? "",
    stringifyJson(body.decisions ?? []),
    stringifyJson(body.actionItems ?? []),
    stringifyJson(participants),
    stringifyJson(body.linkedTimeEntryIds ?? []),
    stringifyJson(body.linkedIssueIds ?? []),
    stringifyJson(screenShareSummary),
    body.sendToPaperclip ? "queued" : "not_requested",
    stringifyJson(paperclipPayload),
    principal!.identityId,
    ts,
    ts,
  );
  await execute(
    env.TEAMFORGE_DB!,
    "UPDATE realtime_call_sessions SET meeting_record_id = ?, updated_at = ? WHERE id = ?",
    meetingId,
    ts,
    call.id,
  );
  await appendEvent(env, workspaceId, room.id, call.id, principal!.identityId, "meeting_closeout_saved", {
    meetingId,
    sendToPaperclip: Boolean(body.sendToPaperclip),
    transcriptIncluded: false,
  });

  const meeting = await queryFirst<RealtimeMeetingRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_meeting_records WHERE id = ? LIMIT 1",
    meetingId,
  );
  return jsonOk({ meeting: meeting ? mapMeeting(meeting) : null });
}

export async function handleGetRealtimeMeeting(
  env: Env,
  meetingId: string,
  principal?: PlexusPrincipal | null,
): Promise<Response> {
  const dbUnavailable = missingDb(env);
  if (dbUnavailable) return dbUnavailable;
  const workspaceId = resolveWorkspaceId(principal, null);
  if (!workspaceId) return requirePrincipal(principal)!;

  const meeting = await queryFirst<RealtimeMeetingRow>(
    env.TEAMFORGE_DB!,
    "SELECT * FROM realtime_meeting_records WHERE id = ? AND workspace_id = ? LIMIT 1",
    meetingId,
    workspaceId,
  );
  if (!meeting) {
    return jsonError({ code: "not_found", message: "Realtime meeting not found.", retryable: false }, 404);
  }
  return jsonOk({ meeting: mapMeeting(meeting) });
}
