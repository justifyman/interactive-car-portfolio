// Town plan: where everything lives. Plain data so it's easy to tweak.
// Coordinates: x = east, z = south (north = -z). Camera looks from the south-east.
import * as THREE from 'three';
import type { SectionId } from '../store';
import type { WingSpec } from './building';
import { loop, ROADS, LANE_OFFSET, LOOP, TUNNEL_X } from './roads';
import { WALL_Z } from './terrain';

export const SPAWN = {
  position: [5, 1.0, 9.5] as [number, number, number],
  yaw: Math.PI * 0.78, // facing north-east-ish (screen right)
};

/** Closest drivable point on any road, in the right-hand lane, with its tangent. */
export function nearestRoadPoint(p: THREE.Vector3) {
  let best = { position: loop.samples[0].p.clone(), tangent: loop.samples[0].t.clone(), d: Infinity };
  for (const r of ROADS) {
    const n = r.nearest(p);
    if (n.distance < best.d) {
      const right = new THREE.Vector3(-n.sample.t.z, 0, n.sample.t.x);
      best = { position: n.sample.p.clone().addScaledVector(right, LANE_OFFSET), tangent: n.sample.t.clone(), d: n.distance };
    }
  }
  return best;
}

// Building yaw helpers: buildings are authored with their front facing local +X.
export const FACE = { east: 0, north: Math.PI / 2, west: Math.PI, south: -Math.PI / 2 };

export interface BuildingDef {
  x: number;
  z: number;
  rotation: number;
  /** Normal-height roofs are dusty teal, 'high' roofs are muted red (kit convention). */
  wings: WingSpec[];
}

export interface LocationDef {
  id: SectionId;
  label: string;
  icon: string;
  pad: [number, number];
  padRadius: number;
  /** Camera-facing label board position. */
  sign?: [number, number];
  building?: BuildingDef;
  /** Index into content.projects for project stands. */
  projectIndex?: number;
}

const N_ROAD = -LOOP.hz; // north road centre z
const S_ROAD = LOOP.hz;

export const LOCATIONS: LocationDef[] = [
  {
    id: 'hero',
    label: 'Welcome',
    icon: '👋',
    pad: [-6.5, 9.5],
    padRadius: 2.2,
  },
  {
    id: 'about',
    label: 'About me',
    icon: '☕',
    pad: [-12.2, -7],
    padRadius: 2.4,
    sign: [-13.6, -10.9],
    building: {
      x: -21,
      z: -7,
      rotation: FACE.east,
      wings: [
        { x: 0, z: 0, length: 3, floors: 2, walls: ['stone', 'wood'], doors: ['e1'], depthScale: 1.45, chimney: 0, windowStyle: 'glass', roofHeight: 'high' },
        { x: -1.2, z: 5.0, rotation: Math.PI / 2, length: 1, floors: 1, walls: ['wood'], depthScale: 1.3, plain: ['n'], roofHeight: 'high' },
      ],
    },
  },
  {
    id: 'experience',
    label: 'Experience',
    icon: '📚',
    pad: [-20, N_ROAD - 7.4],
    padRadius: 2.4,
    sign: [-24.2, -31.6],
    building: {
      x: -20,
      z: N_ROAD - 14.5,
      rotation: FACE.south,
      wings: [
        { x: 0, z: 0, length: 4, floors: 2, walls: ['stone', 'stone'], doors: [], depthScale: 1.5, windowStyle: 'round' },
        { x: 2.0, z: 0, length: 1, floors: 3, walls: ['stone', 'stone', 'wood'], doors: ['e0'], depthScale: 1.0, windowStyle: 'round' },
      ],
    },
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: '🛠️',
    pad: [24, N_ROAD - 7.6],
    padRadius: 2.4,
    sign: [27.9, -31.4],
    building: {
      x: 24,
      z: N_ROAD - 15.5,
      rotation: FACE.south,
      wings: [
        { x: 0, z: 0, length: 4, floors: 2, walls: ['wood', 'wood'], wide: ['e1', 'e2'], plain: ['e0', 'e3'], depthScale: 1.9, roofHeight: 'high', windowStyle: 'shutters' },
        { x: -0.4, z: -6.6, rotation: 0, length: 2, floors: 1, walls: ['stone'], depthScale: 1.5, chimney: 1, windowStyle: 'shutters' },
      ],
    },
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: '🧰',
    pad: [-16.5, S_ROAD + 7.2],
    padRadius: 2.4,
    sign: [-12.6, 30.4],
    building: {
      x: -24,
      z: S_ROAD + 12.5,
      rotation: FACE.east,
      wings: [
        { x: 0, z: 0, length: 3, floors: 1, walls: ['wood'], wide: ['e1'], depthScale: 1.7, windowStyle: 'shutters', chimney: 2 },
        { x: -0.5, z: -5.0, rotation: 0, length: 1, floors: 1, walls: ['stone'], depthScale: 1.25, plain: ['s'] },
      ],
    },
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: '✉️',
    pad: [LOOP.hx + 7.2, -2.5],
    padRadius: 2.4,
    sign: [LOOP.hx + 10.8, -1.2],
    building: {
      x: LOOP.hx + 13.5,
      z: -9,
      rotation: FACE.south,
      wings: [{ x: 0, z: 0, length: 2, floors: 2, walls: ['stone', 'wood'], doors: ['e0'], depthScale: 1.6, windowStyle: 'shutters', chimney: 1, roofHeight: 'high' }],
    },
  },
  {
    id: 'easter',
    label: '???',
    icon: '⭐',
    pad: [30, 55.2],
    padRadius: 1.6,
  },
];

