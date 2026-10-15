// Renders the static town (instanced) and all of its colliders.
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { canvasTexture } from '../materials';
import { palette } from '../palette';
import { groups } from '../physics';
import { useGame } from '../store';
import { buildStaticWorld, VARIANTS, type ColliderDesc, type Lamp } from './staticWorld';
import { buildMergedChunks } from './merge';

export const StaticColliders = memo(function StaticColliders({ list }: { list: ColliderDesc[] }) {
  return (
    <RigidBody type="fixed" colliders={false} collisionGroups={groups.static}>
      {list.map((c, i) =>
        c.kind === 'box' ? (
          <CuboidCollider key={i} args={c.half} position={c.pos} rotation={[0, c.yaw, 0]} collisionGroups={groups.static} friction={0.5} restitution={0.2} />
        ) : (
          <CylinderCollider key={i} args={[c.hh, c.r]} position={c.pos} collisionGroups={groups.static} friction={0.5} restitution={0.2} />
        ),
      )}
    </RigidBody>
  );
});

function LampGlow({ lamps }: { lamps: Lamp[] }) {
  const quality = useGame((s) => s.quality);
  const { bulbs, pools } = useMemo(() => {
    const bulbGeo = new THREE.SphereGeometry(0.17, 12, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.lampGlow).multiplyScalar(2.2), toneMapped: false });
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lamps.length);
    const poolTex = canvasTexture('lamp-pool', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,214,150,0.9)');
      g.addColorStop(0.5, 'rgba(255,200,140,0.35)');
      g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    const poolGeo = new THREE.PlaneGeometry(5, 5);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      bulbs.setMatrixAt(i, m.makeTranslation(l.x, l.y, l.z));
      pools.setMatrixAt(i, m.makeTranslation(l.x, 0.06, l.z));
    });
    bulbs.computeBoundingSphere();
    pools.computeBoundingSphere();
    pools.renderOrder = 2;
    return { bulbs, pools };
  }, [lamps]);
  return (
    <>
      <primitive object={bulbs} />
      {quality !== 'low' && <primitive object={pools} />}
    </>
  );
}

const PUFFS_PER = 9;
function ChimneySmoke({ points }: { points: THREE.Vector3[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = points.length * PUFFS_PER;
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.42, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#EAE4DA', roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const im = ref.current;
    if (!im) return;
    const t = clock.elapsedTime;
    points.forEach((p, ci) => {
      for (let k = 0; k < PUFFS_PER; k++) {
        const life = ((t * 0.32 + k / PUFFS_PER + ci * 0.37) % 1 + 1) % 1;
        v.set(p.x + life * 1.6 + Math.sin(t + k) * 0.15, p.y + life * 3.6, p.z - life * 0.8);
        const sc = Math.sin(Math.min(1, life * 1.15) * Math.PI) * (0.5 + life * 1.1);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, k * 1.7 + life * 2);
        im.setMatrixAt(ci * PUFFS_PER + k, m.compose(v, q, s.setScalar(Math.max(0.001, sc))));
      }
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}

export function Town() {
  const world = useMemo(() => buildStaticWorld(), []);
  const meshes = useMemo(() => buildMergedChunks(world.items, VARIANTS, (v) => v !== 'grass'), [world]);
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.mesh.uuid} object={m.mesh} />
      ))}
      <StaticColliders list={world.colliders} />
      <LampGlow lamps={world.lamps} />
      <ChimneySmoke points={world.chimneys} />
    </>
  );
}
