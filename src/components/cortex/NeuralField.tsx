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
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { CortexGraph, CortexLensId, CortexNode, CortexPath, CortexSignal, CortexSignalState } from "../../lib/commandCortex/types";

/* The Meshy-generated GLBs in src/assets/3d/ are intentionally NOT imported
 * here. Loading 77 MB of binary mesh data on page paint is too heavy for the
 * default MISSION view, and at MISSION zoom the meshes were too small
 * compared to the data leaves anyway. The assets stay in the repo for a
 * future opt-in "examine specimen" deep-zoom mode (loaded on demand only
 * when the user drills into a single node at FOCUS stage). See
 * docs/cortex-3d-meshy-workflow.md. */

/* ---- Locked zoom stages ---------------------------------------------------
 * V3 design implies four distinct "altitude" reads, not free zoom:
 *   0 OVERVIEW — distance ~32, see the whole field, only nucleus + parent
 *               dots + quadrant labels visible.
 *   1 MISSION  — distance ~17, default; metric badges + parent labels read.
 *   2 CLUSTER  — distance ~9,  parent shells + every leaf shard label read.
 *   3 FOCUS    — distance ~5,  selected node's local neighborhood; pull right
 *               panel into the cortex's attention.
 *
 * Scroll-wheel snaps between stops with a smooth lerp; OrbitControls.zoom
 * is disabled so the user can't slide between them.
 */
interface ZoomStage {
  name: string;
  distance: number;
  lod: 0 | 1 | 2 | 3;
}
const ZOOM_STAGES: ZoomStage[] = [
  { name: "OVERVIEW", distance: 32, lod: 0 },
  { name: "MISSION", distance: 17, lod: 1 },
  { name: "CLUSTER", distance: 9, lod: 2 },
  { name: "FOCUS", distance: 5.5, lod: 3 },
];

/** LODContext propagates the current detail level (0..3) to every renderer
 *  so they can decide what to show/hide at each zoom stop. */
const LODContext = createContext<number>(1);
const useLOD = () => useContext(LODContext);

function WheelSnap({ stage, setStage }: { stage: number; setStage: (n: number) => void }) {
  const { gl } = useThree();
  const lockRef = useRef<number>(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lockRef.current < 220) return; // debounce so a single scroll = one stop
      lockRef.current = now;
      const dir = e.deltaY > 0 ? -1 : 1; // wheel up = zoom in (higher LOD)
      const next = Math.max(0, Math.min(ZOOM_STAGES.length - 1, stage + dir));
      if (next !== stage) setStage(next);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [gl, stage, setStage]);
  return null;
}

function ZoomController({ stage }: { stage: number }) {
  const { camera, gl } = useThree();
  const targetRef = useRef(camera.position.length());
  useEffect(() => {
    targetRef.current = ZOOM_STAGES[stage].distance;
  }, [stage]);
  useEffect(() => {
    // Smoothly clamp on mount too
    targetRef.current = ZOOM_STAGES[stage].distance;
    void gl;
  }, [gl, stage]);
  useFrame(() => {
    const t = targetRef.current;
    const cur = camera.position.length();
    if (cur < 0.001) return;
    const next = cur + (t - cur) * 0.09;
    camera.position.normalize().multiplyScalar(next);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

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
      <pointLight intensity={28} distance={14} color="#18d7ff" decay={1.9} />

      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.62, 5]} />
        <meshStandardMaterial
          color={new THREE.Color("#9ff0ff")}
          emissive={new THREE.Color("#18d7ff")}
          emissiveIntensity={1.4}
          roughness={0.22}
          metalness={0.12}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.82, 48, 48]} />
        <meshBasicMaterial color="#7ee9ff" transparent opacity={0.14} side={THREE.BackSide} />
      </mesh>

      <mesh ref={haloRef}>
        <sphereGeometry args={[1.45, 48, 48]} />
        <meshBasicMaterial color="#18d7ff" transparent opacity={0.08} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      <mesh ref={ringARef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.8, 0.012, 16, 160]} />
        <meshBasicMaterial color="#9ff0ff" transparent opacity={0.4} />
      </mesh>

      <mesh ref={ringBRef} rotation={[Math.PI / 2, Math.PI / 5, 0]}>
        <torusGeometry args={[2.4, 0.008, 16, 200]} />
        <meshBasicMaterial color="#18d7ff" transparent opacity={0.24} />
      </mesh>

      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[3.1, 0.005, 12, 240]} />
        <meshBasicMaterial color="#39ff88" transparent opacity={0.15} />
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
      <tubeGeometry args={[curve, 56, emphasized ? 0.018 : 0.012, 8, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isHot ? 1.8 : 0.9}
        transparent
        opacity={emphasized ? 0.7 : 0.35}
        roughness={0.5}
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
  // Pure procedural — no GLB loading. See top-of-file note explaining why.
  return <ProceduralForm kind={kind} color={color} emissive={emissive} innerEmissive={innerEmissive} />;
}

