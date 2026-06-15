import type { CortexCommandId } from "./types";

/**
 * Mapping from the cortex UI's shorthand command IDs (no prefix) to the
 * canonical `ts-` IDs registered in the Worker's COMMAND_REGISTRY. Any new
 * cortex command id MUST also be added to the Worker registry and listed
 * here, otherwise the intent POST will return 400 unknown_command.
 *
 * Source of truth for the Worker side:
 *   cloudflare/worker/src/lib/commands/registry.ts
 *
 * `null` entries are commands the cortex UI exposes today but the Worker
 * registry has not yet adopted. Calling those still falls back to the local
 * describeCommandStub preview — the page handler annotates them with
 * "(not yet wired to registry)" so the founder can tell the difference
 * between a no-op preview and a real intent in flight.
 */
const SHORTHAND_TO_REGISTRY: Record<CortexCommandId, string | null> = {
  "trace-signal": "ts-trace-signal",
  "summon-agent": "ts-summon-agent",
  "stabilize-branch": null,        // not yet in Phase 1-3 registry
  "approve-synapse": "ts-approve-synapse",
  "escalate-human": null,           // not yet in registry
  "split-pathway": null,            // not yet in registry
  "extract-memory": null,           // not yet in registry
  "route-work": null,               // not yet in registry
  "generate-brief": "ts-generate-brief",
  "quarantine-risk": null,          // not yet in registry
};

export function registryIdForShorthand(shorthand: CortexCommandId): string | null {
  return SHORTHAND_TO_REGISTRY[shorthand] ?? null;
}

/**
 * The ts-standup command isn't bound to any single cortex shorthand — it's
 * issued when the Hermes-Sync node fires a standup. This helper centralizes
 * the constant so the page doesn't hardcode "ts-standup".
 */
export const TS_STANDUP_COMMAND_ID = "ts-standup";
