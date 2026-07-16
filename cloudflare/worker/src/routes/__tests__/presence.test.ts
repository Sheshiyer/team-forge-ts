import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env } from "../../lib/env";
import type { PlexusPrincipal } from "../../lib/plexus-session";
import { handleV1Request } from "../v1";
import {
  handleCreatePresenceSession,
  handleDeletePresenceSession,
  handleGetPresence,
  handlePresenceHeartbeat,
} from "../presence";

const START = new Date("2026-07-16T10:00:00.000Z");

function d1(db: DatabaseSync): D1DatabaseLike {
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

function principal(identityId = "pid_active", workspaceId = "ws_test", role: "employee" | "admin" = "employee"): PlexusPrincipal {
  return {
    identityId,
    email: `${identityId}@example.com`,
    displayName: identityId === "pid_active" ? "Active Member" : identityId,
    workspaceId,
    role,
    projectVisibility: role === "admin" ? "all" : "active",
    employeeId: role === "admin" ? "emp_inactive" : `emp_${identityId.replace("pid_", "")}`,
    capabilities: {},
  };
}

function request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeHarness() {
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
    CREATE TABLE realtime_participants (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      client_instance_id TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE realtime_rooms (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL
    );
    INSERT INTO workspaces (id) VALUES ('ws_test'), ('ws_other');
    INSERT INTO employees (id, workspace_id, display_name, email, is_active) VALUES
      ('emp_active', 'ws_test', 'Active Member', 'active@example.com', 1),
      ('emp_second', 'ws_test', 'Second Member', 'second@example.com', 1),
      ('emp_inactive', 'ws_test', 'Inactive Member', 'inactive@example.com', 0),
      ('emp_other', 'ws_other', 'Other Member', 'other@example.com', 1);
    INSERT INTO plexus_identities (
      id, workspace_id, email, employee_id, display_name, role, project_visibility,
      capabilities_json, is_active, created_at, updated_at
    ) VALUES
      ('pid_active', 'ws_test', 'active@example.com', 'emp_active', 'Active Member', 'employee', 'active', '{}', 1, '2026-01-01', '2026-01-01'),
      ('pid_second', 'ws_test', 'second@example.com', 'emp_second', 'Second Member', 'employee', 'active', '{}', 1, '2026-01-01', '2026-01-01'),
      ('pid_inactive', 'ws_test', 'inactive@example.com', 'emp_inactive', 'Inactive Member', 'employee', 'active', '{}', 1, '2026-01-01', '2026-01-01'),
      ('pid_roster', 'ws_test', 'roster@example.com', NULL, 'Roster Only', 'employee', 'active', '{}', 1, '2026-01-01', '2026-01-01'),
      ('pid_admin', 'ws_test', 'admin@example.com', 'emp_inactive', 'Workspace Admin', 'admin', 'all', '{}', 1, '2026-01-01', '2026-01-01'),
      ('pid_other', 'ws_other', 'other@example.com', 'emp_other', 'Other Member', 'employee', 'active', '{}', 1, '2026-01-01', '2026-01-01');
    INSERT INTO projects (id, workspace_id, name) VALUES
      ('project-old', 'ws_test', 'Legacy Project'),
      ('project-1', 'ws_test', 'Current Project');
    INSERT INTO realtime_rooms (id, workspace_id, project_id, name) VALUES
      ('room-old', 'ws_test', 'project-old', 'Legacy Room'),
      ('room-new', 'ws_test', NULL, 'Workspace Lobby');
  `);
  sqlite.exec(readFileSync(new URL("../../../migrations/0016_plexus_app_presence_leases.sql", import.meta.url), "utf8"));
  const env = { TF_ENV: "test", TEAMFORGE_DB: d1(sqlite) } as Env;
  return { sqlite, env };
}

async function createSession(env: Env, caller = principal(), clientInstanceId = "desktop-a") {
  const response = await handleCreatePresenceSession(
    env,
    request("POST", "/v1/realtime/presence/session", { clientInstanceId }),
    caller,
  );
  const body = await response.json() as { data: { presenceSessionId: string; lastSeenAt: string; expiresAt: string } };
  return { response, ...body.data };
}

function focused(sequence: number, presenceSessionId: string, clientInstanceId = "desktop-a") {
  return {
    clientInstanceId,
    presenceSessionId,
    sequence,
    activity: {
      state: "focused",
      timerEntryId: "timer-1",
      projectId: "project-1",
      timerStartedAt: "2026-07-16T09:55:00.000Z",
    },
  };
}

describe("authenticated app presence leases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects unauthenticated, bearer, and internal callers without writing", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const direct = await handleCreatePresenceSession(env, request("POST", "/v1/realtime/presence/session", { clientInstanceId: "desktop-a" }), null);
      expect(direct.status).toBe(401);

      const bearerEnv = { ...env, TF_CREDENTIAL_ENVELOPE_KEY: "bearer-secret", TF_INTERNAL_SHARED_SECRET: "internal-secret" };
      for (const headers of [
        { authorization: "Bearer bearer-secret" },
        { "x-teamforge-internal-secret": "internal-secret" },
      ]) {
        const req = request("POST", "/v1/realtime/presence/session", { clientInstanceId: "desktop-a" }, headers);
        const response = await handleV1Request(req, bearerEnv, new URL(req.url));
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("validates stable client IDs and canonical active employee authority with an admin exception", async () => {
    const { sqlite, env } = makeHarness();
    try {
      for (const clientInstanceId of ["", "x".repeat(129)]) {
        const response = await handleCreatePresenceSession(env, request("POST", "/v1/realtime/presence/session", { clientInstanceId }), principal());
        expect(response.status).toBe(400);
      }
      const forged = await handleCreatePresenceSession(env, request("POST", "/v1/realtime/presence/session", {
        clientInstanceId: "desktop-a",
        identityId: "pid_admin",
      }), principal());
      expect(forged.status).toBe(400);

      const inactive = await handleCreatePresenceSession(env, request("POST", "/v1/realtime/presence/session", { clientInstanceId: "desktop-a" }), principal("pid_inactive"));
      expect(inactive.status).toBe(403);
      const inactiveRead = await handleGetPresence(env, principal("pid_inactive"));
      expect(inactiveRead.status).toBe(403);
      expect(inactiveRead.headers.get("cache-control")).toBe("no-store");
      const rosterOnly = await handleCreatePresenceSession(env, request("POST", "/v1/realtime/presence/session", { clientInstanceId: "desktop-a" }), principal("pid_roster"));
      expect(rosterOnly.status).toBe(403);
      const admin = await createSession(env, principal("pid_admin", "ws_test", "admin"), "admin-desktop");
      expect(admin.response.status).toBe(201);
      const adminRead = await handleGetPresence(env, principal("pid_admin", "ws_test", "admin"));
      expect(adminRead.status).toBe(200);
      expect(sqlite.prepare("SELECT identity_id FROM plexus_app_presence_leases").all()).toEqual([{ identity_id: "pid_admin" }]);
    } finally {
      sqlite.close();
    }
  });

  it("rotates one opaque session per stable client and clears prior state", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const first = await createSession(env);
      await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(1, first.presenceSessionId)), principal());
      sqlite.prepare(`UPDATE plexus_app_presence_leases SET room_kind='project_room', room_id='room-1', call_session_id='call-1', participant_id='part-1', room_project_id='project-1', room_observed_at=?`).run(START.toISOString());

      vi.advanceTimersByTime(1_000);
      const second = await createSession(env);
      expect(second.response.status).toBe(201);
      expect(second.presenceSessionId).not.toBe(first.presenceSessionId);
      const row = sqlite.prepare("SELECT * FROM plexus_app_presence_leases").get() as Record<string, unknown>;
      expect(row).toMatchObject({
        identity_id: "pid_active",
        client_instance_id: "desktop-a",
        presence_session_id: second.presenceSessionId,
        last_sequence: 0,
        activity: "available",
        timer_entry_id: null,
        room_id: null,
        room_observed_at: null,
      });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases").get()).toEqual({ count: 1 });
    } finally {
      sqlite.close();
    }
  });

  it("uses Worker time and conditionally advances the entire activity tuple by sequence", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const session = await createSession(env);
      const forged = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", {
        ...focused(1, session.presenceSessionId),
        lastSeenAt: "2099-01-01T00:00:00.000Z",
        expiresAt: "2099-01-01T00:01:00.000Z",
        ttlSeconds: 999999,
      }), principal());
      expect(forged.status).toBe(400);

      vi.advanceTimersByTime(5_000);
      const accepted = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(2, session.presenceSessionId)), principal());
      expect(accepted.status).toBe(200);
      const afterNew = sqlite.prepare("SELECT * FROM plexus_app_presence_leases").get() as Record<string, unknown>;
      expect(afterNew).toMatchObject({
        last_sequence: 2,
        activity: "focused",
        timer_entry_id: "timer-1",
        last_seen_at: "2026-07-16T10:00:05.000Z",
        expires_at: "2026-07-16T10:01:05.000Z",
      });

      vi.advanceTimersByTime(5_000);
      const late = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", {
        clientInstanceId: "desktop-a",
        presenceSessionId: session.presenceSessionId,
        sequence: 1,
        activity: { state: "available", timerEntryId: null, projectId: null, timerStartedAt: null },
      }), principal());
      expect(late.status).toBe(409);
      expect(sqlite.prepare("SELECT last_sequence, activity, timer_entry_id, last_seen_at, expires_at FROM plexus_app_presence_leases").get()).toEqual({
        last_sequence: 2,
        activity: "focused",
        timer_entry_id: "timer-1",
        last_seen_at: "2026-07-16T10:00:05.000Z",
        expires_at: "2026-07-16T10:01:05.000Z",
      });
    } finally {
      sqlite.close();
    }
  });

  it("rejects malformed activity and all caller-supplied room context", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const session = await createSession(env);
      const invalidActivities = [
        { kind: "available", timerEntryId: null, projectId: null, timerStartedAt: null },
        { state: "available", timerEntryId: "timer", projectId: null, timerStartedAt: null },
        { state: "focused", timerEntryId: "", projectId: "project", timerStartedAt: "2026-07-16T09:00:00.000Z" },
        { state: "focused", timerEntryId: "timer", projectId: "project", timerStartedAt: "not-a-date" },
        { state: "focused", timerEntryId: "timer", projectId: "x".repeat(129), timerStartedAt: "2026-07-16T09:00:00.000Z" },
      ];
      for (const [index, activity] of invalidActivities.entries()) {
        const response = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", {
          clientInstanceId: "desktop-a",
          presenceSessionId: session.presenceSessionId,
          sequence: index + 1,
          activity,
        }), principal());
        expect(response.status).toBe(400);
      }
      const roomForgery = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", {
        ...focused(5, session.presenceSessionId),
        roomId: "room-forged",
      }), principal());
      expect(roomForgery.status).toBe(400);
      expect(sqlite.prepare("SELECT last_sequence, room_id FROM plexus_app_presence_leases").get()).toEqual({ last_sequence: 0, room_id: null });
    } finally {
      sqlite.close();
    }
  });

  it("treats equality as expired and cleans expired workspace rows only during heartbeat", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const active = await createSession(env);
      const second = await createSession(env, principal("pid_second"), "desktop-second");
      sqlite.prepare("UPDATE plexus_app_presence_leases SET expires_at = ? WHERE identity_id = 'pid_second'").run("2026-07-16T09:59:59.000Z");
      vi.advanceTimersByTime(1_000);
      const heartbeat = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(1, active.presenceSessionId)), principal());
      expect(heartbeat.status).toBe(200);
      expect(sqlite.prepare("SELECT identity_id FROM plexus_app_presence_leases ORDER BY identity_id").all()).toEqual([{ identity_id: "pid_active" }]);

      const currentExpiry = sqlite.prepare("SELECT expires_at FROM plexus_app_presence_leases WHERE identity_id = 'pid_active'").get() as { expires_at: string };
      vi.setSystemTime(new Date(currentExpiry.expires_at));
      const atBoundary = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(2, active.presenceSessionId)), principal());
      expect(atBoundary.status).toBe(409);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases").get()).toEqual({ count: 0 });
      expect(second.presenceSessionId).toBeTruthy();
    } finally {
      sqlite.close();
    }
  });

  it("aggregates clients by canonical identity without exposing client or session IDs", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const first = await createSession(env, principal(), "desktop-a");
      await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(1, first.presenceSessionId, "desktop-a")), principal());
      sqlite.prepare(`UPDATE plexus_app_presence_leases SET room_kind='project_room', room_id='room-old', call_session_id='call-old', participant_id='part-old', room_project_id='project-old', room_observed_at='2026-07-16T09:59:00.000Z' WHERE client_instance_id='desktop-a'`).run();

      vi.advanceTimersByTime(10_000);
      const second = await createSession(env, principal(), "desktop-b");
      await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", {
        clientInstanceId: "desktop-b",
        presenceSessionId: second.presenceSessionId,
        sequence: 1,
        activity: { state: "available", timerEntryId: null, projectId: null, timerStartedAt: null },
      }), principal());
      sqlite.prepare(`UPDATE plexus_app_presence_leases SET room_kind='workspace_lobby', room_id='room-new', call_session_id='call-new', participant_id='part-new', room_project_id=NULL, room_observed_at='2026-07-16T10:00:10.000Z' WHERE client_instance_id='desktop-b'`).run();

      sqlite.prepare(`INSERT INTO plexus_app_presence_leases (
        id, workspace_id, identity_id, client_instance_id, presence_session_id, last_sequence, activity,
        last_seen_at, expires_at, created_at, updated_at
      ) VALUES
        ('lease_inactive', 'ws_test', 'pid_inactive', 'inactive-client', 'inactive-session', 0, 'available', ?, ?, ?, ?),
        ('lease_roster', 'ws_test', 'pid_roster', 'roster-client', 'roster-session', 0, 'available', ?, ?, ?, ?),
        ('lease_other', 'ws_other', 'pid_other', 'other-client', 'other-session', 0, 'available', ?, ?, ?, ?)
      `).run(
        START.toISOString(), "2026-07-16T10:01:00.000Z", START.toISOString(), START.toISOString(),
        START.toISOString(), "2026-07-16T10:01:00.000Z", START.toISOString(), START.toISOString(),
        START.toISOString(), "2026-07-16T10:01:00.000Z", START.toISOString(), START.toISOString(),
      );

      const response = await handleGetPresence(env, principal());
      expect(response.status).toBe(200);
      const body = await response.json() as { data: { observedAt: string; members: Array<Record<string, unknown>> } };
      expect(body.data.observedAt).toBe("2026-07-16T10:00:10.000Z");
      expect(body.data.members).toHaveLength(1);
      expect(body.data.members[0]).toMatchObject({
        identityId: "pid_active",
        employeeId: "emp_active",
        displayName: "Active Member",
        initials: "AM",
        activeClientCount: 2,
        presenceProof: "authenticated_app_lease",
        activity: {
          state: "focused",
          timerEntryId: "timer-1",
          projectId: "project-1",
        },
        room: {
          kind: "lounge",
          roomId: "room-new",
          roomName: "Workspace Lobby",
          projectId: null,
          projectName: null,
          callId: "call-new",
          participantId: "part-new",
        },
        lastSeenAt: "2026-07-16T10:00:10.000Z",
        expiresAt: "2026-07-16T10:01:10.000Z",
        observedAt: "2026-07-16T10:00:10.000Z",
      });
      expect(JSON.stringify(body)).not.toContain("desktop-");
      expect(JSON.stringify(body)).not.toContain("presenceSessionId");
      expect(JSON.stringify(body)).not.toContain("session-");
    } finally {
      sqlite.close();
    }
  });

  it("disconnects only the exact current session and distinguishes one client from the final client", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const first = await createSession(env, principal(), "desktop-a");
      const second = await createSession(env, principal(), "desktop-b");
      const staleDelete = await handleDeletePresenceSession(env, "desktop-a", "wrong-session", principal());
      expect(staleDelete.status).toBe(409);

      const one = await handleDeletePresenceSession(env, "desktop-a", first.presenceSessionId, principal());
      expect(one.status).toBe(200);
      let listing = await handleGetPresence(env, principal());
      let body = await listing.json() as { data: { members: Array<{ activeClientCount: number }> } };
      expect(body.data.members[0].activeClientCount).toBe(1);

      const final = await handleDeletePresenceSession(env, "desktop-b", second.presenceSessionId, principal());
      expect(final.status).toBe(200);
      listing = await handleGetPresence(env, principal());
      body = await listing.json() as { data: { members: Array<{ activeClientCount: number }> } };
      expect(body.data.members).toEqual([]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("never mutates leases during reads and marks every presence response no-store", async () => {
    const { sqlite, env } = makeHarness();
    try {
      const session = await createSession(env);
      sqlite.prepare(`INSERT INTO plexus_app_presence_leases (
        id, workspace_id, identity_id, client_instance_id, presence_session_id, last_sequence, activity,
        last_seen_at, expires_at, created_at, updated_at
      ) VALUES ('expired', 'ws_test', 'pid_second', 'old-client', 'old-session', 0, 'available', ?, ?, ?, ?)
      `).run("2026-07-16T09:00:00.000Z", "2026-07-16T09:01:00.000Z", "2026-07-16T09:00:00.000Z", "2026-07-16T09:00:00.000Z");
      const before = sqlite.prepare("SELECT id, last_seen_at, expires_at FROM plexus_app_presence_leases ORDER BY id").all();

      const get = await handleGetPresence(env, principal());
      const after = sqlite.prepare("SELECT id, last_seen_at, expires_at FROM plexus_app_presence_leases ORDER BY id").all();
      expect(after).toEqual(before);

      const heartbeat = await handlePresenceHeartbeat(env, request("POST", "/v1/realtime/presence/heartbeat", focused(1, session.presenceSessionId)), principal());
      const deletion = await handleDeletePresenceSession(env, "desktop-a", session.presenceSessionId, principal());
      for (const response of [session.response, get, heartbeat, deletion]) {
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    } finally {
      sqlite.close();
    }
  });
});
