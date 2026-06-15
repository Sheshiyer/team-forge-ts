import { describe, expect, it } from "vitest";
import type { Env } from "../../lib/env";
import type { PlexusPrincipal } from "../../lib/plexus-session";
import { handleV1Request } from "../v1";
import {
  handleGetRealtimeRooms,
  handleJoinRealtimeRoom,
  handleLeaveRealtimeCall,
  handlePostRealtimeTrack,
  handleRealtimeCloseout,
} from "../realtime.ts";

interface Row {
  [key: string]: unknown;
}

function makePrincipal(role: "employee" | "admin" = "admin"): PlexusPrincipal {
  return {
    identityId: "pid_test",
    email: "member@example.com",
    displayName: "Member Test",
    workspaceId: "ws_test",
    role,
    projectVisibility: role === "admin" ? "all" : "active",
    employeeId: "emp_test",
    capabilities: {},
  };
}

function makeReq(path: string, body: unknown): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRealtimeDb() {
  const projects: Row[] = [
    { id: "proj_alpha", workspace_id: "ws_test", name: "Alpha Project", slug: "alpha", status: "active" },
  ];
  const rooms: Row[] = [];
  const calls: Row[] = [];
  const participants: Row[] = [];
  const tracks: Row[] = [];
  const meetings: Row[] = [];
  const events: Row[] = [];

  function rowWithProject(room: Row): Row {
    const project = projects.find((item) => item.id === room.project_id);
    return { ...room, project_name: project?.name ?? null };
  }

  function first(sql: string, args: unknown[]): Row | null {
    if (sql.includes("SELECT id, workspace_id, name, slug, status FROM projects WHERE id")) {
      return projects.find((project) => project.id === args[0]) ?? null;
    }
    if (sql.includes("FROM realtime_rooms r") && sql.includes("WHERE r.workspace_id = ? AND r.id = ?")) {
      const room = rooms.find((item) => item.workspace_id === args[0] && item.id === args[1]);
      return room ? rowWithProject(room) : null;
    }
    if (sql.includes("FROM realtime_call_sessions") && sql.includes("WHERE workspace_id = ? AND id = ?")) {
      return calls.find((call) => call.workspace_id === args[0] && call.id === args[1]) ?? null;
    }
    if (sql.includes("FROM realtime_call_sessions") && sql.includes("WHERE room_id = ? AND state = 'live'")) {
      return [...calls].reverse().find((call) => call.room_id === args[0] && call.state === "live") ?? null;
    }
    if (sql.includes("COUNT(*) AS count FROM realtime_participants")) {
      return { count: participants.filter((participant) => participant.call_session_id === args[0] && participant.state === "joined").length };
    }
    if (sql.includes("COUNT(*) AS count FROM realtime_media_tracks")) {
      return {
        count: tracks.filter((track) => track.call_session_id === args[0] && track.track_kind === "screen" && track.state === "live").length,
      };
    }
    if (sql.includes("WHERE call_session_id = ? AND identity_id = ? AND client_instance_id = ?")) {
      return participants.find((participant) => participant.call_session_id === args[0] && participant.identity_id === args[1] && participant.client_instance_id === args[2]) ?? null;
    }
    if (sql.includes("SELECT * FROM realtime_participants WHERE id = ? AND call_session_id = ?")) {
      return participants.find((participant) => participant.id === args[0] && participant.call_session_id === args[1]) ?? null;
    }
    if (sql.includes("SELECT * FROM realtime_participants WHERE id = ? LIMIT 1")) {
      return participants.find((participant) => participant.id === args[0]) ?? null;
    }
    if (sql.includes("WHERE call_session_id = ? AND identity_id = ? AND state = 'joined'")) {
      return [...participants].reverse().find((participant) => participant.call_session_id === args[0] && participant.identity_id === args[1] && participant.state === "joined") ?? null;
    }
    if (sql.includes("SELECT * FROM realtime_media_tracks WHERE id = ? AND call_session_id = ?")) {
      return tracks.find((track) => track.id === args[0] && track.call_session_id === args[1]) ?? null;
    }
    if (sql.includes("SELECT * FROM realtime_media_tracks WHERE id = ? LIMIT 1")) {
      return tracks.find((track) => track.id === args[0]) ?? null;
    }
    if (sql.includes("SELECT * FROM realtime_meeting_records WHERE id = ?")) {
      return meetings.find((meeting) => meeting.id === args[0] && (!args[1] || meeting.workspace_id === args[1])) ?? null;
    }
    throw new Error(`test db first unhandled SQL: ${sql}`);
  }

  function all(sql: string, args: unknown[]): Row[] {
    if (sql.includes("SELECT id, workspace_id, name, slug, status FROM projects")) {
      return projects.filter((project) => project.workspace_id === args[0] && project.status === "active");
    }
    if (sql.includes("FROM realtime_rooms r")) {
      return rooms
        .filter((room) => room.workspace_id === args[0] && room.state === "open")
        .map(rowWithProject);
    }
    if (sql.includes("FROM realtime_participants") && sql.includes("WHERE call_session_id = ?")) {
      return participants.filter((participant) => participant.call_session_id === args[0]);
    }
    if (sql.includes("FROM realtime_media_tracks") && sql.includes("WHERE call_session_id = ?")) {
      return tracks.filter((track) => track.call_session_id === args[0]);
    }
    throw new Error(`test db all unhandled SQL: ${sql}`);
  }

  function run(sql: string, args: unknown[]): { success: boolean } {
    if (sql.includes("INSERT OR IGNORE INTO realtime_rooms") && sql.includes("'workspace_lobby'")) {
      if (!rooms.some((room) => room.id === args[0])) {
        rooms.push({
          id: args[0],
          workspace_id: args[1],
          project_id: null,
          name: args[2],
          slug: args[3],
          room_type: "workspace_lobby",
          state: "open",
          visibility: "workspace",
          created_by_identity_id: args[4],
          active_call_id: null,
          metadata_json: "{}",
          last_activity_at: args[5],
          created_at: args[6],
          updated_at: args[7],
        });
      }
      return { success: true };
    }
    if (sql.includes("INSERT OR IGNORE INTO realtime_rooms") && sql.includes("'project_room'")) {
      if (!rooms.some((room) => room.id === args[0])) {
        rooms.push({
          id: args[0],
          workspace_id: args[1],
          project_id: args[2],
          name: args[3],
          slug: args[4],
          room_type: "project_room",
          state: "open",
          visibility: "project",
          created_by_identity_id: args[5],
          active_call_id: null,
          metadata_json: args[6],
          last_activity_at: args[7],
          created_at: args[8],
          updated_at: args[9],
        });
      }
      return { success: true };
    }
    if (sql.includes("INSERT INTO realtime_call_sessions")) {
      calls.push({
        id: args[0],
        workspace_id: args[1],
        room_id: args[2],
        project_id: args[3],
        state: "live",
        created_by_identity_id: args[4],
        meeting_record_id: null,
        provider: "cloudflare_realtime",
        metadata_json: "{}",
        started_at: args[5],
        ended_at: null,
        created_at: args[6],
        updated_at: args[7],
      });
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_rooms SET active_call_id = ?")) {
      const room = rooms.find((item) => item.id === args[3]);
      if (room) room.active_call_id = args[0];
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_rooms SET active_call_id = NULL")) {
      const room = rooms.find((item) => item.id === args[2]);
      if (room) room.active_call_id = null;
      return { success: true };
    }
    if (sql.includes("INSERT INTO realtime_events")) {
      events.push({ id: args[0], workspace_id: args[1], room_id: args[2], call_session_id: args[3], actor_identity_id: args[4], event_type: args[5], payload_json: args[6], occurred_at: args[7] });
      return { success: true };
    }
    if (sql.includes("INSERT INTO realtime_participants")) {
      participants.push({
        id: args[0],
        workspace_id: args[1],
        room_id: args[2],
        call_session_id: args[3],
        identity_id: args[4],
        employee_id: args[5],
        display_name: args[6],
        role: args[7],
        state: "joined",
        client_instance_id: args[8],
        cloudflare_session_id: args[9],
        audio_enabled: args[10],
        video_enabled: args[11],
        screen_share_enabled: args[12],
        joined_at: args[13],
        left_at: null,
        last_seen_at: args[14],
        metadata_json: args[15],
      });
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_participants") && sql.includes("state = 'joined'")) {
      const participant = participants.find((item) => item.id === args[6]);
      if (participant) {
        participant.state = "joined";
        participant.cloudflare_session_id = args[0];
        participant.audio_enabled = args[1];
        participant.video_enabled = args[2];
        participant.screen_share_enabled = args[3];
      }
      return { success: true };
    }
    if (sql.includes("INSERT INTO realtime_media_tracks")) {
      tracks.push({
        id: args[0],
        workspace_id: args[1],
        room_id: args[2],
        call_session_id: args[3],
        participant_id: args[4],
        identity_id: args[5],
        track_kind: args[6],
        direction: args[7],
        state: "live",
        label: args[8],
        source_id: args[9],
        cloudflare_session_id: args[10],
        cloudflare_track_id: args[11],
        target_track_ids_json: args[12],
        metadata_json: args[13],
        started_at: args[14],
        ended_at: null,
        updated_at: args[15],
      });
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_participants") && sql.includes("audio_enabled = CASE")) {
      const participant = participants.find((item) => item.id === args[4]);
      if (participant) {
        if (args[0] === "audio") participant.audio_enabled = 1;
        if (args[1] === "camera") participant.video_enabled = 1;
        if (args[2] === "screen") participant.screen_share_enabled = 1;
      }
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_participants SET state = 'left'")) {
      const participant = participants.find((item) => item.id === args[2]);
      if (participant) {
        participant.state = "left";
        participant.left_at = args[0];
      }
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_media_tracks SET state = 'closed'") && sql.includes("participant_id = ?")) {
      tracks
        .filter((track) => track.call_session_id === args[2] && track.participant_id === args[3] && track.state === "live")
        .forEach((track) => {
          track.state = "closed";
          track.ended_at = args[0];
        });
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_call_sessions SET state = 'ended'")) {
      const call = calls.find((item) => item.id === args[2]);
      if (call) {
        call.state = "ended";
        call.ended_at = args[0];
      }
      return { success: true };
    }
    if (sql.includes("INSERT INTO realtime_meeting_records")) {
      const existing = meetings.find((meeting) => meeting.call_session_id === args[3]);
      const row = {
        id: args[0],
        workspace_id: args[1],
        room_id: args[2],
        call_session_id: args[3],
        project_id: args[4],
        time_entry_id: args[5],
        title: args[6],
        started_at: args[7],
        ended_at: args[8],
        duration_seconds: args[9],
        manual_notes: args[10],
        decisions_json: args[11],
        action_items_json: args[12],
        participant_snapshot_json: args[13],
        linked_time_entry_ids_json: args[14],
        linked_issue_ids_json: args[15],
        screen_share_summary_json: args[16],
        paperclip_status: args[17],
        paperclip_payload_json: args[18],
        paperclip_artifact_ref: null,
        transcript_ref: null,
        recording_ref: null,
        created_by_identity_id: args[19],
        created_at: args[20],
        updated_at: args[21],
      };
      if (existing) Object.assign(existing, row);
      else meetings.push(row);
      return { success: true };
    }
    if (sql.includes("UPDATE realtime_call_sessions SET meeting_record_id")) {
      const call = calls.find((item) => item.id === args[2]);
      if (call) call.meeting_record_id = args[0];
      return { success: true };
    }
    throw new Error(`test db run unhandled SQL: ${sql}`);
  }

  const db = {
    prepare(sql: string) {
      const statement = {
        bind(...args: unknown[]) {
          return {
            run: async () => run(sql, args),
            first: async () => first(sql, args),
            all: async () => ({ results: all(sql, args) }),
          };
        },
        run: async () => run(sql, []),
        first: async () => first(sql, []),
        all: async () => ({ results: all(sql, []) }),
      };
      return statement;
    },
  };

  return { db, projects, rooms, calls, participants, tracks, meetings, events };
}

