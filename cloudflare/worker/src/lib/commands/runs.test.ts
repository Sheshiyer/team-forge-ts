import { describe, it, expect, beforeEach } from "vitest";
import { createRun, getRunById, getRunByCorrelationId, listRunsByState, recordAuditEvent, recordRunResult, transitionRun } from "./runs";
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

  it("recordRunResult stores terminal payload and error fields", async () => {
    const intent: CommandIntent = {
      id: "ts-status", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-4", payload: {},
    };
    const run = await createRun(mock.db, intent, 1000);
    await transitionRun(mock.db, run.id, "accepted", 1500);
    await recordRunResult(mock.db, run.id, "succeeded", "{\"overall\":\"healthy\"}", null, null, 2000);
    const updated = await getRunById(mock.db, run.id);
    expect(updated?.state).toBe("succeeded");
    expect(updated?.result_json).toBe("{\"overall\":\"healthy\"}");
    expect(updated?.completed_at).toBe(2000);
    expect(updated?.error_code).toBeNull();
  });
});

describe("getRunByCorrelationId", () => {
  it("returns the most recent run for a correlation_id", async () => {
    const { db } = makeMockDb();
    const r1 = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "corr-shared", payload: {},
    }, 1000);
    const r2 = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "corr-shared", payload: {},
    }, 2000);
    const found = await getRunByCorrelationId(db, "corr-shared");
    expect(found?.id).toBe(r2.id);
  });

  it("returns null for an unknown correlation_id", async () => {
    const { db } = makeMockDb();
    const found = await getRunByCorrelationId(db, "missing");
    expect(found).toBeNull();
  });
});

describe("listRunsByState", () => {
  it("returns rows matching state in requested_at ASC order, respects limit", async () => {
    const { db } = makeMockDb();
    const r1 = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-list-1", payload: {},
    }, 1000);
    const r2 = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-list-2", payload: {},
    }, 2000);
    const r3 = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-list-3", payload: {},
    }, 3000);
    // Bump r2 out of "created"
    await transitionRun(db, r2.id, "accepted", 2500);

    const found = await listRunsByState(db, "created", null, 10);
    expect(found.map((r) => r.id)).toEqual([r1.id, r3.id]);
    expect((found[0].requested_at as number)).toBeLessThan(found[1].requested_at as number);

    // Limit enforcement — only the first row (ASC) returned
    const limited = await listRunsByState(db, "created", null, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0].id).toBe(r1.id);
  });

  it("commandIds filter returns only matching command_ids", async () => {
    const { db } = makeMockDb();
    const standupRun = await createRun(db, {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-f-1", payload: {},
    }, 1000);
    const briefRun = await createRun(db, {
      id: "ts-generate-brief", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-f-2", payload: {},
    }, 1500);
    const traceRun = await createRun(db, {
      id: "ts-trace-signal", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-f-3", payload: {},
    }, 2000);

    // Filter to only ts-standup + ts-generate-brief
    const downstream = await listRunsByState(db, "created", ["ts-standup", "ts-generate-brief"], 10);
    const ids = downstream.map((r) => r.command_id);
    expect(ids).toContain("ts-standup");
    expect(ids).toContain("ts-generate-brief");
    expect(ids).not.toContain("ts-trace-signal");
    // ordering still ASC by requested_at
    expect(downstream[0].id).toBe(standupRun.id);
    expect(downstream[1].id).toBe(briefRun.id);

    // Empty array short-circuits to no results
    const empty = await listRunsByState(db, "created", [], 10);
    expect(empty).toEqual([]);

    // Single-element filter
    const only = await listRunsByState(db, "created", ["ts-trace-signal"], 10);
    expect(only).toHaveLength(1);
    expect(only[0].id).toBe(traceRun.id);
  });
});
