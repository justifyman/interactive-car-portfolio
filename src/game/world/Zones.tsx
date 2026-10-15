// Trigger zones: soft glowing rings on the ground + floating icon markers.
// Driving into one shows a prompt; E / tap opens the matching HTML panel.
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sfx } from '../audio/audio';
import { emitBurst } from '../fx/fxBus';
import { onAction } from '../input';
import { sharedUniforms } from '../materials';
import { PRIORITY } from '../physics';
import { runtime, useGame, type SectionId } from '../store';
import { markerTexture } from './icons';
import { LOCATIONS, PROJECT_STANDS } from './layout';
import { terrainHeight } from './terrain';

export interface Zone {
  id: SectionId;
  x: number;
  z: number;
  r: number;
  index?: number; // project index for stands
  marker: boolean;
  label: string;
}

export const ZONES: Zone[] = [
  ...LOCATIONS.map((l) => ({ id: l.id, x: l.pad[0], z: l.pad[1], r: l.padRadius, marker: true, label: l.label })),
  ...PROJECT_STANDS.map((s, i) => ({ id: 'projects' as SectionId, x: s.x, z: s.z + 2.7, r: 1.5, index: i, marker: false, label: 'Project' })),
];

const ringVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ringFrag = /* glsl */ `
uniform float uTime;
uniform float uActive;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uActiveColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * (uRadius + 0.6);
  float d = length(p);
  float a = atan(p.y, p.x);
  float R = uRadius * (1.0 + sin(uTime * 2.4) * 0.02 * (1.0 - uActive));
  float ring = smoothstep(R - 0.2, R - 0.08, d) * (1.0 - smoothstep(R + 0.02, R + 0.12, d));
  float glow = exp(-abs(d - R) * 3.5) * 0.45;
  float dashR = R * 0.74;
  float dash = smoothstep(0.05, 0.0, abs(d - dashR) - 0.03) * step(0.45, fract(a / 6.2831 * 18.0 + uTime * 0.25));
  float fill = (1.0 - smoothstep(0.0, R, d)) * 0.16;
  vec3 col = mix(uColor, uActiveColor, uActive);
  float alpha = ring * 0.95 + glow * (0.5 + uActive) + dash * (0.45 + uActive * 0.4) + fill * (0.6 + uActive);
  gl_FragColor = vec4(col * (1.0 + uActive * 0.35), clamp(alpha, 0.0, 1.0) * 0.92);
  #include <colorspace_fragment>
}`;

function Ring({ zone, activeRef }: { zone: Zone; activeRef: React.RefObject<string | null> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: sharedUniforms.uTime,
          uActive: { value: 0 },
          uRadius: { value: zone.r },
          uColor: { value: new THREE.Color(zone.id === 'easter' ? '#E9C98E' : '#F1E6D2') },
          uActiveColor: { value: new THREE.Color('#FFE2A8') },
        },
      }),
    [zone],
  );
  const key = `${zone.id}:${zone.index ?? -1}`;
  useFrame((_, dt) => {
    const target = activeRef.current === key ? 1 : 0;
    mat.uniforms.uActive.value += (target - mat.uniforms.uActive.value) * Math.min(1, dt * 6);
  });
  const size = (zone.r + 0.6) * 2;
  const y = Math.max(0, terrainHeight(zone.x, zone.z)) + (zone.id === 'easter' ? 0.12 : 0.045);
  return (
    <mesh position={[zone.x, y, zone.z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={4}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

function Marker({ zone, activeRef }: { zone: Zone; activeRef: React.RefObject<string | null> }) {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => markerTexture(zone.id), [zone.id]);
  const key = `${zone.id}:${zone.index ?? -1}`;
  const phase = useMemo(() => Math.random() * 6, []);
  const scale = useRef(1);
  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (!g) return;
    const active = activeRef.current === key;
    scale.current += ((active ? 1.25 : 1) - scale.current) * Math.min(1, dt * 8);
    g.position.y = 3.4 + Math.sin(clock.elapsedTime * 2 + phase) * 0.18 + (zone.id === 'easter' ? 0.3 : 0);
    g.scale.setScalar(scale.current);
  });
  return (
    <group position={[zone.x, 0, zone.z]}>
      <group ref={ref}>
        <Billboard>
          <mesh renderOrder={5}>
            <planeGeometry args={[1.35, 1.35]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}

export function Zones() {
  const activeRef = useRef<string | null>(null);
  const setNearZone = useGame((s) => s.setNearZone);

  useEffect(
    () =>
      onAction('interact', () => {
        const st = useGame.getState();
        if (st.openPanel || !st.nearZone) return;
        const z = ZONES.find((zz) => `${zz.id}:${zz.index ?? -1}` === activeRef.current);
        st.open(st.nearZone, z?.index ?? 0);
        sfx.open();
      }),
    [],
  );

  useFrame(() => {
    const p = runtime.carPosition;
    let hit: Zone | null = null;
    let best = Infinity;
    for (const z of ZONES) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < z.r + 0.3 && d < best) {
        best = d;
        hit = z;
      }
    }
    const key = hit ? `${hit.id}:${hit.index ?? -1}` : null;
    if (key !== activeRef.current) {
      activeRef.current = key;
      setNearZone(hit ? hit.id : null);
      if (hit) {
        sfx.zone();
        if (hit.id === 'easter') {
          const st = useGame.getState();
          const first = !st.eggFound;
          st.findEgg();
          emitBurst('confetti', hit.x, 1.5, hit.z);
          sfx.chime();
          if (first) setTimeout(() => useGame.getState().open('easter'), 900);
        }
      }
    }
  }, PRIORITY.world);

  return (
    <>
      {ZONES.map((z) => (
        <group key={`${z.id}:${z.index ?? -1}`}>
          <Ring zone={z} activeRef={activeRef} />
          {z.marker && <Marker zone={z} activeRef={activeRef} />}
        </group>
      ))}
    </>
  );
}