describe("realtime routes", () => {
  it("GET /v1/realtime/rooms fails closed without app auth", async () => {
    const env = { TF_ENV: "test", TF_CREDENTIAL_ENVELOPE_KEY: "secret" } as Env;
    const request = new Request("https://worker.test/v1/realtime/rooms");
    const res = await handleV1Request(request, env, new URL(request.url));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("access_identity_required");
  });

  it("lists durable workspace and project rooms from the project catalog", async () => {
    const mock = makeRealtimeDb();
    const env = { TF_ENV: "test", TEAMFORGE_DB: mock.db } as unknown as Env;
    const res = await handleGetRealtimeRooms(env, new URL("https://worker.test/v1/realtime/rooms"), makePrincipal());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { rooms: Array<{ id: string; roomType: string; projectId: string | null }> } };
    expect(body.data.rooms).toHaveLength(2);
    expect(body.data.rooms.map((room) => room.roomType)).toContain("workspace_lobby");
    expect(body.data.rooms.find((room) => room.projectId === "proj_alpha")).toBeDefined();
  });

  it("joins, records a screen track, and closes tracks on leave", async () => {
    const mock = makeRealtimeDb();
    const env = { TF_ENV: "test", TEAMFORGE_DB: mock.db, CF_REALTIME_APP_ID: "public-app" } as unknown as Env;
    const principal = makePrincipal();
    await handleGetRealtimeRooms(env, new URL("https://worker.test/v1/realtime/rooms"), principal);
    const roomId = String(mock.rooms.find((room) => room.project_id === "proj_alpha")!.id);

    const join = await handleJoinRealtimeRoom(env, makeReq(`/v1/realtime/rooms/${roomId}/join`, {
      clientInstanceId: "client-a",
      intent: "media",
    }), roomId, principal);
    expect(join.status).toBe(201);
    const joined = await join.json() as { data: { call: { id: string }; participant: { id: string }; cloudflare: Record<string, unknown> } };
    expect(joined.data.cloudflare).not.toHaveProperty("token");

    const track = await handlePostRealtimeTrack(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/tracks`, {
      participantId: joined.data.participant.id,
      trackKind: "screen",
      direction: "publish",
      label: "Main display",
    }), joined.data.call.id, principal);
    expect(track.status).toBe(201);
    const trackBody = await track.json() as { data: { track: { trackKind: string } } };
    expect(trackBody.data.track.trackKind).toBe("screen");
    expect(mock.tracks).toHaveLength(1);

    const leave = await handleLeaveRealtimeCall(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/leave`, {
      participantId: joined.data.participant.id,
    }), joined.data.call.id, principal);
    expect(leave.status).toBe(200);
    const leaveBody = await leave.json() as { data: { ended: boolean } };
    expect(leaveBody.data.ended).toBe(true);
    expect(mock.calls[0].state).toBe("ended");
    expect(mock.tracks[0].state).toBe("closed");
  });

  it("saves manual meeting closeout without transcript or recording refs", async () => {
    const mock = makeRealtimeDb();
    const env = { TF_ENV: "test", TEAMFORGE_DB: mock.db } as unknown as Env;
    const principal = makePrincipal();
    await handleGetRealtimeRooms(env, new URL("https://worker.test/v1/realtime/rooms"), principal);
    const roomId = String(mock.rooms[0].id);
    const join = await handleJoinRealtimeRoom(env, makeReq(`/v1/realtime/rooms/${roomId}/join`, {
      clientInstanceId: "client-a",
      intent: "presence_only",
    }), roomId, principal);
    const joined = await join.json() as { data: { call: { id: string }; participant: { id: string } } };
    await handleLeaveRealtimeCall(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/leave`, {
      participantId: joined.data.participant.id,
    }), joined.data.call.id, principal);

    const closeout = await handleRealtimeCloseout(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/closeout`, {
      title: "Alpha sync",
      manualNotes: "No transcript in this pass.",
      decisions: ["Ship lobby"],
      actionItems: ["Wire browser proof"],
      linkedIssueIds: ["RW-006"],
      linkedTimeEntryIds: ["time-1"],
      sendToPaperclip: true,
    }), joined.data.call.id, principal);
    expect(closeout.status).toBe(200);
    const body = await closeout.json() as { data: { meeting: { paperclipStatus: string; transcriptRef: string | null; recordingRef: string | null } } };
    expect(body.data.meeting.paperclipStatus).toBe("queued");
    expect(body.data.meeting.transcriptRef).toBeNull();
    expect(body.data.meeting.recordingRef).toBeNull();
  });
});
