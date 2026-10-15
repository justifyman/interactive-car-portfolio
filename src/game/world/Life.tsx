// Ambient life: windmill blades, bobbing boats & buoys, a lazy flock of birds,
// and puffy clouds drifting around the island.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildModel, cloneHierarchy } from '../assets';
import { useGame } from '../store';
import { patchShader } from '../materials';
import { DOCK, MAILBOX, WINDMILL } from './layout';
import { mulberry32 } from './noise';
import { TILE } from './building';
import { WATER_LEVEL } from './terrain';

function Windmill() {
  const blades = useRef<THREE.Group>(null);
  const model = useMemo(() => buildModel('ft-windmill', { occluder: true }), []);
  const front = new THREE.Vector3(Math.cos(WINDMILL.yaw), 0, -Math.sin(WINDMILL.yaw));
  const depth = (TILE / 2) * 1.25 + 0.55;
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.x += dt * 0.55;
  });
  return (
    <group position={[WINDMILL.x + front.x * depth, TILE * 2.55, WINDMILL.z + front.z * depth]} rotation={[0, WINDMILL.yaw, 0]}>
      <group ref={blades}>
        <primitive object={model} />
      </group>
    </group>
  );
}

interface Floater {
  model: string;
  x: number;
  z: number;
  yaw: number;
  drift?: number; // radius of a slow circular drift
  sink?: number;
}

const FLOATERS: Floater[] = [
  { model: 'rowboat', x: DOCK.x + 3.4, z: DOCK.z1 - 2.8, yaw: 0.25, sink: 0.42 },
  { model: 'sailboat', x: 54, z: 58, yaw: -0.8, drift: 5, sink: 0.55 },
  { model: 'fishing-boat', x: -22, z: 60, yaw: 1.2, drift: 3, sink: 0.6 },
  { model: 'buoy-flag', x: 12, z: 52, yaw: 0, sink: 0.35 },
  { model: 'buoy', x: 44, z: 50, yaw: 0, sink: 0.25 },
  { model: 'buoy', x: 71, z: 12, yaw: 0, sink: 0.25 },
  { model: 'buoy-flag', x: 70, z: -24, yaw: 0, sink: 0.35 },
  { model: 'lily-large', x: 8, z: 47.5, yaw: 0.3, sink: 0.0 },
  { model: 'lily-small', x: 9.4, z: 48.2, yaw: 1.3, sink: 0.0 },
  { model: 'lily-large', x: -36, z: 47.2, yaw: 2.1, sink: 0.0 },
  { model: 'lily-small', x: 65.4, z: 30, yaw: 0.8, sink: 0.0 },
];

function Floaters() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const models = useMemo(() => FLOATERS.map((f) => buildModel(f.model, { occluder: true })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    FLOATERS.forEach((f, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ph = i * 1.7;
      const a = f.drift ? t * 0.02 + ph : 0;
      g.position.set(f.x + Math.cos(a) * (f.drift ?? 0), WATER_LEVEL - (f.sink ?? 0.3) + Math.sin(t * 1.3 + ph) * 0.06, f.z + Math.sin(a) * (f.drift ?? 0));
      g.rotation.set(Math.sin(t * 0.9 + ph) * 0.04, f.yaw + (f.drift ? -a : Math.sin(t * 0.3 + ph) * 0.08), Math.cos(t * 1.1 + ph) * 0.05);
    });
  });
  return (
    <>
      {FLOATERS.map((_, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)}>
          <primitive object={models[i]} />
        </group>
      ))}
    </>
  );
}