/** Original procedural geometric form — kept as Suspense fallback / for
 *  any kind that doesn't have a Meshy GLB yet. */
function ProceduralForm({ kind, color, emissive, innerEmissive }: NodeFormProps) {
  switch (kind) {
    case "agent": {
      // Twin octahedron — outer wireframe shell, inner solid core.
      return (
        <group>
          <mesh>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.35} transparent opacity={0.16} roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
            <Edges color={color} threshold={1} linewidth={1.2} />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.16, 1]} />
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
            <cylinderGeometry args={[0.22, 0.22, 0.34, 6, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.22} roughness={0.4} metalness={0.4} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 6, 0]}>
            <coneGeometry args={[0.22, 0.24, 6]} />
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
            <dodecahedronGeometry args={[0.28, 0]} />
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
            <tetrahedronGeometry args={[0.36, 0]} />
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
            <cylinderGeometry args={[0.2, 0.2, 0.38, 3, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.4} transparent opacity={0.22} roughness={0.4} metalness={0.4} />
            <Edges color={color} threshold={15} linewidth={1.2} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <coneGeometry args={[0.18, 0.22, 3]} />
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
  const lod = useLOD();
  if (lod < 1) return null; // hide at OVERVIEW
  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
      <div className="cortex-3d-metric" data-state={state} data-tone={tone}>
        {text}
      </div>
    </Html>
  );
}

interface SubLeafSpec {
  offset: [number, number, number]; // relative to parent leaf
  label: string;
  size?: number;
}

/** A labeled leaf node — one real datum sprouted from a parent. Recursive:
 *  each leaf may carry its own sub-leaves which render at smaller scale via
 *  the same component. Labels only appear at LOD >= 2 (CLUSTER+). */
function LeafBranch({
  end,
  color,
  label,
  size = 0.05,
  trunk = true,
  subLeaves,
  depth = 0,
}: {
  end: [number, number, number];
  color: string;
  label: string;
  size?: number;
  trunk?: boolean;
  subLeaves?: SubLeafSpec[];
  depth?: number;
}) {
  const lod = useLOD();
  const curve = useMemo(() => {
    const start = new THREE.Vector3(0, 0, 0);
    const e = new THREE.Vector3(...end);
    const mid = e
      .clone()
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, e.y > 0 ? 0.25 : -0.25, 0));
    return new THREE.QuadraticBezierCurve3(start, mid, e);
  }, [end]);

  // Visibility decisions per LOD level
  const showTrunk = trunk && lod >= 1;
  const showLabel = lod >= 2 && depth < 2; // only label at CLUSTER+ and not at the deepest level
  const labelOffset: [number, number, number] = [
    end[0] + (end[0] >= 0 ? 0.14 : -0.14),
    end[1] - 0.04,
    end[2],
  ];

  return (
    <group>
      {showTrunk ? (
        <mesh>
          <tubeGeometry args={[curve, 16, 0.012 - depth * 0.003, 5, false]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.1 - depth * 0.25}
            transparent
            opacity={0.55 - depth * 0.1}
            roughness={0.5}
          />
        </mesh>
      ) : null}
      <mesh position={end}>
        <icosahedronGeometry args={[size, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6 - depth * 0.3} roughness={0.42} />
      </mesh>
      {showLabel ? (
        <Html
          position={labelOffset}
          center={false}
          distanceFactor={11}
          zIndexRange={[18, 6]}
          style={{ pointerEvents: "none", transform: end[0] >= 0 ? "none" : "translateX(-100%)" }}
        >
          <div className="cortex-3d-leaf">{label}</div>
        </Html>
      ) : null}

      {/* Recursive sub-leaves, anchored at this leaf's endpoint */}
      {subLeaves && lod >= 2 && depth < 1 ? (
        <group position={end}>
          {subLeaves.map((sub, i) => (
            <LeafBranch
              key={i}
              end={sub.offset}
              color={color}
              label={sub.label}
              size={(sub.size ?? size) * 0.72}
              trunk={true}
              depth={depth + 1}
            />
          ))}
        </group>
      ) : null}
    </group>
  );
}

