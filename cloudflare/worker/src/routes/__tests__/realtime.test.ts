import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env } from "../../lib/env";
import type { PlexusPrincipal } from "../../lib/plexus-session";
import { handleCreatePresenceSession, handleGetPresence } from "../presence";
import {
  handleCloseRealtimeTrack,
  handleEndRealtimeCall,
  handleGetRealtimeRoom,
  handleGetRealtimeRooms,
  handleJoinRealtimeRoom,
  handleLeaveRealtimeCall,
  handlePostRealtimeTrack,
  handleRealtimeCloseout,
} from "../realtime";
import { handleV1Request } from "../v1";

const START = new Date("2026-07-16T10:00:00.000Z");

function d1(db: DatabaseSync, beforeRun?: (sql: string, values: unknown[]) => void): D1DatabaseLike {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          values = args;
          return statement;
        },
        async first<T>() {
          return (db.prepare(sql).get(...values) as T | undefined) ?? null;
        },
        async run() {
          beforeRun?.(sql, values);
          const result = db.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...values) as T[] };
        },
      };
      return statement;
    },
  };
}

function makePrincipal(): PlexusPrincipal {
  return {
    identityId: "pid_test",
    email: "member@example.com",
    displayName: "Member Test",
    workspaceId: "ws_test",
    role: "employee",
    projectVisibility: "active",
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

function makeRealtimeHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE plexus_identities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      employee_id TEXT,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      project_visibility TEXT NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    INSERT INTO workspaces (id) VALUES ('ws_test');
    INSERT INTO employees (id, workspace_id, display_name, email, is_active)
      VALUES ('emp_test', 'ws_test', 'Member Test', 'member@example.com', 1);
    INSERT INTO plexus_identities (
      id, workspace_id, email, employee_id, display_name, role, project_visibility,
      capabilities_json, is_active, created_at, updated_at
    ) VALUES (
      'pid_test', 'ws_test', 'member@example.com', 'emp_test', 'Member Test', 'employee', 'active',
      '{}', 1, '2026-01-01', '2026-01-01'
    );
    INSERT INTO projects (id, workspace_id, name, slug, status)
      VALUES ('proj_alpha', 'ws_test', 'Alpha Project', 'alpha', 'active');
  `);
  sqlite.exec(readFileSync(new URL("../../../migrations/0011_realtime_workspace.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../../../migrations/0016_plexus_app_presence_leases.sql", import.meta.url), "utf8"));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(JSON.stringify(String(url).endsWith("/sessions/new") ? {sessionId: "provider-session"} : {tracks: (body.tracks ?? []).map((t: any) => ({...t, mid: t.mid ?? "remote-0"})), sessionDescription: {type: "answer", sdp: "provider-sdp"}}), {status: 200});
  }));
  let locked = false;
  const locks = {
    idFromName: (key: string) => key,
    get: () => ({ fetch: async (url: string) => {
      if (url.endsWith("/release")) { locked = false; return new Response("{}"); }
      if (locked) return new Response("{}", {status: 409});
      locked = true; return new Response("{}");
    }}),
  };
  const env = { TF_ENV: "test", TEAMFORGE_DB: d1(sqlite), WORKSPACE_LOCKS: locks, CF_REALTIME_APP_ID: "public-app", CF_REALTIME_API_TOKEN: "test-token" } as Env;
  return { sqlite, env, principal: makePrincipal() };
}

async function createPresenceSession(env: Env, principal: PlexusPrincipal, clientInstanceId = "client-a") {
  const response = await handleCreatePresenceSession(
    env,
    makeReq("/v1/realtime/presence/session", { clientInstanceId }),
    principal,
  );
  expect(response.status).toBe(201);
  const body = await response.json() as { data: { presenceSessionId: string } };
  return body.data.presenceSessionId;
}

async function createRooms(env: Env, principal: PlexusPrincipal) {
  const response = await handleGetRealtimeRooms(env, new URL("https://worker.test/v1/realtime/rooms"), principal);
  expect(response.status).toBe(200);
  const body = await response.json() as { data: { rooms: Array<{ id: string; roomType: string; projectId: string | null }> } };
  return body.data.rooms;
}

async function joinRoom(
  env: Env,
  principal: PlexusPrincipal,
  roomId: string,
  clientInstanceId: string,
  presenceSessionId: string,
) {
  return handleJoinRealtimeRoom(env, makeReq(`/v1/realtime/rooms/${roomId}/join`, {
    clientInstanceId,
    presenceSessionId,
    intent: "media",
  }), roomId, principal);
}

describe("realtime routes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("GET /v1/realtime/rooms fails closed without app auth", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(JSON.stringify(String(url).endsWith("/sessions/new") ? {sessionId: "provider-session"} : {tracks: (body.tracks ?? []).map((t: any) => ({...t, mid: t.mid ?? "remote-0"})), sessionDescription: {type: "answer", sdp: "provider-sdp"}}), {status: 200});
  }));
  const env = { TF_ENV: "test", TF_CREDENTIAL_ENVELOPE_KEY: "secret" } as Env;
    const request = new Request("https://worker.test/v1/realtime/rooms");
    const res = await handleV1Request(request, env, new URL(request.url));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("access_identity_required");
  });

  it("lists durable workspace and project rooms from the project catalog", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const rooms = await createRooms(env, principal);
      expect(rooms).toHaveLength(2);
      expect(rooms.map((room) => room.roomType)).toContain("workspace_lobby");
      expect(rooms.find((room) => room.projectId === "proj_alpha")).toBeDefined();
    } finally {
      sqlite.close();
    }
  });

  it("requires an exact fresh current presence session before creating calls or participants", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const missing = await joinRoom(env, principal, roomId, "client-a", "not-current");
      expect(missing.status).toBe(409);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_call_sessions").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_participants").get()).toEqual({ count: 0 });

      const currentSession = await createPresenceSession(env, principal, "client-a");
      vi.advanceTimersByTime(60_000);
      const expired = await joinRoom(env, principal, roomId, "client-a", currentSession);
      expect(expired.status).toBe(409);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_call_sessions").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("rechecks lease freshness after provider negotiation before creating a participant", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      env.CF_REALTIME_API_TOKEN = "provider-token";
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const presenceSessionId = await createPresenceSession(env, principal);
      vi.stubGlobal("fetch", vi.fn(async () => {
        vi.advanceTimersByTime(60_000);
        return new Response(JSON.stringify({ sessionId: "cf-session", sessionDescription: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }));

      const join = await handleJoinRealtimeRoom(env, makeReq(`/v1/realtime/rooms/${roomId}/join`, {
        clientInstanceId: "client-a",
        presenceSessionId,
        intent: "media",
        sessionDescription: { type: "offer", sdp: "test" },
      }), roomId, principal);
      expect(join.status).toBe(409);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_call_sessions").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_participants").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("compensates local join state when session rotation wins the final room-context CAS", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const presenceSessionId = await createPresenceSession(env, principal);
      let rotated = false;
      env.TEAMFORGE_DB = d1(sqlite, (sql) => {
        if (!rotated && sql.includes("UPDATE plexus_app_presence_leases") && sql.includes("SET room_kind = ?")) {
          rotated = true;
          sqlite.prepare(`UPDATE plexus_app_presence_leases
            SET presence_session_id = 'rotation-won', room_kind = NULL, room_id = NULL,
                call_session_id = NULL, participant_id = NULL, room_project_id = NULL, room_observed_at = NULL
          `).run();
        }
      });

      const join = await joinRoom(env, principal, roomId, "client-a", presenceSessionId);
      expect(join.status).toBe(409);
      expect(rotated).toBe(true);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_participants WHERE state = 'joined'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_call_sessions WHERE state = 'live'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT active_call_id FROM realtime_rooms WHERE id = ?").get(roomId)).toEqual({ active_call_id: null });
    } finally {
      sqlite.close();
    }
  });

  it("server-binds room context, exposes exact live details, and clears context on leave", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const presenceSessionId = await createPresenceSession(env, principal);
      const join = await joinRoom(env, principal, roomId, "client-a", presenceSessionId);
      expect(join.status).toBe(201);
      const joined = await join.json() as { data: { call: { id: string }; participant: { id: string }; cloudflare: Record<string, unknown> } };
      expect(joined.data.cloudflare).not.toHaveProperty("token");

      expect(sqlite.prepare("SELECT client_instance_id, presence_session_id FROM realtime_participants").get()).toEqual({
        client_instance_id: "client-a",
        presence_session_id: presenceSessionId,
      });
      expect(sqlite.prepare("SELECT room_kind, room_id, call_session_id, participant_id, room_project_id, room_observed_at FROM plexus_app_presence_leases").get()).toEqual({
        room_kind: "project_room",
        room_id: roomId,
        call_session_id: joined.data.call.id,
        participant_id: joined.data.participant.id,
        room_project_id: "proj_alpha",
        room_observed_at: START.toISOString(),
      });

      const track = await handlePostRealtimeTrack(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/tracks`, {
        participantId: joined.data.participant.id,
        trackKind: "screen",
        mid: "0",
        sessionDescription: { type: "offer", sdp: "test-offer" },
        direction: "publish",
        label: "Main display",
      }), joined.data.call.id, principal);
      expect(track.status).toBe(201);

      const details = await handleGetRealtimeRoom(env, roomId, principal);
      const detailBody = await details.json() as { data: { room: { presence: { participants: number; screenShares: number } }; participants: unknown[]; tracks: unknown[] } };
      expect(detailBody.data.room.presence).toEqual({ participants: 1, screenShares: 1 });
      expect(detailBody.data.participants).toHaveLength(1);
      expect(detailBody.data.tracks).toHaveLength(1);

      const beforeRead = sqlite.prepare("SELECT last_seen_at, expires_at, room_observed_at FROM plexus_app_presence_leases").get();
      await handleGetPresence(env, principal);
      await handleGetRealtimeRoom(env, roomId, principal);
      expect(sqlite.prepare("SELECT last_seen_at, expires_at, room_observed_at FROM plexus_app_presence_leases").get()).toEqual(beforeRead);

      const leave = await handleLeaveRealtimeCall(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/leave`, {
        participantId: joined.data.participant.id,
      }), joined.data.call.id, principal);
      expect(leave.status).toBe(200);
      expect(sqlite.prepare("SELECT room_kind, room_id, call_session_id, participant_id, room_project_id, room_observed_at FROM plexus_app_presence_leases").get()).toEqual({
        room_kind: null,
        room_id: null,
        call_session_id: null,
        participant_id: null,
        room_project_id: null,
        room_observed_at: null,
      });
      expect(sqlite.prepare("SELECT state FROM realtime_media_tracks").get()).toEqual({ state: "closed" });
    } finally {
      sqlite.close();
    }
  });

  it("excludes stale joins and tracks across crash, expiry, and same-client session rotation until explicit rejoin", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const firstSession = await createPresenceSession(env, principal);
      const firstJoin = await joinRoom(env, principal, roomId, "client-a", firstSession);
      const firstBody = await firstJoin.json() as { data: { call: { id: string }; participant: { id: string } } };
      await handlePostRealtimeTrack(env, makeReq(`/v1/realtime/calls/${firstBody.data.call.id}/tracks`, {
        participantId: firstBody.data.participant.id,
        trackKind: "screen",
        mid: "0",
        sessionDescription: { type: "offer", sdp: "test-offer" },
        direction: "publish",
      }), firstBody.data.call.id, principal);

      vi.advanceTimersByTime(60_000);
      let details = await handleGetRealtimeRoom(env, roomId, principal);
      let body = await details.json() as { data: { room: { presence: { participants: number; screenShares: number } }; participants: unknown[]; tracks: unknown[] } };
      expect(body.data.room.presence).toEqual({ participants: 0, screenShares: 0 });
      expect(body.data.participants).toEqual([]);
      expect(body.data.tracks).toEqual([]);

      const secondSession = await createPresenceSession(env, principal);
      expect(secondSession).not.toBe(firstSession);
      details = await handleGetRealtimeRoom(env, roomId, principal);
      body = await details.json() as typeof body;
      expect(body.data.room.presence.participants).toBe(0);
      expect(body.data.participants).toEqual([]);
      expect(body.data.tracks).toEqual([]);

      const rejoin = await joinRoom(env, principal, roomId, "client-a", secondSession);
      expect(rejoin.status).toBe(201);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_participants").get()).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT presence_session_id, state FROM realtime_participants").get()).toEqual({ presence_session_id: secondSession, state: "joined" });
      expect(sqlite.prepare("SELECT state FROM realtime_media_tracks").get()).toEqual({ state: "closed" });

      details = await handleGetRealtimeRoom(env, roomId, principal);
      body = await details.json() as typeof body;
      expect(body.data.room.presence).toEqual({ participants: 1, screenShares: 0 });
      expect(body.data.participants).toHaveLength(1);
      expect(body.data.tracks).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("requires exact server-owned room context for participant and track visibility", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const presenceSessionId = await createPresenceSession(env, principal);
      const join = await joinRoom(env, principal, roomId, "client-a", presenceSessionId);
      const joined = await join.json() as { data: { call: { id: string }; participant: { id: string } } };
      await handlePostRealtimeTrack(env, makeReq(`/v1/realtime/calls/${joined.data.call.id}/tracks`, {
        participantId: joined.data.participant.id,
        trackKind: "screen",
        mid: "0",
        sessionDescription: { type: "offer", sdp: "test-offer" },
        direction: "publish",
      }), joined.data.call.id, principal);

      sqlite.prepare("UPDATE employees SET is_active = 0 WHERE id = 'emp_test'").run();
      let details = await handleGetRealtimeRoom(env, roomId, principal);
      let body = await details.json() as { data: { room: { presence: { participants: number; screenShares: number } }; participants: unknown[]; tracks: unknown[] } };
      expect(body.data.room.presence).toEqual({ participants: 0, screenShares: 0 });
      expect(body.data.participants).toEqual([]);
      expect(body.data.tracks).toEqual([]);

      sqlite.prepare("UPDATE employees SET is_active = 1 WHERE id = 'emp_test'").run();
      sqlite.prepare("UPDATE plexus_app_presence_leases SET participant_id = 'forged-other-participant'").run();
      details = await handleGetRealtimeRoom(env, roomId, principal);
      body = await details.json() as typeof body;
      expect(body.data.room.presence).toEqual({ participants: 0, screenShares: 0 });
      expect(body.data.participants).toEqual([]);
      expect(body.data.tracks).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("clears every exact lease room context when the host ends a call", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const firstSession = await createPresenceSession(env, principal, "client-a");
      const firstJoin = await joinRoom(env, principal, roomId, "client-a", firstSession);
      const firstBody = await firstJoin.json() as { data: { call: { id: string } } };
      const secondSession = await createPresenceSession(env, principal, "client-b");
      await joinRoom(env, principal, roomId, "client-b", secondSession);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases WHERE room_id IS NOT NULL").get()).toEqual({ count: 2 });

      const ended = await handleEndRealtimeCall(env, firstBody.data.call.id, principal);
      expect(ended.status).toBe(200);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases WHERE room_id IS NOT NULL").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_participants WHERE state = 'joined'").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("rejects forged provider IDs and unavailable remote publications without contacting the provider", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      vi.mocked(fetch).mockClear();
      for (const body of [
        {cloudflareSessionId: "attacker-session"},
        {direction: "subscribe", targetTrackIds: ["other-room-track"]},
      ]) {
        const response = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", ...body}), joined.data.call.id, principal);
        expect([400, 403]).toContain(response.status);
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({count: 0});
    } finally { sqlite.close(); }
  });

  it("allocates an empty provider session and publishes with server owned identifiers", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      const sessionRequest = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/sessions/new"));
      expect(sessionRequest?.[1]?.body).toBeUndefined();
      const response = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), joined.data.call.id, principal);
      expect(response.status).toBe(201);
      const result = await response.json() as any;
      const operation = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
      expect(operation.tracks[0]).toEqual({location: "local", mid: "0", trackName: result.data.track.id});
      expect(result.data.track.cloudflareSessionId).toBe("provider-session");
    } finally { sqlite.close(); }
  });

  it("does not record live media when the provider rejects publication", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({errorCode: "provider_failure"}), {status: 500})));
      const response = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), joined.data.call.id, principal);
      expect(response.status).toBe(502);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({count: 0});
    } finally { sqlite.close(); }
  });

  it("serializes concurrent media mutations and rejects duplicate allocation", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      const body = {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}};
      const responses = await Promise.all([handlePostRealtimeTrack(env, makeReq("/tracks", body), joined.data.call.id, principal), handlePostRealtimeTrack(env, makeReq("/tracks", body), joined.data.call.id, principal)]);
      expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
      const duplicate = await handlePostRealtimeTrack(env, makeReq("/tracks", body), joined.data.call.id, principal);
      expect(duplicate.status).toBe(409);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({count: 1});
      vi.mocked(fetch).mockClear();
      const end = await handleEndRealtimeCall(env, joined.data.call.id, {...principal, role: "admin"});
      expect(end.status).toBe(200);
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/tracks/close") && JSON.parse(String(init?.body)).force)).toBe(true);
    } finally { sqlite.close(); }
  });

  it("rejects malformed and partially failed provider negotiation without live metadata", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      for (const result of [
        {tracks: [{mid: "0", trackName: "fake"}]},
        {tracks: [{mid: "0", trackName: "fake", errorCode: "partial"}], sessionDescription: {type: "answer", sdp: "answer"}},
        {tracks: [{mid: "0"}], sessionDescription: {type: "answer", sdp: "answer"}},
      ]) {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(result))));
        const response = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), joined.data.call.id, principal);
        expect(response.status).toBe(502);
      }
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({count: 0});
      expect((await handleEndRealtimeCall(env, joined.data.call.id)).status).toBe(401);
    } finally { sqlite.close(); }
  });

  it("requires leave before media rejoin and preserves pending negotiation through track closure", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      const published = await (await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), joined.data.call.id, principal)).json() as any;
      sqlite.prepare("UPDATE realtime_participants SET metadata_json = ? WHERE id = ?").run(JSON.stringify({intent: "media", pendingRenegotiation: true}), joined.data.participant.id);
      expect((await handleCloseRealtimeTrack(env, joined.data.call.id, published.data.track.id, principal)).status).toBe(200);
      const rejoin = await joinRoom(env, principal, roomId, "client-a", lease);
      expect(rejoin.status).toBe(409);
      expect((await rejoin.json() as any).error.code).toBe("realtime_rejoin_required");
      expect(JSON.parse((sqlite.prepare("SELECT metadata_json FROM realtime_participants WHERE id = ?").get(joined.data.participant.id) as any).metadata_json).pendingRenegotiation).toBe(true);
      expect((await handleLeaveRealtimeCall(env, makeReq("/leave", {participantId: joined.data.participant.id}), joined.data.call.id, principal)).status).toBe(200);
      vi.mocked(fetch).mockClear();
      expect((await joinRoom(env, principal, roomId, "client-a", lease)).status).toBe(201);
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/sessions/new"))).toBe(true);
    } finally {sqlite.close();}
  });

  it("clears old negotiation state when rejoining a call kept live by another client", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    try {
      let providerSession = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify(String(url).endsWith("/sessions/new") ? {sessionId: `provider-${++providerSession}`} : {tracks: (body.tracks ?? []).map((t: any) => ({...t, mid: t.mid ?? "0"})), sessionDescription: {type: "answer", sdp: "answer"}}));
      }));
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal, "client-a");
      const first = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      const peerLease = await createPresenceSession(env, principal, "client-b");
      await joinRoom(env, principal, roomId, "client-b", peerLease);
      sqlite.prepare("UPDATE realtime_participants SET metadata_json = ? WHERE id = ?").run(JSON.stringify({pendingRenegotiation: true}), first.data.participant.id);
      expect((await handleLeaveRealtimeCall(env, makeReq("/leave", {participantId: first.data.participant.id}), first.data.call.id, principal)).status).toBe(200);
      const rejoined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      expect(rejoined.data.call.id).toBe(first.data.call.id);
      expect(rejoined.data.participant.cloudflareSessionId).not.toBe(first.data.participant.cloudflareSessionId);
      expect(rejoined.data.participant.metadata.pendingRenegotiation).toBeUndefined();
      const publication = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: rejoined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), first.data.call.id, principal);
      expect(publication.status).toBe(201);
    } finally {sqlite.close();}
  });

  it("logs only safe allocation diagnostics and keeps provider errors private", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      const failures = [
        {category: "http_rejected", fetch: async () => new Response(JSON.stringify({message: "raw-secret-provider-error test-token"}), {status: 403, headers: {"cf-ray": "abcdef1234567890-BOM"}})},
        {category: "invalid_response", fetch: async () => new Response(JSON.stringify({message: "raw-secret-provider-error test-token"}), {headers: {"cf-ray": "unsafe-secret-value"}})},
        {category: "network_or_timeout", fetch: async () => {throw new Error("raw-secret-provider-error test-token");}},
      ];
      for (const failure of failures) {
        warn.mockClear(); vi.stubGlobal("fetch", vi.fn(failure.fetch));
        const response = await joinRoom(env, principal, roomId, "client-a", lease);
        expect(response.status).toBe(502);
        expect(warn).toHaveBeenCalledWith("realtime_provider_boundary", expect.objectContaining({operation: "session_allocate", category: failure.category}));
        expect(JSON.stringify(warn.mock.calls)).not.toContain("test-token");
        expect(JSON.stringify(warn.mock.calls)).not.toContain("raw-secret-provider-error");
        expect(JSON.stringify(warn.mock.calls)).not.toContain("unsafe-secret-value");
        expect(await response.text()).not.toContain("raw-secret-provider-error");
      }
      warn.mockClear(); env.CF_REALTIME_API_TOKEN = undefined;
      expect((await joinRoom(env, principal, roomId, "client-a", lease)).status).toBe(502);
      expect(warn).toHaveBeenCalledWith("realtime_provider_boundary", {operation: "session_allocate", category: "config_missing"});
    } finally {warn.mockRestore(); sqlite.close();}
  });

  it("uses Worker-compatible manual redirects and rejects redirects without following", async () => {
    const {sqlite, env, principal} = makeRealtimeHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const lease = await createPresenceSession(env, principal);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {status: 302, headers: {location: "https://untrusted.example/collect"}})));
      expect((await joinRoom(env, principal, roomId, "client-a", lease)).status).toBe(502);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][1]?.redirect).toBe("manual");
      expect(warn).toHaveBeenCalledWith("realtime_provider_boundary", expect.objectContaining({category: "http_rejected", upstreamStatus: 302}));
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({sessionId: "session"}))));
      const joined = await (await joinRoom(env, principal, roomId, "client-a", lease)).json() as any;
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {status: 307, headers: {location: "https://untrusted.example/collect"}})));
      const response = await handlePostRealtimeTrack(env, makeReq("/tracks", {participantId: joined.data.participant.id, trackKind: "audio", mid: "0", sessionDescription: {type: "offer", sdp: "offer"}}), joined.data.call.id, principal);
      expect(response.status).toBe(502);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][1]?.redirect).toBe("manual");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({count: 0});
    } finally {warn.mockRestore(); sqlite.close();}
  });

  it("rejects identity-only track publication when multiple app clients are joined", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal)).find((room) => room.projectId === "proj_alpha")!.id;
      const firstSession = await createPresenceSession(env, principal, "client-a");
      const firstJoin = await joinRoom(env, principal, roomId, "client-a", firstSession);
      const firstBody = await firstJoin.json() as { data: { call: { id: string } } };
      const secondSession = await createPresenceSession(env, principal, "client-b");
      await joinRoom(env, principal, roomId, "client-b", secondSession);

      const track = await handlePostRealtimeTrack(env, makeReq(`/v1/realtime/calls/${firstBody.data.call.id}/tracks`, {
        trackKind: "screen",
        mid: "0",
        sessionDescription: { type: "offer", sdp: "test-offer" },
        direction: "publish",
      }), firstBody.data.call.id, principal);
      expect(track.status).toBe(400);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM realtime_media_tracks").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("saves historical manual closeout after an authenticated participant leaves", async () => {
    const { sqlite, env, principal } = makeRealtimeHarness();
    try {
      const roomId = (await createRooms(env, principal))[0].id;
      const presenceSessionId = await createPresenceSession(env, principal);
      const join = await joinRoom(env, principal, roomId, "client-a", presenceSessionId);
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
      const body = await closeout.json() as { data: { meeting: { paperclipStatus: string; transcriptRef: string | null; recordingRef: string | null; participantSnapshot: unknown[] } } };
      expect(body.data.meeting.paperclipStatus).toBe("queued");
      expect(body.data.meeting.transcriptRef).toBeNull();
      expect(body.data.meeting.recordingRef).toBeNull();
      expect(body.data.meeting.participantSnapshot).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
});
