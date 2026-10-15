// The north boundary: a hand-laid stone retaining wall holding back the hills,
// with an arched tunnel portal where traffic enters and leaves town.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchShader } from '../materials';
import { mulberry32 } from './noise';
import { TUNNEL } from './layout';
import { FENCE_X, SHORE_X, WALL_Z } from './terrain';

const STONE_COLORS = ['#C2B8AA', '#B3A99C', '#CBC1B2', '#AA9F94', '#BCAD9C', '#B8B0A6', '#A79D90'].map((c) => new THREE.Color(c));
const WALL_H = 2.75;
const ARCH_R = TUNNEL.width / 2;
const SPRING = TUNNEL.height - ARCH_R; // arch springline height

interface Block {
  pos: THREE.Vector3;
  size: THREE.Vector3;
  rotZ?: number;
  color: THREE.Color;
}

function layWall(rnd: () => number, x0: number, x1: number, blocks: Block[]) {
  const courses = 5;
  const ch = WALL_H / courses;
  for (let c = 0; c < courses; c++) {
    let x = x0 - (c % 2) * 0.55;
    while (x < x1) {
      const len = Math.min(0.85 + rnd() * 0.75, x1 - x);
      if (len > 0.25) {
        blocks.push({
          pos: new THREE.Vector3(x + len / 2, c * ch + ch / 2, WALL_Z - 0.38 + (rnd() - 0.5) * 0.06),
          size: new THREE.Vector3(len - 0.05, ch - 0.05, 0.76),
          color: STONE_COLORS[Math.floor(rnd() * STONE_COLORS.length)].clone().multiplyScalar(0.94 + rnd() * 0.1),
        });
      }
      x += len;
    }
  }
  // Cap stones.
  let x = x0 - 0.2;
  while (x < x1 + 0.2) {
    const len = Math.min(1.1 + rnd() * 0.8, x1 + 0.2 - x);
    if (len > 0.3)
      blocks.push({
        pos: new THREE.Vector3(x + len / 2, WALL_H + 0.1, WALL_Z - 0.42),
        size: new THREE.Vector3(len - 0.04, 0.22, 1.0),
        color: STONE_COLORS[Math.floor(rnd() * STONE_COLORS.length)].clone().multiplyScalar(1.02 + rnd() * 0.06),
      });
    x += len;
  }
}

function layPortal(rnd: () => number, cx: number, blocks: Block[]) {
  const outerW = TUNNEL.width / 2 + 2.6;
  const top = TUNNEL.height + 1.6;
  // Infill courses around the opening.
  const ch = 0.55;
  for (let y = 0; y < top; y += ch) {
    let x = cx - outerW - (Math.round(y / ch) % 2) * 0.4;
    while (x < cx + outerW) {
      const len = Math.min(0.8 + rnd() * 0.6, cx + outerW - x);
      const mx = x + len / 2;
      const my = y + ch / 2;
      const dx = mx - cx;
      const insideOpening = Math.abs(dx) < ARCH_R + 1.0 && (my < SPRING || Math.hypot(dx, my - SPRING) < ARCH_R + 1.0);
      if (!insideOpening && len > 0.25)
        blocks.push({
          pos: new THREE.Vector3(mx, my, WALL_Z - 0.3),
          size: new THREE.Vector3(len - 0.05, ch - 0.05, 0.9),
          color: STONE_COLORS[Math.floor(rnd() * STONE_COLORS.length)].clone().multiplyScalar(0.92 + rnd() * 0.1),
        });
      x += len;
    }
  }
  // Voussoirs around the arch + keystone.
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = Math.PI - (i + 0.5) * (Math.PI / n);
    const r = ARCH_R + 0.5;
    const key = i === Math.floor(n / 2);
    blocks.push({
      pos: new THREE.Vector3(cx + Math.cos(a) * r, SPRING + Math.sin(a) * r, WALL_Z - 0.2),
      size: new THREE.Vector3(key ? 1.25 : 1.0, ((Math.PI * r) / n) * 0.92, key ? 1.25 : 1.05),
      rotZ: a - Math.PI / 2,
      color: (key ? new THREE.Color('#D8CCB8') : STONE_COLORS[i % STONE_COLORS.length].clone()).multiplyScalar(1.04),
    });
  }
  // Jamb stones below the springline.
  for (const side of [-1, 1]) {
    for (let y = 0; y < SPRING; y += 0.5) {
      blocks.push({
        pos: new THREE.Vector3(cx + side * (ARCH_R + 0.5), y + 0.25, WALL_Z - 0.2),
        size: new THREE.Vector3(1.0, 0.46, 1.05),
        color: STONE_COLORS[Math.floor(rnd() * STONE_COLORS.length)].clone(),
      });
    }
  }
  // Cornice.
  blocks.push({ pos: new THREE.Vector3(cx, top + 0.15, WALL_Z - 0.35), size: new THREE.Vector3(outerW * 2 + 0.6, 0.3, 1.2), color: new THREE.Color('#D2C6B4') });
}

