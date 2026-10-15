// Wooden signage: the big welcome sign (name + title), location boards that
// always face the camera so they stay readable, and plaza signposts.
import { RoundedBox, Text } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import fredoka from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff?url';
import { Model } from '../assets';
import { content } from '../../content';
import { patchShader } from '../materials';
import { useGame } from '../store';
import { drawIcon, woodTexture } from './icons';
import { canvasTexture } from '../materials';
import { LOCATIONS, PLAZA, WELCOME_SIGN, type LocationDef } from './layout';

export const FONT = fredoka;
export const CAMERA_FACING_YAW = Math.PI / 4;
const INK = '#4A3A30';
const CREAM = '#F6ECDC';

function useWoodMaterial(key: string, base: string, repeat: [number, number] = [1, 1]) {
  return useMemo(() => {
    const map = woodTexture(key, base).clone();
    map.repeat.set(...repeat);
    map.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
    patchShader(m, { occluder: true });
    return m;
  }, [key, base, repeat]);
}

function WelcomeSign() {
  const wood = useWoodMaterial('wood-welcome', '#B98C68', [1, 1]);
  const trim = useWoodMaterial('wood-trim', '#8E6A52', [2, 0.4]);
  return (
    <group position={[WELCOME_SIGN.x, 0, WELCOME_SIGN.z]} rotation={[0, WELCOME_SIGN.yaw, 0]}>
      <Model name="ft-pillar-wood" position={[-3.0, 0, 0]} scale={[1.2, 1.45, 1.2]} />
      <Model name="ft-pillar-wood" position={[3.0, 0, 0]} scale={[1.2, 1.45, 1.2]} />
      <RoundedBox args={[6.6, 2.4, 0.26]} radius={0.1} smoothness={3} position={[0, 2.35, 0]} material={wood} castShadow receiveShadow />
      <RoundedBox args={[7.0, 0.22, 0.42]} radius={0.08} smoothness={2} position={[0, 3.62, 0]} material={trim} castShadow />
      <RoundedBox args={[7.0, 0.18, 0.36]} radius={0.07} smoothness={2} position={[0, 1.1, 0]} material={trim} castShadow />
      <Text font={FONT} position={[0, 2.78, 0.14]} fontSize={0.7} color={CREAM} outlineWidth={0.035} outlineColor={INK} anchorX="center" anchorY="middle" maxWidth={6.2}>
        {content.name}
      </Text>
      <Text font={FONT} position={[0, 2.06, 0.14]} fontSize={0.34} color="#F3E3C8" anchorX="center" anchorY="middle" maxWidth={6.2}>
        {content.title}
      </Text>
      <Text font={FONT} position={[0, 1.55, 0.14]} fontSize={0.2} color="#EADAC0" anchorX="center" anchorY="middle" maxWidth={6.2}>
        {useGame.getState().isTouch ? 'Use the joystick to drive · tap to explore' : 'WASD / arrows to drive · Space to drift · E to open'}
      </Text>
    </group>
  );
}

function iconPlaque(l: LocationDef) {
  return canvasTexture(`plaque-${l.id}`, 128, 128, (ctx) => {
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, l.id, 64, 64, 80, INK, 2.2);
  });
}

function LocationSign({ l }: { l: LocationDef }) {
  const wood = useWoodMaterial('wood-board', '#BE9370', [1, 0.5]);
  const plaque = useMemo(() => iconPlaque(l), [l]);
  if (!l.sign) return null;
  return (
    <group position={[l.sign[0], 0, l.sign[1]]} rotation={[0, CAMERA_FACING_YAW, 0]}>
      <Model name="ft-pillar-wood" position={[0, 0, -0.18]} scale={[0.85, 0.9, 0.85]} />
      <RoundedBox args={[3.1, 0.95, 0.16]} radius={0.06} smoothness={2} position={[0, 1.85, 0]} material={wood} castShadow receiveShadow />
      <mesh position={[-1.08, 1.85, 0.085]}>
        <circleGeometry args={[0.36, 32]} />
        <meshBasicMaterial map={plaque} transparent toneMapped={false} />
      </mesh>
      <Text font={FONT} position={[0.3, 1.86, 0.09]} fontSize={0.4} color={CREAM} outlineWidth={0.022} outlineColor={INK} anchorX="center" anchorY="middle">
        {l.label}
      </Text>
    </group>
  );
}

/** Arrow-shaped board pointing along local +X. */
function arrowGeometry(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2 - 0.32, -h / 2);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - 0.32, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
  g.translate(0, 0, -0.035);
  // Planar UVs for the wood texture.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  return g;
}

function Signpost({ x, z, targets }: { x: number; z: number; targets: { label: string; to: [number, number] }[] }) {
  const wood = useWoodMaterial('wood-arrow', '#C29A78', [1, 0.35]);
  const geo = useMemo(() => arrowGeometry(2.3, 0.44), []);
  return (
    <group position={[x, 0, z]}>
      <Model name="ft-pillar-wood" scale={[0.8, 1.25, 0.8]} />
      {targets.map((t, i) => {
        const dx = t.to[0] - x;
        const dz = t.to[1] - z;
        const yaw = Math.atan2(-dz, dx);
        return (
          <group key={t.label} position={[0, 2.65 - i * 0.52, 0]} rotation={[0, yaw, 0]}>
            <mesh geometry={geo} material={wood} position={[1.0, 0, 0]} castShadow />
            <Text font={FONT} position={[0.9, 0, 0.07]} fontSize={0.22} color={CREAM} outlineWidth={0.014} outlineColor={INK} anchorX="center" anchorY="middle">
              {t.label}
            </Text>
            <Text font={FONT} position={[0.9, 0, -0.07]} rotation={[0, Math.PI, 0]} fontSize={0.22} color={CREAM} outlineWidth={0.014} outlineColor={INK} anchorX="center" anchorY="middle">
              {t.label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

export function Signs() {
  const targets = useMemo(
    () =>
      LOCATIONS.filter((l) => l.id !== 'hero' && l.id !== 'easter').map((l) => ({
        label: l.label,
        to: l.pad,
      })),
    [],
  );
  return (
    <>
      <WelcomeSign />
      {LOCATIONS.map((l) => (
        <LocationSign key={l.id} l={l} />
      ))}
      <Signpost x={PLAZA.x + 3.4} z={PLAZA.z + PLAZA.r + 1.6} targets={targets} />
      <Signpost x={PLAZA.x - 3.0} z={PLAZA.z - PLAZA.r - 1.6} targets={targets.slice(0, 3)} />
    </>
  );
}
