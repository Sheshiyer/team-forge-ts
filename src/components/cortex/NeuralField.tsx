import type { CortexGraph, CortexLensId } from "../../lib/commandCortex/types";

export interface NeuralFieldProps {
  graph: CortexGraph;
  activeLens: CortexLensId;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

export default function NeuralField({ graph, activeLens, selectedNodeId, onSelectNode }: NeuralFieldProps) {
  const isNodeEmphasized = (node: CortexGraph["nodes"][number]) =>
    node.lensAffinity?.includes(activeLens) || node.kind === "mission" || node.id === selectedNodeId;

  const isPathEmphasized = (path: CortexGraph["paths"][number]) => {
    const from = graph.nodes.find((node) => node.id === path.from);
    const to = graph.nodes.find((node) => node.id === path.to);
    return Boolean(from && to && (isNodeEmphasized(from) || isNodeEmphasized(to)));
  };

  const renderGlyph = (kind: string) => {
    switch (kind) {
      case "mission":
        return (
          <>
            <circle className="cortex-node__ring" r={27} />
            <path className="cortex-node__mark" d="M -15 0 H 15 M 0 -15 V 15" />
            <circle className="cortex-node__core" r={8} />
          </>
        );
      case "client":
        return (
          <>
            <path className="cortex-node__ring" d="M 0 -24 L 21 -12 L 21 12 L 0 24 L -21 12 L -21 -12 Z" />
            <circle className="cortex-node__core" r={7} />
          </>
        );
      case "project":
        return (
          <>
            <path className="cortex-node__ring" d="M 0 -23 L 23 0 L 0 23 L -23 0 Z" />
            <path className="cortex-node__mark" d="M -10 0 H 10 M 0 -10 V 10" />
            <circle className="cortex-node__core" r={6} />
          </>
        );
      case "issue":
        return (
          <>
            <circle className="cortex-node__inflammation" r={25} />
            <path className="cortex-node__ring" d="M 0 -20 L 18 0 L 0 20 L -18 0 Z" />
            <circle className="cortex-node__core" r={7} />
          </>
        );
      case "agent":
        return (
          <>
            <path className="cortex-node__ring" d="M -22 14 L 0 -24 L 22 14 Z" />
            <path className="cortex-node__mark" d="M -7 5 H 7 M 0 -8 V 10" />
            <circle className="cortex-node__core" r={6} />
          </>
        );
      case "human":
        return (
          <>
            <circle className="cortex-node__ring" r={21} />
            <path className="cortex-node__mark" d="M 0 -18 V 18 M -12 8 H 12" />
            <circle className="cortex-node__core" r={6} />
          </>
        );
      case "memory":
        return (
          <>
            <path className="cortex-node__ring" d="M -20 -14 H 20 L 12 18 H -20 Z" />
            <path className="cortex-node__mark" d="M -9 -3 H 10 M -12 7 H 6" />
            <circle className="cortex-node__core" r={5} />
          </>
        );
      default:
        return (
          <>
            <circle className="cortex-node__ring" r={19} />
            <circle className="cortex-node__core" r={6} />
          </>
        );
    }
  };

  return (
    <div className="cortex-neural-field" data-lens={activeLens}>
      <svg viewBox="0 0 1000 680" role="img" aria-label={`${graph.label} neural field`}>
        <defs>
          <linearGradient id="cortex-field-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(24, 215, 255, 0.18)" />
            <stop offset="48%" stopColor="rgba(57, 255, 136, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 47, 122, 0.12)" />
          </linearGradient>
          <filter id="cortex-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="cortex-field-strata" aria-hidden="true">
          <path d="M 104 480 C 235 320 353 263 500 332 C 645 400 762 372 910 236" />
          <path d="M 180 188 C 322 66 488 92 642 182 C 767 255 848 318 920 470" />
          <path d="M 268 596 C 382 490 482 462 616 508 C 736 548 824 536 914 456" />
          <ellipse cx="580" cy="342" rx="300" ry="206" />
        </g>
        {graph.paths.map((path) => {
          const from = graph.nodes.find((node) => node.id === path.from);
          const to = graph.nodes.find((node) => node.id === path.to);
          if (!from || !to) return null;
          const midX = (from.position.x + to.position.x) / 2;
          const midY = (from.position.y + to.position.y) / 2 - 40;
          return (
            <g key={path.id} className={`cortex-path-group${isPathEmphasized(path) ? " is-emphasized" : " is-muted"}`}>
              <path
                className="cortex-path-sheath"
                d={`M ${from.position.x} ${from.position.y} Q ${midX} ${midY} ${to.position.x} ${to.position.y}`}
                fill="none"
              />
              <path
                className={`cortex-path cortex-path--${path.state}`}
                d={`M ${from.position.x} ${from.position.y} Q ${midX} ${midY} ${to.position.x} ${to.position.y}`}
                fill="none"
              />
              {path.label || path.kind ? (
                <text className="cortex-path-label" x={midX + 8} y={midY - 8}>{path.label ?? path.kind}</text>
              ) : null}
            </g>
          );
        })}
        {graph.signals.map((signal, index) => {
          const path = graph.paths.find((item) => item.id === signal.pathId);
          const from = graph.nodes.find((node) => node.id === path?.from);
          const to = graph.nodes.find((node) => node.id === path?.to);
          if (!path || !from || !to) return null;
          const ratio = ((index + 2) % 5) / 5;
          const x = from.position.x + (to.position.x - from.position.x) * ratio;
          const y = from.position.y + (to.position.y - from.position.y) * ratio;
          return (
            <circle
              key={signal.id}
              className={`cortex-signal cortex-signal--${signal.state}`}
              cx={x}
              cy={y}
              r={4}
            />
          );
        })}
        {graph.nodes.map((node) => (
          <g
            key={node.id}
            className={`cortex-node cortex-node--${node.kind} cortex-node--${node.state}${selectedNodeId === node.id ? " is-selected" : ""}`}
            data-emphasis={isNodeEmphasized(node) ? "primary" : "muted"}
            role="button"
            tabIndex={0}
            transform={`translate(${node.position.x} ${node.position.y})`}
            onClick={() => onSelectNode?.(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectNode?.(node.id);
              }
            }}
          >
            <circle className="cortex-node__halo" r={31} />
            {renderGlyph(node.kind)}
            <text className="cortex-node__label" x={20} y={5}>{node.label}</text>
            <text className="cortex-node__meta" x={20} y={20}>{node.kind} / {node.state}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
