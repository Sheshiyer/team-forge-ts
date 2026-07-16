import type { ActorKind, CommandOwner, CommandRoute, CommandStateOwner } from "./types";

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
  /** Surviving system accountable for this command vocabulary. */
  owner: CommandOwner;
  /** Whether this command mutates state. */
  mutates: boolean;
  /** State owner — teamforge owns the run record; route owns the execution leg. */
  state_owner: CommandStateOwner;
}

export const COMMAND_REGISTRY: CommandSpec[] = [
  {
    id: "ts-trace-signal",
    label: "Trace Signal",
    description: "Read-only: surface recent events for a node.",
    allowed_actor_kinds: ["founder", "cofounder", "employee"],
    route: "local_worker",
    owner: "cambium",
    mutates: false,
    state_owner: "teamforge",
  },
];

export interface RetiredCommandSpec {
  id: string;
  label: string;
  replacement_owner: CommandOwner;
  replacement_surface: string;
}

/**
 * Legacy IDs remain recognizable so callers receive an actionable retirement
 * response, but they are deliberately outside COMMAND_REGISTRY and can never
 * create command_runs rows.
 */
export const RETIRED_COMMANDS: RetiredCommandSpec[] = [
  {
    id: "ts-standup",
    label: "Standup",
    replacement_owner: "hermes",
    replacement_surface: "Hermes /ts-standup backed by Cambium routine evidence",
  },
  {
    id: "ts-summon-agent",
    label: "Summon Agent",
    replacement_owner: "cambium",
    replacement_surface: "Cambium quest and operator intake",
  },
  {
    id: "ts-approve-synapse",
    label: "Approve Synapse",
    replacement_owner: "cambium",
    replacement_surface: "Cambium gate queue",
  },
  {
    id: "ts-generate-brief",
    label: "Generate Brief",
    replacement_owner: "hermes",
    replacement_surface: "Hermes synthesis over Cambium evidence",
  },
];

const REGISTRY_BY_ID = new Map(COMMAND_REGISTRY.map((s) => [s.id, s]));
const RETIRED_BY_ID = new Map(RETIRED_COMMANDS.map((s) => [s.id, s]));

export function getCommandSpec(id: string): CommandSpec | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

export function getRetiredCommandSpec(id: string): RetiredCommandSpec | null {
  return RETIRED_BY_ID.get(id) ?? null;
}

/** Check whether an actor kind is allowed to issue a command. */
export function isAuthorized(commandId: string, actorKind: ActorKind): boolean {
  const spec = getCommandSpec(commandId);
  return spec ? spec.allowed_actor_kinds.includes(actorKind) : false;
}
