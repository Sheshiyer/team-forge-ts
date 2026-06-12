import type {
  ActiveProjectIssueView,
  ActivityItem,
  ClientView,
  FounderCommandCenterView,
  PaperclipOrgView,
  PresenceStatus,
} from "../types";
import { sampleCortexGraph } from "./sampleGraph";
import type {
  CortexGraph,
  CortexNode,
  CortexPath,
  CortexSignal,
  CortexSignalState,
  CortexSourceSystem,
} from "./types";

export interface MissionGraphInput {
  founder?: FounderCommandCenterView | null;
  org?: PaperclipOrgView | null;
  clients?: ClientView[] | null;
  issues?: ActiveProjectIssueView[] | null;
  activity?: ActivityItem[] | null;
  presence?: PresenceStatus[] | null;
}

function sourceSystem(value: string | null | undefined): CortexSourceSystem {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "paperclip") return "paperclip";
  if (normalized === "clockify") return "clockify";
  if (normalized === "huly") return "huly";
  if (normalized === "github") return "github";
  if (normalized === "slack") return "slack";
  if (normalized === "manual") return "manual";
  return "teamforge";
}

function statusState(value: string | null | undefined): CortexSignalState {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "active";
  if (["closed", "complete", "completed", "healthy", "canonical", "active"].includes(normalized)) return "healthy";
  if (["blocked", "critical", "failed", "at-risk", "risk", "open"].includes(normalized)) return "blocked";
  if (["review", "pending", "triage", "paused", "stale"].some((needle) => normalized.includes(needle))) return "pending";
  if (["archived", "done"].includes(normalized)) return "archived";
  return "active";
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildMissionGraph(input: MissionGraphInput = {}): CortexGraph {
  const hasLiveInput = Boolean(
    input.founder || input.org || input.clients?.length || input.issues?.length || input.activity?.length || input.presence?.length,
  );

  if (!hasLiveInput) return sampleCortexGraph;

  const nodes: CortexNode[] = [];
  const paths: CortexPath[] = [];
  const signals: CortexSignal[] = [];

  const summary = input.founder?.summary;
  nodes.push({
    id: "mission:current",
    kind: "mission",
    label: "Mission Nucleus",
    state: summary && summary.unresolvedReviewItems > 0 ? "pending" : "active",
    position: { x: 500, y: 330 },
    source: "teamforge",
    summary: "Live founder command surface synthesized from Team Forge integrations.",
    metrics: [
      { label: "Active streams", value: String(summary?.activeDeliveryStreams ?? input.founder?.activeStreams.length ?? 0), state: "active" },
      { label: "Review queue", value: String(summary?.unresolvedReviewItems ?? 0), state: (summary?.unresolvedReviewItems ?? 0) > 0 ? "pending" : "healthy" },
      { label: "At-risk clients", value: String(summary?.atRiskClients ?? 0), state: (summary?.atRiskClients ?? 0) > 0 ? "blocked" : "healthy" },
    ],
    commands: ["trace-signal", "summon-agent", "route-work", "generate-brief"],
    lensAffinity: ["mission", "risk", "signals"],
  });

  const clients = (input.clients ?? []).slice(0, 5);
  clients.forEach((client, index) => {
    const angle = -2.55 + index * 0.46;
    const state = client.operationalSignals.daysRemaining !== null && client.operationalSignals.daysRemaining < 30
      ? "blocked"
      : client.registryStatus === "canonical"
        ? "healthy"
        : "pending";
    nodes.push({
      id: `client:${client.id}`,
      kind: "client",
      label: client.name,
      state,
      position: { x: 500 + Math.cos(angle) * 330, y: 330 + Math.sin(angle) * 190 },
      source: "teamforge",
      summary: client.profile?.engagementModel ?? client.operationalSignals.inferredIndustry ?? "Operational client cluster.",
      metrics: [
        { label: "Registry", value: client.registryStatus, state },
        { label: "Days left", value: client.operationalSignals.daysRemaining === null ? "--" : String(client.operationalSignals.daysRemaining), state },
      ],
      commands: ["trace-signal", "stabilize-branch", "generate-brief"],
      lensAffinity: ["clients", "mission", "risk"],
    });
    paths.push({ id: `path:mission-client:${client.id}`, kind: "ownership", from: "mission:current", to: `client:${client.id}`, state, source: "teamforge", signalCount: 1 });
  });

  const streams = (input.founder?.activeStreams ?? []).slice(0, 6);
  streams.forEach((stream, index) => {
    const state = stream.attention === "blocked" || stream.openIssues > 8 ? "blocked" : stream.attention === "review" ? "pending" : "active";
    const nodeId = `project:${stream.projectId ?? stream.id}`;
    const client = clients[index % Math.max(clients.length, 1)];
    nodes.push({
      id: nodeId,
      kind: "project",
      label: stream.title,
      state,
      position: { x: 240 + index * 118, y: index % 2 === 0 ? 150 : 505 },
      source: sourceSystem(stream.source),
      summary: `${stream.status} / ${stream.source}${stream.repo ? ` / ${stream.repo}` : ""}`,
      metrics: [
        { label: "Complete", value: `${clampPercent(stream.percentComplete)}%`, state },
        { label: "Open issues", value: String(stream.openIssues), state: stream.openIssues > 0 ? "pending" : "healthy" },
      ],
      commands: ["trace-signal", "summon-agent", "split-pathway", "route-work", "generate-brief"],
      lensAffinity: ["work", "mission", "signals"],
    });
    paths.push({
      id: `path:${client ? `client:${client.id}` : "mission:current"}-${nodeId}`,
      kind: "execution",
      from: client ? `client:${client.id}` : "mission:current",
      to: nodeId,
      state,
      source: sourceSystem(stream.source),
      signalCount: Math.max(1, stream.openIssues),
      label: stream.source,
    });
  });

  const issues = (input.issues ?? []).filter((issue) => issue.state.toLowerCase() === "open").slice(0, 5);
  issues.forEach((issue, index) => {
    const projectId = issue.projectId ? `project:${issue.projectId}` : "mission:current";
    const nodeId = `issue:${issue.id}`;
    const state = issue.priority === "critical" || issue.priority === "high" ? "blocked" : "pending";
    nodes.push({
      id: nodeId,
      kind: "issue",
      label: issue.title,
      state,
      position: { x: 625 + (index % 3) * 95, y: 135 + index * 72 },
      source: "github",
      summary: `${issue.repo}#${issue.number}${issue.clientName ? ` / ${issue.clientName}` : ""}`,
      metrics: [
        { label: "Priority", value: issue.priority ?? "open", state },
        { label: "Track", value: issue.track ?? "--", state: "active" },
      ],
      commands: ["trace-signal", "approve-synapse", "escalate-human", "quarantine-risk"],
      lensAffinity: ["risk", "work", "mission"],
    });
    paths.push({ id: `path:${projectId}-${nodeId}`, kind: "risk", from: projectId, to: nodeId, state, source: "github", signalCount: 1, label: issue.priority ?? "open" });
  });

  const orgNodes = (input.org?.nodes ?? []).slice(0, 5);
  orgNodes.forEach((agent, index) => {
    const state = agent.telemetry?.status === "healthy" ? "healthy" : agent.escalationCount > 0 ? "pending" : "active";
    const nodeId = `agent:${agent.user.userId}`;
    nodes.push({
      id: nodeId,
      kind: "agent",
      label: agent.user.userName,
      state,
      position: { x: 805, y: 155 + index * 86 },
      source: "paperclip",
      summary: `${agent.activeTaskCount} active tasks / ${agent.escalationCount} escalations`,
      metrics: [
        { label: "Tasks", value: String(agent.activeTaskCount), state },
        { label: "Rooms", value: String(agent.roomCount), state: "active" },
      ],
      commands: ["trace-signal", "generate-brief", "escalate-human"],
      lensAffinity: ["agents", "signals", "mission"],
    });
    paths.push({ id: `path:mission-${nodeId}`, kind: "handoff", from: "mission:current", to: nodeId, state, source: "paperclip", signalCount: agent.activeTaskCount, label: "agent" });
  });

  const presence = (input.presence ?? []).slice(0, 4);
  presence.forEach((person, index) => {
    const state = person.combinedStatus === "active" ? "active" : person.combinedStatus === "idle" ? "pending" : "dormant";
    const nodeId = `human:${person.employeeName}`;
    nodes.push({
      id: nodeId,
      kind: "human",
      label: person.employeeName,
      state,
      position: { x: 320 + index * 120, y: 590 },
      source: person.clockifyTimerActive ? "clockify" : "manual",
      summary: person.clockifyProject ?? "Human anchor node.",
      commands: ["trace-signal", "generate-brief"],
      lensAffinity: ["signals", "mission"],
    });
    paths.push({ id: `path:mission-${nodeId}`, kind: "handoff", from: "mission:current", to: nodeId, state, source: "manual", signalCount: 1, label: "human" });
  });

  const activity = (input.activity ?? []).slice(0, 10);
  activity.forEach((item, index) => {
    const path = paths[index % Math.max(paths.length, 1)];
    if (!path) return;
    signals.push({
      id: `signal:${index}:${item.occurredAt}`,
      pathId: path.id,
      state: statusState(item.status) === "blocked" ? "blocked" : "active",
      source: sourceSystem(item.source),
      label: `${item.employeeName}: ${item.action}`,
      occurredAt: item.occurredAt,
    });
  });

  if (signals.length === 0) {
    signals.push(...sampleCortexGraph.signals);
  }

  return {
    id: "mission-cortex-live",
    label: "Mission Cortex Live Graph",
    generatedAt: new Date().toISOString(),
    nodes: unique(nodes),
    paths: unique(paths).filter((path) => nodes.some((node) => node.id === path.from) && nodes.some((node) => node.id === path.to)),
    signals,
  };
}
