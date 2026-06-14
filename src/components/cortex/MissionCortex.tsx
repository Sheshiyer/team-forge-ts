import { useEffect, useMemo, useRef, useState } from "react";
import type { CortexLensDefinition } from "../../lib/commandCortex/lensTypes";
import type { CortexCommand, CortexGraph, CortexLensId, CortexNode } from "../../lib/commandCortex/types";
import { getCommandsForNode } from "../../lib/commandCortex/commandRules";
import CommandRing from "./CommandRing";
import LensRail from "./LensRail";
import NeuralField from "./NeuralField";
import TacticalMembrane from "./TacticalMembrane";

function formatCortexTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

function computeSystemHealth(graph: CortexGraph): number {
  const total = graph.paths.length || 1;
  const healthy = graph.paths.filter((p) => p.state === "healthy" || p.state === "active").length;
  const pending = graph.paths.filter((p) => p.state === "pending").length;
  const blocked = graph.paths.filter((p) => p.state === "blocked").length;
  const score = (healthy * 1 + pending * 0.5 - blocked * 0.6) / total;
  return Math.max(12, Math.min(99.4, Math.round(score * 100 * 10) / 10));
}

export interface MissionCortexProps {
  graph: CortexGraph;
  lenses: CortexLensDefinition[];
  commands: CortexCommand[];
  activeLens: CortexLensId;
  selectedNode?: CortexNode | null;
  lastCommand?: string;
  onSelectLens: (lensId: CortexLensId) => void;
  onSelectNode: (nodeId: string) => void;
  onCommand: (command: CortexCommand, node: CortexNode) => void;
}

