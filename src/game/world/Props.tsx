// Knockable props: dynamic rigid bodies that tumble when hit, settle, and quietly
// respawn in place later if they were knocked far away.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { content } from '../../content';
import { buildModel, getProto } from '../assets';
import { sfx } from '../audio/audio';
import { emitDust } from '../fx/fxBus';
import { groups, PRIORITY } from '../physics';
import { runtime } from '../store';
import { FONT } from './Signs';
import { LOOP, TUNNEL_X } from './roads';
import { WALL_Z } from './terrain';

type Shape = 'box' | 'cyl';
interface PropDef {
  model: string;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  shape?: Shape;
  density?: number;
  label?: string;
}

const S_ROAD = LOOP.hz;

// Hand-placed knockables, grouped by location.
const PROPS: PropDef[] = [
  // Construction corner by the tunnel.
  { model: 'traffic-cone', x: TUNNEL_X + 5.0, z: WALL_Z + 5, shape: 'cyl', density: 0.35 },
  { model: 'traffic-cone', x: TUNNEL_X + 5.6, z: WALL_Z + 6.4, shape: 'cyl', density: 0.35 },
  { model: 'traffic-cone', x: TUNNEL_X + 6.2, z: WALL_Z + 7.8, shape: 'cyl', density: 0.35 },
  { model: 'barrier', x: TUNNEL_X + 7.8, z: WALL_Z + 6, yaw: 0.2, density: 0.5 },
  { model: 'construction-light', x: TUNNEL_X - 5.8, z: WALL_Z + 3.6, shape: 'cyl', density: 0.4 },
  { model: 'road-sign-warning', x: TUNNEL_X - 5.6, z: WALL_Z + 7.5, yaw: Math.PI / 4, density: 0.4 },
  // Workshop yard.
  { model: 'crate', x: 19.2, z: -36.8, density: 0.5 },
  { model: 'crate', x: 20.3, z: -36.6, yaw: 0.3, density: 0.5 },
  { model: 'crate', x: 19.7, z: -36.7, y: 1.0, yaw: 0.6, density: 0.5 },
  { model: 'cone', x: 21.5, z: -29.2, shape: 'cyl', density: 0.3 },
  { model: 'cone', x: 26.5, z: -29.2, shape: 'cyl', density: 0.3 },
  { model: 'barrel-b', x: 29.4, z: -36.2, shape: 'cyl', density: 0.6 },
  // Café & plaza.
  { model: 'shopping-cart', x: -15.4, z: -15.2, yaw: 0.6, density: 0.4 },
  { model: 'trashcan', x: 6.2, z: -9.6, shape: 'cyl', density: 0.4 },
  { model: 'trashcan', x: -6.2, z: 9.0, shape: 'cyl', density: 0.4 },
  { model: 'trashcan', x: -14.4, z: -3.8, shape: 'cyl', density: 0.4 },
  { model: 'bucket', x: -16.8, z: -12.5, shape: 'cyl', density: 0.3 },
  // Tool shed yard.
  { model: 'barrel', x: -17.6, z: S_ROAD + 16.4, shape: 'cyl', density: 0.7 },
  { model: 'barrel', x: -16.8, z: S_ROAD + 17.2, shape: 'cyl', density: 0.7 },
  { model: 'barrel-b', x: -18.6, z: S_ROAD + 17.0, shape: 'cyl', density: 0.6 },
  { model: 'box-open', x: -6.0, z: S_ROAD + 15.6, density: 0.4 },
  { model: 'bucket', x: -7.2, z: S_ROAD + 16.2, shape: 'cyl', density: 0.3 },
  // Post office parcels.
  { model: 'box', x: LOOP.hx + 9.2, z: -5.0, density: 0.35 },
  { model: 'box', x: LOOP.hx + 9.9, z: -5.4, yaw: 0.4, density: 0.35 },
  { model: 'box', x: LOOP.hx + 9.5, z: -5.2, y: 0.8, yaw: 0.9, density: 0.35 },
  { model: 'box-large', x: LOOP.hx + 15.6, z: -4.6, yaw: 1.2, density: 0.35 },
  // Houses.
  { model: 'trashcan', x: 19.6, z: -8.2, shape: 'cyl', density: 0.4 },
  { model: 'trashcan', x: 20.8, z: 8.2, shape: 'cyl', density: 0.4 },
  { model: 'trashcan', x: -47, z: -8.8, shape: 'cyl', density: 0.4 },
];

