import { useMemo } from "react";
import type { CortexGraph, CortexLensId, CortexNode, CortexPath, CortexSignal } from "../../lib/commandCortex/types";

export interface NeuralFieldProps {
  graph: CortexGraph;
  activeLens: CortexLensId;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function pointAlongQuad(from: Point, control: Point, to: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
    y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
  };
}

function quadControl(from: Point, to: Point, arch = -40): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + arch };
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface StipplePoint {
  t: number;
  x: number;
  y: number;
  r: number;
  opacity: number;
}

function stippleAlongQuad(from: Point, control: Point, to: Point, count: number, seed: number): StipplePoint[] {
  const rand = mulberry32(seed);
  const points: StipplePoint[] = [];
  for (let i = 0; i < count; i++) {
    const baseT = (i + 0.5) / count;
    const jitter = (rand() - 0.5) * 0.35 * (1 / count);
    const t = Math.max(0, Math.min(1, baseT + jitter));
    const p = pointAlongQuad(from, control, to, t);
    const lateralAngle = rand() * Math.PI * 2;
    const lateralR = rand() * 6;
    points.push({
      t,
      x: p.x + Math.cos(lateralAngle) * lateralR,
      y: p.y + Math.sin(lateralAngle) * lateralR,
      r: 0.6 + rand() * 1.6,
      opacity: 0.28 + rand() * 0.5,
    });
  }
  return points;
}

interface SubBranch {
  from: Point;
  control: Point;
  to: Point;
  d: string;
  stipples: StipplePoint[];
}

function generateSubBranches(
  from: Point,
  control: Point,
  to: Point,
  count: number,
  seed: number,
): SubBranch[] {
  const rand = mulberry32(seed * 9301 + 17);
  const branches: SubBranch[] = [];
  const trunkLen = distance(from, to);
  const reach = Math.max(38, trunkLen * 0.28);
  for (let i = 0; i < count; i++) {
    const tStart = 0.18 + (i + rand() * 0.4) * (0.66 / count);
    const start = pointAlongQuad(from, control, to, tStart);
    const tangent = pointAlongQuad(from, control, to, Math.min(1, tStart + 0.05));
    const dx = tangent.x - start.x;
    const dy = tangent.y - start.y;
    const tlen = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
    const nx = -dy / tlen;
    const ny = dx / tlen;
    const side = rand() < 0.5 ? -1 : 1;
    const lenJitter = 0.7 + rand() * 0.6;
    const len = reach * lenJitter;
    const end = {
      x: start.x + nx * side * len + dx / tlen * len * 0.45,
      y: start.y + ny * side * len + dy / tlen * len * 0.45,
    };
    const ctrl = {
      x: (start.x + end.x) / 2 + nx * side * 14,
      y: (start.y + end.y) / 2 + ny * side * 14,
    };
    const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    const stipples = stippleAlongQuad(start, ctrl, end, 14 + Math.floor(rand() * 8), seed * 17 + i + 3);
    branches.push({ from: start, control: ctrl, to: end, d, stipples });
  }
  return branches;
}

function motionDurationFor(state: string): number {
  switch (state) {
    case "active":
      return 3.6;
    case "healthy":
      return 5.4;
    case "pending":
      return 4.8;
    case "blocked":
      return 6.8;
    default:
      return 7.2;
  }
}

