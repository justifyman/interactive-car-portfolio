// Procedural assembly of landmark buildings from the Kenney fantasy-town modular kit.
// A building is one or more "wings": a row of 1-tile-deep modules with a gable roof.
// Wings can be widened (depthScale) and combined into L / T shapes.
import * as THREE from 'three';

export const TILE = 2.4;

export type WallStyle = 'stone' | 'wood';
export type RoofStyle = 'red' | 'green';

export interface WingSpec {
  /** Centre of the wing in building space. */
  x: number;
  z: number;
  /** Yaw of the wing; the wing's length runs along its local Z axis. */
  rotation?: number;
  length: number; // tiles
  floors?: number;
  depthScale?: number; // stretch across the ridge (1 = one tile deep)
  walls?: WallStyle[]; // per floor, bottom first
  /** Which wall slots get doors / windows: keys like "e0", "w2", "n", "s" (floor 0). */
  doors?: string[];
  wide?: string[]; // wide doorways (garage-style)
  plain?: string[]; // slots without windows
  windowStyle?: 'shutters' | 'glass' | 'round';
  roofHeight?: 'normal' | 'high';
  chimney?: number; // tile index for a chimney, if any
  /** Skip the roof (for wings that sit under another wing's roof). */
  noRoof?: boolean;
  /** Gable end caps: set false where the wing butts into another wing. */
  capNorth?: boolean;
  capSouth?: boolean;
}

export interface PiecePlacement {
  model: string;
  matrix: THREE.Matrix4;
}

const Y = new THREE.Vector3(0, 1, 0);

function local(x: number, y: number, z: number, rot: number) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1));
}

function wallPiece(style: WallStyle, kind: 'wall' | 'door' | 'window' | 'wide' | 'detail', windowStyle: WingSpec['windowStyle']) {
  const p = style === 'wood' ? 'ft-wall-wood' : 'ft-wall';
  switch (kind) {
    case 'door':
      return `${p}-door`;
    case 'wide':
      return `${p}-doorway-square-wide`;
    case 'window':
      return windowStyle === 'glass' ? `${p}-window-glass` : windowStyle === 'round' ? `${p}-window-round` : `${p}-window-shutters`;
    case 'detail':
      return `${p}-detail-cross`;
    default:
      return p;
  }
}

/** Returns building-space matrices for every module of a wing plus its bounding box. */
export function buildWing(spec: WingSpec, buildingMatrix: THREE.Matrix4) {
  const floors = spec.floors ?? 1;
  const L = spec.length;
  const ds = spec.depthScale ?? 1;
  const walls = spec.walls ?? ['stone'];
  const doors = new Set(spec.doors ?? []);
  const wide = new Set(spec.wide ?? []);
  const plain = new Set(spec.plain ?? []);
  const wingM = new THREE.Matrix4()
    .compose(new THREE.Vector3(spec.x, 0, spec.z), new THREE.Quaternion().setFromAxisAngle(Y, spec.rotation ?? 0), new THREE.Vector3(ds, 1, 1))
    .premultiply(buildingMatrix);
  const out: PiecePlacement[] = [];
  const add = (model: string, m: THREE.Matrix4) => out.push({ model, matrix: wingM.clone().multiply(m) });

  const zOf = (k: number) => (k - (L - 1) / 2) * TILE;
  for (let f = 0; f < floors; f++) {
    const style = walls[Math.min(f, walls.length - 1)];
    const y = f * TILE;
    const slot = (key: string, alt: number) => {
      const k = f === 0 ? key : `${key}@${f}`;
      if (doors.has(k)) return 'door' as const;
      if (wide.has(k)) return 'wide' as const;
      if (plain.has(k)) return (alt % 2 ? 'detail' : 'wall') as 'detail' | 'wall';
      return alt % 2 === 0 || f > 0 ? ('window' as const) : ('wall' as const);
    };
    for (let k = 0; k < L; k++) {
      add(wallPiece(style, slot(`e${k}`, k + 1), spec.windowStyle), local(0, y, zOf(k), 0));
      add(wallPiece(style, slot(`w${k}`, k), spec.windowStyle), local(0, y, zOf(k), Math.PI));
    }
    add(wallPiece(style, slot('n', 0), spec.windowStyle), local(0, y, zOf(0), Math.PI / 2));
    add(wallPiece(style, slot('s', 0), spec.windowStyle), local(0, y, zOf(L - 1), -Math.PI / 2));
  }

  const roofY = floors * TILE;
  if (!spec.noRoof) {
    const high = spec.roofHeight === 'high';
    const mid = high ? 'ft-roof-high-gable' : 'ft-roof-gable';
    const end = high ? 'ft-roof-high-gable-end' : 'ft-roof-gable-end';
    for (let k = 0; k < L; k++) {
      const isN = k === 0 && spec.capNorth !== false;
      const isS = k === L - 1 && spec.capSouth !== false;
      if (L === 1 && isN && isS) {
        add(high ? 'ft-roof-high-point' : 'ft-roof-point', local(0, roofY, zOf(k), 0));
      } else if (isN) add(end, local(0, roofY, zOf(k), -Math.PI / 2));
      else if (isS) add(end, local(0, roofY, zOf(k), Math.PI / 2));
      else add(mid, local(0, roofY, zOf(k), Math.PI / 2));
    }
    if (spec.chimney !== undefined) {
      add('ft-chimney', local(-0.55, roofY - 0.2, zOf(spec.chimney), 0));
    }
  }

  // Oriented footprint for collisions (building space).
  const halfX = (TILE / 2) * ds;
  const halfZ = (L * TILE) / 2;
  const height = roofY + (spec.noRoof ? 0 : spec.roofHeight === 'high' ? 2.6 : 1.5);
  return { pieces: out, collider: { center: new THREE.Vector3(spec.x, height / 2, spec.z), half: new THREE.Vector3(halfX + 0.05, height / 2, halfZ + 0.05), rotation: spec.rotation ?? 0 } };
}
