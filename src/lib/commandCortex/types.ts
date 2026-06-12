export type CortexLensId =
  | "mission"
  | "agents"
  | "work"
  | "clients"
  | "risk"
  | "signals"
  | "memory";

export type CortexNodeKind =
  | "mission"
  | "client"
  | "project"
  | "issue"
  | "agent"
  | "human"
  | "memory"
  | "routine"
  | "approval";

export type CortexPathKind =
  | "ownership"
  | "execution"
  | "handoff"
  | "risk"
  | "memory"
  | "routine";

export type CortexSignalState =
  | "healthy"
  | "active"
  | "pending"
  | "blocked"
  | "dormant"
  | "archived";

export type CortexSourceSystem =
  | "teamforge"
  | "paperclip"
  | "clockify"
  | "huly"
  | "github"
  | "slack"
  | "manual";

export type CortexCommandId =
  | "trace-signal"
  | "summon-agent"
  | "stabilize-branch"
  | "approve-synapse"
  | "escalate-human"
  | "split-pathway"
  | "extract-memory"
  | "route-work"
  | "generate-brief"
  | "quarantine-risk";

export interface CortexPoint {
  x: number;
  y: number;
}

export interface CortexNodeMetric {
  label: string;
  value: string;
  state?: CortexSignalState;
}

export interface CortexNode {
  id: string;
  kind: CortexNodeKind;
  label: string;
  state: CortexSignalState;
  position: CortexPoint;
  source: CortexSourceSystem;
  summary?: string;
  metrics?: CortexNodeMetric[];
  commands?: CortexCommandId[];
  lensAffinity?: CortexLensId[];
}

export interface CortexPath {
  id: string;
  kind: CortexPathKind;
  from: string;
  to: string;
  state: CortexSignalState;
  source: CortexSourceSystem;
  signalCount?: number;
  label?: string;
}

export interface CortexSignal {
  id: string;
  pathId: string;
  state: CortexSignalState;
  source: CortexSourceSystem;
  label: string;
  occurredAt?: string;
}

export interface CortexGraph {
  id: string;
  label: string;
  generatedAt: string;
  nodes: CortexNode[];
  paths: CortexPath[];
  signals: CortexSignal[];
}

export interface CortexCommand {
  id: CortexCommandId;
  label: string;
  description: string;
  allowedNodeKinds: CortexNodeKind[];
}
