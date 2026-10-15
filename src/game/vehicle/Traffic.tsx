// Light AI traffic: 1–2 cars arrive through the tunnel, potter around the loop for
// a few laps at a calm pace, and leave again. They are dynamic bodies, so the
// player can bump them; they wobble, then steer themselves back onto the road.
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, RoundCuboidCollider, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CoefficientCombineRule } from '@dimforge/rapier3d-compat';
import { sfx } from '../audio/audio';
import { canvasTexture, patchShader } from '../materials';
import { groups, PRIORITY } from '../physics';
import { runtime } from '../store';
import { loop, tunnelSpur, LANE_OFFSET, TUNNEL_X, RoadPath } from '../world/roads';
import { WALL_Z } from '../world/terrain';
import { prepareCar } from './carModel';

const AI_MODELS = ['van', 'taxi', 'truck', 'delivery', 'suv', 'hatchback-sports'];
const LOOP_SPEED = 7.2;
const SPUR_SPEED = 6;
const GATE_Z = WALL_Z + 2.4;

type Phase = 'enter' | 'loop' | 'exit';
interface AISpec {
  key: number;
  model: string;
  dir: 1 | -1;
  phase: Phase;
  s: number;
  laps: number;
}

/** Live positions of AI cars (for mutual avoidance and the tunnel gate). */
const aiRegistry = new Map<number, { pos: THREE.Vector3; fwd: THREE.Vector3 }>();
(window as unknown as { __game: Record<string, unknown> }).__game.traffic = aiRegistry;
const sJunction = loop.nearest(new THREE.Vector3(TUNNEL_X, 0, -24)).s;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function wrapDelta(a: number, b: number, L: number) {
  let d = (b - a) % L;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

function AICar({ spec, onDone }: { spec: AISpec; onDone: (key: number) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const car = useMemo(() => prepareCar(spec.model), [spec.model]);
  const st = useRef({
    phase: spec.phase,
    s: spec.s,
    remaining: spec.laps * loop.length,
    stun: 0,
    blocked: 0,
    lastHonk: 0,
    stuck: 0,
    laneShift: 0,
    wobble: new THREE.Vector2(),
    wobbleV: new THREE.Vector2(),
    spin: 0,
    done: false,
  });
  const { world } = useRapier();

  const startPose = useMemo(() => {
    const path = spec.phase === 'loop' ? loop : tunnelSpur;
    const travelDir = spec.phase === 'enter' ? -1 : spec.phase === 'loop' ? spec.dir : 1;
    const { p, t } = path.at(spec.s);
    const tt = t.clone().multiplyScalar(travelDir);
    const right = new THREE.Vector3(-tt.z, 0, tt.x);
    p.addScaledVector(right, LANE_OFFSET);
    return { pos: [p.x, 0.25, p.z] as [number, number, number], yaw: Math.atan2(tt.x, tt.z) };
  }, [spec]);

  useEffect(() => () => void aiRegistry.delete(spec.key), [spec.key]);

  useBeforePhysicsStep(() => {
    const b = body.current;
    const s = st.current;
    if (!b || s.done) return;
    const dt = world.timestep;
    const t = b.translation();
    const pos = _v.set(t.x, t.y, t.z).clone();
    const r = b.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
    aiRegistry.set(spec.key, { pos, fwd });

    // Which path, and which way along it.
    let path: RoadPath = loop;
    let travel = 1;
    if (s.phase === 'loop') travel = spec.dir;
    else {
      path = tunnelSpur;
      travel = s.phase === 'enter' ? -1 : 1;
    }

    // Track progress by re-projecting onto the path near the current s.
    const near = path.nearest(pos);
    if (path.closed) {
      const d = wrapDelta(s.s, near.s, path.length);
      if (Math.abs(d) < 12) {
        if (s.phase === 'loop') s.remaining -= d * travel;
        s.s = near.s;
      }
    } else s.s = near.s;

    // Phase transitions.
    if (s.phase === 'enter' && s.s < 5.5) {
      s.phase = 'loop';
      s.s = sJunction;
      return;
    }
    if (s.phase === 'loop' && s.remaining <= 0) {
      const toJ = wrapDelta(s.s, sJunction, loop.length) * travel;
      if (toJ > 0 && toJ < 7) {
        s.phase = 'exit';
        s.s = 0;
        return;
      }
    }
    if (s.phase === 'exit' && s.s > tunnelSpur.length - 4.5) {
      s.done = true;
      onDone(spec.key);
      return;
    }

    // Target: a look-ahead point in the right-hand lane.
    const ahead = 5.5;
    const { p: tp, t: tt } = path.at(s.s + ahead * travel);
    tt.multiplyScalar(travel);
    const right = new THREE.Vector3(-tt.z, 0, tt.x);
    tp.addScaledVector(right, LANE_OFFSET + s.laneShift);
    const toT = tp.sub(pos).setY(0);
    const desiredYaw = Math.atan2(toT.x, toT.z);
    const yaw = Math.atan2(fwd.x, fwd.z);
    let err = desiredYaw - yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));

    // Speed: calm cruising, slower into corners and at junctions.
    let speed = s.phase === 'loop' ? LOOP_SPEED : SPUR_SPEED;
    const turn = path.turnAhead(s.s, 12 * travel);
    speed *= 1 - Math.min(0.32, turn * 0.36);
    if (Math.abs(err) > 0.5) speed *= 0.55;
    // Ease off for the junction turns in and out of the tunnel road.
    if (s.phase === 'enter' && s.s < 12) speed = Math.min(speed, 3.2);
    if (s.phase === 'loop' && s.remaining <= loop.length * 0.08) {
      const toJ = wrapDelta(s.s, sJunction, loop.length) * travel;
      if (toJ > 0 && toJ < 16) speed = Math.min(speed, 3.4);
    }
    if (s.phase === 'loop' && Math.abs(wrapDelta(s.s, sJunction, loop.length)) < 6 && Math.abs(err) > 0.3) speed = Math.min(speed, 3.4);

    // Yield to the player and other AI cars ahead.
    let yieldF = 1;
    let blockedByPlayer = false;
    const right2 = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const check = (o: THREE.Vector3, isPlayer: boolean) => {
      const d = o.clone().sub(pos).setY(0);
      const along = d.dot(fwd);
      const lat = Math.abs(d.dot(right2));
      if (along > 0 && along < 9.5 && lat < 2.3) {
        const f = THREE.MathUtils.clamp((along - 3.4) / 5.5, 0, 1);
        if (f < yieldF) {
          yieldF = f;
          blockedByPlayer = isPlayer;
        }
      }
    };
    check(runtime.carPosition, true);
    aiRegistry.forEach((o, k) => k !== spec.key && check(o.pos, false));
    // Tunnel gate: wait until it's up.
    if (gateState.angle < 1.1 && Math.abs(pos.x - TUNNEL_X) < 5) {
      const dz = (GATE_Z - pos.z) * Math.sign(fwd.z || 1);
      if (dz > 0 && dz < 6) yieldF = Math.min(yieldF, THREE.MathUtils.clamp((dz - 2.2) / 4, 0, 1));
    }
    speed *= yieldF;

    // Blocked by the player: wait, honk softly, then try to swerve around.
    if (blockedByPlayer && yieldF < 0.25) {
      s.blocked += dt;
      if (s.blocked > 2.4 && runtime.elapsed - s.lastHonk > 4 && pos.distanceTo(runtime.carPosition) < 14) {
        sfx.horn(false, true);
        s.lastHonk = runtime.elapsed;
      }
      if (s.blocked > 3.5) {
        const side = runtime.carPosition.clone().sub(pos).dot(right2) > 0 ? -1 : 1;
        s.laneShift = THREE.MathUtils.lerp(s.laneShift, side * 2.6, dt * 1.5);
      }
    } else {
      s.blocked = Math.max(0, s.blocked - dt * 2);
      s.laneShift = THREE.MathUtils.lerp(s.laneShift, 0, dt * 0.8);
    }

    // Drive: blend velocity toward the desired heading/speed (impacts still push us).
    s.stun = Math.max(0, s.stun - dt);
    const gain = s.stun > 0 ? 0.6 : 5;
    const lv = b.linvel();
    const desired = fwd.clone().multiplyScalar(speed);
    const k = Math.min(1, dt * gain);
    b.setLinvel({ x: lv.x + (desired.x - lv.x) * k, y: lv.y, z: lv.z + (desired.z - lv.z) * k }, true);
    const av = b.angvel();
    const wantAv = THREE.MathUtils.clamp(err * 4.2, -2.4, 2.4) * Math.min(1, 0.35 + Math.hypot(lv.x, lv.z) / 3);
    b.setAngvel({ x: 0, y: av.y + (wantAv - av.y) * Math.min(1, dt * (s.stun > 0 ? 1.5 : 8)), z: 0 }, true);

    // Hopelessly stuck (e.g. wedged) → quietly leave and let a new car come.
    if (Math.hypot(lv.x, lv.z) < 0.4 && !blockedByPlayer && yieldF > 0.5) s.stuck += dt;
    else s.stuck = 0;
    if ((s.stuck > 8 && pos.distanceTo(runtime.carPosition) > 18) || pos.y < -5) {
      s.done = true;
      onDone(spec.key);
    }
    s.spin += (b.linvel().x * fwd.x + b.linvel().z * fwd.z) * dt / 0.3;
  });

  useFrame((_, delta) => {
    const s = st.current;
    const dt = Math.min(delta, 1 / 20);
    // Spring wobble (roll/pitch) for a cartoony reaction to bumps and turns.
    s.wobbleV.x += (-s.wobble.x * 90 - s.wobbleV.x * 7) * dt;
    s.wobbleV.y += (-s.wobble.y * 90 - s.wobbleV.y * 7) * dt;
    s.wobble.addScaledVector(s.wobbleV, dt);
    car.leanPivot.rotation.z = s.wobble.x;
    car.leanPivot.rotation.x = s.wobble.y;
    const steer = THREE.MathUtils.clamp((body.current?.angvel().y ?? 0) * 0.25, -0.45, 0.45);
    car.wheels.forEach((w) => {
      w.spin.rotation.x = s.spin;
      if (w.front) w.pivot.rotation.y = steer;
    });
  }, PRIORITY.vehicles);

  return (
    <RigidBody
      ref={body}
      position={startPose.pos}
      rotation={[0, startPose.yaw, 0]}
      colliders={false}
      enabledRotations={[false, true, false]}
      linearDamping={0.1}
      angularDamping={1.2}
      canSleep={false}
      collisionGroups={groups.ai}
      onContactForce={(e) => {
        const f = e.totalForceMagnitude;
        if (f < 60) return;
        const s = st.current;
        s.stun = Math.min(1.6, s.stun + f / 600);
        s.wobbleV.x += (Math.random() - 0.5) * Math.min(3, f / 150);
        s.wobbleV.y += (Math.random() - 0.5) * Math.min(2, f / 220);
      }}
    >
      <RoundCuboidCollider args={[0.6, 0.34, 1.15, 0.12]} position={[0, 0.47, 0]} density={1.4} friction={0} frictionCombineRule={CoefficientCombineRule.Min} restitution={0.2} collisionGroups={groups.ai} />
      <group ref={visual}>
        <primitive object={car.root} />
      </group>
    </RigidBody>
  );
}