function renderGlyph(kind: string) {
  switch (kind) {
    case "mission":
      return (
        <>
          <circle className="cortex-node__ring" r={28} />
          <circle className="cortex-node__ring" r={20} opacity={0.45} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI * 2) / 8;
            return (
              <line
                key={i}
                className="cortex-node__spoke"
                x1={Math.cos(a) * 16}
                y1={Math.sin(a) * 16}
                x2={Math.cos(a) * 26}
                y2={Math.sin(a) * 26}
              />
            );
          })}
          <path className="cortex-node__mark" d="M -15 0 H 15 M 0 -15 V 15" />
          <circle className="cortex-node__core" r={9} />
          <circle className="cortex-node__core-inner" r={4} />
        </>
      );
    case "client":
      return (
        <>
          <circle className="cortex-node__orbit" r={26} />
          <circle className="cortex-node__orbit" r={20} opacity={0.55} />
          <path className="cortex-node__ring" d="M 0 -22 L 19 -11 L 19 11 L 0 22 L -19 11 L -19 -11 Z" />
          <circle className="cortex-node__core" r={7} />
        </>
      );
    case "project":
      return (
        <>
          <path className="cortex-node__ring" d="M 0 -23 L 21 0 L 0 23 L -21 0 Z" />
          <path className="cortex-node__fork" d="M 0 -8 V 6 M 0 6 L -9 16 M 0 6 L 9 16" />
          <circle className="cortex-node__core" r={6} />
        </>
      );
    case "issue":
      return (
        <>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const r1 = i % 2 === 0 ? 24 : 28;
            const r2 = i % 2 === 0 ? 30 : 36;
            return (
              <line
                key={i}
                className="cortex-node__inflammation-ray"
                x1={Math.cos(a) * r1}
                y1={Math.sin(a) * r1}
                x2={Math.cos(a) * r2}
                y2={Math.sin(a) * r2}
              />
            );
          })}
          <circle className="cortex-node__inflammation" r={25} />
          <path className="cortex-node__ring" d="M 0 -20 L 18 0 L 0 20 L -18 0 Z" />
          <circle className="cortex-node__core" r={7} />
        </>
      );
    case "agent":
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i * Math.PI * 2) / 6;
            return (
              <line
                key={i}
                className="cortex-node__pulse-ray"
                x1={Math.cos(a) * 10}
                y1={Math.sin(a) * 10}
                x2={Math.cos(a) * 22}
                y2={Math.sin(a) * 22}
              />
            );
          })}
          <path className="cortex-node__ring" d="M -22 14 L 0 -24 L 22 14 Z" />
          <path className="cortex-node__mark" d="M -7 5 H 7 M 0 -8 V 10" />
          <circle className="cortex-node__core" r={6} />
        </>
      );
    case "human":
      return (
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI * 2) / 8 + Math.PI / 8;
            const r1 = 14;
            const r2 = 26 + (i % 2 === 0 ? 4 : 0);
            const ctrlR = 20;
            const ctrlA = a + 0.15;
            return (
              <path
                key={i}
                className="cortex-node__tendril"
                d={`M ${Math.cos(a) * r1} ${Math.sin(a) * r1} Q ${Math.cos(ctrlA) * ctrlR} ${Math.sin(ctrlA) * ctrlR} ${Math.cos(a) * r2} ${Math.sin(a) * r2}`}
              />
            );
          })}
          <circle className="cortex-node__ring" r={16} />
          <path className="cortex-node__mark" d="M 0 -14 V 14 M -10 6 H 10" />
          <circle className="cortex-node__core" r={6} />
        </>
      );
    case "memory":
      return (
        <>
          {[28, 22, 16].map((r, i) => (
            <ellipse
              key={r}
              className="cortex-node__memory-layer"
              cx={0}
              cy={0}
              rx={r}
              ry={r * 0.62}
              opacity={0.32 + i * 0.22}
            />
          ))}
          <circle className="cortex-node__core" r={5} />
        </>
      );
    case "routine":
      return (
        <>
          <path className="cortex-node__ring" d="M -22 0 C -22 -16 -6 -16 0 0 C 6 16 22 16 22 0 C 22 -16 6 -16 0 0 C -6 16 -22 16 -22 0 Z" />
          <circle className="cortex-node__core" r={5} />
        </>
      );
    case "approval":
      return (
        <>
          <path className="cortex-node__ring" d="M 0 -22 L 19 0 L 0 22 L -19 0 Z" />
          <path className="cortex-node__mark" d="M -8 0 L -2 6 L 9 -7" />
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
}

