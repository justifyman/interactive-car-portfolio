// Model registry: loads the merged GLB bundles (built by scripts/build-assets.mjs),
// exposes each named model as a prototype that can be instanced or cloned.
import { useGLTF } from '@react-three/drei';
import { useMemo, type JSX } from 'react';
import * as THREE from 'three';
import { variantMaterial, type VariantOptions } from './materials';

export const BUNDLES = ['vehicles', 'town', 'nature', 'props'] as const;
export type BundleName = (typeof BUNDLES)[number];
const url = (b: BundleName) => `/models/${b}.glb`;

export function preloadBundles() {
  BUNDLES.forEach((b) => useGLTF.preload(url(b), false, true));
}

export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4; // relative to the model origin, includes baked scale
  name: string;
}

export interface ModelProto {
  name: string;
  root: THREE.Object3D;
  parts: Part[];
  box: THREE.Box3;
  size: THREE.Vector3;
}

const registry = new Map<string, ModelProto>();

function register(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  for (const root of scene.children) {
    if (registry.has(root.name)) continue;
    const parts: Part[] = [];
    const box = new THREE.Box3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const matrix = mesh.matrixWorld.clone();
      parts.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix, name: mesh.name });
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));
    });
    registry.set(root.name, { name: root.name, root, parts, box, size: box.getSize(new THREE.Vector3()) });
  }
}

/** Suspends until all bundles are loaded; returns the registry. */
export function useModelRegistry() {
  const gltfs = BUNDLES.map((b) => useGLTF(url(b), false, true));
  return useMemo(() => {
    gltfs.forEach((g) => register(g.scene));
    return registry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, gltfs);
}

export function getProto(name: string): ModelProto {
  const p = registry.get(name);
  if (!p) throw new Error(`Unknown model "${name}". Known: ${[...registry.keys()].join(', ')}`);
  return p;
}
export const hasProto = (name: string) => registry.has(name);
export const allProtoNames = () => [...registry.keys()];

export interface Placement {
  /** Full transform; when set, position/rotation/scale are ignored. */
  matrix?: THREE.Matrix4;
  position: [number, number, number];
  rotation?: number; // yaw (radians)
  scale?: number | [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function placementMatrix(pl: Placement, out = new THREE.Matrix4()) {
  if (pl.matrix) return out.copy(pl.matrix);
  _p.set(...pl.position);
  _q.setFromAxisAngle(_up, pl.rotation ?? 0);
  if (Array.isArray(pl.scale)) _s.set(...pl.scale);
  else _s.setScalar(pl.scale ?? 1);
  return out.compose(_p, _q, _s);
}

/** One draw call per model part for any number of placements. */
export function InstancedModel({
  name,
  items,
  variant,
  castShadow = true,
  receiveShadow = true,
}: {
  name: string;
  items: Placement[];
  variant?: VariantOptions;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const meshes = useMemo(() => {
    if (!items.length) return [];
    const proto = getProto(name);
    return proto.parts.map((part) => {
      const im = new THREE.InstancedMesh(part.geometry, variantMaterial(part.material, variant), items.length);
      items.forEach((it, i) => {
        placementMatrix(it, _m).multiply(part.matrix);
        im.setMatrixAt(i, _m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.name = `${name}:${part.name}`;
      return im;
    });
  }, [name, items, variant, castShadow, receiveShadow]);
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/** Flattened static copy of a model (shares geometry; cheap). */
export function Model({
  name,
  variant,
  castShadow = true,
  receiveShadow = true,
  ...props
}: { name: string; variant?: VariantOptions; castShadow?: boolean; receiveShadow?: boolean } & JSX.IntrinsicElements['group']) {
  const group = useMemo(() => buildModel(name, variant, castShadow, receiveShadow), [name, variant, castShadow, receiveShadow]);
  return <primitive object={group} {...props} />;
}

export function buildModel(name: string, variant?: VariantOptions, castShadow = true, receiveShadow = true) {
  const proto = getProto(name);
  const g = new THREE.Group();
  g.name = name;
  for (const part of proto.parts) {
    const mesh = new THREE.Mesh(part.geometry, variantMaterial(part.material, variant));
    part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.name = part.name;
    g.add(mesh);
  }
  return g;
}

/** Deep clone keeping node hierarchy (used for vehicles with separate wheels). */
export function cloneHierarchy(name: string, variant?: VariantOptions) {
  const proto = getProto(name);
  const clone = proto.root.clone(true);
  clone.position.set(0, 0, 0);
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = variantMaterial(mesh.material as THREE.Material, variant);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return clone;
}