// ── Tunnel gate (boom barrier) ───────────────────────────────────────────────
const gateState = { angle: 0 };

function TunnelGate() {
  const arm = useRef<RapierRigidBody>(null);
  const light = useRef<THREE.MeshBasicMaterial>(null);
  const pivot: [number, number, number] = [TUNNEL_X + 4.1, 1.05, GATE_Z];
  const stripes = useMemo(
    () =>
      canvasTexture('gate-stripes', 256, 16, (ctx) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#F2E8D8' : '#B5706B';
          ctx.fillRect(i * 32, 0, 32, 16);
        }
      }),
    [],
  );
  const armMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 });
    patchShader(m, { occluder: true });
    return m;
  }, [stripes]);
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#E3D5C1', roughness: 0.8 }), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ clock }, delta) => {
    let want = 0;
    aiRegistry.forEach((o) => {
      if (Math.abs(o.pos.x - TUNNEL_X) < 7 && o.pos.z > GATE_Z - 16 && o.pos.z < GATE_Z + 13) want = 1.35;
    });
    // Never drop the arm onto the player.
    const p = runtime.carPosition;
    if (gateState.angle > 0.2 && Math.abs(p.x - TUNNEL_X) < 6 && Math.abs(p.z - GATE_Z) < 3.2) want = Math.max(want, gateState.angle);
    const speed = 1.6 * Math.min(delta, 0.05);
    gateState.angle += THREE.MathUtils.clamp(want - gateState.angle, -speed, speed);
    arm.current?.setNextKinematicRotation(q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -gateState.angle));
    if (light.current) {
      const moving = Math.abs(want - gateState.angle) > 0.01 || want > 0;
      light.current.color.set(moving && Math.sin(clock.elapsedTime * 10) > 0 ? '#FFC98A' : '#8E6E58');
    }
  }, PRIORITY.world);

  return (
    <>
      <RoundedBox args={[0.55, 1.4, 0.55]} radius={0.08} position={[pivot[0], 0.7, pivot[2]]} material={postMat} castShadow />
      <mesh position={[pivot[0], 1.48, pivot[2]]}>
        <sphereGeometry args={[0.14, 12, 8]} />
        <meshBasicMaterial ref={light} color="#8E6E58" toneMapped={false} />
      </mesh>
      <RigidBody ref={arm} type="kinematicPosition" position={pivot} colliders={false} collisionGroups={groups.static}>
        <CuboidCollider args={[3.85, 0.14, 0.14]} position={[-3.95, 0, 0]} collisionGroups={groups.static} />
        <RoundedBox args={[7.9, 0.3, 0.3]} radius={0.09} position={[-3.95, 0, 0]} material={armMat} castShadow />
        <RoundedBox args={[0.9, 0.55, 0.08]} radius={0.05} position={[-4.0, -0.48, 0.0]} material={postMat} castShadow />
      </RigidBody>
    </>
  );
}