export default function NeuralField({ graph, activeLens, selectedNodeId, onSelectNode }: NeuralFieldProps) {
  const isNodeEmphasized = (node: CortexNode) =>
    node.lensAffinity?.includes(activeLens) || node.kind === "mission" || node.id === selectedNodeId;

  const isPathEmphasized = (path: CortexPath) => {
    const from = graph.nodes.find((node) => node.id === path.from);
    const to = graph.nodes.find((node) => node.id === path.to);
    return Boolean(from && to && (isNodeEmphasized(from) || isNodeEmphasized(to)));
  };

  const pathGeometry = useMemo(() => {
    return graph.paths
      .map((path) => {
        const from = graph.nodes.find((node) => node.id === path.from);
        const to = graph.nodes.find((node) => node.id === path.to);
        if (!from || !to) return null;
        const fromP = from.position;
        const toP = to.position;
        const control = quadControl(fromP, toP, -40);
        const trunkLen = distance(fromP, toP);
        const trunkStippleCount = Math.max(36, Math.floor(trunkLen / 9));
        const seed = hashSeed(path.id);
        const stipples = stippleAlongQuad(fromP, control, toP, trunkStippleCount, seed);
        const branches = generateSubBranches(fromP, control, toP, 2 + (seed % 3), seed + 211);
        const d = `M ${fromP.x} ${fromP.y} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${toP.x} ${toP.y}`;
        const labelP = pointAlongQuad(fromP, control, toP, 0.5);
        return { path, from, to, control, d, stipples, branches, labelP, mpathId: `cortex-mpath-${path.id}` };
      })
      .filter(Boolean) as Array<{
      path: CortexPath;
      from: CortexNode;
      to: CortexNode;
      control: Point;
      d: string;
      stipples: StipplePoint[];
      branches: SubBranch[];
      labelP: Point;
      mpathId: string;
    }>;
  }, [graph.paths, graph.nodes]);

  const signalAssignments = useMemo(() => {
    return graph.signals
      .map((signal, index) => {
        const geom = pathGeometry.find((g) => g.path.id === signal.pathId);
        if (!geom) return null;
        return { signal, geom, idx: index } as { signal: CortexSignal; geom: typeof geom; idx: number };
      })
      .filter(Boolean) as Array<{ signal: CortexSignal; geom: (typeof pathGeometry)[number]; idx: number }>;
  }, [graph.signals, pathGeometry]);

  return (
    <div className="cortex-neural-field" data-lens={activeLens}>
      <svg viewBox="0 0 1000 680" role="img" aria-label={`${graph.label} neural field`}>
        <defs>
          <linearGradient id="cortex-field-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(24, 215, 255, 0.18)" />
            <stop offset="48%" stopColor="rgba(57, 255, 136, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 47, 122, 0.12)" />
          </linearGradient>
          <radialGradient id="cortex-core-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(24, 215, 255, 0.55)" />
            <stop offset="60%" stopColor="rgba(24, 215, 255, 0.18)" />
            <stop offset="100%" stopColor="rgba(24, 215, 255, 0)" />
          </radialGradient>
          <filter id="cortex-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="cortex-strong-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
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
          <ellipse cx="500" cy="340" rx="180" ry="120" opacity={0.3} />
        </g>

        {/* Hidden motion paths — animateMotion refers to these by id */}
        <g aria-hidden="true" style={{ display: "none" }}>
          {pathGeometry.map((g) => (
            <path key={g.mpathId} id={g.mpathId} d={g.d} />
          ))}
        </g>

        {/* Stippled micro-nodes under all paths */}
        <g className="cortex-stipple-layer" aria-hidden="true">
          {pathGeometry.map((g) => (
            <g
              key={`stipple-${g.path.id}`}
              className={`cortex-stipple cortex-stipple--${g.path.state}${isPathEmphasized(g.path) ? " is-emphasized" : " is-muted"}`}
            >
              {g.stipples.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.opacity} />
              ))}
              {g.branches.map((b, bi) => (
                <g key={bi}>
                  <path className="cortex-sub-branch" d={b.d} fill="none" />
                  {b.stipples.map((s, i) => (
                    <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.85} opacity={s.opacity * 0.8} />
                  ))}
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* Main paths */}
        {pathGeometry.map((g) => (
          <g
            key={g.path.id}
            className={`cortex-path-group${isPathEmphasized(g.path) ? " is-emphasized" : " is-muted"}`}
          >
            <path className="cortex-path-sheath" d={g.d} fill="none" />
            <path className={`cortex-path cortex-path--${g.path.state}`} d={g.d} fill="none" />
            {g.path.label || g.path.kind ? (
              <text className="cortex-path-label" x={g.labelP.x + 8} y={g.labelP.y - 12}>
                {g.path.label ?? g.path.kind}
              </text>
            ) : null}
          </g>
        ))}

        {/* Traveling signals — animateMotion along the trunk paths */}
        {signalAssignments.map(({ signal, geom, idx }) => {
          const dur = motionDurationFor(signal.state);
          const begin = `${(idx * 0.7) % dur}s`;
          return (
            <g key={signal.id} className={`cortex-signal-travel cortex-signal-travel--${signal.state}`}>
              <circle className={`cortex-signal-trail cortex-signal-trail--${signal.state}`} r={9}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={begin}>
                  <mpath href={`#${geom.mpathId}`} />
                </animateMotion>
              </circle>
              <circle className={`cortex-signal cortex-signal--${signal.state}`} r={3.6}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={begin}>
                  <mpath href={`#${geom.mpathId}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}

        {/* Nodes on top */}
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
            {node.kind === "mission" || node.id === selectedNodeId ? (
              <circle className="cortex-node__aura" r={56} fill="url(#cortex-core-pulse)" />
            ) : null}
            <circle className="cortex-node__halo" r={31} />
            {renderGlyph(node.kind)}
            <text className="cortex-node__label" x={20} y={5}>
              {node.label}
            </text>
            <text className="cortex-node__meta" x={20} y={20}>
              {node.kind} / {node.state}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
