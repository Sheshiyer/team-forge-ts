import { useMemo, useRef, type CSSProperties } from "react";
import type { CortexGraph, CortexLensId, CortexNode, CortexPath, CortexSignal } from "../../lib/commandCortex/types";

export interface NeuralFieldProps {
  graph: CortexGraph;
  activeLens: CortexLensId;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

const VIEW_W = 1000;
const VIEW_H = 680;
const CENTER = { x: 500, y: 340 };

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
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
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

function offsetAlongNormal(from: Point, control: Point, to: Point) {
  const mid = pointAlongQuad(from, control, to, 0.5);
  const ahead = pointAlongQuad(from, control, to, 0.55);
  const dx = ahead.x - mid.x;
  const dy = ahead.y - mid.y;
  const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  return { nx: -dy / len, ny: dx / len, mid };
}

// Generate radial spike-rays from nucleus center filling the field — STATIC
const NUCLEUS_RAYS = (() => {
  const rand = mulberry32(0xc0fee);
  return Array.from({ length: 220 }, (_, i) => {
    const angle = (i / 220) * Math.PI * 2 + rand() * 0.04;
    const innerR = 38 + rand() * 6;
    const outerR = 110 + rand() * 340;
    const opacity = 0.04 + rand() * 0.32;
    const sw = 0.4 + rand() * 0.7;
    return {
      x1: CENTER.x + Math.cos(angle) * innerR,
      y1: CENTER.y + Math.sin(angle) * innerR,
      x2: CENTER.x + Math.cos(angle) * outerR,
      y2: CENTER.y + Math.sin(angle) * outerR,
      opacity,
      sw,
    };
  });
})();

interface StrandSpec {
  d: string;
  offset: number;
  stipples: Array<{ x: number; y: number; r: number }>;
}

interface PathGeom {
  path: CortexPath;
  from: CortexNode;
  to: CortexNode;
  trunkD: string;
  strands: StrandSpec[];
  labelP: Point;
  mpathId: string;
}

function buildStrands(from: Point, to: Point, seed: number): StrandSpec[] {
  const rand = mulberry32(seed);
  const trunkControl = quadControl(from, to, -40 - rand() * 20);
  const { nx, ny } = offsetAlongNormal(from, trunkControl, to);
  const strandCount = 3;
  const strands: StrandSpec[] = [];
  for (let s = 0; s < strandCount; s++) {
    const offset = (s - (strandCount - 1) / 2) * 6;
    const ctrl = { x: trunkControl.x + nx * offset, y: trunkControl.y + ny * offset };
    const fromP = { x: from.x + nx * offset * 0.18, y: from.y + ny * offset * 0.18 };
    const toP = { x: to.x + nx * offset * 0.18, y: to.y + ny * offset * 0.18 };
    const d = `M ${fromP.x.toFixed(1)} ${fromP.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${toP.x.toFixed(1)} ${toP.y.toFixed(1)}`;
    const stippleCount = 14 + Math.floor(rand() * 6);
    const stipples = [];
    for (let i = 0; i < stippleCount; i++) {
      const t = (i + 0.5 + (rand() - 0.5) * 0.6) / stippleCount;
      const p = pointAlongQuad(fromP, ctrl, toP, Math.max(0.04, Math.min(0.96, t)));
      stipples.push({ x: p.x, y: p.y, r: 0.7 + rand() * 1.2 });
    }
    strands.push({ d, offset, stipples });
  }
  return strands;
}

function motionDurFor(state: string): number {
  switch (state) {
    case "active":
      return 4.0;
    case "healthy":
      return 5.6;
    case "pending":
      return 5.0;
    case "blocked":
      return 7.0;
    default:
      return 8.0;
  }
}

function renderGlyph(kind: string, isMission: boolean) {
  if (isMission) {
    // Mission nucleus is rendered separately in the nucleus layer.
    return null;
  }
  switch (kind) {
    case "client":
      return (
        <>
          <circle className="cortex-node__orbit" r={24} />
          <circle className="cortex-node__orbit" r={18} opacity={0.6} />
          <path className="cortex-node__ring" d="M 0 -20 L 17 -10 L 17 10 L 0 20 L -17 10 L -17 -10 Z" />
          <circle className="cortex-node__core" r={6} />
        </>
      );
    case "project":
      return (
        <>
          <path className="cortex-node__ring" d="M 0 -21 L 19 0 L 0 21 L -19 0 Z" />
          <path className="cortex-node__fork" d="M 0 -7 V 4 M 0 4 L -8 12 M 0 4 L 8 12" />
          <circle className="cortex-node__core" r={5} />
        </>
      );
    case "issue":
      return (
        <>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i * Math.PI * 2) / 10;
            const r1 = 22;
            const r2 = i % 2 === 0 ? 30 : 26;
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
          <path className="cortex-node__ring" d="M 0 -18 L 16 0 L 0 18 L -16 0 Z" />
          <circle className="cortex-node__core" r={6} />
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
                x1={Math.cos(a) * 9}
                y1={Math.sin(a) * 9}
                x2={Math.cos(a) * 20}
                y2={Math.sin(a) * 20}
              />
            );
          })}
          <path className="cortex-node__ring" d="M -20 12 L 0 -22 L 20 12 Z" />
          <circle className="cortex-node__core" r={6} />
        </>
      );
    case "human":
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i * Math.PI * 2) / 6 + Math.PI / 6;
            const r1 = 13;
            const r2 = 24;
            const ctrlR = 19;
            const ctrlA = a + 0.18;
            return (
              <path
                key={i}
                className="cortex-node__tendril"
                d={`M ${Math.cos(a) * r1} ${Math.sin(a) * r1} Q ${Math.cos(ctrlA) * ctrlR} ${Math.sin(ctrlA) * ctrlR} ${Math.cos(a) * r2} ${Math.sin(a) * r2}`}
              />
            );
          })}
          <circle className="cortex-node__ring" r={14} />
          <circle className="cortex-node__core" r={5} />
        </>
      );
    case "memory":
      return (
        <>
          {[24, 18, 13].map((r, i) => (
            <ellipse
              key={r}
              className="cortex-node__memory-layer"
              rx={r}
              ry={r * 0.6}
              opacity={0.32 + i * 0.22}
            />
          ))}
          <circle className="cortex-node__core" r={5} />
        </>
      );
    case "approval":
      return (
        <>
          <path className="cortex-node__ring" d="M 0 -20 L 17 0 L 0 20 L -17 0 Z" />
          <path className="cortex-node__mark" d="M -7 0 L -2 5 L 8 -6" />
          <circle className="cortex-node__core" r={5} />
        </>
      );
    default:
      return (
        <>
          <circle className="cortex-node__ring" r={17} />
          <circle className="cortex-node__core" r={5} />
        </>
      );
  }
}

