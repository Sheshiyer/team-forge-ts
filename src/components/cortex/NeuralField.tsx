/**
 * NeuralField — real 3D Mission Cortex.
 *
 * Replaces the prior SVG/CSS implementation (preserved at
 * NeuralField.svg.bak.tsx) with a Three.js + React-Three-Fiber scene.
 *
 * Features:
 *   - Volumetric glowing nucleus with bloom post-fx.
 *   - 3D node spheres (state-coloured emissive) connected by curving tube
 *     synapses.
 *   - Particles travel along the synapses as live signals.
 *   - Ambient dendrite cloud: thousands of small lit dots filling the
 *     surrounding space → the "living organism" feel.
 *   - Camera: OrbitControls (left-drag rotate, scroll zoom, right-drag pan).
 *   - Click-to-select a node; drag-to-move it freely in 3D space.
 */
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { CortexGraph, CortexLensId, CortexNode, CortexPath, CortexSignal, CortexSignalState } from "../../lib/commandCortex/types";

export interface NeuralFieldProps {
  graph: CortexGraph;
  activeLens: CortexLensId;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

const STATE_COLOR: Record<CortexSignalState, string> = {
  healthy: "#39ff88",
  active: "#18d7ff",
  pending: "#ffb02e",
  blocked: "#ff2f7a",
  dormant: "#56615f",
  archived: "#3b4742",
};

/* ---- Semantic 3D positioning ----------------------------------------------
 * Each node kind maps to a quadrant angle around the nucleus (3D world).
 * Matches the V3 cluster zoning:
 *   NW (top-left, ~135°)  → CLIENT CLUSTERS (emerald)
 *   N  (top,      ~90°)   → PROJECT WORK (cyan-emerald)
 *   NE (top-right, ~45°)  → PENDING JUDGMENTS / approvals (amber)
 *   E  (right,     ~0°)   → ISSUE HOTSPOTS (rose)
 *   SE (bottom-right, ~-45°) → HUMAN ANCHORS (cyan)
 *   SW (bottom-left, ~-135°) → AI AGENT PULSES + routines (cyan)
 *   W  (left,        ~180°)  → MEMORY TISSUE (graphite-emerald)
 *
 * angle convention: 0 = +X (right), PI/2 = +Y (up/N), PI = -X (left/W).
 * In our world (camera looks toward -Z), X is screen-right and Y is up.
 */
const KIND_ANGLE: Record<string, number> = {
  mission: 0, // unused; mission is at origin
  client: (3 * Math.PI) / 4,   // NW
  project: (2 * Math.PI) / 3,  // N-NW
  issue: 0,                    // E
  approval: Math.PI / 4,       // NE
  agent: -(3 * Math.PI) / 4,   // SW
  routine: -(2 * Math.PI) / 3, // S-SW
  human: -Math.PI / 4,         // SE
  memory: Math.PI,             // W
};

const KIND_RADIUS: Record<string, number> = {
  mission: 0,
  client: 4.6,
  project: 3.6,  // nestled between client cluster and nucleus
  issue: 4.4,
  approval: 4.0,
  agent: 4.6,
  routine: 3.8,
  human: 4.4,
  memory: 4.8,
};

const KIND_DEPTH: Record<string, number> = {
  mission: 0,
  client: 0.4,
  project: -0.3,
  issue: 0.7,
  agent: -0.7,
  human: 0.2,
  memory: -0.4,
  routine: 0,
  approval: 0.5,
};

function semanticPositions(nodes: CortexNode[]): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  const byKind = new Map<string, CortexNode[]>();
  for (const n of nodes) {
    const arr = byKind.get(n.kind) ?? [];
    arr.push(n);
    byKind.set(n.kind, arr);
  }
  for (const [kind, group] of byKind) {
    if (kind === "mission") {
      group.forEach((n) => out.set(n.id, [0, 0, 0]));
      continue;
    }
    const base = KIND_ANGLE[kind] ?? 0;
    const r = KIND_RADIUS[kind] ?? 4.4;
    const z = KIND_DEPTH[kind] ?? 0;
    // Fan multiple nodes of same kind across an arc within their quadrant
    const span = Math.min(0.9, 0.32 * group.length);
    group.forEach((n, i) => {
      const t = group.length === 1 ? 0 : (i / (group.length - 1)) - 0.5;
      const a = base + t * span;
      const rJitter = r + ((Math.sin(n.id.length * 13.37) * 0.6));
      out.set(n.id, [rJitter * Math.cos(a), rJitter * Math.sin(a), z]);
    });
  }
  return out;
}

/* ---- Metric → semantic visualization derivation ---------------------------
 * Every visible sub-element MUST map to a node.metric value.
 * No synthetic decoration. */
type ContextKind = "task-swarm" | "branch-fan" | "pending-stack" | "inflammation" | "flow-loop" | "memory-rings" | "human-anchor" | "none";

