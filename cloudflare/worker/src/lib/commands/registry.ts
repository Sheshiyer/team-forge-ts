import type { ActorKind, CommandRoute, CommandStateOwner } from "./types";

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
  route: CommandRoute;
  /** Hermes/Cambium lane that owns the command after intake. */
  operator_lane: string;
  /** Whether this command mutates state. */
  mutates: boolean;
  /** State owner — teamforge owns the run record; route owns the execution leg. */
  state_owner: CommandStateOwner;
}

export const COMMAND_REGISTRY: CommandSpec[] = [
  {
    id: "ts-standup",
    label: "Standup",
    description: "Aggregate read-only standup data via the Hermes daily-standup autopilot.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "hermes_bridge",
    operator_lane: "founder_standup",
    mutates: false,
    state_owner: "cambium",
  },
  {
    id: "ts-summon-agent",
    label: "Summon Agent",
    description: "Bring a specific agent into a project/client branch.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "cambium_operator",
    operator_lane: "quest_spawn",
    mutates: true,
    state_owner: "cambium",
  },
  {
    id: "ts-approve-synapse",
    label: "Approve Synapse",
    description: "Approve a pending decision gate (e.g. PR review).",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "cambium_operator",
    operator_lane: "approval_gate",
    mutates: true,
    state_owner: "cambium",
  },
  {
    id: "ts-status",
    label: "Status",
    description: "Read-only founder status snapshot for TeamForge control-plane health.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "cambium_operator",
    operator_lane: "status_snapshot",
    mutates: false,
    state_owner: "cambium",
  },
  {
    id: "ts-trace-signal",
    label: "Trace Signal",
    description: "Read-only: surface recent events for a node.",
    allowed_actor_kinds: ["founder", "cofounder", "employee"],
    route: "cambium_operator",
    operator_lane: "signal_trace",
    mutates: false,
    state_owner: "cambium",
  },
  {
    id: "ts-generate-brief",
    label: "Generate Brief",
    description: "Synthesize a tactical brief from node context.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "hermes_bridge",
    operator_lane: "brief_synthesis",
    mutates: false,
    state_owner: "cambium",
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
