import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CORTEX_LENSES } from "../lib/commandCortex/lensTypes";
import { CORTEX_COMMANDS, sampleCortexGraph } from "../lib/commandCortex/sampleGraph";
import { buildMissionGraph } from "../lib/commandCortex/buildMissionGraph";
import { describeCommandStub } from "../lib/commandCortex/commandRules";
import type { CortexGraph, CortexLensId } from "../lib/commandCortex/types";
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

  useEffect(() => {
    setActiveLens(routeLens);
  }, [routeLens]);

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
      onSelectLens={setActiveLens}
      onSelectNode={setSelectedNodeId}
      onCommand={(command, node) => {
        // Stub for now: format → "[HH:MM:SS] command on node — description".
        // Tier 2 follow-up will switch this to a real Tauri invoke per
        // command kind (paperclip_summon_agent, github_approve_pr, etc.)
        // and reflect the ack timing back into lastCommand.
        const ts = new Date().toISOString().slice(11, 19);
        const stub = describeCommandStub(command, node);
        setLastCommand(`[${ts}] ${stub}`);
      }}
    />
  );
}