/** Sibling filaments — thin lines connecting nearby leaves of the same parent.
 *  Hides at LOD 0 (overview). */
function SiblingFilaments({ leaves, color }: { leaves: Array<[number, number, number]>; color: string }) {
  const lod = useLOD();
  const geom = useMemo(() => {
    const positions: number[] = [];
    // Connect each leaf to its nearest-by-index neighbor (organic-feel cross-ties)
    for (let i = 0; i < leaves.length - 1; i++) {
      // Probabilistic via deterministic hash so not every pair connects
      if (((i * 7 + 3) % 5) === 0 || (i % 3 === 0 && i + 2 < leaves.length)) {
        const a = leaves[i];
        const b = leaves[(i + 1) % leaves.length];
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [leaves]);
  if (lod < 1) return null;
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
    </lineSegments>
  );
}

function TaskBranches({
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
  // Agents: each task is its own labeled leaf. Every 3rd task carries 2
  // sub-tasks (T03.A, T03.B) so the tree has visible depth at CLUSTER+.
  const leaves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const phi = (i / count) * Math.PI * 1.6 - Math.PI * 0.8;
      const tilt = ((i % 5) - 2) * 0.22;
      const r = 1.7 + ((i * 7) % 5) * 0.16;
      const end: [number, number, number] = [
        r * Math.sin(phi) * Math.cos(tilt),
        tilt * 0.9 + ((i % 3) - 1) * 0.14,
        -r * Math.cos(phi) * Math.cos(tilt) - 0.15,
      ];
      const tag = String(i + 1).padStart(2, "0");
      const hasSubs = i % 3 === 1; // ~33% have sub-tasks
      const subLeaves: SubLeafSpec[] | undefined = hasSubs
        ? [
            { offset: [0.35, 0.1, 0.1], label: `${tag}.A` },
            { offset: [-0.3, 0.04, 0.2], label: `${tag}.B` },
            ...(i % 5 === 0
              ? [{ offset: [0.05, -0.18, 0.32] as [number, number, number], label: `${tag}.C` }]
              : []),
          ]
        : undefined;
      return { end, label: `T${tag}`, subLeaves };
    });
  }, [count]);

  return (
    <group>
      {leaves.map((l, i) => (
        <LeafBranch key={i} end={l.end} color={color} label={l.label} size={0.055} subLeaves={l.subLeaves} />
      ))}
      <SiblingFilaments leaves={leaves.map((l) => l.end)} color={color} />
      <MetricBadge text={label ? `${count} ${label}` : `${count} TASKS`} position={[0, 1.45, 0]} tone="good" />
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
  // Clients: each active branch carries 2 sub-projects so the cluster reads
  // as a tree, not a fan.
  const leaves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / Math.max(1, count - 1) - 0.5) * 1.6;
      const elev = ((i % 2) - 0.5) * 0.7;
      const r = 1.9 + (i % 3) * 0.18;
      const end: [number, number, number] = [r * Math.sin(angle), elev, -r * Math.cos(angle)];
      const subLeaves: SubLeafSpec[] = [
        { offset: [0.3, 0.05, 0.05], label: `B${i + 1}.P1` },
        { offset: [-0.25, -0.05, 0.18], label: `B${i + 1}.P2` },
      ];
      return { end, label: `B${i + 1}`, subLeaves };
    });
  }, [count]);

  return (
    <group>
      {leaves.map((l, i) => (
        <LeafBranch key={i} end={l.end} color={color} label={l.label} size={0.062} subLeaves={l.subLeaves} />
      ))}
      <SiblingFilaments leaves={leaves.map((l) => l.end)} color={color} />
      <MetricBadge text={label ? `${count} ${label}` : `${count} BRANCHES`} position={[0, 1.05, -0.6]} tone="good" />
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
  const leaves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / Math.max(1, count - 1) - 0.5) * 1.0;
      const r = 1.5 + (i % 2) * 0.2;
      const end: [number, number, number] = [
        r * Math.sin(angle),
        -0.65 - i * 0.18,
        r * Math.cos(angle) * 0.5 + 0.3,
      ];
      const subLeaves: SubLeafSpec[] = [
        { offset: [0.22, -0.05, 0.05], label: `P${i + 1}.R` },
      ];
      return { end, label: `P${i + 1}`, subLeaves };
    });
  }, [count]);
  return (
    <group>
      {leaves.map((l, i) => (
        <LeafBranch key={i} end={l.end} color={color} label={l.label} size={0.058} subLeaves={l.subLeaves} />
      ))}
      <SiblingFilaments leaves={leaves.map((l) => l.end)} color={color} />
      <MetricBadge
        text={label ? `${count} ${label}` : `${count} PENDING`}
        position={[0, 0.7, 0]}
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
  // Memory: 3 concentric rings + 5 labeled memory shards spread around.
  const tilts = [0, Math.PI / 5, -Math.PI / 6];
  const shards = useMemo(() => {
    return [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      const r = 1.55 + (i % 2) * 0.22;
      const end: [number, number, number] = [
        r * Math.cos(a),
        (i % 2 === 0 ? 0.18 : -0.18) + (i * 0.04 - 0.08),
        r * Math.sin(a),
      ];
      return { end, label: `M${i + 1}` };
    });
  }, []);
  return (
    <group>
      {tilts.map((tilt, i) => {
        const r = 0.6 + i * 0.16;
        return (
          <mesh key={i} rotation={[Math.PI / 2 + tilt, 0, 0]}>
            <torusGeometry args={[r, 0.008, 8, 96]} />
            <meshStandardMaterial
              color={i === 0 ? "#39ff88" : "#83918c"}
              emissive={i === 0 ? "#39ff88" : "#83918c"}
              emissiveIntensity={1.0 - i * 0.22}
              transparent
              opacity={0.6 - i * 0.12}
            />
          </mesh>
        );
      })}
      {shards.map((s, i) => (
        <LeafBranch key={i} end={s.end} color="#83918c" label={s.label} size={0.046} />
      ))}
      <MetricBadge text="MEMORY · DORMANT" position={[0, 1.3, 0]} tone="neutral" />
    </group>
  );
}

