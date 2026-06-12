import type { CortexLensId, CortexNodeKind, CortexPathKind, CortexSignalState } from "./types";

export interface CortexLensDefinition {
  id: CortexLensId;
  label: string;
  legacyPages: string[];
  primaryNodeKinds: CortexNodeKind[];
  primaryPathKinds: CortexPathKind[];
  emphasizedStates: CortexSignalState[];
  intentPlaceholder: string;
}

export const CORTEX_LENSES: CortexLensDefinition[] = [
  {
    id: "mission",
    label: "Mission",
    legacyPages: ["Overview", "Inbox"],
    primaryNodeKinds: ["mission", "project", "issue", "approval"],
    primaryPathKinds: ["execution", "risk", "handoff"],
    emphasizedStates: ["active", "pending", "blocked"],
    intentPlaceholder: "Trace signal, summarize mission, stabilize branch...",
  },
  {
    id: "agents",
    label: "Agents",
    legacyPages: ["Agents", "Team"],
    primaryNodeKinds: ["agent", "human", "approval"],
    primaryPathKinds: ["handoff", "execution", "ownership"],
    emphasizedStates: ["healthy", "active", "pending", "blocked"],
    intentPlaceholder: "Summon agent, inspect trace, approve synapse...",
  },
  {
    id: "work",
    label: "Work",
    legacyPages: ["Projects", "Sprints", "Boards"],
    primaryNodeKinds: ["project", "issue", "agent", "human"],
    primaryPathKinds: ["execution", "ownership", "risk"],
    emphasizedStates: ["active", "pending", "blocked"],
    intentPlaceholder: "Route work, split pathway, generate brief...",
  },
  {
    id: "clients",
    label: "Clients",
    legacyPages: ["Clients", "Onboarding"],
    primaryNodeKinds: ["client", "project", "issue"],
    primaryPathKinds: ["ownership", "execution", "risk"],
    emphasizedStates: ["healthy", "active", "pending", "blocked"],
    intentPlaceholder: "Stabilize client, inspect obligations, trace risk...",
  },
  {
    id: "risk",
    label: "Risk",
    legacyPages: ["Issues", "Settings"],
    primaryNodeKinds: ["issue", "approval", "project", "client"],
    primaryPathKinds: ["risk", "handoff"],
    emphasizedStates: ["pending", "blocked"],
    intentPlaceholder: "Quarantine risk, escalate human, approve synapse...",
  },
  {
    id: "signals",
    label: "Signals",
    legacyPages: ["Activity", "Timesheet", "Calendar", "Comms"],
    primaryNodeKinds: ["agent", "human", "routine", "project"],
    primaryPathKinds: ["routine", "handoff", "execution"],
    emphasizedStates: ["healthy", "active", "pending"],
    intentPlaceholder: "Trace signal, inspect rhythm, detect anomaly...",
  },
  {
    id: "memory",
    label: "Memory",
    legacyPages: ["Knowledge", "Goals", "Routines"],
    primaryNodeKinds: ["memory", "routine", "mission", "project"],
    primaryPathKinds: ["memory", "routine", "execution"],
    emphasizedStates: ["healthy", "active", "dormant"],
    intentPlaceholder: "Extract memory, attach context, synthesize brief...",
  },
];

export function getCortexLens(id: CortexLensId): CortexLensDefinition {
  return CORTEX_LENSES.find((lens) => lens.id === id) ?? CORTEX_LENSES[0];
}