export function NorthWall() {
  const { meshes, tunnel, slices } = useMemo(() => {
    const rnd = mulberry32(99);
    const blocks: Block[] = [];
    const gapL = TUNNEL.x - TUNNEL.width / 2 - 2.6;
    const gapR = TUNNEL.x + TUNNEL.width / 2 + 2.6;
    layWall(rnd, FENCE_X - 1.5, gapL, blocks);
    layWall(rnd, gapR, SHORE_X + 1.2, blocks);
    layPortal(rnd, TUNNEL.x, blocks);

    const geo = new RoundedBoxGeometry(1, 1, 1, 1, 0.09);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    patchShader(mat, { occluder: true });
    // Split into chunks along the wall so off-screen sections are culled.
    const CHUNK_W = 24;
    const byChunk = new Map<number, Block[]>();
    for (const b of blocks) {
      const k = Math.floor(b.pos.x / CHUNK_W);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k)!.push(b);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const meshes = [...byChunk.values()].map((list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => {
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03, b.rotZ ?? (rnd() - 0.5) * 0.02));
        m.compose(b.pos, q, b.size);
        im.setMatrixAt(i, m);
        im.setColorAt(i, b.color);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      return im;
    });

    // Tunnel interior: arched tube, dark and getting darker with depth.
    const shape = new THREE.Shape();
    shape.moveTo(-ARCH_R, -0.2);
    shape.lineTo(-ARCH_R, SPRING);
    shape.absarc(0, SPRING, ARCH_R, Math.PI, 0, true);
    shape.lineTo(ARCH_R, -0.2);
    const pts = shape.getPoints(24);
    const pos: number[] = [];
    const col: number[] = [];
    const segs = 10;
    const depth = TUNNEL.depth;
    for (let s = 0; s < segs; s++) {
      const z0 = WALL_Z - 0.2 - (s / segs) * depth;
      const z1 = WALL_Z - 0.2 - ((s + 1) / segs) * depth;
      const c0 = 0.07 * Math.pow(1 - s / segs, 2.0) + 0.006;
      const c1 = 0.07 * Math.pow(1 - (s + 1) / segs, 2.0) + 0.006;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        pos.push(TUNNEL.x + a.x, a.y, z0, TUNNEL.x + b.x, b.y, z0, TUNNEL.x + a.x, a.y, z1);
        pos.push(TUNNEL.x + b.x, b.y, z0, TUNNEL.x + b.x, b.y, z1, TUNNEL.x + a.x, a.y, z1);
        for (const c of [c0, c0, c1, c0, c1, c1]) col.push(c * 0.95, c * 0.88, c * 1.1);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const tunnelMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

    // Darkness slices so cars fade into the tunnel.
    const sliceGeo = new THREE.ShapeGeometry(shape, 12);
    const slices: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const sm = new THREE.Mesh(
        sliceGeo,
        new THREE.MeshBasicMaterial({ color: '#16121D', transparent: true, opacity: 0.26, depthWrite: false }),
      );
      sm.position.set(TUNNEL.x, 0, WALL_Z - 1.2 - i * 1.6);
      sm.renderOrder = 3;
      slices.push(sm);
    }
    return { meshes, tunnel: tunnelMesh, slices };
  }, []);

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={tunnel} />
      {slices.map((s) => (
        <primitive key={s.uuid} object={s} />
      ))}
    </>
  );
}