function HumanAnchor({ color }: { color: string }) {
  // Humans: 4 labeled responsibility anchors fanning down + out.
  const anchors = useMemo(() => {
    return ["R1", "R2", "R3", "R4"].map((label, i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const r = 1.5;
      const end: [number, number, number] = [
        r * Math.cos(a),
        -0.55 + (i % 2) * 0.18,
        r * Math.sin(a) * 0.65 + 0.25,
      ];
      return { end, label };
    });
  }, []);
  return (
    <group>
      {anchors.map((a, i) => (
        <LeafBranch key={i} end={a.end} color={color} label={a.label} size={0.052} />
      ))}
      <MetricBadge text="HUMAN · ANCHOR" position={[0, 0.85, 0]} tone="good" />
    </group>
  );
}

function NodeContext({ node, color }: { node: CortexNode; color: string }) {
  const spec = useMemo(() => deriveContext(node), [node]);
  switch (spec.kind) {
    case "task-swarm":
      return <TaskBranches color={color} count={spec.count} intensity={spec.intensity} label={spec.label} />;
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
    // Smooth quadrant palette — colors interpolate around the circle so
    // there are no hard sector cuts at the octant boundaries (the prior
    // hard-cut approach felt jarring; V3 mockup zones blend through center).
    const stops: Array<{ angle: number; c: THREE.Color }> = [
      { angle: -(3 * Math.PI) / 4, c: new THREE.Color("#18d7ff") },           // SW cyan
      { angle: -Math.PI / 4, c: new THREE.Color("#ff2f7a") },                // SE rose
      { angle: Math.PI / 4, c: new THREE.Color("#ffb02e") },                 // NE amber
      { angle: (3 * Math.PI) / 4, c: new THREE.Color("#39ff88") },           // NW emerald
      { angle: (3 * Math.PI) / 4 + 2 * Math.PI, c: new THREE.Color("#18d7ff") }, // wrap → SW
    ];
    // Move the wrap stop to be just-above the first one so the segment search
    // is contiguous. Easier path: clone and shift the first stop by 2π.
    const segments: Array<{ aStart: number; aEnd: number; cStart: THREE.Color; cEnd: THREE.Color }> = [];
    for (let i = 0; i < stops.length - 1; i++) {
      segments.push({ aStart: stops[i].angle, aEnd: stops[i + 1].angle, cStart: stops[i].c, cEnd: stops[i + 1].c });
    }
    function smoothColor(x: number, y: number, out: THREE.Color): void {
      const a = Math.atan2(y, x);
      const seg = segments.find((s) => a >= s.aStart && a < s.aEnd) ?? segments[segments.length - 1];
      const t = (a - seg.aStart) / (seg.aEnd - seg.aStart);
      // Smoothstep so transitions ease, not linear hard
      const e = t * t * (3 - 2 * t);
      out.copy(seg.cStart).lerp(seg.cEnd, e);
    }

    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 2.6 + Math.pow(Math.random(), 1.6) * radius;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.55;
      const z = r * Math.cos(phi) * 0.55;
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      smoothColor(x, y, tmp);
      // Reduced luminance + jitter — the field stays DARK, accents are thin
      const j = 0.55 + Math.random() * 0.35;
      colors[i * 3 + 0] = tmp.r * j;
      colors[i * 3 + 1] = tmp.g * j;
      colors[i * 3 + 2] = tmp.b * j;
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
  zoomStage: number;
  setZoomStage: (n: number) => void;
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
  zoomStage,
  setZoomStage,
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

      {/* Locked zoom controller + wheel snap handler */}
      <ZoomController stage={zoomStage} />
      <WheelSnap stage={zoomStage} setStage={setZoomStage} />
      <OrbitControls
        enabled={orbitEnabled}
        enablePan
        enableZoom={false}
        enableRotate
        rotateSpeed={0.45}
        panSpeed={0.5}
        target={[0, 0, 0]}
        makeDefault
      />

      <EffectComposer multisampling={2}>
        <Bloom intensity={0.5} luminanceThreshold={0.32} luminanceSmoothing={0.9} mipmapBlur radius={0.5} />
        <ChromaticAberration offset={[0.0003, 0.0003]} radialModulation modulationOffset={0.5} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.2} darkness={1.1} />
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
  const [zoomStage, setZoomStage] = useState(1); // default MISSION

  // Auto-advance to FOCUS when a node gets selected (if user was already
  // at MISSION or closer). Stays at OVERVIEW if they explicitly chose it.
  useEffect(() => {
    if (selectedNodeId && zoomStage < 2) setZoomStage(2);
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        camera={{ position: [0, 1.4, 17], fov: 46, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        shadows={false}
        fallback={<FallbackOverlay>WebGL unavailable — falling back to static cortex view.</FallbackOverlay>}
      >
        <LODContext.Provider value={ZOOM_STAGES[zoomStage].lod}>
          <Scene
            graph={graph}
            activeLens={activeLens}
            selectedNodeId={selectedNodeId ?? null}
            positions={positions}
            setPosition={setPosition}
            onSelectNode={onSelectNode ?? (() => {})}
            orbitEnabled={orbitEnabled}
            setOrbit={setOrbitEnabled}
            zoomStage={zoomStage}
            setZoomStage={setZoomStage}
          />
        </LODContext.Provider>
      </Canvas>

      {/* Zoom-stage HUD — clickable stops + current */}
      <div className="cortex-3d-zoom" aria-label="Cortex zoom altitude">
        {ZOOM_STAGES.map((s, i) => (
          <button
            key={s.name}
            type="button"
            className={i === zoomStage ? "is-active" : undefined}
            onClick={() => setZoomStage(i)}
            title={`${s.name} · distance ${s.distance}`}
          >
            <span className="cortex-3d-zoom__index">{i}</span>
            <span className="cortex-3d-zoom__name">{s.name}</span>
          </button>
        ))}
      </div>

      <div className="cortex-3d-hint" aria-hidden="true">
        <span>drag · rotate</span>
        <span>scroll · zoom stage</span>
        <span>click · select</span>
        <span>drag node · move</span>
      </div>
    </div>
  );
}
