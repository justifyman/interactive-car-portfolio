// Deterministic scatter of nature props, avoiding roads, buildings and water.
import type { Placement } from '../assets';
import { RESERVED, HOUSES, DOCK, TUNNEL, PLAZA } from './layout';
import { mulberry32 } from './noise';
import { distanceToRoads, ROAD_WIDTH } from './roads';
import { terrainHeight, terrainSlope, WALL_Z, FENCE_X, SHORE_Z, SHORE_X, WORLD } from './terrain';

export interface ScatterItem extends Placement {
  model: string;
  collider?: { radius: number; height: number };
}

const rnd = mulberry32(20261014);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const range = (a: number, b: number) => a + rnd() * (b - a);

const placed: { x: number; z: number; r: number }[] = [];

function free(x: number, z: number, r: number, roadMargin: number) {
  for (const c of RESERVED) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return false;
  for (const p of placed) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + r) ** 2) return false;
  if (distanceToRoads(x, z) < ROAD_WIDTH / 2 + roadMargin + r) return false;
  return true;
}

/** Inside the playable town (between the boundaries). */
const inTown = (x: number, z: number, margin = 0) =>
  z > WALL_Z + 1.5 + margin && x > FENCE_X + 1.5 + margin && z < SHORE_Z - 1 - margin && x < SHORE_X - 1 - margin;

function tryPlace(
  out: ScatterItem[],
  n: number,
  sample: () => [number, number],
  r: number,
  roadMargin: number,
  make: (x: number, z: number, y: number) => ScatterItem | null,
  maxTries = n * 30,
) {
  let count = 0;
  for (let t = 0; t < maxTries && count < n; t++) {
    const [x, z] = sample();
    if (!free(x, z, r, roadMargin)) continue;
    const y = terrainHeight(x, z);
    const item = make(x, z, y);
    if (!item) continue;
    placed.push({ x, z, r });
    out.push(item);
    count++;
  }
}

const HILL_TREES = ['pine', 'pine-tall', 'tree-pine-a', 'ft-tree', 'ft-tree-high', 'pine', 'tree-round', 'pine-autumn', 'ft-tree-high-round'];
const TOWN_TREES = ['tree-round', 'tree-round', 'ft-tree-high-round', 'sub-tree-large', 'pine-autumn', 'tree-pine-small', 'ft-tree'];

const trunkRadius: Record<string, number> = {
  pine: 0.4,
  'pine-tall': 0.45,
  'pine-autumn': 0.35,
  'pine-autumn-tall': 0.4,
  'tree-pine-a': 0.45,
  'tree-pine-small': 0.35,
  'tree-round': 0.45,
  'ft-tree': 0.4,
  'ft-tree-high': 0.4,
  'ft-tree-high-round': 0.4,
  'ft-tree-crooked': 0.4,
  'sub-tree-large': 0.35,
  'sub-tree-small': 0.3,
};

export const trees: ScatterItem[] = [];
export const rocks: ScatterItem[] = [];
export const flowers: ScatterItem[] = [];
export const grass: ScatterItem[] = [];
export const bushes: ScatterItem[] = [];

const tree = (model: string, x: number, z: number, y: number, s = range(0.85, 1.2)): ScatterItem => ({
  model,
  position: [x, y - 0.05, z],
  rotation: rnd() * Math.PI * 2,
  scale: s,
  collider: { radius: (trunkRadius[model] ?? 0.4) * s, height: 3 },
});

// Hand-placed town trees first (frame the landmarks).
const FEATURE_TREES: [string, number, number, number?][] = [
  ['tree-round', -9, -15], ['ft-tree-high-round', -14, -16], ['tree-round', 9, 16], ['pine-autumn', -27, 2],
  ['tree-round', -30, -16], ['ft-tree-high-round', 33, 5], ['tree-round', 33, -4], ['pine-autumn', 21, 2],
  ['tree-round', -31, 15], ['ft-tree', -4, 16.5], ['tree-round', 4, -16.5], ['pine-autumn', -8, 16],
  ['ft-tree-high-round', -29, -40], ['tree-round', -11, -40], ['pine', 37, -40], ['ft-tree-high', 43, -40],
  ['tree-round', 44, 6], ['pine-autumn', 46, -16], ['tree-round', 57, 30], ['ft-tree-high-round', 46, 30],
  ['tree-round', -33, 37], ['pine-autumn', -40, 30], ['tree-round', 16, 39], ['ft-tree-high-round', 40, 38],
  ['tree-round', -56, -24], ['pine', -57, 14], ['tree-round', -45, -41], ['ft-tree-high-round', 57, -40],
];
for (const [m, x, z, s] of FEATURE_TREES) {
  if (!free(x, z, 1.2, 1.2)) continue;
  placed.push({ x, z, r: 1.6 });
  trees.push(tree(m, x, z, terrainHeight(x, z), s));
}

