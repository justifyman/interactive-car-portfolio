// Tyre marks: a ring buffer of ground quads per rear wheel, fading with age.
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { skidQueue } from './fxBus';

const SEGMENTS = 500;
const WIDTH = 0.2;
const LIFETIME = 9; // seconds

export function SkidMarks() {
  const { geometry, material, state } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(SEGMENTS * 4 * 3);
    const col = new Float32Array(SEGMENTS * 4 * 4);
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    return {
      geometry: g,
      material: m,
      state: {
        head: 0,
        born: new Float32Array(SEGMENTS).fill(-1e3),
        last: new Map<number, { l: THREE.Vector3; r: THREE.Vector3; p: THREE.Vector3 }>(),
        time: 0,
      },
    };
  }, []);

  useFrame((_, dt) => {
    state.time += dt;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    let dirty = false;
    while (skidQueue.length) {
      const e = skidQueue.shift()!;
      if (e.wheel < 0) {
        state.last.clear();
        continue;
      }
      const p = new THREE.Vector3(e.x, e.y + 0.025, e.z);
      const prev = state.last.get(e.wheel);
      const side = new THREE.Vector3(Math.cos(e.yaw), 0, -Math.sin(e.yaw)).multiplyScalar(WIDTH / 2);
      const l = p.clone().add(side);
      const r = p.clone().sub(side);
      if (prev && prev.p.distanceTo(p) < 0.2) continue;
      if (prev && prev.p.distanceTo(p) < 2) {
        const i = state.head;
        state.head = (state.head + 1) % SEGMENTS;
        state.born[i] = state.time;
        const o = i * 4;
        pos.setXYZ(o, prev.l.x, prev.l.y, prev.l.z);
        pos.setXYZ(o + 1, prev.r.x, prev.r.y, prev.r.z);
        pos.setXYZ(o + 2, l.x, l.y, l.z);
        pos.setXYZ(o + 3, r.x, r.y, r.z);
        dirty = true;
      }
      state.last.set(e.wheel, { l, r, p });
    }
    // Fade by age.
    for (let i = 0; i < SEGMENTS; i++) {
      const age = state.time - state.born[i];
      const a = age < LIFETIME ? 0.32 * (1 - age / LIFETIME) : 0;
      const o = i * 4;
      if (col.getW(o) === a && a === 0) continue;
      for (let k = 0; k < 4; k++) col.setXYZW(o + k, 0.36, 0.33, 0.36, a);
      dirty = true;
    }
    if (dirty) {
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
