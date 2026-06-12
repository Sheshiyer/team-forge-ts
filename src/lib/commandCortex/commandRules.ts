import { CORTEX_COMMANDS } from "./sampleGraph";
import type { CortexCommand, CortexCommandId, CortexNode } from "./types";

const STATE_COMMANDS: Record<CortexNode["state"], CortexCommandId[]> = {
  healthy: ["trace-signal", "generate-brief"],
  active: ["trace-signal", "summon-agent", "route-work", "generate-brief"],
  pending: ["trace-signal", "approve-synapse", "escalate-human", "generate-brief"],
  blocked: ["trace-signal", "quarantine-risk", "escalate-human", "stabilize-branch"],
  dormant: ["trace-signal", "extract-memory", "generate-brief"],
  archived: ["trace-signal", "extract-memory"],
};

export function getCommandsForNode(node: CortexNode, commands: CortexCommand[] = CORTEX_COMMANDS) {
  const explicit = new Set(node.commands ?? []);
  const stateCommands = STATE_COMMANDS[node.state] ?? [];
  for (const commandId of stateCommands) explicit.add(commandId);

  return commands.filter(
    (command) => explicit.has(command.id) && command.allowedNodeKinds.includes(node.kind),
  );
}

export function describeCommandStub(command: CortexCommand, node: CortexNode): string {
  switch (command.id) {
    case "trace-signal":
      return `Tracing signal around ${node.label}`;
    case "summon-agent":
      return `Summoning agent support for ${node.label}`;
    case "stabilize-branch":
      return `Stabilization requested for ${node.label}`;
    case "approve-synapse":
      return `Approval stub queued for ${node.label}`;
    case "escalate-human":
      return `Human escalation stub queued for ${node.label}`;
    case "split-pathway":
      return `Split pathway stub queued for ${node.label}`;
    case "extract-memory":
      return `Extracting memory context for ${node.label}`;
    case "route-work":
      return `Routing work from ${node.label}`;
    case "generate-brief":
      return `Brief stub generated for ${node.label}`;
    case "quarantine-risk":
      return `Risk quarantine stub queued for ${node.label}`;
  }
}
