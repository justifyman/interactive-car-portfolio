// Shared car rigging: clones a vehicle model and re-parents its wheels onto
// pivot groups (steer about Y, spin about X) and the body onto a lean pivot.
import * as THREE from 'three';
import { cloneHierarchy } from '../assets';

const WHEEL_ORDER = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'] as const;

export interface WheelVisual {
  pivot: THREE.Group; // positioned at wheel centre, steers (Y) and spins (X)
  spin: THREE.Group;
  connection: THREE.Vector3;
  radius: number;
  front: boolean;
}

export function prepareCar(skin: string) {
  const model = cloneHierarchy(skin, { occluder: false });
  model.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.add(model);
  root.updateMatrixWorld(true);

  const findByPrefix = (prefix: string) => {
    let hit: THREE.Object3D | undefined;
    model.traverse((o) => {
      if (!hit && (o.name === prefix || o.name.startsWith(prefix + '_') || o.name.replace(/_\d+$/, '') === prefix)) hit = o;
    });
    return hit;
  };

  const wheels: WheelVisual[] = [];
  for (const name of WHEEL_ORDER) {
    const obj = findByPrefix(name);
    if (!obj) continue;
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    pivot.position.copy(center);
    pivot.add(spin);
    root.add(pivot);
    pivot.updateMatrixWorld(true);
    spin.attach(obj); // keeps world transform, now spins about the wheel centre
    wheels.push({ pivot, spin, connection: center.clone(), radius: (box.max.y - box.min.y) / 2, front: name.includes('front') });
  }
  const body = findByPrefix('body') ?? model;
  const bodyBox = new THREE.Box3().setFromObject(body);
  // Lean pivot near the bottom centre of the body.
  const leanPivot = new THREE.Group();
  leanPivot.position.set(0, bodyBox.min.y + 0.2, 0);
  root.add(leanPivot);
  leanPivot.updateMatrixWorld(true);
  leanPivot.attach(model);
  return { root, wheels, leanPivot, bodyBox };
}

