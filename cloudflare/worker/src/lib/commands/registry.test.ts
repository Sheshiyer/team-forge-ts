import { describe, it, expect } from "vitest";
import { COMMAND_REGISTRY, getCommandSpec } from "./registry";

describe("command registry", () => {
  it("registers ts-standup", () => {
    const spec = getCommandSpec("ts-standup");
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("ts-standup");
    expect(spec?.allowed_actor_kinds).toContain("founder");
  });

  it("rejects unknown command IDs", () => {
    expect(getCommandSpec("nope")).toBeNull();
  });

  it("registry includes the founder vocabulary", () => {
    const ids = COMMAND_REGISTRY.map((s) => s.id).sort();
    expect(ids).toContain("ts-status");
    expect(ids).toContain("ts-standup");
    expect(ids).toContain("ts-summon-agent");
    expect(ids).toContain("ts-approve-synapse");
  });

  it("registers ts-status as founder/cofounder cambium_operator", () => {
    const spec = getCommandSpec("ts-status");
    expect(spec).toMatchObject({
      id: "ts-status",
      route: "cambium_operator",
      operator_lane: "status_snapshot",
      mutates: false,
      state_owner: "cambium",
    });
    expect(spec?.allowed_actor_kinds).toEqual(["founder", "cofounder"]);
  });

  it("every active command declares a Hermes/Cambium route", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(["hermes_bridge", "cambium_operator"]).toContain(spec.route);
    }
  });

  it("every command declares a non-empty operator_lane", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(typeof spec.operator_lane).toBe("string");
      expect(spec.operator_lane.length).toBeGreaterThan(0);
    }
  });

  it("does not register new work to the legacy MultiCA drain", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(spec.route).not.toBe("legacy_multica");
      expect("multica_agent" in spec).toBe(false);
    }
  });
});
