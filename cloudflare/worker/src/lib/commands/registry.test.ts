import { describe, expect, it } from "vitest";
import {
  COMMAND_REGISTRY,
  RETIRED_COMMANDS,
  getCommandSpec,
  getRetiredCommandSpec,
} from "./registry";

describe("command registry", () => {
  it("keeps only the Worker-owned command active", () => {
    expect(COMMAND_REGISTRY.map((spec) => spec.id)).toEqual(["ts-trace-signal"]);
    expect(getCommandSpec("ts-trace-signal")).toMatchObject({
      route: "local_worker",
      owner: "cambium",
    });
  });

  it("rejects unknown command IDs", () => {
    expect(getCommandSpec("nope")).toBeNull();
    expect(getRetiredCommandSpec("nope")).toBeNull();
  });

  it("keeps retired IDs outside the active registry with explicit replacements", () => {
    expect(RETIRED_COMMANDS.map((spec) => spec.id).sort()).toEqual([
      "ts-approve-synapse",
      "ts-generate-brief",
      "ts-standup",
      "ts-summon-agent",
    ]);
    expect(getCommandSpec("ts-standup")).toBeNull();
    expect(getRetiredCommandSpec("ts-standup")).toMatchObject({
      replacement_owner: "hermes",
    });
    expect(RETIRED_COMMANDS.every((spec) => spec.replacement_surface.length > 0)).toBe(true);
  });

  it("every active command declares a surviving owner", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(["hermes", "cambium"]).toContain(spec.owner);
    }
  });
});
