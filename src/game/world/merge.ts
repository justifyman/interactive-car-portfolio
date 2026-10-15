// Merges static placements into spatial chunks, one mesh per (chunk, material,
// variant). Far fewer draw calls than per-model instancing, and per-chunk
// frustum culling works for both the camera and the shadow pass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getProto, placementMatrix, type Placement } from '../assets';
import { variantMaterial, type VariantOptions } from '../materials';

const CHUNK = 28;
const floatCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** De-quantized, non-interleaved float copy with a consistent attribute set. */
function toFloat(src: THREE.BufferGeometry) {
  const hit = floatCache.get(src);
  if (hit) return hit;
  const g = new THREE.BufferGeometry();
  const count = src.attributes.position.count;
  const copy = (name: string, size: number) => {
    const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    const out = new Float32Array(count * size);
    if (a) {
      for (let i = 0; i < count; i++) {
        out[i * size] = a.getX(i);
        if (size > 1) out[i * size + 1] = a.getY(i);
        if (size > 2) out[i * size + 2] = a.getZ(i);
      }
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  copy('position', 3);
  copy('normal', 3);
  copy('uv', 2);
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  else g.setIndex(Array.from({ length: count }, (_, i) => i));
  if (!src.getAttribute('normal')) g.computeVertexNormals();
  floatCache.set(src, g);
  return g;
}

export interface MergeItem {
  model: string;
  placement: Placement;
  variant: string;
}

export interface MergedMesh {
  mesh: THREE.Mesh;
  variant: string;
}

export function buildMergedChunks(items: MergeItem[], variants: Record<string, VariantOptions>, castShadowFor: (variant: string) => boolean) {
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; material: THREE.Material; variant: string }>();
  const m = new THREE.Matrix4();
  for (const it of items) {
    const proto = getProto(it.model);
    const pm = placementMatrix(it.placement);
    const px = pm.elements[12];
    const pz = pm.elements[14];
    const baseY = pm.elements[13];
    const chunk = `${Math.floor(px / CHUNK)},${Math.floor(pz / CHUNK)}`;
    for (const part of proto.parts) {
      const key = `${chunk}|${part.material.uuid}|${it.variant}`;
      let b = buckets.get(key);
      if (!b) {
        b = { geos: [], material: part.material, variant: it.variant };
        buckets.set(key, b);
      }
      const g = toFloat(part.geometry).clone();
      m.multiplyMatrices(pm, part.matrix);
      g.applyMatrix4(m);
      // Flip winding for mirrored transforms so faces stay outward.
      if (m.determinant() < 0 && g.index) {
        const ix = g.index;
        for (let i = 0; i < ix.count; i += 3) {
          const t = ix.getX(i + 1);
          ix.setX(i + 1, ix.getX(i + 2));
          ix.setX(i + 2, t);
        }
      }
      g.setAttribute('aBaseY', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(baseY), 1));
      b.geos.push(g);
    }
  }
  const out: MergedMesh[] = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, variantMaterial(b.material, { ...variants[b.variant], mergedBase: true }));
    mesh.castShadow = castShadowFor(b.variant);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.push({ mesh, variant: b.variant });
  }
  return out;
}