// ── Traffic manager ──────────────────────────────────────────────────────────
let nextKey = 1;
const pickModel = (avoid?: string) => {
  const opts = AI_MODELS.filter((m) => m !== avoid);
  return opts[Math.floor(Math.random() * opts.length)];
};
const randomLaps = () => 1 + Math.floor(Math.random() * 3);

export function Traffic() {
  const [cars, setCars] = useState<AISpec[]>(() => {
    // One car already pottering around the far side of the loop at start.
    const startS = (sJunction + loop.length * 0.55) % loop.length;
    return [{ key: nextKey++, model: pickModel(), dir: 1, phase: 'loop', s: startS, laps: randomLaps() }];
  });
  const timer = useRef(5 + Math.random() * 4);

  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 7 + Math.random() * 12;
    setCars((cs) => {
      // Sometimes keep it to a single car so traffic doesn't feel like clockwork.
      if (cs.length >= 2 || (cs.length === 1 && Math.random() < 0.3)) return cs;
      return [...cs, { key: nextKey++, model: pickModel(cs[0]?.model), dir: Math.random() < 0.6 ? 1 : -1, phase: 'enter', s: tunnelSpur.length - 2.5, laps: randomLaps() }];
    });
  }, PRIORITY.world);

  const remove = (key: number) => setCars((cs) => cs.filter((c) => c.key !== key));

  return (
    <>
      {cars.map((c) => (
        <AICar key={c.key} spec={c} onDone={remove} />
      ))}
      <TunnelGate />
    </>
  );
}