const BIRDS = 7;
function Birds() {
  const group = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Mesh[]>([]);
  const { body, wing, mat } = useMemo(() => {
    const body = new THREE.ConeGeometry(0.12, 0.6, 5);
    body.rotateX(Math.PI / 2);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.7, 0.12);
    s.lineTo(0.55, -0.12);
    s.lineTo(0, -0.18);
    const wing = new THREE.ShapeGeometry(s);
    wing.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#F1EADF', roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
    return { body, wing, mat };
  }, []);
  const birds = useMemo(() => {
    const r = mulberry32(5);
    return Array.from({ length: BIRDS }, () => ({ off: new THREE.Vector3((r() - 0.5) * 4, (r() - 0.5) * 1.2, (r() - 0.5) * 4), ph: r() * 6, speed: 0.9 + r() * 0.2 }));
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    // The flock wanders a lazy figure-eight over the town.
    const a = t * 0.06;
    g.position.set(Math.sin(a) * 38, 13 + Math.sin(t * 0.3) * 1.2, Math.sin(a * 2) * 22);
    const nx = Math.cos(a) * 38 * 0.06;
    const nz = Math.cos(a * 2) * 2 * 22 * 0.06;
    g.rotation.y = Math.atan2(nx, nz);
    g.children.forEach((b, i) => {
      const bd = birds[i];
      b.position.copy(bd.off).add(new THREE.Vector3(Math.sin(t * 0.7 + bd.ph) * 0.4, Math.sin(t * 1.3 + bd.ph) * 0.3, 0));
      const flap = Math.sin(t * 9 * bd.speed + bd.ph) * 0.65;
      const l = wings.current[i * 2];
      const rr = wings.current[i * 2 + 1];
      if (l) l.rotation.z = flap;
      if (rr) rr.rotation.z = -flap;
    });
  });
  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <group key={i}>
          <mesh geometry={body} material={mat} castShadow />
          <mesh ref={(el) => el && (wings.current[i * 2] = el)} geometry={wing} material={mat} castShadow />
          <mesh ref={(el) => el && (wings.current[i * 2 + 1] = el)} geometry={wing} material={mat} scale={[-1, 1, 1]} castShadow />
        </group>
      ))}
    </group>
  );
}

function cloudGeometry(seed: number) {
  const r = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const s = 1.4 + r() * 1.8;
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.translate((i - n / 2) * 1.6 + r() * 0.8, Math.sin((i / n) * Math.PI) * 1.2 + r() * 0.5, (r() - 0.5) * 2.2);
    parts.push(g);
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  merged.computeVertexNormals();
  return merged;
}

/** Puffy clouds drifting slowly around the island at its own level — a floating-diorama touch. */
function Clouds() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const { geos, mat, defs } = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#FBF6EE', roughness: 1, flatShading: true, emissive: '#B9B3D6', emissiveIntensity: 0.12 });
    patchShader(mat, { occluder: true });
    const r = mulberry32(11);
    // Only on the far (north-west) side of the island, so they never sit between the camera and the town.
    const defs = Array.from({ length: 10 }, (_, i) => ({
      ang: Math.PI * 0.62 + (i / 10) * Math.PI * 1.25 + r() * 0.15,
      rad: 118 + r() * 26,
      y: -5 + r() * 7,
      scale: 1.1 + r() * 1.1,
      speed: 0.004 * (r() < 0.5 ? 1 : -1),
    }));
    return { geos: defs.map((_, i) => cloudGeometry(100 + i)), mat, defs };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    defs.forEach((d, i) => {
      const m = refs.current[i];
      if (!m) return;
      const a = d.ang + Math.sin(t * Math.abs(d.speed) + i) * 0.12;
      m.position.set(Math.cos(a) * d.rad, d.y + Math.sin(t * 0.2 + i) * 0.4, Math.sin(a) * d.rad * 0.82);
    });
  });
  return (
    <>
      {defs.map((d, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={geos[i]} material={mat} scale={d.scale} />
      ))}
    </>
  );
}

/** The post office mailbox — its little flag pops up while the contact panel is open. */
function Mailbox() {
  const { root, flag } = useMemo(() => {
    const root = cloneHierarchy('mailbox', { occluder: true });
    let flag: THREE.Object3D | undefined;
    root.traverse((o) => {
      if (!flag && o.name.toLowerCase().includes('flag')) flag = o;
    });
    return { root, flag, rest: flag?.rotation.x ?? 0 };
  }, []);
  const rest = useMemo(() => flag?.rotation.clone() ?? new THREE.Euler(), [flag]);
  useFrame((_, dt) => {
    if (!flag) return;
    const up = useGame.getState().openPanel === 'contact' || useGame.getState().nearZone === 'contact';
    const target = rest.x + (up ? -1.2 : 0);
    flag.rotation.x += (target - flag.rotation.x) * Math.min(1, dt * 6);
  });
  return <primitive object={root} position={[MAILBOX.x, 0, MAILBOX.z]} rotation={[0, MAILBOX.yaw, 0]} />;
}

export function Life() {
  return (
    <>
      <Mailbox />
      <Windmill />
      <Floaters />
      <Birds />
      <Clouds />
    </>
  );
}
