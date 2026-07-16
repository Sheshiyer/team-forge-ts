import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("Plexus app presence lease migration", () => {
  it("creates stable-client leases and session-binds realtime participants", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE workspaces (id TEXT PRIMARY KEY);
        CREATE TABLE employees (id TEXT PRIMARY KEY);
        CREATE TABLE plexus_identities (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          employee_id TEXT,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
        );
        CREATE TABLE realtime_participants (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          identity_id TEXT NOT NULL,
          client_instance_id TEXT NOT NULL
        );
        INSERT INTO workspaces (id) VALUES ('ws_test'), ('ws_other');
        INSERT INTO employees (id) VALUES ('emp_test'), ('emp_other');
        INSERT INTO plexus_identities (id, workspace_id, employee_id)
          VALUES ('pid_test', 'ws_test', 'emp_test'), ('pid_other', 'ws_other', 'emp_other');
      `);

      db.exec(readFileSync(new URL("../../../migrations/0016_plexus_app_presence_leases.sql", import.meta.url), "utf8"));

      const leaseColumns = db.prepare("PRAGMA table_info(plexus_app_presence_leases)").all()
        .map((column) => String(column.name));
      expect(leaseColumns).toEqual(expect.arrayContaining([
        "workspace_id",
        "identity_id",
        "client_instance_id",
        "presence_session_id",
        "last_sequence",
        "activity",
        "timer_entry_id",
        "timer_project_id",
        "timer_started_at",
        "room_kind",
        "room_id",
        "call_session_id",
        "participant_id",
        "room_project_id",
        "room_observed_at",
        "last_seen_at",
        "expires_at",
      ]));
      expect(db.prepare("PRAGMA table_info(realtime_participants)").all()
        .map((column) => String(column.name))).toContain("presence_session_id");

      const insert = db.prepare(`
        INSERT INTO plexus_app_presence_leases (
          id, workspace_id, identity_id, client_instance_id, presence_session_id,
          last_sequence, activity, last_seen_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, 'available', ?, ?, ?, ?)
      `);
      insert.run("lease_a", "ws_test", "pid_test", "desktop-a", "session-a", "2026-07-16T00:00:00.000Z", "2026-07-16T00:01:00.000Z", "2026-07-16T00:00:00.000Z", "2026-07-16T00:00:00.000Z");

      expect(() => insert.run("lease_dup", "ws_test", "pid_test", "desktop-a", "session-b", "2026-07-16T00:00:00.000Z", "2026-07-16T00:01:00.000Z", "2026-07-16T00:00:00.000Z", "2026-07-16T00:00:00.000Z"))
        .toThrow(/UNIQUE constraint failed/);
      expect(() => insert.run("lease_session_dup", "ws_other", "pid_other", "desktop-a", "session-a", "2026-07-16T00:00:00.000Z", "2026-07-16T00:01:00.000Z", "2026-07-16T00:00:00.000Z", "2026-07-16T00:00:00.000Z"))
        .toThrow(/UNIQUE constraint failed/);

      insert.run("lease_other", "ws_other", "pid_other", "desktop-a", "session-c", "2026-07-16T00:00:00.000Z", "2026-07-16T00:01:00.000Z", "2026-07-16T00:00:00.000Z", "2026-07-16T00:00:00.000Z");
      expect(db.prepare("SELECT COUNT(*) AS count FROM plexus_app_presence_leases").get()).toEqual({ count: 2 });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
