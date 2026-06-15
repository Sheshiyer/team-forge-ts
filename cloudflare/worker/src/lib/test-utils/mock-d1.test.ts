import { describe, it, expect } from "vitest";
import { makeMockDb } from "./mock-d1";

describe("mock-d1 result-column extension", () => {
  it("UPDATE command_runs SET result_json persists into the row", async () => {
    const { db, runs } = makeMockDb();
    // Seed a row
    await db
      .prepare(
        `INSERT INTO command_runs (id, command_id, actor_id, actor_kind, auth_mode, state, target_kind, target_id, correlation_id, requested_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
      )
      .bind("run_1", "ts-standup", "f", "founder", "cf_access", null, null, "corr-1", 1000)
      .run();
    // Update with result
    await db
      .prepare(
        `UPDATE command_runs SET result_json = ?, error_code = ?, error_message = ?, state = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
      )
      .bind(JSON.stringify({ ok: true }), null, null, "succeeded", 2000, "run_1")
      .run();
    const row = runs.get("run_1");
    expect(row?.state).toBe("succeeded");
    expect(row?.result_json).toBe(JSON.stringify({ ok: true }));
    expect(row?.completed_at).toBe(2000);
  });

  it("SELECT by correlation_id returns the matching row", async () => {
    const { db } = makeMockDb();
    await db
      .prepare(
        `INSERT INTO command_runs (id, command_id, actor_id, actor_kind, auth_mode, state, target_kind, target_id, correlation_id, requested_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
      )
      .bind("run_2", "ts-standup", "f", "founder", "cf_access", null, null, "corr-find", 1000)
      .run();
    const row = await db
      .prepare(`SELECT * FROM command_runs WHERE correlation_id = ? ORDER BY requested_at DESC LIMIT 1`)
      .bind("corr-find")
      .first();
    expect(row).not.toBeNull();
    expect((row as { id: string }).id).toBe("run_2");
  });
});
