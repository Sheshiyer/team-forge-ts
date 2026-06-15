import { describe, it, expect, beforeEach } from "vitest";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "./runs";
import type { CommandIntent } from "./types";
import { makeMockDb, type MockDbHandle } from "../test-utils/mock-d1";

describe("command runs", () => {
  let mock: MockDbHandle;
  beforeEach(() => {
    mock = makeMockDb();
  });

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
    const run = await createRun(mock.db, intent, Date.now());
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
    const run = await createRun(mock.db, intent, 1000);
    await transitionRun(mock.db, run.id, "accepted", 2000);
    const updated = await getRunById(mock.db, run.id);
    expect(updated?.state).toBe("accepted");
    expect(updated?.accepted_at).toBe(2000);
  });

  it("recordAuditEvent inserts an audit row", async () => {
    const intent: CommandIntent = {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-3", payload: {},
    };
    const run = await createRun(mock.db, intent, 1000);
    await recordAuditEvent(mock.db, run.id, "command_received", "f", "founder", { hello: "world" }, 1001);
    expect(mock.events).toHaveLength(1);
    expect(mock.events[0].kind).toBe("command_received");
    expect(mock.events[0].run_id).toBe(run.id);
    expect(JSON.parse(mock.events[0].payload_json as string)).toEqual({ hello: "world" });
  });
});
