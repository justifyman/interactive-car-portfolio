// Display boards in front of the workshop — one per project, showing its image.
import { RoundedBox, Text } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { content } from '../../content';
import { Model } from '../assets';
import { patchShader } from '../materials';
import { PROJECT_STANDS } from './layout';
import { FONT } from './Signs';
import { woodTexture } from './icons';

function useImageTexture(url: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      // Draw into a canvas so SVGs and photos behave the same.
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 400;
      const ctx = c.getContext('2d')!;
      const s = Math.max(c.width / img.width, c.height / img.height);
      ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      setTex(t);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return tex;
}

function Stand({ index, x, z }: { index: number; x: number; z: number }) {
  const project = content.projects[index];
  const tex = useImageTexture(project?.image ?? '');
  const frame = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: woodTexture('wood-frame', '#9C7458'), roughness: 0.85 });
    patchShader(m, { occluder: true });
    return m;
  }, []);
  if (!project) return null;
  const yaw = Math.PI / 10 * (x < 24 ? 1 : -1) * 0.6;
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <Model name="ft-pillar-wood" position={[-1.7, 0, 0]} scale={[0.9, 1.15, 0.9]} />
      <Model name="ft-pillar-wood" position={[1.7, 0, 0]} scale={[0.9, 1.15, 0.9]} />
      <RoundedBox args={[3.7, 2.45, 0.18]} radius={0.07} smoothness={2} position={[0, 1.75, 0]} material={frame} castShadow receiveShadow />
      <mesh position={[0, 1.83, 0.095]}>
        <planeGeometry args={[3.35, 2.09]} />
        <meshStandardMaterial map={tex ?? undefined} color={tex ? '#ffffff' : '#E3D5C1'} roughness={0.7} />
      </mesh>
      <RoundedBox args={[3.0, 0.42, 0.12]} radius={0.05} smoothness={2} position={[0, 0.45, 0.04]} material={frame} castShadow />
      <Text font={FONT} position={[0, 0.46, 0.115]} fontSize={0.2} color="#F6ECDC" anchorX="center" anchorY="middle" maxWidth={2.8}>
        {project.title}
      </Text>
    </group>
  );
}

export function ProjectStands() {
  return (
    <>
      {PROJECT_STANDS.map((s, i) => (
        <Stand key={i} index={i} x={s.x} z={s.z} />
      ))}
    </>
  );
}
