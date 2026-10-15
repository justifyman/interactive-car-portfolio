// Chunky cartoon dust puffs + confetti/sparkle bursts from one instanced pool each.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { burstQueue, dustQueue } from './fxBus';
import { palette } from '../palette';

const MAX = 180;

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  spin: number;
  gravity: number;
}

export function Dust() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const confetti = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo<P[]>(() => [], []);
  const cpool = useMemo<(P & { color: THREE.Color; rot: THREE.Euler })[]>(() => [], []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#E9DFD0', roughness: 1, flatShading: true }), []);
  const cgeo = useMemo(() => new THREE.PlaneGeometry(0.22, 0.12), []);
  const cmat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const colors = useMemo(() => [palette.mutedRed, palette.sand, palette.sageTeal, palette.dustyBlue, palette.cream, palette.terracotta].map((c) => new THREE.Color(c)), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    while (dustQueue.length) {
      const e = dustQueue.shift()!;
      if (pool.length >= MAX) pool.shift();
      pool.push({
        pos: new THREE.Vector3(e.x + (Math.random() - 0.5) * 0.3, e.y + 0.15, e.z + (Math.random() - 0.5) * 0.3),
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8 * e.strength, (Math.random() - 0.5) * 1.2),
        life: 0,
        max: 0.7 + Math.random() * 0.5,
        size: (0.25 + Math.random() * 0.3) * (0.6 + e.strength * 0.5),
        spin: Math.random() * 6,
        gravity: -0.4,
      });
    }
    while (burstQueue.length) {
      const b = burstQueue.shift()!;
      const n = b.kind === 'confetti' ? 90 : b.kind === 'splash' ? 24 : 30;
      for (let i = 0; i < n; i++) {
        if (b.kind === 'splash') {
          pool.push({
            pos: new THREE.Vector3(b.x, b.y, b.z),
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4),
            life: 0,
            max: 0.8,
            size: 0.2 + Math.random() * 0.2,
            spin: 0,
            gravity: -14,
          });
          continue;
        }
        if (cpool.length > 260) cpool.shift();
        const a = Math.random() * Math.PI * 2;
        const sp = b.kind === 'confetti' ? 3 + Math.random() * 5 : 1 + Math.random() * 2;
        cpool.push({
          pos: new THREE.Vector3(b.x, b.y, b.z),
          vel: new THREE.Vector3(Math.cos(a) * sp * 0.6, 5 + Math.random() * 6, Math.sin(a) * sp * 0.6),
          life: 0,
          max: 2.5 + Math.random() * 1.5,
          size: 1,
          spin: (Math.random() - 0.5) * 12,
          gravity: -7,
          color: colors[i % colors.length],
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        });
      }
    }

    const im = mesh.current!;
    let n = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life += dt;
      if (p.life >= p.max) {
        pool.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - 1.8 * dt);
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.max;
      const sc = p.size * Math.sin(Math.min(1, t * 1.6 + 0.15) * Math.PI) * (1 + t * 0.6);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.spin + t * 2);
      m.compose(p.pos, q, s.setScalar(Math.max(0.001, sc)));
      im.setMatrixAt(n++, m);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;

    const cm = confetti.current!;
    let k = 0;
    for (let i = cpool.length - 1; i >= 0; i--) {
      const p = cpool[i];
      p.life += dt;
      if (p.life >= p.max || p.pos.y < 0.02) {
        if (p.pos.y < 0.02) {
          p.pos.y = 0.02;
          p.vel.set(0, 0, 0);
          p.gravity = 0;
        }
        if (p.life >= p.max) {
          cpool.splice(i, 1);
          continue;
        }
      }
      p.vel.y += p.gravity * dt;
      p.vel.x *= 1 - 1.5 * dt;
      p.vel.z *= 1 - 1.5 * dt;
      if (p.vel.y < -2.2) p.vel.y = -2.2; // flutter
      p.pos.addScaledVector(p.vel, dt);
      if (p.gravity !== 0) {
        p.rot.x += p.spin * dt;
        p.rot.y += p.spin * 0.7 * dt;
      }
      q.setFromEuler(p.rot);
      const fade = Math.min(1, (p.max - p.life) * 2);
      m.compose(p.pos, q, s.setScalar(fade));
      cm.setMatrixAt(k, m);
      cm.setColorAt(k, p.color);
      k++;
    }
    cm.count = k;
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[geo, mat, MAX + 40]} frustumCulled={false} castShadow={false} receiveShadow />
      <instancedMesh ref={confetti} args={[cgeo, cmat, 300]} frustumCulled={false} castShadow={false} />
    </>
  );
}
