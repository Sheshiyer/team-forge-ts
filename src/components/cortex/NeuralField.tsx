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
import { Html, OrbitControls, Stars } from "@react-three/drei";
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

const KIND_DEPTH: Record<string, number> = {
  mission: 0,
  client: 0.6,
  project: -0.4,
  issue: 0.9,
  agent: -0.8,
  human: 0.3,
  memory: -0.3,
  routine: 0.1,
  approval: 0.7,
};

const SVG_W = 1000;
const SVG_H = 680;
const SCALE = 70;

function toWorld(p: { x: number; y: number }, kind: string): [number, number, number] {
  return [
    (p.x - SVG_W / 2) / SCALE,
    -(p.y - SVG_H / 2) / SCALE,
    KIND_DEPTH[kind] ?? 0,
  ];
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
/* Node3D — interactive draggable graph node                                   */
/* -------------------------------------------------------------------------- */
function Node3D({
  node,
  position,
  selected,
  emphasized,
  onSelect,
  onMove,
  setOrbit,
}: {
  node: CortexNode;
  position: [number, number, number];
  selected: boolean;
  emphasized: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  setOrbit: (enabled: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const dragRef = useRef<{
    dragging: boolean;
    plane: THREE.Plane;
    intersect: THREE.Vector3;
    offset: THREE.Vector3;
  }>({
    dragging: false,
    plane: new THREE.Plane(),
    intersect: new THREE.Vector3(),
    offset: new THREE.Vector3(),
  });

  const color = STATE_COLOR[node.state];
  const baseY = position[1];

  useFrame(({ clock }) => {
    if (!groupRef.current || dragRef.current.dragging) return;
    const t = clock.elapsedTime + node.id.length * 0.21;
    groupRef.current.position.y = baseY + Math.sin(t * 0.55) * 0.07;
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(node.id);
    if (!groupRef.current) return;
    const cam = e.camera as THREE.Camera;
    const planeNormal = new THREE.Vector3();
    cam.getWorldDirection(planeNormal);
    planeNormal.negate();
    dragRef.current.plane.setFromNormalAndCoplanarPoint(planeNormal, groupRef.current.position);
    dragRef.current.offset.subVectors(groupRef.current.position, e.point);
    dragRef.current.dragging = true;
    setOrbit(false);
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current.dragging || !groupRef.current) return;
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
    dragRef.current.dragging = false;
    setOrbit(true);
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
  };

  if (node.kind === "mission") {
    // Mission is the nucleus — render only a floating label
    return (
      <Html
        position={[position[0], position[1] - 1.8, position[2]]}
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

  const scale = selected ? 1.45 : hovered ? 1.2 : 1;
  return (
    <group ref={groupRef} position={position}>
      <mesh
        ref={meshRef}
        scale={scale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <icosahedronGeometry args={[0.28, 2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emphasized ? 2.6 : 1.4}
          roughness={0.32}
          metalness={0.2}
        />
      </mesh>

      {selected ? <PulseSelection color={color} /> : null}

      {emphasized ? (
        <Satellites
          color={color}
          count={node.kind === "agent" || node.kind === "human" ? 5 : 3}
          seed={node.id.length * 7919 + node.label.length * 31}
        />
      ) : null}

      <Html
        position={[0.38, -0.42, 0]}
        zIndexRange={[30, 10]}
        distanceFactor={9}
        occlude="blending"
        style={{ pointerEvents: "none" }}
      >
        <div className={`cortex-3d-label${selected ? " is-selected" : ""}`} data-state={node.state}>
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
/* Satellites — small orbiting dots around each major node (activity feel)     */
/* -------------------------------------------------------------------------- */
function Satellites({ color, count = 4, seed }: { color: string; count?: number; seed: number }) {
  const ref = useRef<THREE.Group>(null);
  const dots = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      r: 0.45 + rand() * 0.15,
      speed: 0.4 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.4,
      size: 0.018 + rand() * 0.012,
    }));
  }, [count, seed]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((child, i) => {
      const d = dots[i];
      const a = t * d.speed + d.phase;
      child.position.set(d.r * Math.cos(a), Math.sin(a * 0.7) * d.tilt, d.r * Math.sin(a));
    });
  });
  return (
    <group ref={ref}>
      {dots.map((d, i) => (
        <mesh key={i}>
          <sphereGeometry args={[d.size, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* AmbientBranches — curving 3D dendrite trees from nucleus into all octants   */
/* (the V3 mockup's "living organism" texture — sub-branches + leaves)         */
/* -------------------------------------------------------------------------- */
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

const QUAD_COLORS = {
  emerald: new THREE.Color("#39ff88"),
  amber: new THREE.Color("#ffb02e"),
  cyan: new THREE.Color("#18d7ff"),
  rose: new THREE.Color("#ff2f7a"),
};

function colorForOctant(x: number, y: number): THREE.Color {
  if (y >= 0) {
    return x >= 0 ? QUAD_COLORS.amber : QUAD_COLORS.emerald;
  }
  return x >= 0 ? QUAD_COLORS.rose : QUAD_COLORS.cyan;
}

function AmbientBranches({ count = 64, seed = 0xc0ffee }: { count?: number; seed?: number }) {
  const linesRef = useRef<THREE.LineSegments>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const leavesRef = useRef<THREE.InstancedMesh>(null);

  const { lineGeom, lineMat, pointGeom, pointMat, leaves } = useMemo(() => {
    const rand = mulberry32(seed);
    const lineVerts: number[] = [];
    const lineCols: number[] = [];
    const pointVerts: number[] = [];
    const pointCols: number[] = [];
    const leafData: Array<{ pos: THREE.Vector3; color: THREE.Color; size: number }> = [];

    for (let i = 0; i < count; i++) {
      // Distribute branches around the full sphere with slight equatorial bias
      const angleBase = (i / count) * Math.PI * 2;
      const angleJitter = (rand() - 0.5) * ((Math.PI * 2) / count) * 1.4;
      const angle = angleBase + angleJitter;
      const elev = (rand() - 0.5) * Math.PI * 0.45; // limit vertical spread

      const innerR = 2.6 + rand() * 0.3;
      const trunkLen = 3.8 + rand() * 4.5;
      const start = new THREE.Vector3(
        innerR * Math.cos(angle) * Math.cos(elev),
        innerR * Math.sin(elev),
        innerR * Math.sin(angle) * Math.cos(elev),
      );

      const endAngle = angle + (rand() - 0.5) * 0.35;
      const endElev = elev + (rand() - 0.5) * 0.25;
      const endR = innerR + trunkLen;
      const end = new THREE.Vector3(
        endR * Math.cos(endAngle) * Math.cos(endElev),
        endR * Math.sin(endElev),
        endR * Math.sin(endAngle) * Math.cos(endElev),
      );

      const midAngle = (angle + endAngle) / 2 + (rand() - 0.5) * 0.2;
      const midElev = (elev + endElev) / 2 + (rand() - 0.5) * 0.15;
      const midR = innerR + trunkLen * 0.55;
      const ctrl = new THREE.Vector3(
        midR * Math.cos(midAngle) * Math.cos(midElev),
        midR * Math.sin(midElev),
        midR * Math.sin(midAngle) * Math.cos(midElev),
      );

      const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
      const color = colorForOctant(end.x, end.z);

      // Discretize trunk into line segments
      const segs = 14;
      const samples: THREE.Vector3[] = [];
      for (let s = 0; s <= segs; s++) samples.push(curve.getPointAt(s / segs));
      for (let s = 0; s < segs; s++) {
        lineVerts.push(samples[s].x, samples[s].y, samples[s].z);
        lineVerts.push(samples[s + 1].x, samples[s + 1].y, samples[s + 1].z);
        lineCols.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }

      // Stipple dots along trunk
      const stippleN = 5 + Math.floor(rand() * 6);
      for (let s = 0; s < stippleN; s++) {
        const t = (s + 0.5) / stippleN;
        const p = curve.getPointAt(t);
        pointVerts.push(p.x + (rand() - 0.5) * 0.08, p.y + (rand() - 0.5) * 0.08, p.z + (rand() - 0.5) * 0.08);
        pointCols.push(color.r, color.g, color.b);
      }

      // Sub-branches (0-2 per trunk)
      const subN = Math.floor(rand() * 2.6);
      for (let s = 0; s < subN; s++) {
        const branchT = 0.45 + rand() * 0.35;
        const origin = curve.getPointAt(branchT);
        const ahead = curve.getPointAt(Math.min(0.99, branchT + 0.05));
        const tangent = ahead.clone().sub(origin).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const right = tangent.clone().cross(up).normalize();
        const side = s === 0 ? 1 : -1;
        const subLen = 1.3 + rand() * 2.2;
        const subDir = right.clone().multiplyScalar(side * 0.85).add(tangent.clone().multiplyScalar(0.4)).normalize();
        const subEnd = origin.clone().add(subDir.clone().multiplyScalar(subLen));
        const subCtrl = origin.clone()
          .add(subDir.clone().multiplyScalar(subLen * 0.5))
          .add(right.clone().multiplyScalar(side * 0.25));

        const subCurve = new THREE.QuadraticBezierCurve3(origin, subCtrl, subEnd);
        const subSegs = 10;
        const subSamples: THREE.Vector3[] = [];
        for (let k = 0; k <= subSegs; k++) subSamples.push(subCurve.getPointAt(k / subSegs));
        for (let k = 0; k < subSegs; k++) {
          lineVerts.push(subSamples[k].x, subSamples[k].y, subSamples[k].z);
          lineVerts.push(subSamples[k + 1].x, subSamples[k + 1].y, subSamples[k + 1].z);
          lineCols.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
        const subStippleN = 3 + Math.floor(rand() * 4);
        for (let k = 0; k < subStippleN; k++) {
          const t = (k + 0.5) / subStippleN;
          const p = subCurve.getPointAt(t);
          pointVerts.push(p.x, p.y, p.z);
          pointCols.push(color.r, color.g, color.b);
        }

        leafData.push({ pos: subEnd, color, size: 0.028 + rand() * 0.018 });
      }

      leafData.push({ pos: end, color, size: 0.038 + rand() * 0.022 });
    }

    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lineVerts, 3));
    lg.setAttribute("color", new THREE.Float32BufferAttribute(lineCols, 3));
    const lm = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(pointVerts, 3));
    pg.setAttribute("color", new THREE.Float32BufferAttribute(pointCols, 3));
    const pm = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.07,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    return { lineGeom: lg, lineMat: lm, pointGeom: pg, pointMat: pm, leaves: leafData };
  }, [count, seed]);

  // Animate leaves via InstancedMesh — populate matrices on first render
  useMemo(() => {
    if (!leavesRef.current) return;
    const dummy = new THREE.Object3D();
    const colorAttr = new THREE.Color();
    leaves.forEach((leaf, i) => {
      dummy.position.copy(leaf.pos);
      dummy.scale.setScalar(leaf.size * 30);
      dummy.updateMatrix();
      leavesRef.current!.setMatrixAt(i, dummy.matrix);
      colorAttr.copy(leaf.color);
      leavesRef.current!.setColorAt(i, colorAttr);
    });
    leavesRef.current.instanceMatrix.needsUpdate = true;
    if (leavesRef.current.instanceColor) leavesRef.current.instanceColor.needsUpdate = true;
  }, [leaves]);

  useFrame(({ clock }) => {
    if (linesRef.current) {
      const t = clock.elapsedTime;
      const m = linesRef.current.material as THREE.LineBasicMaterial;
      m.opacity = 0.42 + Math.sin(t * 0.4) * 0.06;
    }
  });

  return (
    <group>
      <lineSegments ref={linesRef} geometry={lineGeom} material={lineMat} />
      <points ref={pointsRef} geometry={pointGeom} material={pointMat} />
      <instancedMesh ref={leavesRef} args={[undefined, undefined, leaves.length]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>
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

      <AmbientBranches count={64} seed={0xc0ffee} />
      <AmbientDendrites count={1400} radius={14} />

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
        return (
          <Node3D
            key={node.id}
            node={node}
            position={pos}
            selected={selectedNodeId === node.id}
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

  const initialPositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const n of graph.nodes) {
      map.set(n.id, toWorld(n.position, n.kind));
    }
    return map;
  }, [graph.nodes]);

  // Per-node position state (so drag-to-move actually mutates the world).
  const [positions, setPositions] = useState<Map<string, [number, number, number]>>(initialPositions);

  // Sync when graph changes
  useMemo(() => {
    setPositions((prev) => {
      const next = new Map(prev);
      for (const n of graph.nodes) {
        if (!next.has(n.id)) next.set(n.id, toWorld(n.position, n.kind));
      }
      // Drop nodes no longer in graph
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
