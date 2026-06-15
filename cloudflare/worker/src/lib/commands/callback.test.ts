import { describe, it, expect } from "vitest";
import { parseCallbackBody } from "./callback";

describe("parseCallbackBody", () => {
  it("accepts a minimal in_progress envelope", () => {
    const v = parseCallbackBody({
      run_id: "run_1",
      correlation_id: "c-1",
      state: "in_progress",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.state).toBe("in_progress");
      expect(v.value.run_id).toBe("run_1");
    }
  });

  it("accepts a succeeded envelope with result", () => {
    const v = parseCallbackBody({
      run_id: "run_1",
      correlation_id: "c-1",
      state: "succeeded",
      result: { yesterday: ["x"], today: ["y"], blockers: [], confidence: 0.9 },
      completed_at: 1700000000000,
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.result?.yesterday).toEqual(["x"]);
  });

  it("accepts a failed envelope with error", () => {
    const v = parseCallbackBody({
      run_id: "run_1",
      correlation_id: "c-1",
      state: "failed",
      error: { code: "timeout", message: "agent did not respond", retryable: true },
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.error?.code).toBe("timeout");
  });

  it("accepts a partial envelope with partial_failures", () => {
    const v = parseCallbackBody({
      run_id: "run_1",
      correlation_id: "c-1",
      state: "partial",
      result: { aggregated: true },
      partial_failures: [{ agent_id: "agent-x", error_code: "no_data", error_message: "no signals today" }],
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.partial_failures).toHaveLength(1);
  });

  it("rejects non-object", () => {
    const v = parseCallbackBody("hello");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/object/);
  });

  it("rejects missing run_id", () => {
    const v = parseCallbackBody({ correlation_id: "c-1", state: "succeeded" });
    expect(v.ok).toBe(false);
  });

  it("rejects state not in enum", () => {
    const v = parseCallbackBody({ run_id: "r", correlation_id: "c-1", state: "bogus" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/state/);
  });

  it("rejects failed without error block", () => {
    const v = parseCallbackBody({ run_id: "r", correlation_id: "c-1", state: "failed" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/error/);
  });
});
