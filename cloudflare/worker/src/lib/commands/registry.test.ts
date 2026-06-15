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
    expect(ids).toContain("ts-standup");
    expect(ids).toContain("ts-summon-agent");
    expect(ids).toContain("ts-approve-synapse");
  });

  it("every command declares route — downstream/local/worker-only", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(["downstream_multica", "local_worker", "downstream_paperclip"]).toContain(spec.route);
    }
  });
});