export default function MissionCortex({
  graph,
  lenses,
  commands,
  activeLens,
  selectedNode,
  lastCommand,
  onSelectLens,
  onSelectNode,
  onCommand,
}: MissionCortexProps) {
  const [intent, setIntent] = useState("");
  const commandInputRef = useRef<HTMLInputElement>(null);
  const activeLensDefinition = lenses.find((lens) => lens.id === activeLens) ?? lenses[0];
  const [cortexTime, setCortexTime] = useState(() => formatCortexTime(new Date()));
  const systemHealth = useMemo(() => computeSystemHealth(graph), [graph]);

  useEffect(() => {
    const tick = () => setCortexTime(formatCortexTime(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const selectedCommands = useMemo(() => {
    if (!selectedNode) return [];
    return getCommandsForNode(selectedNode, commands);
  }, [commands, selectedNode]);

  const selectedContext = useMemo(() => {
    if (!selectedNode) return { paths: [], signals: [] };
    const paths = graph.paths.filter((path) => path.from === selectedNode.id || path.to === selectedNode.id);
    const pathIds = new Set(paths.map((path) => path.id));
    const signals = graph.signals.filter((signal) => pathIds.has(signal.pathId));
    return { paths, signals };
  }, [graph.paths, graph.signals, selectedNode]);

  useEffect(() => {
    const focusCommand = () => commandInputRef.current?.focus();
    window.addEventListener("cortex:focus-command", focusCommand);
    return () => window.removeEventListener("cortex:focus-command", focusCommand);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        commandInputRef.current?.blur();
      }
      if ((event.metaKey || event.ctrlKey) && /^[1-7]$/.test(event.key)) {
        const lens = lenses[Number(event.key) - 1];
        if (lens) {
          event.preventDefault();
          onSelectLens(lens.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lenses, onSelectLens]);

  const submitIntent = () => {
    if (!selectedNode || selectedCommands.length === 0) return;
    onCommand(selectedCommands[0], selectedNode);
    setIntent("");
  };

  return (
    <section className="cortex-shell" aria-label="Mission Cortex" data-lens={activeLens}>
      <div className="cortex-titlebar-safezone" aria-hidden="true" />
      <LensRail lenses={lenses} activeLens={activeLens} onSelectLens={onSelectLens} />

      <div className="cortex-headline" aria-live="polite">
        <span>Command Cortex</span>
        <strong>{activeLensDefinition.label}</strong>
        <em>{lastCommand ?? "System ready"}</em>
      </div>

      <div className="cortex-field-readout" aria-hidden="true">
        <span>{graph.nodes.length} nodes</span>
        <span>{graph.paths.length} synapses</span>
        <span>{graph.signals.length} live signals</span>
      </div>

      <div className="cortex-chrome" aria-hidden="true">
        <div className="cortex-chrome__row">
          <span className="cortex-chrome__label">EXECUTIVE COMMAND MODE</span>
          <span className="cortex-chrome__sep">⌬</span>
          <span className="cortex-chrome__label">CORTEX SOVEREIGN ACTIVE</span>
        </div>
        <div className="cortex-chrome__row">
          <span className="cortex-chrome__label">SYSTEM HEALTH</span>
          <strong className="cortex-chrome__metric" data-state={systemHealth > 80 ? "healthy" : systemHealth > 50 ? "active" : systemHealth > 30 ? "pending" : "blocked"}>
            {systemHealth.toFixed(1)}%
          </strong>
          <span className="cortex-chrome__sep">·</span>
          <span className="cortex-chrome__label">CORTEX TIME</span>
          <strong className="cortex-chrome__metric">{cortexTime}</strong>
        </div>
      </div>

      <div className="cortex-quadrant-labels" aria-hidden="true">
        <div className="cortex-quadrant-labels__nw">
          <span className="cortex-quadrant-labels__title">CLIENT CLUSTERS</span>
          <span className="cortex-quadrant-labels__sub">
            {graph.nodes.filter((n) => n.kind === "client").length} client · {graph.nodes.filter((n) => n.kind === "project").length} project
          </span>
        </div>
        <div className="cortex-quadrant-labels__ne">
          <span className="cortex-quadrant-labels__title">PENDING JUDGMENTS</span>
          <span className="cortex-quadrant-labels__sub">
            {graph.nodes.filter((n) => n.kind === "approval").length + graph.nodes.filter((n) => n.kind === "issue" && n.state === "pending").length} awaiting synapse
          </span>
        </div>
        <div className="cortex-quadrant-labels__sw">
          <span className="cortex-quadrant-labels__title">AI AGENT PULSES</span>
          <span className="cortex-quadrant-labels__sub">
            {graph.nodes.filter((n) => n.kind === "agent").length} agent · {graph.nodes.filter((n) => n.kind === "routine").length} routine
          </span>
        </div>
        <div className="cortex-quadrant-labels__se">
          <span className="cortex-quadrant-labels__title">HUMAN ANCHORS</span>
          <span className="cortex-quadrant-labels__sub">
            {graph.nodes.filter((n) => n.kind === "human").length} anchor · {graph.nodes.filter((n) => n.kind === "issue" && n.state === "blocked").length} inflamed
          </span>
        </div>
      </div>

      <NeuralField
        graph={graph}
        activeLens={activeLens}
        selectedNodeId={selectedNode?.id ?? null}
        onSelectNode={onSelectNode}
      />

      <CommandRing
        node={selectedNode ?? null}
        commands={selectedCommands}
        onCommand={(commandId) => {
          const command = selectedCommands.find((item) => item.id === commandId);
          if (command && selectedNode) onCommand(command, selectedNode);
        }}
      />

      <TacticalMembrane
        node={selectedNode ?? null}
        commands={selectedCommands}
        paths={selectedContext.paths}
        signals={selectedContext.signals}
      />

      <form
        className="cortex-intent"
        onSubmit={(event) => {
          event.preventDefault();
          submitIntent();
        }}
      >
        <span>⌘K</span>
        <input
          ref={commandInputRef}
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder={activeLensDefinition.intentPlaceholder}
          aria-label="Command Cortex intent"
        />
        <button type="submit" disabled={!selectedNode || selectedCommands.length === 0}>
          Execute
        </button>
      </form>

      <div className="cortex-runtime-strip" aria-label="Runtime status">
        <span data-state="healthy">Paperclip online</span>
        <span data-state="active">Huly stream</span>
        <span data-state="pending">GitHub review gates</span>
        <span data-state="dormant">Slack signal quiet</span>
      </div>
    </section>
  );
}