interface NodeContextSpec {
  kind: ContextKind;
  count: number;        // for swarms/fans/stacks
  intensity: number;    // 0-1 normalized
  label?: string;       // optional metric name to render as a tiny tag
}

function parseLeadingInt(value: string): number | null {
  const m = value.match(/^(\d+(?:\.\d+)?)/);
  return m ? Math.floor(parseFloat(m[1])) : null;
}

function severityFromValue(value: string): number {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("critical")) return 1;
  if (v.includes("medium") || v.includes("med")) return 0.65;
  if (v.includes("low")) return 0.35;
  const pct = value.match(/(\d+)\s*%/);
  if (pct) return parseInt(pct[1]) / 100;
  return 0.5;
}

function deriveContext(node: CortexNode): NodeContextSpec {
  const m = node.metrics?.[0];
  // Default per-kind structure when no metrics
  if (!m) {
    if (node.kind === "memory") return { kind: "memory-rings", count: 3, intensity: 0.7 };
    if (node.kind === "human") return { kind: "human-anchor", count: 0, intensity: 0.8 };
    if (node.kind === "routine") return { kind: "flow-loop", count: 0, intensity: 0.5 };
    return { kind: "none", count: 0, intensity: 0 };
  }
  const numeric = parseLeadingInt(m.value);
  switch (node.kind) {
    case "client":
      return { kind: "branch-fan", count: Math.min(numeric ?? 0, 8), intensity: 0.8, label: m.label };
    case "agent":
      return { kind: "task-swarm", count: Math.min(numeric ?? 0, 12), intensity: 0.9, label: m.label };
    case "issue":
      if (node.state === "blocked") {
        return { kind: "inflammation", count: 0, intensity: severityFromValue(m.value), label: m.label };
      }
      return { kind: "pending-stack", count: Math.min(numeric ?? 0, 8), intensity: 0.7, label: m.label };
    case "project":
      return { kind: "flow-loop", count: 0, intensity: severityFromValue(m.value), label: m.label };
    case "approval":
      return { kind: "pending-stack", count: Math.min(numeric ?? 0, 6), intensity: 0.85, label: m.label };
    default:
      return { kind: "none", count: 0, intensity: 0 };
  }
}


/* -------------------------------------------------------------------------- */
/* Nucleus — the volumetric glowing centerpiece                                */
/* -------------------------------------------------------------------------- */
function Nucleus() {
  const innerRef = useRef<THREE.Mesh>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (innerRef.current) {
      innerRef.current.scale.setScalar(1 + Math.sin(t * 1.4) * 0.05);
      innerRef.current.rotation.y = t * 0.15;
      innerRef.current.rotation.x = Math.sin(t * 0.2) * 0.1;
    }
    if (haloRef.current) {
      const m = haloRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.1 + (Math.sin(t * 1.2) + 1) * 0.04;
    }
    if (ringARef.current) ringARef.current.rotation.z = t * 0.08;
    if (ringBRef.current) ringBRef.current.rotation.z = -t * 0.05;
  });

  return (
    <group>
      <pointLight intensity={120} distance={22} color="#18d7ff" decay={1.6} />

      <mesh ref={innerRef}>
        <icosahedronGeometry args={[1.05, 5]} />
        <meshStandardMaterial
          color={new THREE.Color("#9ff0ff")}
          emissive={new THREE.Color("#18d7ff")}
          emissiveIntensity={4.5}
          roughness={0.18}
          metalness={0.12}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.32, 48, 48]} />
        <meshBasicMaterial color="#7ee9ff" transparent opacity={0.18} side={THREE.BackSide} />
      </mesh>

      <mesh ref={haloRef}>
        <sphereGeometry args={[2.1, 48, 48]} />
        <meshBasicMaterial color="#18d7ff" transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      <mesh ref={ringARef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[2.6, 0.018, 16, 160]} />
        <meshBasicMaterial color="#9ff0ff" transparent opacity={0.45} />
      </mesh>

      <mesh ref={ringBRef} rotation={[Math.PI / 2, Math.PI / 5, 0]}>
        <torusGeometry args={[3.4, 0.012, 16, 200]} />
        <meshBasicMaterial color="#18d7ff" transparent opacity={0.28} />
      </mesh>

      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[4.4, 0.006, 12, 240]} />
        <meshBasicMaterial color="#39ff88" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Synapse — curving glowing tube between two world points                     */
/* -------------------------------------------------------------------------- */
function curveBetween(from: THREE.Vector3, to: THREE.Vector3, lift: number): THREE.QuadraticBezierCurve3 {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from);
  const offset = new THREE.Vector3(0, 0, lift * Math.max(1, dir.length() * 0.18));
  mid.add(offset);
  return new THREE.QuadraticBezierCurve3(from, mid, to);
}

