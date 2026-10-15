// Roads: ribbon meshes along the road paths with a worn, hand-painted look,
// rounded stone curbs (broken at junctions), and the cobbled town plaza.
import { useMemo } from 'react';
import * as THREE from 'three';
import { palette } from '../palette';
import { GLSL_NOISE } from './noise';
import { loop, tunnelSpur, ROAD_WIDTH, LOOP, TUNNEL_X, RoadPath } from './roads';
import { PLAZA, LOCATIONS } from './layout';
import { WALL_Z } from './terrain';

const ROAD_Y = 0.03;
const vec3 = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

function ribbon(path: RoadPath, width: number, s0 = 0, s1 = path.length, step = 0.5) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const { p, t } = path.at(s);
    const rx = -t.z;
    const rz = t.x;
    pos.push(p.x - rx * width * 0.5, ROAD_Y, p.z - rz * width * 0.5, p.x + rx * width * 0.5, ROAD_Y, p.z + rz * width * 0.5);
    uv.push(0, s, 1, s);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const roadMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;\nvarying vec2 vRoadXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = uv;\nvRoadXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vRoadUv;\nvarying vec2 vRoadXZ;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float u = vRoadUv.x;
          float v = vRoadUv.y;
          vec2 p = vRoadXZ;
          vec3 base = ${vec3(palette.road)};
          vec3 dark = ${vec3(palette.roadDark)};
          float edge = smoothstep(0.36, 0.5, abs(u - 0.5) + vnoise(p * 1.3) * 0.05);
          vec3 c = mix(base, dark, edge * 0.8);
          // Tyre tracks in each lane.
          float tracks = exp(-pow((abs(u - 0.5) - 0.25) * 18.0, 2.0));
          c *= 1.0 - tracks * 0.06;
          // Patches and gravel.
          c *= 0.93 + fbm3(p * 0.45) * 0.12;
          float grit = hash12(floor(p * 18.0));
          c *= 1.0 - step(0.9, grit) * 0.07 + step(0.97, grit) * 0.06;
          // Dashed centre line, slightly worn.
          float dash = step(abs(u - 0.5), 0.016) * step(fract(v / 3.2), 0.55);
          float wear = smoothstep(0.25, 0.6, vnoise(p * 2.5 + 11.0));
          c = mix(c, ${vec3('#EFE7D8')}, dash * (0.55 + 0.45 * wear) * vRoadDash);
          diffuseColor.rgb = c;
        }`,
      )
      .replace('#include <common>', '#include <common>\nuniform float vRoadDash;');
    shader.uniforms.vRoadDash = { value: 1 };
  };
  return m;
})();

const pavingMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPaveXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaveXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vPaveXZ;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vPaveXZ * 1.35;
          float row = floor(p.y);
          p.x += mod(row, 2.0) * 0.5;
          vec2 cell = floor(p);
          vec2 f = fract(p) - 0.5;
          vec2 d = abs(f) - vec2(0.38, 0.36);
          float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.08;
          float stone = 1.0 - smoothstep(-0.02, 0.03, sdf);
          float h = hash12(cell);
          vec3 c1 = ${vec3('#D9CDB8')};
          vec3 c2 = ${vec3('#C7B9A2')};
          vec3 c3 = ${vec3('#D3C2A8')};
          vec3 sc = mix(mix(c1, c2, step(0.5, h)), c3, step(0.8, h));
          sc *= 0.94 + vnoise(vPaveXZ * 6.0) * 0.1;
          vec3 grout = ${vec3('#A59985')};
          diffuseColor.rgb = mix(grout, sc, stone);
        }`,
      );
  };
  return m;
})();

const curbMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, color: palette.curb });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCurbS;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCurbS = uv.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vCurbS;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float seg = fract(vCurbS / 1.4);
          float joint = smoothstep(0.0, 0.025, seg) * smoothstep(1.0, 0.975, seg);
          float id = floor(vCurbS / 1.4);
          diffuseColor.rgb *= (0.86 + 0.14 * joint) * (0.95 + hash12(vec2(id, 3.0)) * 0.08);
        }`,
      );
  };
  return m;
})();

/** Rounded curb profile swept along an offset of the path. */
function curb(path: RoadPath, offset: number, s0: number, s1: number) {
  const prof: [number, number][] = [];
  const W = 0.34;
  const H = 0.15;
  const r = 0.06;
  // Profile (across, up) — rounded top corners.
  prof.push([-W / 2, -0.05]);
  for (let i = 0; i <= 3; i++) {
    const a = Math.PI - (i / 3) * (Math.PI / 2);
    prof.push([-W / 2 + r + Math.cos(a) * r, H - r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= 3; i++) {
    const a = Math.PI / 2 - (i / 3) * (Math.PI / 2);
    prof.push([W / 2 - r + Math.cos(a) * r, H - r + Math.sin(a) * r]);
  }
  prof.push([W / 2, -0.05]);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  const P = prof.length;
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const { p, t } = path.at(s);
    const rx = -t.z;
    const rz = t.x;
    for (let k = 0; k < P; k++) {
      const [a, h] = prof[k];
      const o = offset + a;
      pos.push(p.x + rx * o, h, p.z + rz * o);
      uv.push(k / (P - 1), s);
    }
    if (i < n) {
      for (let k = 0; k < P - 1; k++) {
        const a = i * P + k;
        idx.push(a, a + 1, a + P, a + 1, a + P + 1, a + P);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Splits [0, L] into curb runs, skipping the gaps (each gap = [sCentre, halfWidth]). */
function runs(L: number, gaps: [number, number][], closed: boolean): [number, number][] {
  const cuts = gaps.map(([c, w]) => [c - w, c + w] as [number, number]).sort((a, b) => a[0] - b[0]);
  if (!cuts.length) return [[0, L]];
  const out: [number, number][] = [];
  if (closed) {
    for (let i = 0; i < cuts.length; i++) {
      const a = cuts[i][1];
      const b = i + 1 < cuts.length ? cuts[i + 1][0] : cuts[0][0] + L;
      if (b - a > 0.6) out.push([a, b]);
    }
  } else {
    let cur = 0;
    for (const [a, b] of cuts) {
      if (a - cur > 0.6) out.push([cur, a]);
      cur = b;
    }
    if (L - cur > 0.6) out.push([cur, L]);
  }
  return out;
}

const sOn = (path: RoadPath, x: number, z: number) => path.nearest(new THREE.Vector3(x, 0, z)).s;

function junctionFillet(cx: number, cz: number, dirX: number, r: number) {
  // Quarter-circle fillet filling the corner between the loop's north edge and the spur.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(r, 0);
  shape.absarc(r, r, r, -Math.PI / 2, -Math.PI, true);
  shape.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  g.rotateX(-Math.PI / 2); // shape +y → world north (-z), normal up
  if (dirX < 0) {
    g.scale(-1, 1, 1);
    const ix = g.index!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
  }
  g.translate(cx, ROAD_Y - 0.001, cz);
  return g;
}

export function Roads() {
  const parts = useMemo(() => {
    const half = ROAD_WIDTH / 2;
    const edgeZ = -LOOP.hz - half; // loop's north edge
    const spurStart = sOn(tunnelSpur, TUNNEL_X, edgeZ);
    const spurEnd = sOn(tunnelSpur, TUNNEL_X, WALL_Z - 1);
    const loopRibbon = ribbon(loop, ROAD_WIDTH);
    const spurRibbon = ribbon(tunnelSpur, ROAD_WIDTH, spurStart, tunnelSpur.length);

    // Curb gaps on the loop: spur junction (outer edge), plaza paths (inner edge), and pads.
    const sJ = sOn(loop, TUNNEL_X, -LOOP.hz);
    const outerGaps: [number, number][] = [[sJ, half + 3.2]];
    const innerGaps: [number, number][] = [
      [sOn(loop, 0, -LOOP.hz), 2.4],
      [sOn(loop, 0, LOOP.hz), 2.4],
    ];
    // Leave openings beside every location pad so driving in feels natural.
    for (const l of LOCATIONS) {
      const n = loop.nearest(new THREE.Vector3(l.pad[0], 0, l.pad[1]));
      if (n.distance > 14) continue;
      const side = new THREE.Vector3(l.pad[0], 0, l.pad[1]).sub(n.sample.p);
      const right = new THREE.Vector3(-n.sample.t.z, 0, n.sample.t.x);
      (side.dot(right) > 0 ? outerGaps : innerGaps).push([n.s, 3.4]);
    }
    // Determine which side is "inner": for a CCW loop, right-hand side points outward.
    const curbs: THREE.BufferGeometry[] = [];
    for (const [a, b] of runs(loop.length, outerGaps, true)) curbs.push(curb(loop, half + 0.17, a, b));
    for (const [a, b] of runs(loop.length, innerGaps, true)) curbs.push(curb(loop, -(half + 0.17), a, b));
    curbs.push(curb(tunnelSpur, half + 0.17, spurStart + 3.2, spurEnd));
    curbs.push(curb(tunnelSpur, -(half + 0.17), spurStart + 3.2, spurEnd));

    const fillets = [junctionFillet(TUNNEL_X + half, edgeZ, 1, 3.2), junctionFillet(TUNNEL_X - half, edgeZ, -1, 3.2)];

    // Plaza + paths.
    const plaza = new THREE.CircleGeometry(PLAZA.r, 64);
    plaza.rotateX(-Math.PI / 2);
    plaza.translate(PLAZA.x, 0.022, PLAZA.z);
    const paths: THREE.BufferGeometry[] = [];
    const path = (x0: number, z0: number, x1: number, z1: number, w: number) => {
      const g = new THREE.PlaneGeometry(Math.abs(x1 - x0) || w, Math.abs(z1 - z0) || w);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
      paths.push(g);
    };
    path(0, -PLAZA.r + 0.5, 0, -LOOP.hz + half - 0.2, 4.2);
    path(0, PLAZA.r - 0.5, 0, LOOP.hz - half + 0.2, 4.2);
    path(-PLAZA.r + 0.5, -7, -15.5, -7, 4.2);
    return { loopRibbon, spurRibbon, curbs, fillets, plaza, paths };
  }, []);

  return (
    <>
      <mesh geometry={parts.loopRibbon} material={roadMaterial} receiveShadow />
      <mesh geometry={parts.spurRibbon} material={roadMaterial} receiveShadow />
      {parts.fillets.map((g, i) => (
        <mesh key={`f${i}`} geometry={g} material={roadMaterial} receiveShadow />
      ))}
      {parts.curbs.map((g, i) => (
        <mesh key={`c${i}`} geometry={g} material={curbMaterial} receiveShadow castShadow />
      ))}
      <mesh geometry={parts.plaza} material={pavingMaterial} receiveShadow />
      {parts.paths.map((g, i) => (
        <mesh key={`p${i}`} geometry={g} material={pavingMaterial} receiveShadow />
      ))}
    </>
  );
}
