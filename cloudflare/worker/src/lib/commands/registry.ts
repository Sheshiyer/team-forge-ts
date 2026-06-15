import type { ActorKind } from "./types";

/** A registered command. */
export interface CommandSpec {
  /** Canonical ID prefixed with ts- (founder vocabulary). */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Description of what executing this command does. */
  description: string;
  /** Who is allowed to issue this command. */
  allowed_actor_kinds: ActorKind[];
  /** Where execution happens. */
  route: "downstream_multica" | "local_worker" | "downstream_paperclip";
  /** Whether this command mutates state. */
  mutates: boolean;
  /** State owner — who is canonical for the result. */
  state_owner: "teamforge" | "multica" | "paperclip";
}

export const COMMAND_REGISTRY: CommandSpec[] = [
  {
    id: "ts-standup",
    label: "Standup",
    description: "Aggregate read-only standup data from a project's dedicated Paperclip agent.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_multica",
    mutates: false,
    state_owner: "teamforge",
  },
  {
    id: "ts-summon-agent",
    label: "Summon Agent",
    description: "Bring a specific agent into a project/client branch.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: true,
    state_owner: "teamforge",
  },
  {
    id: "ts-approve-synapse",
    label: "Approve Synapse",
    description: "Approve a pending decision gate (e.g. PR review).",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: true,
    state_owner: "teamforge",
  },
  {
    id: "ts-trace-signal",
    label: "Trace Signal",
    description: "Read-only: surface recent events for a node.",
    allowed_actor_kinds: ["founder", "cofounder", "employee"],
    route: "local_worker",
    mutates: false,
    state_owner: "teamforge",
  },
  {
    id: "ts-generate-brief",
    label: "Generate Brief",
    description: "Synthesize a tactical brief from node context.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: false,
    state_owner: "teamforge",
  },
];

const REGISTRY_BY_ID = new Map(COMMAND_REGISTRY.map((s) => [s.id, s]));

export function getCommandSpec(id: string): CommandSpec | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

/** Check whether an actor kind is allowed to issue a command. */
export function isAuthorized(commandId: string, actorKind: ActorKind): boolean {
  const spec = getCommandSpec(commandId);
  return spec ? spec.allowed_actor_kinds.includes(actorKind) : false;
}