function Synapse({
  from,
  to,
  state,
  emphasized,
}: {
  from: [number, number, number];
  to: [number, number, number];
  state: CortexSignalState;
  emphasized: boolean;
}) {
  const curve = useMemo(
    () => curveBetween(new THREE.Vector3(...from), new THREE.Vector3(...to), 1),
    [from, to],
  );
  const color = STATE_COLOR[state];
  const isHot = state === "active" || state === "blocked";
  return (
    <mesh>
      <tubeGeometry args={[curve, 56, emphasized ? 0.025 : 0.018, 8, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isHot ? 3 : 1.6}
        transparent
        opacity={emphasized ? 0.85 : 0.45}
        roughness={0.4}
      />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* TravelingSignal — particle that loops along a curve                         */
/* -------------------------------------------------------------------------- */
function durationFor(state: CortexSignalState): number {
  switch (state) {
    case "active":
      return 3.2;
    case "healthy":
      return 4.8;
    case "pending":
      return 4.2;
    case "blocked":
      return 6.0;
    default:
      return 7.5;
  }
}

function TravelingSignal({
  from,
  to,
  state,
  offset,
}: {
  from: [number, number, number];
  to: [number, number, number];
  state: CortexSignalState;
  offset: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const curve = useMemo(
    () => curveBetween(new THREE.Vector3(...from), new THREE.Vector3(...to), 1),
    [from, to],
  );
  const dur = durationFor(state);
  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime + offset) / dur) % 1;
    const p = curve.getPointAt(t);
    if (meshRef.current) meshRef.current.position.copy(p);
    if (trailRef.current) trailRef.current.position.copy(p);
  });
  const color = STATE_COLOR[state];
  return (
    <group>
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* NodeForm — kind-specific geometric form (the V3 visual identity).           */
/* Each kind is built from: glass outer shell (transparent + wireframe edges)  */
/* + emissive inner core. Pure spheres are reserved for the nucleus.           */
/* -------------------------------------------------------------------------- */
interface NodeFormProps {
  kind: string;
  color: string;
  emissive: number;
  innerEmissive: number;
}

function NodeForm({ kind, color, emissive, innerEmissive }: NodeFormProps) {
  switch (kind) {
    case "agent": {
      // Twin octahedron — outer wireframe shell, inner solid core.
      return (
        <group>
          <mesh>
            <octahedronGeometry args={[0.36, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.35} transparent opacity={0.16} roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
            <Edges color={color} threshold={1} linewidth={1.2} />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.17, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} roughness={0.25} metalness={0.3} />
          </mesh>
        </group>
      );
    }
    case "client": {
      // Hexagonal column with crystal cap — the "organism cluster".
      return (
        <group>
          <mesh rotation={[0, Math.PI / 6, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.36, 6, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.22} roughness={0.4} metalness={0.4} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh position={[0, 0.32, 0]} rotation={[0, Math.PI / 6, 0]}>
            <coneGeometry args={[0.24, 0.26, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.7} transparent opacity={0.4} roughness={0.3} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh>
            <icosahedronGeometry args={[0.11, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    case "project": {
      // Dodecahedron — the "work pathway" node.
      return (
        <group>
          <mesh>
            <dodecahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.3} transparent opacity={0.18} roughness={0.35} metalness={0.5} side={THREE.DoubleSide} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh>
            <icosahedronGeometry args={[0.14, 2]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    case "issue": {
      // Tetrahedron — sharp, "edge case" angularity.
      return (
        <group>
          <mesh rotation={[0.3, 0.6, 0]}>
            <tetrahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.2} roughness={0.45} metalness={0.45} side={THREE.DoubleSide} />
            <Edges color={color} threshold={1} linewidth={1.4} />
          </mesh>
          <mesh>
            <icosahedronGeometry args={[0.13, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    case "human": {
      // Vertical triangular pillar — anchor surface for handoffs.
      return (
        <group>
          <mesh rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.38, 3, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.22} roughness={0.4} metalness={0.4} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <coneGeometry args={[0.2, 0.22, 3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.7} transparent opacity={0.4} roughness={0.3} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    case "memory": {
      // Stacked discs — knowledge layers; central deposit core.
      const layers = [-1, 0, 1];
      return (
        <group>
          {layers.map((i) => (
            <mesh key={i} position={[0, i * 0.13, 0]} rotation={[(i % 2) * 0.18, 0, 0]}>
              <cylinderGeometry args={[0.26 - Math.abs(i) * 0.04, 0.26 - Math.abs(i) * 0.04, 0.018, 36, 1]} />
              <meshStandardMaterial color={i === 0 ? color : "#83918c"} emissive={i === 0 ? color : "#83918c"} emissiveIntensity={emissive * (i === 0 ? 0.6 : 0.3)} transparent opacity={0.55} roughness={0.5} metalness={0.3} />
              <Edges color={i === 0 ? color : "#83918c"} threshold={15} linewidth={1} />
            </mesh>
          ))}
          <mesh>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive * 0.75} />
          </mesh>
        </group>
      );
    }
    case "approval": {
      // Vertically oriented octahedron (diamond) — the synapse gate.
      return (
        <group>
          <mesh>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.22} roughness={0.35} metalness={0.5} side={THREE.DoubleSide} />
            <Edges color={color} threshold={1} linewidth={1.3} />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.15, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    case "routine": {
      // Torus-knot — a closed pulse loop.
      return (
        <group>
          <mesh>
            <torusGeometry args={[0.26, 0.05, 12, 64]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.6} roughness={0.35} metalness={0.4} transparent opacity={0.55} />
            <Edges color={color} threshold={15} linewidth={1} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={innerEmissive} />
          </mesh>
        </group>
      );
    }
    default: {
      return (
        <mesh>
          <icosahedronGeometry args={[0.28, 2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.32} metalness={0.2} />
        </mesh>
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* ClickRipple — single-shot expanding ring fired on every node click          */
/* -------------------------------------------------------------------------- */
function ClickRipple({ color, triggerKey }: { color: string; triggerKey: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const startRef = useRef<number>(0);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (startRef.current === 0) startRef.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startRef.current;
    const dur = 0.85;
    const t = Math.min(elapsed / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = 1 + eased * 3.2;
    ref.current.scale.setScalar(scale);
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = (1 - t) * 0.8;
  });
  return (
    <mesh key={triggerKey} ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.42, 0.012, 12, 80]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* Node3D — interactive draggable graph node                                   */
/* -------------------------------------------------------------------------- */
function Node3D({
  node,
  position,
  selected,
  dimmed,
  emphasized,
  onSelect,
  onMove,
  setOrbit,
}: {
  node: CortexNode;
  position: [number, number, number];
  selected: boolean;
  dimmed: boolean;
  emphasized: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  setOrbit: (enabled: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [clickKey, setClickKey] = useState(0);
  const dragRef = useRef<{
    dragging: boolean;
    didDrag: boolean;
    pointerStart: { x: number; y: number };
    plane: THREE.Plane;
    intersect: THREE.Vector3;
    offset: THREE.Vector3;
  }>({
    dragging: false,
    didDrag: false,
    pointerStart: { x: 0, y: 0 },
    plane: new THREE.Plane(),
    intersect: new THREE.Vector3(),
    offset: new THREE.Vector3(),
  });

  const color = STATE_COLOR[node.state];
  const baseY = position[1];
  const targetScale = selected ? 1.4 : hovered ? 1.15 : dimmed ? 0.78 : 1;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    if (!dragRef.current.dragging) {
      const t = clock.elapsedTime + node.id.length * 0.21;
      groupRef.current.position.y = baseY + Math.sin(t * 0.55) * 0.07;
    }
    if (scaleRef.current) {
      // Smoothly interpolate scale to target — no hard pops
      const current = scaleRef.current.scale.x;
      const next = current + (targetScale - current) * 0.18;
      scaleRef.current.scale.setScalar(next);
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!groupRef.current) return;
    const cam = e.camera as THREE.Camera;
    const planeNormal = new THREE.Vector3();
    cam.getWorldDirection(planeNormal);
    planeNormal.negate();
    dragRef.current.plane.setFromNormalAndCoplanarPoint(planeNormal, groupRef.current.position);
    dragRef.current.offset.subVectors(groupRef.current.position, e.point);
    dragRef.current.dragging = true;
    dragRef.current.didDrag = false;
    dragRef.current.pointerStart = { x: e.clientX, y: e.clientY };
    setOrbit(false);
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current.dragging || !groupRef.current) return;
    const dx = e.clientX - dragRef.current.pointerStart.x;
    const dy = e.clientY - dragRef.current.pointerStart.y;
    if (Math.hypot(dx, dy) > 6) {
      dragRef.current.didDrag = true;
    }
    if (!dragRef.current.didDrag) return;
    e.stopPropagation();
    const raycaster = e.ray ? new THREE.Raycaster() : null;
    if (raycaster) {
      raycaster.set(e.ray.origin, e.ray.direction);
      const hit = raycaster.ray.intersectPlane(dragRef.current.plane, dragRef.current.intersect);
      if (hit) {
        const next = hit.clone().add(dragRef.current.offset);
        groupRef.current.position.copy(next);
        onMove(node.id, [next.x, next.y, next.z]);
      }
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current.dragging) return;
    e.stopPropagation();
    const wasDrag = dragRef.current.didDrag;
    dragRef.current.dragging = false;
    dragRef.current.didDrag = false;
    setOrbit(true);
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    if (!wasDrag) {
      // It was a click, not a drag — select + fire ripple
      onSelect(node.id);
      setClickKey((k) => k + 1);
    }
  };

  if (node.kind === "mission") {
    return (
      <Html
        position={[position[0], position[1] - 2.05, position[2]]}
        center
        distanceFactor={9}
        zIndexRange={[40, 30]}
      >
        <div className="cortex-3d-label cortex-3d-label--mission">
          <span>{node.label.toUpperCase()}</span>
        </div>
      </Html>
    );
  }

  const emissive = dimmed ? 0.5 : emphasized ? 1.4 : 0.9;
  const innerEmissive = dimmed ? 0.8 : emphasized ? 2.6 : 1.8;

  return (
    <group ref={groupRef} position={position}>
      <group ref={scaleRef}>
        {/* Hit target — the actual geometric form */}
        <group
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <NodeForm kind={node.kind} color={color} emissive={emissive} innerEmissive={innerEmissive} />
        </group>

        {selected ? <PulseSelection color={color} /> : null}
        {clickKey > 0 ? <ClickRipple color={color} triggerKey={clickKey} /> : null}

        {/* Data-derived sub-structure — every element below maps to a real
            node.metric. See deriveContext(). */}
        <NodeContext node={node} color={color} />
      </group>

      <Html
        position={[0, -0.72, 0]}
        center
        zIndexRange={[30, 10]}
        distanceFactor={9}
        occlude="blending"
        style={{ pointerEvents: "none" }}
      >
        <div className={`cortex-3d-label${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`} data-state={node.state}>
          <strong>{node.label}</strong>
          <em>
            {node.kind} · {node.state}
          </em>
        </div>
      </Html>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* NodeContext — data-derived visualization of a node's metrics                */
/* Every sub-element must be VISUALLY READABLE: emissive, sized to register    */
/* against the bloomed nucleus + ambient cloud, and tagged with the metric.    */
/* -------------------------------------------------------------------------- */

/** Floating metric badge — tag rendered as HTML so it's always legible. */
function MetricBadge({
  text,
  position = [0, 0.85, 0],
  state,
  tone = "neutral",
}: {
  text: string;
  position?: [number, number, number];
  state?: CortexSignalState;
  tone?: "neutral" | "warn" | "danger" | "good";
}) {
  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
      <div className="cortex-3d-metric" data-state={state} data-tone={tone}>
        {text}
      </div>
    </Html>
  );
}

function TaskSwarm({
  color,
  count,
  intensity,
  label,
}: {
  color: string;
  count: number;
  intensity: number;
  label?: string;
}) {
  // Agents: an orbital RING with N task particles glowing on it. The ring
  // makes the swarm read as a swarm even at low task counts; emissive
  // material punches through the bloom.
  const ringRef = useRef<THREE.Group>(null);
  const orbits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        ringIdx: i % 2,
        phase: (i / count) * Math.PI * 2 + (i % 2) * 0.5,
        speed: 0.42 + (i % 3) * 0.07,
        tilt: ((i % 4) - 1.5) * 0.18,
      })),
    [count],
  );
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.elapsedTime;
    ringRef.current.children.forEach((child, i) => {
      if (i >= orbits.length) return;
      const o = orbits[i];
      const r = o.ringIdx === 0 ? 0.95 : 1.25;
      const a = t * o.speed + o.phase;
      child.position.set(r * Math.cos(a), o.tilt, r * Math.sin(a));
    });
  });
  return (
    <group>
      {/* Track rings — visible orbital paths */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.008, 8, 96]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.45} />
      </mesh>
      <mesh rotation={[Math.PI / 2.2, Math.PI / 6, 0]}>
        <torusGeometry args={[1.25, 0.006, 8, 96]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.32} />
      </mesh>
      {/* Task particles */}
      <group ref={ringRef}>
        {orbits.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <MetricBadge text={label ? `${count} ${label}` : `${count} tasks`} position={[0, 1.55, 0]} tone="good" />
      {/* underscore intentionally unused vars */}
      {(() => {
        void intensity;
        return null;
      })()}
    </group>
  );
}

function BranchFan({
  color,
  count,
  intensity,
  label,
}: {
  color: string;
  count: number;
  intensity: number;
  label?: string;
}) {
  // Clients: each active branch is a real tube + emissive leaf node fanned
  // outward from the client. Far more prominent than the prior thin lines.
  const filaments = useMemo(() => {
    const out: Array<{ curve: THREE.QuadraticBezierCurve3; end: THREE.Vector3 }> = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count - 1) - 0.5) * 1.4; // wider fan
      const elev = ((i % 2) - 0.5) * 0.5;
      const r = 1.3 + (i % 3) * 0.18;
      const start = new THREE.Vector3(0, 0, 0);
      const end = new THREE.Vector3(r * Math.sin(angle), elev, -r * Math.cos(angle));
      const mid = end.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, elev * 0.4, 0));
      out.push({ curve: new THREE.QuadraticBezierCurve3(start, mid, end), end });
    }
    return out;
  }, [count]);

  return (
    <group>
      {filaments.map((f, i) => (
        <group key={i}>
          <mesh>
            <tubeGeometry args={[f.curve, 24, 0.018, 6, false]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={0.85} />
          </mesh>
          <mesh position={f.end.toArray()}>
            <sphereGeometry args={[0.085, 14, 14]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <MetricBadge text={label ? `${count} ${label}` : `${count} branches`} position={[0, 1.05, -0.6]} tone="good" />
      {(() => {
        void intensity;
        return null;
      })()}
    </group>
  );
}

function PendingStack({
  color,
  count,
  label,
}: {
  color: string;
  count: number;
  label?: string;
}) {
  // Issues / approvals: N glowing pending tags stacked below the node. Each
  // tag is a flat panel that catches the bloom — reads as queue depth.
  return (
    <group position={[0, -0.65, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} position={[0, -i * 0.22, 0]}>
          <mesh>
            <boxGeometry args={[0.36, 0.08, 0.22]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6 - i * 0.18} roughness={0.3} />
          </mesh>
          {/* underline strip */}
          <mesh position={[0, -0.05, 0.115]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.32, 0.012]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
      <MetricBadge
        text={label ? `${count} ${label}` : `${count} pending`}
        position={[0, 0.35, 0]}
        tone="warn"
      />
    </group>
  );
}

function InflammationHalo({ intensity, label }: { intensity: number; label?: string }) {
  // Blocked issues: large volumetric magenta halo + flickering core sphere +
  // outer pulsing ring + pulsing point light. Should read as a wound.
  const haloRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const baseR = 0.9 + intensity * 0.6;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (haloRef.current) {
      const s = 1 + Math.sin(t * (1.4 + intensity)) * (0.06 + intensity * 0.08);
      haloRef.current.scale.setScalar(s);
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.22 + intensity * 0.2 + Math.sin(t * 1.1) * 0.08;
    }
    if (coreRef.current) {
      const m = coreRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 2.5 + Math.sin(t * 4) * 1.5 * intensity;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.8;
      const s = 1 + Math.sin(t * 0.8) * 0.12;
      ringRef.current.scale.setScalar(s);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 8 * intensity + Math.sin(t * (1.8 + intensity)) * 3.2;
    }
  });

  return (
    <group>
      <mesh ref={haloRef}>
        <sphereGeometry args={[baseR, 32, 32]} />
        <meshBasicMaterial color="#ff2f7a" transparent opacity={0.28} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.48, 2]} />
        <meshStandardMaterial
          color="#ff2f7a"
          emissive="#ff2f7a"
          emissiveIntensity={2.5}
          roughness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[baseR * 0.85, 0.016, 8, 96]} />
        <meshStandardMaterial color="#ff2f7a" emissive="#ff2f7a" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>
      <pointLight ref={lightRef} color="#ff2f7a" distance={baseR * 5} intensity={6 * intensity} decay={1.6} />
      <MetricBadge
        text={label ? `${label.toUpperCase()} · INFLAMED` : "INFLAMED"}
        position={[0, baseR + 0.4, 0]}
        tone="danger"
      />
    </group>
  );
}

function FlowLoop({ color, intensity, label }: { color: string; intensity: number; label?: string }) {
  // Projects: progress arc whose extent encodes flow %, with a co-rotating
  // inner trim and a "throughput pulse" travelling along the arc.
  const arcRef = useRef<THREE.Mesh>(null);
  const trimRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const arcExtent = Math.PI * 2 * Math.max(0.05, Math.min(0.98, intensity));

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (arcRef.current) arcRef.current.rotation.z = t * (0.3 + intensity * 0.8);
    if (trimRef.current) trimRef.current.rotation.z = -t * (0.4 + intensity * 0.6);
    if (pulseRef.current) {
      const a = (t * (0.6 + intensity * 1.2)) % arcExtent;
      const r = 0.9;
      pulseRef.current.position.set(r * Math.cos(a), 0, r * Math.sin(a));
    }
  });

  return (
    <group>
      <mesh ref={arcRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.018, 10, 96, arcExtent]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.0} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.005, 8, 96]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={0.22} />
      </mesh>
      <mesh ref={trimRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.012, 8, 96, arcExtent * 0.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={0.7} />
      </mesh>
      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
      </mesh>
      <MetricBadge
        text={label ? `${label.toUpperCase()} ${Math.round(intensity * 100)}%` : `${Math.round(intensity * 100)}% FLOW`}
        position={[0, 1.25, 0]}
        tone="good"
      />
    </group>
  );
}

function MemoryRings() {
  // Memory: 3 concentric tilted bands at clearly readable sizes.
  const tilts = [0, Math.PI / 5, -Math.PI / 6];
  return (
    <group>
      {tilts.map((tilt, i) => {
        const r = 0.72 + i * 0.28;
        return (
          <mesh key={i} rotation={[Math.PI / 2 + tilt, 0, 0]}>
            <torusGeometry args={[r, 0.012, 8, 96]} />
            <meshStandardMaterial
              color={i === 0 ? "#39ff88" : "#83918c"}
              emissive={i === 0 ? "#39ff88" : "#83918c"}
              emissiveIntensity={1.4 - i * 0.3}
              transparent
              opacity={0.7 - i * 0.12}
            />
          </mesh>
        );
      })}
      <mesh>
        <icosahedronGeometry args={[0.22, 2]} />
        <meshStandardMaterial
          color="#83918c"
          emissive="#39ff88"
          emissiveIntensity={0.6}
          roughness={0.5}
        />
      </mesh>
      <MetricBadge text="MEMORY · DORMANT" position={[0, 1.45, 0]} tone="neutral" />
    </group>
  );
}

function HumanAnchor({ color }: { color: string }) {
  // Humans: 4 sturdy anchor cylinders downward with terminal nodes.
  const anchors = useMemo(() => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const r = 0.62;
      out.push([r * Math.cos(a), -0.65, r * Math.sin(a)]);
    }
    return out;
  }, []);
  return (
    <group>
      {anchors.map((pos, i) => {
        const start = new THREE.Vector3(pos[0] * 0.4, -0.15, pos[2] * 0.4);
        const end = new THREE.Vector3(...pos);
        const curve = new THREE.LineCurve3(start, end);
        return (
          <group key={i}>
            <mesh>
              <tubeGeometry args={[curve, 1, 0.018, 6, false]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={0.8} />
            </mesh>
            <mesh position={pos}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} />
            </mesh>
          </group>
        );
      })}
      <MetricBadge text="HUMAN · ANCHOR" position={[0, 0.9, 0]} tone="good" />
    </group>
  );
}

function NodeContext({ node, color }: { node: CortexNode; color: string }) {
  const spec = useMemo(() => deriveContext(node), [node]);
  switch (spec.kind) {
    case "task-swarm":
      return <TaskSwarm color={color} count={spec.count} intensity={spec.intensity} label={spec.label} />;
    case "branch-fan":
      return <BranchFan color={color} count={spec.count} intensity={spec.intensity} label={spec.label} />;
    case "pending-stack":
      return <PendingStack color={color} count={spec.count} label={spec.label} />;
    case "inflammation":
      return <InflammationHalo intensity={spec.intensity} label={spec.label} />;
    case "flow-loop":
      return <FlowLoop color={color} intensity={spec.intensity} label={spec.label} />;
    case "memory-rings":
      return <MemoryRings />;
    case "human-anchor":
      return <HumanAnchor color={color} />;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* PulseSelection — pulsing animated ring around a selected node               */
/* -------------------------------------------------------------------------- */
function PulseSelection({ color }: { color: string }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.4;
    const s = 1 + Math.sin(t) * 0.08;
    if (outerRef.current) {
      outerRef.current.scale.set(s, s, s);
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t + 0.5) * 0.25;
    }
    if (innerRef.current) {
      innerRef.current.rotation.z = t * 0.6;
    }
  });
  return (
    <group>
      <mesh ref={outerRef}>
        <torusGeometry args={[0.62, 0.014, 8, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh ref={innerRef} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.42, 0.008, 8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* AmbientDendrites — sea of tiny lit points around the nucleus (living tissue)*/
/* -------------------------------------------------------------------------- */
function AmbientDendrites({ count = 1800, radius = 14 }: { count?: number; radius?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = ["#39ff88", "#18d7ff", "#ffb02e", "#ff2f7a"];
    for (let i = 0; i < count; i++) {
      // Spherical cloud biased toward the equatorial plane
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 2.6 + Math.pow(Math.random(), 1.6) * radius;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.55;
      const z = r * Math.cos(phi) * 0.55;
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geom, material: mat };
  }, [count, radius]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.012;
      ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.06;
    }
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}

/* -------------------------------------------------------------------------- */
/* RadialPulses — slow concentric ring pulses emitting from nucleus            */
/* -------------------------------------------------------------------------- */
function RadialPulse({ delay }: { delay: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const period = 6.0;
    const t = ((clock.elapsedTime + delay) % period) / period;
    const r = 1.4 + t * 7.0;
    ref.current.scale.set(r, r, r);
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, (1 - t) * 0.35);
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.01, 12, 80]} />
      <meshBasicMaterial color="#18d7ff" transparent opacity={0.3} depthWrite={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* Scene wrapper                                                               */
/* -------------------------------------------------------------------------- */
interface SceneProps {
  graph: CortexGraph;
  activeLens: CortexLensId;
  selectedNodeId: string | null;
  positions: Map<string, [number, number, number]>;
  setPosition: (id: string, pos: [number, number, number]) => void;
  onSelectNode: (id: string) => void;
  orbitEnabled: boolean;
  setOrbit: (enabled: boolean) => void;
}

function Scene({
  graph,
  activeLens,
  selectedNodeId,
  positions,
  setPosition,
  onSelectNode,
  orbitEnabled,
  setOrbit,
}: SceneProps) {
  const isNodeEmphasized = (n: CortexNode) =>
    n.lensAffinity?.includes(activeLens) || n.kind === "mission" || n.id === selectedNodeId;

  const pathRenderable = (path: CortexPath) => {
    const from = positions.get(path.from);
    const to = positions.get(path.to);
    if (!from || !to) return null;
    const fromN = graph.nodes.find((n) => n.id === path.from);
    const toN = graph.nodes.find((n) => n.id === path.to);
    const emph = Boolean(fromN && toN && (isNodeEmphasized(fromN) || isNodeEmphasized(toN)));
    return { from, to, emph };
  };

  return (
    <>
      <color attach="background" args={["#02060a"]} />
      <fog attach="fog" args={["#02060a", 12, 60]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight intensity={0.4} color="#18d7ff" groundColor="#06110f" />
      <directionalLight position={[6, 8, 5]} intensity={0.6} color="#f4f1e8" />

      <Stars radius={80} depth={50} count={600} factor={3} fade speed={0.4} />

      <Nucleus />

      <RadialPulse delay={0} />
      <RadialPulse delay={2} />
      <RadialPulse delay={4} />

      {/* Background ambient dust — pure atmosphere, no semantic claim. Kept
          sparse so the field reads as "data set against a quiet field" rather
          than "data buried under decoration". */}
      <AmbientDendrites count={900} radius={14} />

      {graph.paths.map((path) => {
        const r = pathRenderable(path);
        if (!r) return null;
        return (
          <Synapse
            key={path.id}
            from={r.from}
            to={r.to}
            state={path.state}
            emphasized={r.emph}
          />
        );
      })}

      {graph.signals.map((signal: CortexSignal, idx) => {
        const path = graph.paths.find((p) => p.id === signal.pathId);
        if (!path) return null;
        const from = positions.get(path.from);
        const to = positions.get(path.to);
        if (!from || !to) return null;
        return (
          <TravelingSignal
            key={signal.id}
            from={from}
            to={to}
            state={signal.state}
            offset={idx * 1.2}
          />
        );
      })}

      {graph.nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const isSelected = selectedNodeId === node.id;
        const hasSelection = selectedNodeId !== null;
        const isDimmed = hasSelection && !isSelected && node.kind !== "mission";
        return (
          <Node3D
            key={node.id}
            node={node}
            position={pos}
            selected={isSelected}
            dimmed={isDimmed}
            emphasized={isNodeEmphasized(node)}
            onSelect={onSelectNode}
            onMove={setPosition}
            setOrbit={setOrbit}
          />
        );
      })}

      <OrbitControls
        enabled={orbitEnabled}
        enablePan
        enableZoom
        enableRotate
        minDistance={4}
        maxDistance={45}
        zoomSpeed={0.7}
        rotateSpeed={0.45}
        panSpeed={0.6}
        target={[0, 0, 0]}
        makeDefault
      />

      <EffectComposer multisampling={2}>
        <Bloom intensity={1.0} luminanceThreshold={0.22} luminanceSmoothing={0.85} mipmapBlur radius={0.7} />
        <ChromaticAberration offset={[0.0006, 0.0006]} radialModulation modulationOffset={0.5} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.18} darkness={1.0} />
      </EffectComposer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Public component                                                            */
/* -------------------------------------------------------------------------- */
function FallbackOverlay({ children }: { children: ReactNode }) {
  return <div className="cortex-3d-fallback">{children}</div>;
}

export default function NeuralField({ graph, activeLens, selectedNodeId, onSelectNode }: NeuralFieldProps) {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  // Semantic 3D placement — every kind clusters in its V3 quadrant. Multiple
  // nodes of the same kind fan within the quadrant; not derived from the SVG
  // x,y coords (which were never intended for a 3D scene).
  const initialPositions = useMemo(() => semanticPositions(graph.nodes), [graph.nodes]);

  // Per-node position state (so drag-to-move actually mutates the world).
  const [positions, setPositions] = useState<Map<string, [number, number, number]>>(initialPositions);

  // Sync when graph changes — preserve user-dragged positions, only add new nodes.
  useMemo(() => {
    setPositions((prev) => {
      const semantic = semanticPositions(graph.nodes);
      const next = new Map(prev);
      for (const n of graph.nodes) {
        if (!next.has(n.id)) next.set(n.id, semantic.get(n.id) ?? [0, 0, 0]);
      }
      for (const id of next.keys()) {
        if (!graph.nodes.find((n) => n.id === id)) next.delete(id);
      }
      return next;
    });
  }, [graph.nodes]);

  const setPosition = (id: string, pos: [number, number, number]) => {
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  };

  return (
    <div className="cortex-neural-field cortex-neural-field--3d" data-lens={activeLens}>
      <Canvas
        camera={{ position: [0, 1.2, 12], fov: 45, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        shadows={false}
        fallback={<FallbackOverlay>WebGL unavailable — falling back to static cortex view.</FallbackOverlay>}
      >
        <Scene
          graph={graph}
          activeLens={activeLens}
          selectedNodeId={selectedNodeId ?? null}
          positions={positions}
          setPosition={setPosition}
          onSelectNode={onSelectNode ?? (() => {})}
          orbitEnabled={orbitEnabled}
          setOrbit={setOrbitEnabled}
        />
      </Canvas>
      <div className="cortex-3d-hint" aria-hidden="true">
        <span>drag · rotate</span>
        <span>scroll · zoom</span>
        <span>click · select</span>
        <span>drag node · move</span>
      </div>
    </div>
  );
}
