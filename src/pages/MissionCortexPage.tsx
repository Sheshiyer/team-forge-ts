import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CORTEX_LENSES } from "../lib/commandCortex/lensTypes";
import { CORTEX_COMMANDS, sampleCortexGraph } from "../lib/commandCortex/sampleGraph";
import { buildMissionGraph } from "../lib/commandCortex/buildMissionGraph";
import { describeCommandStub } from "../lib/commandCortex/commandRules";
import {
  registryIdForShorthand,
  TS_STANDUP_COMMAND_ID,
} from "../lib/commandCortex/cortexToRegistry";
import type { CortexGraph, CortexLensId } from "../lib/commandCortex/types";
import type { FounderCommandIntent, FounderCommandRun } from "../lib/types";
import MissionCortex from "../components/cortex/MissionCortex";
import { useInvoke } from "../hooks/useInvoke";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function lensFromPathname(pathname: string): CortexLensId {
  if (pathname.startsWith("/mission-cortex")) return "mission";
  if (pathname.startsWith("/agents")) return "agents";
  if (pathname.startsWith("/team")) return "agents";
  if (pathname.startsWith("/projects")) return "work";
  if (pathname.startsWith("/sprints")) return "work";
  if (pathname.startsWith("/boards")) return "work";
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/onboarding")) return "clients";
  if (pathname.startsWith("/issues")) return "risk";
  if (pathname.startsWith("/settings")) return "risk";
  if (pathname.startsWith("/activity")) return "signals";
  if (pathname.startsWith("/timesheet")) return "signals";
  if (pathname.startsWith("/calendar")) return "signals";
  if (pathname.startsWith("/comms")) return "signals";
  if (pathname.startsWith("/insights")) return "signals";
  if (pathname.startsWith("/knowledge")) return "memory";
  if (pathname.startsWith("/goals")) return "memory";
  if (pathname.startsWith("/routines")) return "memory";
  if (pathname.startsWith("/inbox")) return "mission";
  return "mission";
}

export default function MissionCortexPage() {
  const location = useLocation();
  const api = useInvoke();
  const routeLens = useMemo(() => lensFromPathname(location.pathname), [location.pathname]);
  const [activeLens, setActiveLens] = useState<CortexLensId>(routeLens);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("mission:current");
  const [lastCommand, setLastCommand] = useState<string>(
    isTauriRuntime() ? "Awaiting live integration signals" : "Browser preview using sample graph",
  );
  const [graph, setGraph] = useState<CortexGraph>(sampleCortexGraph);
  const [activeRun, setActiveRun] = useState<FounderCommandRun | null>(null);
  const [activeRunLabel, setActiveRunLabel] = useState<string | null>(null);

  useEffect(() => {
    setActiveLens(routeLens);
  }, [routeLens]);

  // Poll the active command run while it's in a non-terminal state. The
  // 1500ms cadence mirrors the spec in docs/plans/.../Phase 3 Task 3.9.
  // We stop on any terminal state (succeeded/failed/partial/cancelled) so
  // the membrane can freeze the final state machine snapshot.
  useEffect(() => {
    if (!activeRun || !isTauriRuntime()) return;
    const terminal: FounderCommandRun["state"][] = [
      "succeeded",
      "failed",
      "partial",
      "cancelled",
    ];
    if (terminal.includes(activeRun.state)) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await api.getCommandRun(activeRun.id);
        if (cancelled) return;
        setActiveRun(next);
      } catch {
        // swallow transient errors; the next tick may succeed
      }
    };
    const handle = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [activeRun, api]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;

    const loadGraph = async () => {
      const [founder, org, clients, issues, activity, presence] = await Promise.allSettled([
        api.getFounderCommandCenter(),
        api.getPaperclipOrgView(),
        api.getClients(),
        api.getActiveProjectIssues(),
        api.getActivityFeed(20),
        api.getPresenceStatus(),
      ]);

      if (cancelled) return;

      const nextGraph = buildMissionGraph({
        founder: founder.status === "fulfilled" ? founder.value : null,
        org: org.status === "fulfilled" ? org.value : null,
        clients: clients.status === "fulfilled" ? clients.value : null,
        issues: issues.status === "fulfilled" ? issues.value : null,
        activity: activity.status === "fulfilled" ? activity.value : null,
        presence: presence.status === "fulfilled" ? presence.value : null,
      });
      setGraph(nextGraph);
      setSelectedNodeId((current) => current && nextGraph.nodes.some((node) => node.id === current) ? current : "mission:current");
      setLastCommand("Live graph synthesized from Team Forge signals");
    };

    loadGraph().catch((error) => {
      if (!cancelled) {
        console.warn("[command-cortex] live graph fallback:", error);
        setGraph(sampleCortexGraph);
        setLastCommand("Live graph unavailable, using sample cortex");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  return (
    <MissionCortex
      graph={graph}
      lenses={CORTEX_LENSES}
      commands={CORTEX_COMMANDS}
      activeLens={activeLens}
      selectedNode={selectedNode}
      lastCommand={lastCommand}
      activeRun={activeRun}
      activeRunLabel={activeRunLabel}
      onSelectLens={setActiveLens}
      onSelectNode={setSelectedNodeId}
      onCommand={(command, node) => {
        const ts = new Date().toISOString().slice(11, 19);

        // Mission/Hermes-Sync node defaults to ts-standup; other nodes use
        // the shorthand → registry mapping. Commands not yet wired to the
        // Worker registry fall back to the local describe stub so the
        // founder gets the same readable preview while we expand coverage.
        const registryId =
          node.id === "mission:current" || node.kind === "mission"
            ? TS_STANDUP_COMMAND_ID
            : registryIdForShorthand(command.id);

        if (!registryId) {
          setLastCommand(
            `[${ts}] ${describeCommandStub(command, node)} (not yet wired to registry)`,
          );
          return;
        }

        if (!isTauriRuntime()) {
          setLastCommand(
            `[${ts}] ${command.label} on ${node.label} (browser preview — not posting intent)`,
          );
          return;
        }

        const intent: FounderCommandIntent = {
          id: registryId,
          actorId: "founder",
          actorKind: "founder",
          authMode: "cf_access",
          targetKind: node.kind,
          targetId: node.id,
          correlationId: `cortex-${node.id}-${Date.now()}`,
          payload: { node_label: node.label, command_shorthand: command.id },
        };

        setLastCommand(`[${ts}] ${command.label} on ${node.label} — posting intent`);
        setActiveRunLabel(`${command.label} on ${node.label}`);
        setActiveRun(null);

        api
          .postCommandIntent(intent)
          .then((result) => {
            // Seed an optimistic run skeleton; the polling effect fills in
            // the authoritative state machine as the Worker advances it.
            setActiveRun({
              id: result.runId,
              commandId: intent.id,
              actorId: intent.actorId,
              actorKind: intent.actorKind,
              authMode: intent.authMode,
              state: result.state,
              targetKind: intent.targetKind ?? null,
              targetId: intent.targetId ?? null,
              correlationId: intent.correlationId,
              requestedAt: Date.now(),
              acceptedAt: null,
              completedAt: null,
              resultJson: null,
              errorCode: null,
              errorMessage: null,
            });
            setLastCommand(
              `[${ts}] ${command.label} on ${node.label} — run ${result.runId.slice(0, 12)}…`,
            );
          })
          .catch((err: unknown) => {
            setActiveRunLabel(null);
            setLastCommand(
              `[${ts}] ${command.label} on ${node.label} — error: ${String(err).slice(0, 80)}`,
            );
          });
      }}
    />
  );
}
