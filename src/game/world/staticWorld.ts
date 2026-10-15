// Builds every static placement in the town (buildings, nature, fences, street
// furniture) plus a matching collider for each. Runs once after models load.
import * as THREE from 'three';
import { getProto, placementMatrix, type Placement } from '../assets';
import type { VariantOptions } from '../materials';
import { buildWing, TILE } from './building';
import {
  DOCK,
  FOUNTAIN,
  HOUSES,
  LOCATIONS,
  MAILBOX,
  PLAZA,
  PROJECT_STANDS,
  TUNNEL,
  WINDMILL,
  WELCOME_SIGN,
} from './layout';
import { loop, LOOP, ROAD_WIDTH, TUNNEL_X } from './roads';
import { trees, rocks, flowers, grass, bushes } from './scatter';
import { FENCE_X, SHORE_X, SHORE_Z, WALL_Z, terrainHeight } from './terrain';
import { mulberry32 } from './noise';

export type VariantKey = 'solid' | 'tree' | 'grass' | 'plain';
export const VARIANTS: Record<VariantKey, VariantOptions> = {
  solid: { occluder: true },
  tree: { occluder: true, wind: 0.0022 },
  grass: { wind: 0.3 },
  plain: {},
};

export type ColliderDesc =
  | { kind: 'box'; pos: [number, number, number]; half: [number, number, number]; yaw: number }
  | { kind: 'cyl'; pos: [number, number, number]; r: number; hh: number };

export interface StaticItem {
  model: string;
  placement: Placement;
  variant: VariantKey;
}

export interface Lamp {
  x: number;
  z: number;
  y: number; // bulb height
}

const Y = new THREE.Vector3(0, 1, 0);