// Skill crates: a pyramid in the tool-shed yard, one labelled crate per skill.
const CRATE = 1.0;
function skillCrates(): PropDef[] {
  const out: PropDef[] = [];
  const names = content.skills.map((s) => s.name);
  const rows: number[] = [];
  let left = names.length;
  let width = Math.min(5, Math.ceil(Math.sqrt(names.length * 2)));
  while (left > 0) {
    const n = Math.min(width, left);
    rows.push(n);
    left -= n;
    width = Math.max(1, width - 1);
  }
  const cx = -10.5;
  const cz = S_ROAD + 12.8;
  let k = 0;
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * (CRATE + 0.04);
      out.push({ model: 'crate', x: cx + offset * 0.707, z: cz - offset * 0.707, y: row * (CRATE + 0.01) + 0.01, yaw: -Math.PI / 4, density: 0.45, label: names[k++] });
    }
  });
  return out;
}

const _q = new THREE.Quaternion();

function KnockProp({ def }: { def: PropDef }) {
  const body = useRef<RapierRigidBody>(null);
  const restT = useRef(0);
  const { object, half, center } = useMemo(() => {
    const p = getProto(def.model);
    const object = buildModel(def.model, { occluder: false });
    const c = p.box.getCenter(new THREE.Vector3());
    // Centre the visual on the body origin so it tumbles naturally.
    object.position.set(-c.x, -c.y, -c.z);
    return { object, half: p.size.clone().multiplyScalar(0.5), center: c };
  }, [def.model]);
  const home = useMemo(
    () => ({
      pos: new THREE.Vector3(def.x, (def.y ?? 0) + center.y + 0.02, def.z),
      rot: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.yaw ?? 0),
    }),
    [def, center],
  );

  // Respawn check, a few times per second.
  useFrame((_, dt) => {
    const b = body.current;
    if (!b) return;
    const t = b.translation();
    const away = Math.hypot(t.x - home.pos.x, t.z - home.pos.z);
    const r = b.rotation();
    const tipped = _q.set(r.x, r.y, r.z, r.w).angleTo(home.rot) > 0.6;
    const resting = b.isSleeping() || b.linvel().y ** 2 + b.linvel().x ** 2 + b.linvel().z ** 2 < 0.01;
    if ((away > 1.2 || tipped) && resting) restT.current += dt;
    else restT.current = 0;
    const carFar = runtime.carPosition.distanceTo(home.pos) > 14;
    if ((restT.current > 9 && carFar) || t.y < -4) {
      b.setTranslation(home.pos, true);
      b.setRotation(home.rot, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      b.sleep();
      restT.current = 0;
    }
  }, PRIORITY.world);

  const hx = Math.max(0.08, half.x * 0.95);
  const hy = Math.max(0.08, half.y * 0.98);
  const hz = Math.max(0.08, half.z * 0.95);
  return (
    <RigidBody
      ref={body}
      position={home.pos.toArray()}
      quaternion={home.rot.toArray() as [number, number, number, number]}
      colliders={false}
      collisionGroups={groups.props}
      linearDamping={0.25}
      angularDamping={0.35}
      canSleep
      onCollisionEnter={(e) => {
        if (e.other.rigidBody?.handle === runtime.carBodyHandle) {
          const sp = Math.abs(runtime.carSpeed);
          if (sp > 2) {
            sfx.knock(Math.min(1, sp / 14));
            const t = body.current!.translation();
            emitDust(t.x, t.y, t.z, 0.6);
          }
        }
      }}
    >
      {def.shape === 'cyl' ? (
        <CylinderCollider args={[hy, Math.max(hx, hz)]} density={def.density ?? 0.5} friction={0.7} restitution={0.25} collisionGroups={groups.props} />
      ) : (
        <CuboidCollider args={[hx, hy, hz]} density={def.density ?? 0.5} friction={0.7} restitution={0.2} collisionGroups={groups.props} />
      )}
      <primitive object={object} />
      {def.label && (
        <>
          <Text font={FONT} position={[0, 0.05, hz + 0.012]} fontSize={0.16} maxWidth={0.86} textAlign="center" color="#FFF6E6" outlineWidth={0.012} outlineColor="#5A4636" anchorX="center" anchorY="middle">
            {def.label}
          </Text>
          <Text font={FONT} position={[hx + 0.012, 0.05, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.16} maxWidth={0.86} textAlign="center" color="#FFF6E6" outlineWidth={0.012} outlineColor="#5A4636" anchorX="center" anchorY="middle">
            {def.label}
          </Text>
        </>
      )}
    </RigidBody>
  );
}

export function Props() {
  const all = useMemo(() => [...PROPS, ...skillCrates()], []);
  return (
    <>
      {all.map((d, i) => (
        <KnockProp key={i} def={d} />
      ))}
    </>
  );
}