/** Project display stands in front of the workshop. */
export const PROJECT_STANDS = [
  { x: 11.5, z: N_ROAD - 9.5 },
  { x: 16.5, z: N_ROAD - 10.5 },
  { x: 31.5, z: N_ROAD - 10.5 },
  { x: 36.5, z: N_ROAD - 9.5 },
];

export const PLAZA = { x: 0, z: 0, r: 11 };
export const FOUNTAIN = { x: 0, z: -1 };
export const WELCOME_SIGN = { x: -3.5, z: 6.5, yaw: Math.PI / 4 };
export const DOCK = { x: 30, z0: 43.2, z1: 56.5, w: 3.6 };
export const TUNNEL = { x: TUNNEL_X, z: WALL_Z, width: 8.4, height: 4.6, depth: 22 };
export const MAILBOX = { x: LOOP.hx + 5.2, z: -6.2, yaw: Math.PI / 4 };
export const WINDMILL = { x: -51, z: 24, yaw: -Math.PI / 4 }; // front faces the camera (south-east)

/** Suburban homes (model, position, yaw). */
export const HOUSES: { model: string; x: number; z: number; rot: number }[] = [
  { model: 'house-building-type-c', x: 15, z: -12.5, rot: 0 },
  { model: 'house-building-type-h', x: 27, z: -12, rot: 0 },
  { model: 'house-building-type-a', x: 15.5, z: 12, rot: Math.PI },
  { model: 'house-building-type-q', x: 27, z: 12.5, rot: Math.PI },
  { model: 'house-building-type-k', x: -15, z: 13, rot: Math.PI },
  { model: 'house-building-type-f', x: -51, z: -12, rot: -Math.PI / 2 },
  { model: 'house-building-type-t', x: -51, z: 4, rot: -Math.PI / 2 },
  { model: 'house-building-type-d', x: 7, z: 37, rot: 0 },
  { model: 'house-building-type-n', x: 52, z: 14, rot: Math.PI / 2 },
  { model: 'house-building-type-h', x: 52, z: -24, rot: Math.PI / 2 },
  { model: 'house-building-type-a', x: -50, z: -32, rot: -Math.PI / 2 },
];

/** Areas kept clear of random scatter (trees, rocks, flowers). */
export const RESERVED: { x: number; z: number; r: number }[] = [
  { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 1.5 },
  { x: SPAWN.position[0], z: SPAWN.position[2], r: 5 },
  ...LOCATIONS.map((l) => ({ x: l.pad[0], z: l.pad[1], r: l.padRadius + 2.5 })),
  ...LOCATIONS.filter((l) => l.building).map((l) => ({ x: l.building!.x, z: l.building!.z, r: 9 })),
  ...HOUSES.map((h) => ({ x: h.x, z: h.z, r: 7 })),
  ...PROJECT_STANDS.map((s) => ({ x: s.x, z: s.z, r: 3.5 })),
  { x: TUNNEL.x, z: TUNNEL.z + 4, r: 9 },
  { x: WINDMILL.x, z: WINDMILL.z, r: 6 },
  { x: -11, z: S_ROAD + 13, r: 6.5 }, // skills crate yard
  { x: DOCK.x, z: 47, r: 5 },
];
