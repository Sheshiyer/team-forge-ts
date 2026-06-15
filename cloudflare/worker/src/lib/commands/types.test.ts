import { describe, it, expect } from "vitest";
import type { ActorKind, AuthMode, CommandIntent, CommandRunState, AuditEventKind } from "./types";

describe("types module", () => {
  it("exports the actor kinds", () => {
    const kinds: ActorKind[] = ["founder", "cofounder", "employee", "multica_service", "paperclip_agent"];
    expect(kinds).toHaveLength(5);
  });

  it("exports the auth modes", () => {
    const modes: AuthMode[] = ["cf_access", "m2m", "app_bearer", "aws_task_role", "paperclip_token"];
    expect(modes).toHaveLength(5);
  });

  it("exports the run states", () => {
    const states: CommandRunState[] = [
      "created", "accepted", "in_progress",
      "succeeded", "failed", "partial", "cancelled",
    ];
    expect(states).toHaveLength(7);
  });

  it("CommandIntent has id, actor, auth_mode, target", () => {
    const intent: CommandIntent = {
      id: "ts-standup",
      actor_id: "user-1",
      actor_kind: "founder",
      auth_mode: "cf_access",
      target_kind: "project",
      target_id: "proj-1",
      correlation_id: "c-1",
      payload: {},
    };
    expect(intent.id).toBe("ts-standup");
  });

  it("AuditEventKind enumerates the 9 documented event kinds", () => {
    const kinds: AuditEventKind[] = [
      "command_received", "run_created",
      "downstream_agent_contacted", "downstream_agent_responded",
      "result_received", "result_delivered",
      "failure", "partial_failure", "cancelled",
    ];
    expect(kinds).toHaveLength(9);
  });
});
