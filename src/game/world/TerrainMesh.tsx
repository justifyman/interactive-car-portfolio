// Diorama island terrain: vertex-coloured heightfield with baked contact shadows,
// procedural detail in the shader, soil strata on the island sides and a glassy
// water cross-section where the lake meets the edge.
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';
import { patchShader } from '../materials';
import { groups } from '../physics';
import { palette } from '../palette';
import { GLSL_NOISE } from './noise';
import { HOUSES, LOCATIONS } from './layout';
import { trees } from './scatter';
import { terrainColor, terrainHeight, WORLD, DIORAMA_BOTTOM, WATER_LEVEL, inTunnelCut, WALL_Z } from './terrain';
import { CuboidCollider } from '@react-three/rapier';
import { TUNNEL_X, TUNNEL_END_Z } from './roads';
import { TILE } from './building';

const STEP = 1;

function buildAO(nx: number, nz: number) {
  const ao = new Float32Array(nx * nz);
  const idx = (x: number, z: number) => {
    const i = Math.round((x - WORLD.minX) / STEP);
    const k = Math.round((z - WORLD.minZ) / STEP);
    return i >= 0 && k >= 0 && i < nx && k < nz ? k * nx + i : -1;
  };
  const splat = (cx: number, cz: number, r: number, strength: number) => {
    for (let x = cx - r; x <= cx + r; x += STEP) {
      for (let z = cz - r; z <= cz + r; z += STEP) {
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d > 1) continue;
        const j = idx(x, z);
        if (j >= 0) ao[j] = Math.min(1, ao[j] + strength * (1 - d) ** 1.5);
      }
    }
  };
  for (const t of trees) splat(t.position[0], t.position[2], 2.6 * (typeof t.scale === 'number' ? t.scale : 1), 0.55);
  for (const h of HOUSES) for (let a = 0; a < 6.28; a += 0.8) splat(h.x + Math.cos(a) * 3, h.z + Math.sin(a) * 2.5, 2.4, 0.3);
  for (const l of LOCATIONS) {
    const b = l.building;
    if (!b) continue;
    const c = Math.cos(b.rotation);
    const sn = Math.sin(b.rotation);
    for (const w of b.wings) {
      const half = ((w.length * TILE) / 2) * 0.9;
      const wr = w.rotation ?? 0;
      for (let s = -half; s <= half; s += 1.5) {
        const lx = w.x + Math.sin(wr) * s;
        const lz = w.z + Math.cos(wr) * s;
        splat(b.x + lx * c + lz * sn, b.z - lx * sn + lz * c, 3.4, 0.35);
      }
    }
  }
  return ao;
}

function useTerrainGeometry() {
  return useMemo(() => {
    const nx = Math.round((WORLD.maxX - WORLD.minX) / STEP) + 1;
    const nz = Math.round((WORLD.maxZ - WORLD.minZ) / STEP) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const ao = buildAO(nx, nz);
    const c = new THREE.Color();
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const x = WORLD.minX + i * STEP;
        const z = WORLD.minZ + k * STEP;
        const h = terrainHeight(x, z);
        const j = k * nx + i;
        pos.set([x, h, z], j * 3);
        terrainColor(x, z, h, ao[j], c);
        col.set([c.r, c.g, c.b], j * 3);
      }
    }
    const index: number[] = [];
    for (let k = 0; k < nz - 1; k++) {
      for (let i = 0; i < nx - 1; i++) {
        if (inTunnelCut(WORLD.minX + (i + 0.5) * STEP, WORLD.minZ + (k + 0.5) * STEP, false)) continue;
        const a = k * nx + i;
        const b = a + 1;
        const d = a + nx;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }, []);
}

function useColliderData() {
  return useMemo(() => {
    const step = 2;
    const nx = Math.round((WORLD.maxX - WORLD.minX) / step) + 1;
    const nz = Math.round((WORLD.maxZ - WORLD.minZ) / step) + 1;
    const v = new Float32Array(nx * nz * 3);
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const x = WORLD.minX + i * step;
        const z = WORLD.minZ + k * step;
        v.set([x, terrainHeight(x, z), z], (k * nx + i) * 3);
      }
    const idx: number[] = [];
    for (let k = 0; k < nz - 1; k++)
      for (let i = 0; i < nx - 1; i++) {
        if (inTunnelCut(WORLD.minX + (i + 0.5) * step, WORLD.minZ + (k + 0.5) * step, true)) continue;
        const a = k * nx + i;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    return { vertices: v, indices: new Uint32Array(idx) };
  }, []);
}

const terrainMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTerrainPos;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vTerrainPos.xz;
          float broad = fbm3(p * 0.35);
          float fine = vnoise(p * 7.0);
          float blades = vnoise(vec2(p.x * 14.0, p.y * 3.0) + vnoise(p * 2.0) * 3.0);
          float grassy = smoothstep(-0.1, 0.25, vTerrainPos.y + 0.3);
          diffuseColor.rgb *= 0.9 + broad * 0.14 + fine * 0.05 + blades * 0.05 * grassy;
          // Pebbly speckle on sand / lake bed.
          float speck = step(0.92, hash12(floor(p * 9.0)));
          diffuseColor.rgb *= 1.0 - speck * 0.08 * (1.0 - grassy);
        }`,
      );
  };
  patchShader(m, { occluder: true });
  return m;
})();

function DioramaSides() {
  const { soil, water } = useMemo(() => {
    // Walk the island perimeter, emitting a vertical strip from terrain height to the bottom.
    const pts: [number, number][] = [];
    const step = 1;
    for (let x = WORLD.minX; x <= WORLD.maxX; x += step) pts.push([x, WORLD.maxZ]); // south (front)
    for (let z = WORLD.maxZ; z >= WORLD.minZ; z -= step) pts.push([WORLD.maxX, z]); // east (front)
    for (let x = WORLD.maxX; x >= WORLD.minX; x -= step) pts.push([x, WORLD.minZ]); // north
    for (let z = WORLD.minZ; z <= WORLD.maxZ; z += step) pts.push([WORLD.minX, z]); // west
    const sp: number[] = [];
    const wp: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const h0 = terrainHeight(x0, z0);
      const h1 = terrainHeight(x1, z1);
      sp.push(x0, h0, z0, x0, DIORAMA_BOTTOM, z0, x1, h1, z1, x1, h1, z1, x0, DIORAMA_BOTTOM, z0, x1, DIORAMA_BOTTOM, z1);
      if (h0 < WATER_LEVEL || h1 < WATER_LEVEL) {
        const a0 = Math.min(h0, WATER_LEVEL);
        const a1 = Math.min(h1, WATER_LEVEL);
        wp.push(x0, WATER_LEVEL, z0, x0, a0, z0, x1, WATER_LEVEL, z1, x1, WATER_LEVEL, z1, x0, a0, z0, x1, a1, z1);
      }
    }
    const soil = new THREE.BufferGeometry();
    soil.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    soil.computeVertexNormals();
    const water = new THREE.BufferGeometry();
    water.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    water.computeVertexNormals();
    return { soil, water };
  }, []);

  const soilMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSoilPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoilPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSoilPos;\n${GLSL_NOISE}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float along = vSoilPos.x + vSoilPos.z;
            float y = vSoilPos.y + vnoise(vec2(along * 0.15, 0.0)) * 0.9 + vnoise(vec2(along * 0.8, 3.0)) * 0.15;
            vec3 c1 = vec3(${new THREE.Color(palette.soil).toArray().map((v) => v.toFixed(3)).join(',')});
            vec3 c2 = vec3(${new THREE.Color(palette.soilDark).toArray().map((v) => v.toFixed(3)).join(',')});
            vec3 c3 = vec3(${new THREE.Color('#B59A80').toArray().map((v) => v.toFixed(3)).join(',')});
            float band = sin(y * 1.6) * 0.5 + 0.5;
            vec3 c = mix(c1, c3, smoothstep(0.35, 0.75, band));
            c = mix(c, c2, smoothstep(-2.5, -6.5, y));
            // Pebbles.
            vec2 cell = vec2(along * 2.2, vSoilPos.y * 2.2);
            float peb = step(0.86, hash12(floor(cell)));
            c = mix(c, vec3(0.62, 0.58, 0.55), peb * 0.35);
            diffuseColor.rgb = c * (0.92 + vnoise(cell * 1.7) * 0.12);
          }`,
        );
    };
    return m;
  }, []);

  const waterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: palette.waterDeep,
        transparent: true,
        opacity: 0.72,
        roughness: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  return (
    <>
      <mesh geometry={soil} material={soilMat} receiveShadow />
      <mesh geometry={water} material={waterMat} renderOrder={1} />
    </>
  );
}

export function Terrain() {
  const geometry = useTerrainGeometry();
  const collider = useColliderData();
  return (
    <>
      <mesh geometry={geometry} material={terrainMaterial} receiveShadow />
      <DioramaSides />
      <RigidBody type="fixed" colliders={false} collisionGroups={groups.static}>
        <TrimeshCollider args={[collider.vertices, collider.indices]} collisionGroups={groups.static} friction={0.9} />
        {/* Tunnel floor (the hill above is cut out of the collider). */}
        <CuboidCollider args={[6, 0.5, (WALL_Z - TUNNEL_END_Z) / 2 + 3]} position={[TUNNEL_X, -0.5, (WALL_Z + TUNNEL_END_Z) / 2 - 1]} collisionGroups={groups.static} />
      </RigidBody>
    </>
  );
}