export default function NeuralField({ graph, activeLens, selectedNodeId, onSelectNode }: NeuralFieldProps) {
  const cameraRef = useRef<HTMLDivElement>(null);

  // Mouse parallax — sets CSS custom properties, no React re-render
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const node = cameraRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--cortex-tilt-x", `${(-dy * 4).toFixed(2)}deg`);
    node.style.setProperty("--cortex-tilt-y", `${(dx * 5).toFixed(2)}deg`);
  };
  const handleMouseLeave = () => {
    const node = cameraRef.current;
    if (!node) return;
    node.style.setProperty("--cortex-tilt-x", "0deg");
    node.style.setProperty("--cortex-tilt-y", "0deg");
  };

  const isNodeEmphasized = (node: CortexNode) =>
    node.lensAffinity?.includes(activeLens) || node.kind === "mission" || node.id === selectedNodeId;

  const isPathEmphasized = (path: CortexPath) => {
    const from = graph.nodes.find((node) => node.id === path.from);
    const to = graph.nodes.find((node) => node.id === path.to);
    return Boolean(from && to && (isNodeEmphasized(from) || isNodeEmphasized(to)));
  };

  const pathGeometry: PathGeom[] = useMemo(() => {
    return graph.paths
      .map((path) => {
        const from = graph.nodes.find((n) => n.id === path.from);
        const to = graph.nodes.find((n) => n.id === path.to);
        if (!from || !to) return null;
        const seed = hashSeed(path.id);
        const strands = buildStrands(from.position, to.position, seed);
        const trunkControl = quadControl(from.position, to.position, -40);
        const trunkD = `M ${from.position.x} ${from.position.y} Q ${trunkControl.x.toFixed(1)} ${trunkControl.y.toFixed(1)} ${to.position.x} ${to.position.y}`;
        const labelP = pointAlongQuad(from.position, trunkControl, to.position, 0.5);
        return {
          path,
          from,
          to,
          trunkD,
          strands,
          labelP,
          mpathId: `cortex-mpath-${path.id}`,
        } as PathGeom;
      })
      .filter(Boolean) as PathGeom[];
  }, [graph.paths, graph.nodes]);

  const signalAssignments = useMemo(() => {
    return graph.signals
      .map((signal, index) => {
        const geom = pathGeometry.find((g) => g.path.id === signal.pathId);
        if (!geom) return null;
        return { signal, geom, idx: index };
      })
      .filter(Boolean) as Array<{ signal: CortexSignal; geom: PathGeom; idx: number }>;
  }, [graph.signals, pathGeometry]);

  const sharedSvgProps = {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: "xMidYMid meet",
  } as const;

  const layerStyle = (z: number): CSSProperties => ({
    transform: `translateZ(${z}px)`,
  });

  return (
    <div className="cortex-neural-field" data-lens={activeLens}>
      <div
        ref={cameraRef}
        className="cortex-camera"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Quadrant tint layer (deepest back) */}
        <div className="cortex-field-layer cortex-field-layer--quadrants" style={layerStyle(-160)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            <defs>
              <radialGradient id="quad-nw" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(57, 255, 136, 0.16)" />
                <stop offset="100%" stopColor="rgba(57, 255, 136, 0)" />
              </radialGradient>
              <radialGradient id="quad-ne" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255, 176, 46, 0.14)" />
                <stop offset="100%" stopColor="rgba(255, 176, 46, 0)" />
              </radialGradient>
              <radialGradient id="quad-sw" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(24, 215, 255, 0.16)" />
                <stop offset="100%" stopColor="rgba(24, 215, 255, 0)" />
              </radialGradient>
              <radialGradient id="quad-se" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255, 47, 122, 0.14)" />
                <stop offset="100%" stopColor="rgba(255, 47, 122, 0)" />
              </radialGradient>
            </defs>
            <ellipse cx={260} cy={200} rx={340} ry={240} fill="url(#quad-nw)" />
            <ellipse cx={740} cy={200} rx={340} ry={240} fill="url(#quad-ne)" />
            <ellipse cx={260} cy={490} rx={340} ry={240} fill="url(#quad-sw)" />
            <ellipse cx={740} cy={490} rx={340} ry={240} fill="url(#quad-se)" />
          </svg>
        </div>

        {/* Background strata — blurred for depth */}
        <div className="cortex-field-layer cortex-field-layer--strata" style={layerStyle(-100)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            <defs>
              <linearGradient id="cortex-strata-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(24, 215, 255, 0.2)" />
                <stop offset="50%" stopColor="rgba(57, 255, 136, 0.1)" />
                <stop offset="100%" stopColor="rgba(255, 47, 122, 0.12)" />
              </linearGradient>
            </defs>
            <g className="cortex-field-strata">
              <path d="M 104 480 C 235 320 353 263 500 332 C 645 400 762 372 910 236" />
              <path d="M 180 188 C 322 66 488 92 642 182 C 767 255 848 318 920 470" />
              <path d="M 268 596 C 382 490 482 462 616 508 C 736 548 824 536 914 456" />
              <ellipse cx="500" cy="340" rx="320" ry="220" />
              <ellipse cx="500" cy="340" rx="220" ry="140" opacity={0.5} />
              <ellipse cx="500" cy="340" rx="130" ry="86" opacity={0.4} />
            </g>
          </svg>
        </div>

        {/* Nucleus radiating spike-rays (behind paths) */}
        <div className="cortex-field-layer cortex-field-layer--rays" style={layerStyle(-60)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            <g className="cortex-nucleus-rays">
              {NUCLEUS_RAYS.map((r, i) => (
                <line
                  key={i}
                  x1={r.x1}
                  y1={r.y1}
                  x2={r.x2}
                  y2={r.y2}
                  strokeWidth={r.sw}
                  opacity={r.opacity}
                />
              ))}
            </g>
          </svg>
        </div>

        {/* Stippled micro-nodes layer (lightweight — no filter) */}
        <div className="cortex-field-layer cortex-field-layer--stipple" style={layerStyle(-20)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            {pathGeometry.map((g) => (
              <g
                key={`stip-${g.path.id}`}
                className={`cortex-stipple cortex-stipple--${g.path.state}${isPathEmphasized(g.path) ? " is-emphasized" : " is-muted"}`}
              >
                {g.strands.flatMap((strand) =>
                  strand.stipples.map((s, i) => (
                    <circle key={`${strand.offset}-${i}`} cx={s.x} cy={s.y} r={s.r} />
                  )),
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* Main multi-strand paths */}
        <div className="cortex-field-layer cortex-field-layer--paths" style={layerStyle(0)}>
          <svg {...sharedSvgProps}>
            <defs>
              <filter id="cortex-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Hidden motion paths (referenced by animateMotion below) */}
            <g aria-hidden="true" style={{ display: "none" }}>
              {pathGeometry.map((g) => (
                <path key={g.mpathId} id={g.mpathId} d={g.trunkD} />
              ))}
            </g>
            {pathGeometry.map((g) => {
              const emphasized = isPathEmphasized(g.path);
              return (
                <g
                  key={g.path.id}
                  className={`cortex-path-group${emphasized ? " is-emphasized" : " is-muted"}`}
                >
                  {/* sheath behind all strands */}
                  <path className="cortex-path-sheath" d={g.trunkD} fill="none" />
                  {g.strands.map((strand, si) => (
                    <path
                      key={si}
                      className={`cortex-path cortex-path--${g.path.state} cortex-strand cortex-strand--${si}`}
                      d={strand.d}
                      fill="none"
                    />
                  ))}
                  {g.path.label || g.path.kind ? (
                    <text className="cortex-path-label" x={g.labelP.x + 8} y={g.labelP.y - 12}>
                      {g.path.label ?? g.path.kind}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Signals — animateMotion along trunk */}
        <div className="cortex-field-layer cortex-field-layer--signals" style={layerStyle(30)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            {signalAssignments.map(({ signal, geom, idx }) => {
              const dur = motionDurFor(signal.state);
              const begin = `${(idx * 0.9) % dur}s`;
              return (
                <g key={signal.id}>
                  <circle className={`cortex-signal-trail cortex-signal-trail--${signal.state}`} r={8}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={begin}>
                      <mpath href={`#${geom.mpathId}`} />
                    </animateMotion>
                  </circle>
                  <circle className={`cortex-signal cortex-signal--${signal.state}`} r={3.4}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={begin}>
                      <mpath href={`#${geom.mpathId}`} />
                    </animateMotion>
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Volumetric nucleus (the centerpiece — looks like a glowing 3D sphere) */}
        <div className="cortex-field-layer cortex-field-layer--nucleus" style={layerStyle(50)} aria-hidden="true">
          <svg {...sharedSvgProps}>
            <defs>
              <radialGradient id="nucleus-outer" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(24, 215, 255, 0.45)" />
                <stop offset="55%" stopColor="rgba(24, 215, 255, 0.12)" />
                <stop offset="100%" stopColor="rgba(24, 215, 255, 0)" />
              </radialGradient>
              <radialGradient id="nucleus-mid" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(140, 240, 255, 0.85)" />
                <stop offset="50%" stopColor="rgba(24, 215, 255, 0.55)" />
                <stop offset="100%" stopColor="rgba(24, 215, 255, 0)" />
              </radialGradient>
              <radialGradient id="nucleus-core" cx="45%" cy="40%" r="55%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 1)" />
                <stop offset="30%" stopColor="rgba(180, 245, 255, 0.95)" />
                <stop offset="70%" stopColor="rgba(24, 215, 255, 0.6)" />
                <stop offset="100%" stopColor="rgba(24, 215, 255, 0)" />
              </radialGradient>
              <radialGradient id="nucleus-edge" cx="55%" cy="58%" r="50%">
                <stop offset="60%" stopColor="rgba(0, 0, 0, 0)" />
                <stop offset="92%" stopColor="rgba(7, 17, 31, 0.4)" />
                <stop offset="100%" stopColor="rgba(7, 17, 31, 0.85)" />
              </radialGradient>
            </defs>
            {/* atmospheric halo */}
            <circle cx={CENTER.x} cy={CENTER.y} r={180} fill="url(#nucleus-outer)" />
            {/* concentric tactical rings */}
            <circle cx={CENTER.x} cy={CENTER.y} r={88} className="cortex-nucleus-ring" />
            <circle cx={CENTER.x} cy={CENTER.y} r={64} className="cortex-nucleus-ring" opacity={0.7} />
            <circle cx={CENTER.x} cy={CENTER.y} r={46} className="cortex-nucleus-ring" opacity={0.5} />
            {/* lens-flare cross */}
            <line className="cortex-nucleus-flare" x1={CENTER.x - 140} y1={CENTER.y} x2={CENTER.x + 140} y2={CENTER.y} />
            <line className="cortex-nucleus-flare" x1={CENTER.x} y1={CENTER.y - 140} x2={CENTER.x} y2={CENTER.y + 140} />
            <line
              className="cortex-nucleus-flare cortex-nucleus-flare--soft"
              x1={CENTER.x - 90}
              y1={CENTER.y - 90}
              x2={CENTER.x + 90}
              y2={CENTER.y + 90}
            />
            <line
              className="cortex-nucleus-flare cortex-nucleus-flare--soft"
              x1={CENTER.x - 90}
              y1={CENTER.y + 90}
              x2={CENTER.x + 90}
              y2={CENTER.y - 90}
            />
            {/* volumetric core */}
            <circle cx={CENTER.x} cy={CENTER.y} r={44} fill="url(#nucleus-mid)" />
            <circle cx={CENTER.x} cy={CENTER.y} r={30} fill="url(#nucleus-core)" />
            <circle cx={CENTER.x} cy={CENTER.y} r={44} fill="url(#nucleus-edge)" />
            {/* breathing pulse — single, subtle */}
            <circle cx={CENTER.x} cy={CENTER.y} r={46} className="cortex-nucleus-pulse" />
          </svg>
        </div>

        {/* Nodes layer (interactive — front-most) */}
        <div className="cortex-field-layer cortex-field-layer--nodes" style={layerStyle(80)}>
          <svg {...sharedSvgProps}>
            {graph.nodes.map((node) => {
              const isMission = node.kind === "mission";
              return (
                <g
                  key={node.id}
                  className={`cortex-node cortex-node--${node.kind} cortex-node--${node.state}${selectedNodeId === node.id ? " is-selected" : ""}`}
                  data-emphasis={isNodeEmphasized(node) ? "primary" : "muted"}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${node.position.x} ${node.position.y})`}
                  onClick={() => onSelectNode?.(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectNode?.(node.id);
                    }
                  }}
                >
                  {isMission ? (
                    <text className="cortex-node__label cortex-node__label--mission" textAnchor="middle" y={62}>
                      {node.label.toUpperCase()}
                    </text>
                  ) : (
                    <>
                      <circle className="cortex-node__halo" r={26} />
                      {renderGlyph(node.kind, false)}
                      <text className="cortex-node__label" x={18} y={4}>
                        {node.label}
                      </text>
                      <text className="cortex-node__meta" x={18} y={18}>
                        {node.kind} / {node.state}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