export function buildStaticWorld() {
  const items: StaticItem[] = [];
  const colliders: ColliderDesc[] = [];
  const lamps: Lamp[] = [];
  const chimneys: THREE.Vector3[] = [];
  const rnd = mulberry32(7);

  /** World-space box collider from a model's bounds under a placement. */
  const autoBox = (model: string, pl: Placement, shrink = 0.92, minHalf = 0.12): ColliderDesc => {
    const p = getProto(model);
    const s = typeof pl.scale === 'number' ? pl.scale : 1;
    const c = p.box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    const yaw = pl.rotation ?? 0;
    c.applyAxisAngle(Y, yaw);
    return {
      kind: 'box',
      pos: [pl.position[0] + c.x, pl.position[1] + c.y, pl.position[2] + c.z],
      half: [Math.max(minHalf, (p.size.x / 2) * s * shrink), Math.max(minHalf, (p.size.y / 2) * s), Math.max(minHalf, (p.size.z / 2) * s * shrink)],
      yaw,
    };
  };

  /** Place a model so its footprint centre lands on (x, z). */
  const add = (
    model: string,
    x: number,
    z: number,
    yaw = 0,
    opts: { variant?: VariantKey; collider?: 'auto' | 'none' | 'cyl' | ColliderDesc; scale?: number; y?: number; shrink?: number; center?: boolean } = {},
  ) => {
    const p = getProto(model);
    const s = opts.scale ?? 1;
    let px = x;
    let pz = z;
    if (opts.center !== false) {
      const c = p.box.getCenter(new THREE.Vector3()).multiplyScalar(s);
      c.y = 0;
      c.applyAxisAngle(Y, yaw);
      px -= c.x;
      pz -= c.z;
    }
    const pl: Placement = { position: [px, opts.y ?? terrainHeight(x, z), pz], rotation: yaw, scale: s };
    items.push({ model, placement: pl, variant: opts.variant ?? 'solid' });
    const col = opts.collider ?? 'auto';
    if (col === 'auto') colliders.push(autoBox(model, pl, opts.shrink));
    else if (col === 'cyl') {
      const r = Math.max(p.size.x, p.size.z) * s * 0.35;
      colliders.push({ kind: 'cyl', pos: [x, pl.position[1] + (p.size.y * s) / 2, z], r, hh: (p.size.y * s) / 2 });
    } else if (col !== 'none') colliders.push(col);
    return pl;
  };

  // ── Landmark buildings ─────────────────────────────────────────────────────
  for (const l of LOCATIONS) {
    const b = l.building;
    if (!b) continue;
    const bm = new THREE.Matrix4().compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion().setFromAxisAngle(Y, b.rotation), new THREE.Vector3(1, 1, 1));
    for (const w of b.wings) {
      const { pieces, collider } = buildWing(w, bm);
      for (const pc of pieces) items.push({ model: pc.model, placement: { position: [0, 0, 0], matrix: pc.matrix }, variant: 'solid' });
      const c = collider.center.clone().applyAxisAngle(Y, b.rotation);
      colliders.push({
        kind: 'box',
        pos: [b.x + c.x, collider.center.y, b.z + c.z],
        half: [collider.half.x, collider.half.y, collider.half.z],
        yaw: b.rotation + collider.rotation,
      });
      if (w.chimney !== undefined) {
        const zc = (w.chimney - (w.length - 1) / 2) * TILE;
        const local = new THREE.Vector3(-0.55 * (w.depthScale ?? 1) + 0.4, (w.floors ?? 1) * TILE + 2.0, zc)
          .applyAxisAngle(Y, w.rotation ?? 0)
          .add(new THREE.Vector3(w.x, 0, w.z))
          .applyAxisAngle(Y, b.rotation);
        chimneys.push(new THREE.Vector3(b.x + local.x, local.y, b.z + local.z));
      }
    }
  }

  // Windmill: a three-storey tower (blades are animated separately).
  {
    const bm = new THREE.Matrix4().compose(new THREE.Vector3(WINDMILL.x, 0, WINDMILL.z), new THREE.Quaternion().setFromAxisAngle(Y, WINDMILL.yaw), new THREE.Vector3(1, 1, 1));
    const { pieces, collider } = buildWing({ x: 0, z: 0, length: 1, floors: 3, walls: ['stone', 'stone', 'wood'], doors: ['e0'], roofHeight: 'high', windowStyle: 'round', depthScale: 1.25 }, bm);
    for (const pc of pieces) items.push({ model: pc.model, placement: { position: [0, 0, 0], matrix: pc.matrix }, variant: 'solid' });
    colliders.push({ kind: 'box', pos: [WINDMILL.x, collider.center.y, WINDMILL.z], half: [collider.half.x, collider.half.y, collider.half.z], yaw: WINDMILL.yaw });
  }

  // ── Suburban homes with little gardens ─────────────────────────────────────
  for (const h of HOUSES) {
    add(h.model, h.x, h.z, h.rot, { shrink: 0.9 });
    const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, h.rot);
    const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, h.rot);
    add('sub-planter', h.x + front.x * 4.4 + side.x * 2.6, h.z + front.z * 4.4 + side.z * 2.6, h.rot, { shrink: 0.85 });
    if (rnd() < 0.7) add('bush', h.x + front.x * 4.2 - side.x * 2.8, h.z + front.z * 4.2 - side.z * 2.8, rnd() * 6, { collider: 'cyl' });
  }

  // ── Nature scatter ─────────────────────────────────────────────────────────
  for (const t of trees) {
    items.push({ model: t.model, placement: t, variant: 'tree' });
    const c = t.collider!;
    colliders.push({ kind: 'cyl', pos: [t.position[0], t.position[1] + c.height / 2, t.position[2]], r: c.radius, hh: c.height / 2 });
  }
  for (const r of rocks) {
    items.push({ model: r.model, placement: r, variant: 'solid' });
    colliders.push(autoBox(r.model, r, 0.75));
  }
  for (const b of bushes) {
    items.push({ model: b.model, placement: b, variant: 'grass' });
    const p = getProto(b.model);
    const s = typeof b.scale === 'number' ? b.scale : 1;
    colliders.push({ kind: 'cyl', pos: [b.position[0], b.position[1] + p.size.y * s * 0.5, b.position[2]], r: Math.max(p.size.x, p.size.z) * s * 0.3, hh: p.size.y * s * 0.5 });
  }
  for (const f of flowers) items.push({ model: f.model, placement: f, variant: 'grass' });
  for (const g of grass) items.push({ model: g.model, placement: g, variant: 'grass' });

  // ── Boundaries ─────────────────────────────────────────────────────────────
  // West: wooden fence with hedges behind it.
  for (let z = WALL_Z + 1.2; z < SHORE_Z - 0.5; z += 2.4) {
    add('ft-fence', FENCE_X, z, 0, { collider: 'none' });
    if (rnd() < 0.55) add('ft-hedge-large', FENCE_X - 1.3, z, 0, { collider: 'none', variant: 'solid' });
  }
  colliders.push({ kind: 'box', pos: [FENCE_X, 0.8, (WALL_Z + SHORE_Z) / 2], half: [0.35, 1.6, (SHORE_Z - WALL_Z) / 2 + 1], yaw: 0 });
  // South & east: rope fence along the beach (gap for the dock).
  for (let x = FENCE_X + 1.5; x < SHORE_X - 0.5; x += 2.85) {
    if (Math.abs(x - DOCK.x) < DOCK.w / 2 + 1.2) continue;
    add('fence-rope', x, SHORE_Z, 0, { collider: 'none', variant: 'plain' });
  }
  colliders.push({ kind: 'box', pos: [(FENCE_X + DOCK.x - DOCK.w / 2 - 0.2) / 2, 0.7, SHORE_Z], half: [(DOCK.x - DOCK.w / 2 - 0.2 - FENCE_X) / 2, 1.2, 0.3], yaw: 0 });
  colliders.push({ kind: 'box', pos: [(SHORE_X + DOCK.x + DOCK.w / 2 + 0.2) / 2, 0.7, SHORE_Z], half: [(SHORE_X - DOCK.x - DOCK.w / 2 - 0.2) / 2 + 0.6, 1.2, 0.3], yaw: 0 });
  for (let z = WALL_Z + 1.6; z < SHORE_Z; z += 2.85) add('fence-rope', SHORE_X, z, Math.PI / 2, { collider: 'none', variant: 'plain' });
  colliders.push({ kind: 'box', pos: [SHORE_X, 0.7, (WALL_Z + SHORE_Z) / 2], half: [0.3, 1.2, (SHORE_Z - WALL_Z) / 2 + 0.6], yaw: 0 });
  // North retaining wall collider (visuals in NorthWall.tsx), with a gap for the tunnel.
  const wallHalfDepth = 0.6;
  const leftEnd = TUNNEL_X - TUNNEL.width / 2 - 0.9;
  const rightStart = TUNNEL_X + TUNNEL.width / 2 + 0.9;
  colliders.push({ kind: 'box', pos: [(FENCE_X - 1 + leftEnd) / 2, 1.6, WALL_Z - wallHalfDepth], half: [(leftEnd - FENCE_X + 1) / 2, 2.2, wallHalfDepth], yaw: 0 });
  colliders.push({ kind: 'box', pos: [(rightStart + SHORE_X + 1) / 2, 1.6, WALL_Z - wallHalfDepth], half: [(SHORE_X + 1 - rightStart) / 2, 2.2, wallHalfDepth], yaw: 0 });
  // Tunnel: side walls inside, and a dead end deep in the dark.
  colliders.push({ kind: 'box', pos: [TUNNEL_X - TUNNEL.width / 2 - 0.4, 2.5, WALL_Z - TUNNEL.depth / 2], half: [0.4, 2.5, TUNNEL.depth / 2], yaw: 0 });
  colliders.push({ kind: 'box', pos: [TUNNEL_X + TUNNEL.width / 2 + 0.4, 2.5, WALL_Z - TUNNEL.depth / 2], half: [0.4, 2.5, TUNNEL.depth / 2], yaw: 0 });
  colliders.push({ kind: 'box', pos: [TUNNEL_X, 2.5, WALL_Z - 19], half: [TUNNEL.width / 2, 2.5, 0.5], yaw: 0 });
  colliders.push({ kind: 'box', pos: [TUNNEL_X, TUNNEL.height + 0.6, WALL_Z - TUNNEL.depth / 2], half: [TUNNEL.width / 2 + 1, 0.5, TUNNEL.depth / 2], yaw: 0 });

  // ── Street lamps along the loop ────────────────────────────────────────────
  const lampEvery = 19;
  const sJ = loop.nearest(new THREE.Vector3(TUNNEL_X, 0, -LOOP.hz)).s;
  for (let s = 6, i = 0; s < loop.length; s += lampEvery, i++) {
    if (Math.abs(s - sJ) < 9) continue;
    const { p, t } = loop.at(s);
    const right = new THREE.Vector3(-t.z, 0, t.x);
    const side = i % 2 === 0 ? -1 : 1; // alternate inner / outer
    const off = ROAD_WIDTH / 2 + 0.95;
    const x = p.x + right.x * off * side;
    const z = p.z + right.z * off * side;
    add('ft-lantern', x, z, Math.atan2(t.x, t.z), { collider: { kind: 'cyl', pos: [x, 1.8, z], r: 0.2, hh: 1.8 } });
    lamps.push({ x, z, y: 3.05 });
  }

  // ── Plaza ──────────────────────────────────────────────────────────────────
  add('ft-fountain-round-detail', FOUNTAIN.x, FOUNTAIN.z, 0, { collider: { kind: 'cyl', pos: [FOUNTAIN.x, 0.6, FOUNTAIN.z], r: 2.35, hh: 0.6 } });
  for (const a of [0.25, 0.75, 1.25, 1.75]) {
    const x = PLAZA.x + Math.cos(a * Math.PI) * (PLAZA.r - 1.3);
    const z = PLAZA.z + Math.sin(a * Math.PI) * (PLAZA.r - 1.3);
    add('ft-lantern', x, z, 0, { collider: { kind: 'cyl', pos: [x, 1.8, z], r: 0.2, hh: 1.8 } });
    lamps.push({ x, z, y: 3.05 });
  }
  for (const a of [0.0, 0.5, 1.0, 1.5]) {
    const ang = a * Math.PI + Math.PI / 4;
    const x = FOUNTAIN.x + Math.cos(ang) * 5.2;
    const z = FOUNTAIN.z + Math.sin(ang) * 5.2;
    add('ft-stall-bench', x, z, -ang, { shrink: 0.9 });
  }
  for (const [x, z] of [[-8, -6.5], [8, -6.5], [8, 6.5]] as const) add('sub-planter', x, z, Math.atan2(x, z), { shrink: 0.85 });
  // Flower bed under the welcome sign.
  for (let i = -2; i <= 2; i++) {
    const a = WELCOME_SIGN.yaw;
    add(i % 2 ? 'flowers-tall' : 'flower-yellow', WELCOME_SIGN.x + Math.cos(a) * i * 1.0 + Math.sin(a) * 0.9, WELCOME_SIGN.z - Math.sin(a) * i * 1.0 + Math.cos(a) * 0.9, rnd() * 6, { collider: 'none', variant: 'grass' });
  }

  // ── Landmark dressing ──────────────────────────────────────────────────────
  // Café terrace (About).
  add('ft-stall-red', -15.6, -11.2, Math.PI / 2, { shrink: 0.8 });
  add('ft-stall-stool', -14.2, -2.6, 0);
  add('ft-stall-stool', -14.2, -1.2, 0);
  add('ft-stall-bench', -16.2, -1.9, 0);
  add('potted-plant', -15.8, -4.2, 0, { collider: 'cyl' });
  add('potted-plant', -15.8, -9.6, 0, { collider: 'cyl' });
  add('barrel', -16.2, -12.9, 0, { collider: 'cyl' });
  add('fruit-stand', -14.8, -13.3, Math.PI / 2);
  // Library (Experience).
  add('ft-banner-green', -24.2, LOOP.hz * -1 - 11.6, -Math.PI / 2, { collider: 'none', center: false, y: 1.4 });
  add('ft-banner-green', -15.8, LOOP.hz * -1 - 11.6, -Math.PI / 2, { collider: 'none', center: false, y: 1.4 });
  add('ft-stall-bench', -25.5, -32.6, Math.PI / 2);
  add('ft-stall-bench', -14.5, -32.6, Math.PI / 2);
  add('bush-large', -27.6, -33.4, 0, { collider: 'cyl', variant: 'grass' });
  add('bush-large', -12.4, -33.4, 0, { collider: 'cyl', variant: 'grass' });
  // Workshop (Projects).
  add('ft-cart', 36.5, -42.5, 0.4);
  add('workbench', 14.2, -36.6, Math.PI);
  add('anvil', 12.6, -37.2, 0.3);
  add('wood-pile', 34.6, -37.4, 0.2);
  add('planks-pile', 12.4, -41.2, Math.PI / 2);
  add('ft-wheel', 33.6, -39.6, 0.8, { collider: 'cyl' });
  // Tool shed (Skills).
  add('log-stack', -31.5, 34.5, 0.2);
  add('log-stack', -31.5, 36.7, -0.1);
  add('workbench', -18.6, 39.8, 0);
  add('anvil', -20.4, 40.4, 0.6);
  add('ft-cart-high', -30.8, 40.2, -0.3);
  // Post office (Contact).
  add('flag', LOOP.hx + 7.0, -9.8, 0, { collider: { kind: 'cyl', pos: [LOOP.hx + 7.0, 1.3, -9.8], r: 0.18, hh: 1.3 } });
  add('ft-stall-bench', LOOP.hx + 17.6, -3.6, Math.PI / 2);
  add('potted-plant', LOOP.hx + 10.2, -4.4, 0, { collider: 'cyl' });
  add('potted-plant', LOOP.hx + 16.8, -4.4, 0, { collider: 'cyl' });

  // Mailbox (visual in Life.tsx, so its flag can move).
  colliders.push({ kind: 'cyl', pos: [MAILBOX.x, 0.8, MAILBOX.z], r: 0.3, hh: 0.8 });

  // Sign posts (visuals in Signs.tsx).
  {
    const a = WELCOME_SIGN.yaw;
    for (const sx of [-3, 3]) colliders.push({ kind: 'cyl', pos: [WELCOME_SIGN.x + Math.cos(a) * sx, 1.7, WELCOME_SIGN.z - Math.sin(a) * sx], r: 0.3, hh: 1.7 });
    colliders.push({ kind: 'box', pos: [WELCOME_SIGN.x, 2.4, WELCOME_SIGN.z], half: [3.4, 1.3, 0.2], yaw: a });
  }
  for (const l of LOCATIONS) if (l.sign) colliders.push({ kind: 'cyl', pos: [l.sign[0], 1.2, l.sign[1]], r: 0.25, hh: 1.2 });
  colliders.push({ kind: 'cyl', pos: [PLAZA.x + 3.4, 1.5, PLAZA.z + PLAZA.r + 1.6], r: 0.25, hh: 1.5 });
  colliders.push({ kind: 'cyl', pos: [PLAZA.x - 3.0, 1.5, PLAZA.z - PLAZA.r - 1.6], r: 0.25, hh: 1.5 });

  // Project stands get colliders here (visuals in ProjectStands.tsx).
  for (const s of PROJECT_STANDS) colliders.push({ kind: 'box', pos: [s.x, 1.4, s.z - 0.1], half: [1.9, 1.4, 0.25], yaw: 0 });

  // Dock: planks over the water with railings and posts.
  const dockY = 0.05;
  for (let z = DOCK.z0 + 1.2; z < DOCK.z1; z += 2.4) {
    add('ft-planks', DOCK.x - 0.6, z, 0, { collider: 'none', y: dockY, center: true });
    add('ft-planks', DOCK.x + 0.6, z, 0, { collider: 'none', y: dockY, center: true });
  }
  for (let z = DOCK.z0 + 2.4; z <= DOCK.z1; z += 2.4) {
    for (const sx of [-1, 1]) {
      const x = DOCK.x + sx * (DOCK.w / 2 + 0.15);
      add('ft-pillar-wood', x, z, 0, { collider: 'none', y: -1.6 });
    }
  }
  for (const sx of [-1, 1]) {
    for (let z = DOCK.z0 + 2.4; z < DOCK.z1 - 0.5; z += 2.4) add('ft-fence', DOCK.x + sx * (DOCK.w / 2 + 0.15), z + 1.2, 0, { collider: 'none', y: dockY + 0.1 });
    colliders.push({ kind: 'box', pos: [DOCK.x + sx * (DOCK.w / 2 + 0.4), 0.8, (DOCK.z0 + DOCK.z1) / 2 + 1], half: [0.3, 1.1, (DOCK.z1 - DOCK.z0) / 2 + 1], yaw: 0 });
  }
  colliders.push({ kind: 'box', pos: [DOCK.x, 0.8, DOCK.z1 + 0.5], half: [DOCK.w / 2 + 0.6, 1.1, 0.3], yaw: 0 });
  // The dock deck itself (drivable).
  colliders.push({ kind: 'box', pos: [DOCK.x, dockY - 0.1, (DOCK.z0 + DOCK.z1) / 2 + 0.6], half: [DOCK.w / 2 + 0.2, 0.25, (DOCK.z1 - DOCK.z0) / 2 + 0.6], yaw: 0 });
  add('ft-lantern', DOCK.x + DOCK.w / 2 - 0.2, DOCK.z1 - 0.4, 0, { collider: 'none', y: dockY + 0.1 });
  lamps.push({ x: DOCK.x + DOCK.w / 2 - 0.2, z: DOCK.z1 - 0.4, y: 3.15 });

  // Shoreline rocks & reeds for a crafted edge.
  for (let x = FENCE_X + 4; x < SHORE_X; x += 7 + rnd() * 6) {
    if (Math.abs(x - DOCK.x) < 5) continue;
    const z = SHORE_Z + 1.5 + rnd() * 1.5;
    add(rnd() < 0.5 ? 'rock-c' : 'rock-b', x, z, rnd() * 6, { collider: 'none', scale: 0.7 + rnd() * 0.4, y: terrainHeight(x, z) - 0.15 });
  }
  for (let z = WALL_Z + 6; z < SHORE_Z; z += 8 + rnd() * 6) {
    const x = SHORE_X + 1.6 + rnd() * 1.2;
    add(rnd() < 0.5 ? 'rock-c' : 'rock-b', x, z, rnd() * 6, { collider: 'none', scale: 0.7 + rnd() * 0.4, y: terrainHeight(x, z) - 0.15 });
  }

  return { items, colliders, lamps, chimneys };
}

export type StaticWorld = ReturnType<typeof buildStaticWorld>;

/** Group items by model+variant for instanced rendering. */
export function groupItems(items: StaticItem[]) {
  const map = new Map<string, { model: string; variant: VariantKey; placements: Placement[] }>();
  for (const it of items) {
    const key = `${it.model}|${it.variant}`;
    if (!map.has(key)) map.set(key, { model: it.model, variant: it.variant, placements: [] });
    map.get(key)!.placements.push(it.placement);
  }
  return [...map.values()];
}

export { placementMatrix };
