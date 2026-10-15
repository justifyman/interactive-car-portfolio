// Road network geometry shared by rendering, AI traffic, resets and terrain.
// The main loop is a rounded rectangle sampled by arc length; spurs are polylines.
import * as THREE from 'three';

export const ROAD_WIDTH = 7;
export const LANE_OFFSET = 1.75;

export interface RoadSample {
  p: THREE.Vector3;
  t: THREE.Vector3; // unit tangent
  s: number; // arc length
}

export class RoadPath {
  samples: RoadSample[] = [];
  length = 0;
  constructor(
    points: THREE.Vector3[],
    public closed: boolean,
    step = 0.5,
  ) {
    // Resample a dense polyline uniformly by arc length.
    const pts = closed ? [...points, points[0]] : points;
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = cum[cum.length - 1];
    const n = Math.max(2, Math.round(this.length / step));
    let seg = 0;
    for (let k = 0; k <= (closed ? n - 1 : n); k++) {
      const s = (k / n) * this.length;
      while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
      const a = pts[seg];
      const b = pts[seg + 1];
      const f = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const p = a.clone().lerp(b, f);
      const t = b.clone().sub(a).normalize();
      this.samples.push({ p, t, s });
    }
    // Smooth tangents.
    const sm = this.samples.map((_, i) => {
      const prev = this.samples[closed ? (i - 1 + this.samples.length) % this.samples.length : Math.max(0, i - 1)];
      const next = this.samples[closed ? (i + 1) % this.samples.length : Math.min(this.samples.length - 1, i + 1)];
      return next.p.clone().sub(prev.p).normalize();
    });
    this.samples.forEach((s, i) => s.t.copy(sm[i]));
  }

  /** Position + tangent at arc length s (wraps if closed). */
  at(s: number, out = { p: new THREE.Vector3(), t: new THREE.Vector3() }) {
    const L = this.length;
    if (this.closed) s = ((s % L) + L) % L;
    else s = THREE.MathUtils.clamp(s, 0, L);
    const f = (s / L) * (this.closed ? this.samples.length : this.samples.length - 1);
    const i0 = Math.floor(f);
    const i1 = this.closed ? (i0 + 1) % this.samples.length : Math.min(this.samples.length - 1, i0 + 1);
    const a = this.samples[i0 % this.samples.length];
    const b = this.samples[i1];
    const k = f - i0;
    out.p.copy(a.p).lerp(b.p, k);
    out.t.copy(a.t).lerp(b.t, k).normalize();
    return out;
  }

  nearest(p: THREE.Vector3) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const q = this.samples[i].p;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const s = this.samples[best];
    return { sample: s, distance: Math.sqrt(bd), s: s.s };
  }

  /** Curvature proxy (radians of heading change over the next `ahead` metres). */
  turnAhead(s: number, ahead: number) {
    const a = this.at(s).t.clone();
    const b = this.at(s + ahead).t.clone();
    return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  }
}

function roundedRect(hx: number, hz: number, r: number, cx = 0, cz = 0, seg = 16) {
  // Counter-clockwise when viewed from above (+Y), starting at the east edge middle.
  const pts: THREE.Vector3[] = [];
  const corners = [
    { x: hx - r, z: -(hz - r), a0: 0, a1: -Math.PI / 2 }, // NE (north = -z)
    { x: -(hx - r), z: -(hz - r), a0: -Math.PI / 2, a1: -Math.PI },
    { x: -(hx - r), z: hz - r, a0: Math.PI, a1: Math.PI / 2 },
    { x: hx - r, z: hz - r, a0: Math.PI / 2, a1: 0 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = c.a0 + ((c.a1 - c.a0) * i) / seg;
      pts.push(new THREE.Vector3(cx + c.x + Math.cos(a) * r, 0, cz + c.z + Math.sin(a) * r));
    }
  }
  return pts;
}

// ── The town's roads ─────────────────────────────────────────────────────────
export const LOOP = { hx: 38, hz: 24, r: 13 };
export const loop = new RoadPath(roundedRect(LOOP.hx, LOOP.hz, LOOP.r), true);

/** Spur from the north road into the tunnel in the hills (AI cars enter/leave here). */
export const TUNNEL_X = 6;
export const TUNNEL_MOUTH_Z = -46; // matches terrain WALL_Z
export const TUNNEL_END_Z = TUNNEL_MOUTH_Z - 18;
export const tunnelSpur = new RoadPath(
  [new THREE.Vector3(TUNNEL_X, 0, -LOOP.hz), new THREE.Vector3(TUNNEL_X, 0, -36), new THREE.Vector3(TUNNEL_X, 0, TUNNEL_END_Z)],
  false,
);

export const ROADS = [loop, tunnelSpur];

/** Signed distance from point to the nearest road centreline (xz). */
export function distanceToRoads(x: number, z: number) {
  let best = Infinity;
  const p = new THREE.Vector3(x, 0, z);
  for (const r of ROADS) best = Math.min(best, r.nearest(p).distance);
  return best;
}