// Dense forest on the north hills and west hills (beyond the boundaries).
tryPlace(
  trees,
  210,
  () => [range(WORLD.minX + 2, WORLD.maxX - 2), range(WORLD.minZ + 2, WALL_Z - 1.8)],
  1.7,
  0,
  (x, z, y) => {
    if (Math.abs(x - TUNNEL.x) < 7 && z > WALL_Z - 4) return null; // keep the portal clear
    if (terrainSlope(x, z) > 2.2) return null;
    return tree(pick(HILL_TREES), x, z, y, range(0.9, 1.35));
  },
);
tryPlace(
  trees,
  110,
  () => [range(WORLD.minX + 2, FENCE_X - 1.6), range(WALL_Z, SHORE_Z + 12)],
  1.7,
  0,
  (x, z, y) => (y < -0.2 ? null : tree(pick(HILL_TREES), x, z, y, range(0.9, 1.3))),
);
// Town trees: parks, edges of bands, along the boundary fences.
tryPlace(
  trees,
  70,
  () => [range(FENCE_X + 3, SHORE_X - 3), range(WALL_Z + 3, SHORE_Z - 3)],
  2.2,
  2.4,
  (x, z, y) => (inTown(x, z, 1) ? tree(pick(TOWN_TREES), x, z, y, range(0.8, 1.15)) : null),
);

// Rocks: hills, shore, a few in town.
const ROCKS = ['rock-a', 'rock-b', 'rock-c', 'ft-rock-large', 'ft-rock-wide', 'ft-rock-small', 'rocks'];
tryPlace(
  rocks,
  70,
  () => [range(WORLD.minX + 3, WORLD.maxX - 3), range(WORLD.minZ + 3, WORLD.maxZ - 3)],
  1.4,
  1.5,
  (x, z, y) => {
    if (inTown(x, z, -1) && rnd() > 0.15) return null;
    if (y < -1.6) return null;
    const m = pick(ROCKS);
    const s = m.startsWith('ft-') ? range(0.45, 0.8) : range(0.7, 1.2);
    return { model: m, position: [x, y - 0.1, z], rotation: rnd() * 6.28, scale: s };
  },
);

// Bushes along buildings and fences.
tryPlace(
  bushes,
  70,
  () => [range(FENCE_X + 1, SHORE_X - 1), range(WALL_Z + 1, SHORE_Z - 1)],
  1.0,
  1.2,
  (x, z, y) => ({ model: pick(['bush', 'bush-large', 'plant']), position: [x, y, z], rotation: rnd() * 6.28, scale: range(0.8, 1.2) }),
);

// Flowers & grass tufts (no colliders — purely decorative ground cover).
tryPlace(
  flowers,
  200,
  () => [range(WORLD.minX + 2, WORLD.maxX - 2), range(WORLD.minZ + 2, SHORE_Z + 1)],
  0.6,
  0.9,
  (x, z, y) =>
    y < 0 ? null : { model: pick(['flowers', 'flowers-tall', 'flower-yellow', 'flower-purple', 'mushrooms']), position: [x, y, z], rotation: rnd() * 6.28, scale: range(0.6, 1) },
  4000,
);
{
  // Grass tufts don't reserve space (they can sit near anything except roads).
  let n = 0;
  for (let t = 0; t < 9000 && n < 520; t++) {
    const x = range(WORLD.minX + 1, WORLD.maxX - 1);
    const z = range(WORLD.minZ + 1, WORLD.maxZ - 1);
    if (distanceToRoads(x, z) < ROAD_WIDTH / 2 + 0.6) continue;
    if ((x - PLAZA.x) ** 2 + (z - PLAZA.z) ** 2 < (PLAZA.r + 0.5) ** 2) continue;
    if (Math.abs(x - DOCK.x) < 3 && z > DOCK.z0 - 1) continue;
    let inHouse = false;
    for (const h of HOUSES) if (Math.abs(x - h.x) < 4.5 && Math.abs(z - h.z) < 4) inHouse = true;
    if (inHouse) continue;
    const y = terrainHeight(x, z);
    if (y < -0.35) continue;
    grass.push({ model: rnd() < 0.7 ? 'grass-tuft' : 'grass-large', position: [x, y - 0.02, z], rotation: rnd() * 6.28, scale: range(0.6, 1.1) });
    n++;
  }
}
