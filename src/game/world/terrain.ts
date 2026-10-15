// Terrain height + colour model for the diorama island.
//   North: a stone retaining wall at z = WALL_Z holds back tree-covered hills (tunnel portal in it).
//   West:  a wooden fence at x = FENCE_X with hills rising behind.
//   South / East: beaches sloping into a lake (rope fence along the shore).
import * as THREE from 'three';
import { fbm, smoothstep, lerp } from './noise';
import { palette } from '../palette';
import { TUNNEL_X } from './roads';

export const WORLD = { minX: -86, maxX: 86, minZ: -70, maxZ: 70 };
export const WALL_Z = -46;
export const FENCE_X = -62;
export const SHORE_Z = 44; // rope fence line (south)
export const SHORE_X = 62; // rope fence line (east)
export const WATER_LEVEL = -0.55;
export const DIORAMA_BOTTOM = -7;
export const TUNNEL_HALF_W = 4.2;

/** Terrain triangles skipped so the tunnel mouth stays open (render: mouth only; collider: whole tube). */
export function inTunnelCut(x: number, z: number, wholeTube: boolean) {
  return Math.abs(x - TUNNEL_X) < TUNNEL_HALF_W + 0.7 && z < WALL_Z + 0.4 && z > (wholeTube ? WALL_Z - 24 : WALL_Z - 1.2);
}

export function terrainHeight(x: number, z: number) {
  const n = fbm(x * 0.045, z * 0.045, 4);
  const n2 = fbm(x * 0.12 + 40, z * 0.12 - 13, 3);
  let h = 0;
  // North hills behind the retaining wall (the wall itself is ~2.7 high).
  if (z < WALL_Z - 0.2) {
    const d = WALL_Z - 0.2 - z;
    h = Math.max(h, 2.75 + Math.min(d, 1.5) * 0.15 + smoothstep(1, 18, d) * (4.5 + n * 2.5) + n2 * 0.25 * smoothstep(1, 4, d));
  }
  // A mound above the tunnel so the hill covers the tube.
  if (z < WALL_Z - 0.6) {
    const dx = Math.abs(x - TUNNEL_X);
    h = Math.max(h, 6.6 + n * 0.6 - smoothstep(7, 14, dx) * 3.6 - smoothstep(-58, -66, z) * 1.5);
  }
  // West hills behind the fence.
  if (x < FENCE_X - 1) {
    const d = FENCE_X - 1 - x;
    h = Math.max(h, smoothstep(0, 14, d) * (6 + n * 2.5) + n2 * 0.3 * smoothstep(0, 4, d));
  }
  // Lake to the south and east, with beaches between the rope fence and the water.
  const lakeS = smoothstep(SHORE_Z + 0.5, SHORE_Z + 9, z) * (x > FENCE_X + 2 ? 1 : smoothstep(54, 60, z));
  const lakeE = smoothstep(SHORE_X + 0.5, SHORE_X + 8, x) * (z > WALL_Z + 1 ? 1 : 0);
  const lake = Math.max(lakeS, lakeE);
  if (lake > 0) {
    const bed = -2.9 + n * 0.5;
    const beach = lerp(0, bed, lake);
    h = lerp(h, beach, Math.min(1, lake * 1.5));
  }
  // Gentle undulation in open lawns (kept tiny so the town reads flat).
  return h;
}

/** Slope magnitude (rise/run) using finite differences. */
export function terrainSlope(x: number, z: number) {
  const e = 0.5;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

const C = {
  grass: new THREE.Color(palette.grass),
  grassDark: new THREE.Color(palette.grassDark),
  grassLight: new THREE.Color(palette.grassLight),
  sand: new THREE.Color('#D8C7A6'),
  wetSand: new THREE.Color('#B9A88C'),
  dirt: new THREE.Color('#A8957C'),
  rock: new THREE.Color('#A39A92'),
  lakeBed: new THREE.Color('#8E9A8C'),
  hill: new THREE.Color('#8FA37E'),
};

/** Base vertex colour; `ao` (0..1) darkens toward a cool tint for fake contact shadows. */
export function terrainColor(x: number, z: number, h: number, ao: number, out = new THREE.Color()) {
  const n = fbm(x * 0.08 + 7, z * 0.08 - 3, 3);
  const n2 = fbm(x * 0.33, z * 0.33, 2);
  out.copy(C.grass).lerp(C.grassDark, smoothstep(-0.2, 0.6, n) * 0.7).lerp(C.grassLight, smoothstep(0.25, 0.8, n2) * 0.35);
  if (h > 1) out.lerp(C.hill, smoothstep(1, 5, h) * 0.6);
  const slope = terrainSlope(x, z);
  out.lerp(C.rock, smoothstep(0.9, 1.8, slope) * 0.75);
  // Beaches & lake bed.
  if (h < 0.05) {
    out.lerp(C.sand, smoothstep(0.05, -0.25, h));
    out.lerp(C.wetSand, smoothstep(WATER_LEVEL + 0.25, WATER_LEVEL - 0.1, h));
    out.lerp(C.lakeBed, smoothstep(WATER_LEVEL - 0.3, -2, h));
  }
  if (ao > 0) out.lerp(new THREE.Color('#6F7A72'), ao * 0.45);
  return out;
}
