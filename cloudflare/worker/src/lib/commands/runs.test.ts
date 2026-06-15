import { describe, it, expect, beforeEach } from "vitest";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "./runs";
import type { CommandIntent } from "./types";

// In-memory D1 stub
function makeMockDb() {
  const runs = new Map<string, any>();
  const events: any[] = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO command_runs")) {
                const [id, command_id, actor_id, actor_kind, auth_mode, target_kind, target_id, correlation_id, requested_at] = args;
                runs.set(id, {
                  id, command_id, actor_id, actor_kind, auth_mode,
                  state: "created",
                  target_kind, target_id, correlation_id, requested_at,
                  accepted_at: null, completed_at: null,
                  result_json: null, error_code: null, error_message: null,
                });
                return { success: true };
              }
              if (sql.includes("INSERT INTO command_audit_events")) {
                events.push({ id: args[0], run_id: args[1], kind: args[2], actor_id: args[3], actor_kind: args[4], payload_json: args[5], occurred_at: args[6] });
                return { success: true };
              }
              if (sql.includes("UPDATE command_runs")) {
                const id = args[args.length - 1];
                const r = runs.get(id);
                if (r) {
                  r.state = args[0];
                  if (args[1] !== null && args[1] !== undefined) r.accepted_at = args[1];
                  if (args[2] !== null && args[2] !== undefined) r.completed_at = args[2];
                }
                return { success: true };
              }
              return { success: true };
            },
            async first() {
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE id")) {
                return runs.get(args[0]) ?? null;
              }
              return null;
            },
          };
        },
      };
    },
    __events: events,
  } as any;
}

describe("command runs", () => {
  let db: any;
  beforeEach(() => { db = makeMockDb(); });

  it("createRun stores a row in state=created", async () => {
    const intent: CommandIntent = {
      id: "ts-standup",
      actor_id: "founder-1",
      actor_kind: "founder",
      auth_mode: "cf_access",
      target_kind: "project",
      target_id: "proj-1",
      correlation_id: "c-1",
      payload: {},
    };
    const run = await createRun(db, intent, Date.now());
    expect(run.state).toBe("created");
    expect(run.command_id).toBe("ts-standup");
    expect(run.id).toBeTruthy();
    expect(run.id.startsWith("run_")).toBe(true);
  });

  it("transitionRun moves created → accepted with accepted_at timestamp", async () => {
    const intent: CommandIntent = {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-2", payload: {},
    };
    const run = await createRun(db, intent, 1000);
    await transitionRun(db, run.id, "accepted", 2000);
    const updated = await getRunById(db, run.id);
    expect(updated?.state).toBe("accepted");
    expect(updated?.accepted_at).toBe(2000);
  });

  it("recordAuditEvent inserts an audit row", async () => {
    const intent: CommandIntent = {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-3", payload: {},
    };
    const run = await createRun(db, intent, 1000);
    await recordAuditEvent(db, run.id, "command_received", "f", "founder", { hello: "world" }, 1001);
    expect(db.__events).toHaveLength(1);
    expect(db.__events[0].kind).toBe("command_received");
    expect(db.__events[0].run_id).toBe(run.id);
    expect(JSON.parse(db.__events[0].payload_json)).toEqual({ hello: "world" });
  });
});
