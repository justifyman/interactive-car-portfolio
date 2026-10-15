// The player's car: Rapier ray-cast vehicle with arcade tuning.
// Suspension, steering and drifting come from the vehicle controller; a few
// "assists" (upright torque, drift yaw, speed caps) keep it playful, not sim.
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  RoundCuboidCollider,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { prepareCar } from './carModel';
import { input, onAction, readAxes } from '../input';
import { PRIORITY, groups } from '../physics';
import { runtime, useGame } from '../store';
import { sfx } from '../audio/audio';
import { emitDust, emitSkid } from '../fx/fxBus';
import { nearestRoadPoint, SPAWN } from '../world/layout';

export const CAR_SKINS = ['sedan', 'sedan-sports', 'hatchback-sports', 'police'];

const TUNE = {
  mass: 4,
  com: new THREE.Vector3(0, 0.32, 0.05),
  restLength: 0.34,
  stiffness: 32,
  compression: 2.6,
  relaxation: 3.4,
  maxTravel: 0.28,
  frictionSlip: 2.4,
  sideFriction: 1.15,
  driftRearSlip: 1.0,
  driftRearSide: 0.45,
  engine: 15, // per driven wheel
  reverseEngine: 9,
  brake: 0.32,
  handbrake: 0.05,
  coast: 0.012,
  maxSpeed: 16,
  boostSpeed: 19,
  maxReverse: 6,
  steerLow: 0.62,
  steerHigh: 0.17,
  steerRate: 5.5,
  uprightTorque: 2.2,
  driftYaw: 0.5,
  driftCarry: 0.22, // how quickly the slide's direction follows the nose (lower = longer slides)
  maxSlip: 0.75, // radians of slide before the car straightens itself (arcade assist)
};

export function PlayerCar() {
  const skinIndex = useGame((s) => s.carSkin);
  const skin = CAR_SKINS[skinIndex % CAR_SKINS.length];
  const bodyRef = useRef<RapierRigidBody>(null);
  const vehicleRef = useRef<DynamicRayCastVehicleController | null>(null);
  const visualRef = useRef<THREE.Group>(null);
  const { world } = useRapier();
  const car = useMemo(() => prepareCar(skin), [skin]);
  const state = useRef({
    steer: 0,
    flippedFor: 0,
    lean: new THREE.Vector2(),
    leanVel: new THREE.Vector2(),
    prevVel: new THREE.Vector3(),
    wheelSpin: [0, 0, 0, 0],
    lastSkid: 0,
    driftDir: new THREE.Vector2(),
    driftOn: false,
  });

  // Build the vehicle controller once the rigid body exists.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setAdditionalMassProperties(
      TUNE.mass,
      TUNE.com,
      { x: TUNE.mass * 0.75, y: TUNE.mass * 0.9, z: TUNE.mass * 0.35 },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    const v = world.createVehicleController(body);
    v.indexUpAxis = 1;
    v.setIndexForwardAxis = 2;
    car.wheels.forEach((w, i) => {
      const conn = { x: w.connection.x, y: w.connection.y + TUNE.restLength - 0.069, z: w.connection.z };
      v.addWheel(conn, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, TUNE.restLength, w.radius);
      v.setWheelSuspensionStiffness(i, TUNE.stiffness);
      v.setWheelSuspensionCompression(i, TUNE.compression);
      v.setWheelSuspensionRelaxation(i, TUNE.relaxation);
      v.setWheelMaxSuspensionTravel(i, TUNE.maxTravel);
      v.setWheelMaxSuspensionForce(i, 1e5);
      v.setWheelFrictionSlip(i, TUNE.frictionSlip);
      v.setWheelSideFrictionStiffness(i, TUNE.sideFriction);
    });
    vehicleRef.current = v;
    runtime.carBodyHandle = body.handle;
    return () => {
      world.removeVehicleController(v);
      vehicleRef.current = null;
    };
  }, [world, car]);

  const resetCar = (inPlace: boolean) => {
    const body = bodyRef.current;
    if (!body) return;
    const t = body.translation();
    const p = new THREE.Vector3(t.x, t.y, t.z);
    let yaw = runtime.carYaw;
    if (!inPlace) {
      const r = nearestRoadPoint(p);
      p.copy(r.position);
      yaw = Math.atan2(r.tangent.x, r.tangent.z);
    }
    body.setTranslation({ x: p.x, y: Math.max(p.y, 0) + 1.2, z: p.z }, true);
    body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.current.flippedFor = 0;
  };

  useEffect(() => {
    runtime.teleport = (x, z, yaw = runtime.carYaw) => {
      const body = bodyRef.current;
      if (!body) return;
      body.setTranslation({ x, y: 1.2, z }, true);
      body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    };
    const offReset = onAction('reset', () => resetCar(false));
    const offHorn = onAction('horn', () => sfx.horn(useGame.getState().eggFound));
    const offCycle = onAction('cycleCar', () => {
      if (useGame.getState().eggFound) useGame.getState().cycleCar();
    });
    return () => {
      offReset();
      offHorn();
      offCycle();
    };
  }, []);

  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _up = useMemo(() => new THREE.Vector3(), []);
  const _fwd = useMemo(() => new THREE.Vector3(), []);

  useBeforePhysicsStep(() => {
    const v = vehicleRef.current;
    const body = bodyRef.current;
    if (!v || !body) return;
    const dt = world.timestep;
    const s = state.current;
    const paused = useGame.getState().openPanel !== null || useGame.getState().mode !== 'game';
    const { throttle, steer } = paused ? { throttle: 0, steer: 0 } : readAxes();
    const speed = v.currentVehicleSpeed();
    const absSpeed = Math.abs(speed);

    // Steering: fast response, reduced lock at speed.
    const lock = THREE.MathUtils.lerp(TUNE.steerLow, TUNE.steerHigh, Math.min(1, absSpeed / TUNE.maxSpeed));
    const target = steer * lock;
    s.steer += THREE.MathUtils.clamp(target - s.steer, -TUNE.steerRate * dt, TUNE.steerRate * dt);
    v.setWheelSteering(0, s.steer);
    v.setWheelSteering(1, s.steer);

    // Throttle / brake / reverse.
    let engine = 0;
    let brake = 0;
    const handbrake = input.handbrake && !paused;
    if (throttle > 0.05) {
      if (speed < -0.6) brake = TUNE.brake * throttle;
      else if (speed < TUNE.maxSpeed) engine = TUNE.engine * throttle * (1 - Math.max(0, speed / TUNE.maxSpeed) ** 3 * 0.6);
    } else if (throttle < -0.05) {
      if (speed > 0.6) brake = TUNE.brake * -throttle;
      else if (speed > -TUNE.maxReverse) engine = TUNE.reverseEngine * throttle;
    } else {
      brake = TUNE.coast;
    }
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      v.setWheelEngineForce(i, rear ? engine : engine * 0.35);
      v.setWheelBrake(i, rear && handbrake ? TUNE.handbrake : brake);
      v.setWheelFrictionSlip(i, rear && handbrake ? TUNE.driftRearSlip : TUNE.frictionSlip);
      v.setWheelSideFrictionStiffness(i, rear && handbrake ? TUNE.driftRearSide : TUNE.sideFriction);
    }

    v.updateVehicle(dt, undefined, groups.wheelRay);

    // Assists.
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    let contacts = 0;
    for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contacts++;
    runtime.grounded = contacts >= 2;
    // Keep upright: torque toward world up proportional to tilt.
    _v.copy(_up).cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(TUNE.uprightTorque * dt * (contacts ? 1 : 0.35));
    body.applyTorqueImpulse({ x: _v.x, y: 0, z: _v.z }, true);
    // Drift: extra yaw while the handbrake is held, and momentum that keeps carrying the
    // car along its previous line so the tail swings out (arcade, not sim).
    if (handbrake && contacts >= 2 && absSpeed > 4) {
      body.applyTorqueImpulse({ x: 0, y: steer * TUNE.driftYaw * dt * Math.sign(speed || 1), z: 0 }, true);
      const lv = body.linvel();
      const len = Math.hypot(lv.x, lv.z);
      if (len > 0.5) {
        const cx = lv.x / len;
        const cz = lv.z / len;
        if (!s.driftOn) s.driftDir.set(cx, cz);
        s.driftDir.lerp(new THREE.Vector2(cx, cz), TUNE.driftCarry).normalize();
        const keep = 0.9985;
        body.setLinvel({ x: s.driftDir.x * len * keep, y: lv.y, z: s.driftDir.y * len * keep }, true);
        s.driftOn = true;
      }
    } else s.driftOn = false;
    // Arcade stabiliser: cap the yaw rate and gently pull the nose back toward the
    // direction of travel once the slide angle gets big, so drifts never become spins.
    {
      const av = body.angvel();
      const maxYaw = handbrake ? 2.7 : 3.1;
      if (Math.abs(av.y) > maxYaw) body.setAngvel({ x: av.x, y: Math.sign(av.y) * maxYaw, z: av.z }, true);
      const lv0 = body.linvel();
      const hv = Math.hypot(lv0.x, lv0.z);
      if (hv > 3 && contacts >= 2 && speed > 0) {
        const slip = Math.atan2(lv0.x * _fwd.z - lv0.z * _fwd.x, lv0.x * _fwd.x + lv0.z * _fwd.z);
        const over = Math.abs(slip) - TUNE.maxSlip;
        if (over > 0) body.applyTorqueImpulse({ x: 0, y: Math.sign(slip) * over * 2.4 * dt, z: 0 }, true);
      }
    }
    // Low-speed turning help so tight spaces never feel stuck.
    if (contacts >= 3 && absSpeed < 3 && Math.abs(throttle) > 0.1) {
      body.applyTorqueImpulse({ x: 0, y: steer * 0.12 * dt * Math.sign(throttle), z: 0 }, true);
    }

    // Lateral slip → drifting state (used for skid marks & sound).
    const lv = body.linvel();
    _v.set(lv.x, 0, lv.z);
    const lateral = Math.abs(_v.dot(new THREE.Vector3(_fwd.z, 0, -_fwd.x)));
    runtime.drifting = contacts >= 2 && ((handbrake && absSpeed > 3) || lateral > 3.2);
    runtime.carSpeed = speed;

    // Flip detection → auto reset after a few seconds upside-down / on the side.
    if (_up.y < 0.35) {
      s.flippedFor += dt;
      if (s.flippedFor > 2.5) resetCar(true);
    } else s.flippedFor = 0;
    // Fell off the world somehow.
    if (body.translation().y < -8) resetCar(false);
  });

  // Visual update: wheels, lean, shared runtime state.
  useFrame((_, delta) => {
    const v = vehicleRef.current;
    const g = visualRef.current;
    if (!v || !g) return;
    const s = state.current;
    const dt = Math.min(delta, 1 / 20);
    g.getWorldPosition(runtime.carPosition);
    g.getWorldQuaternion(_q);
    runtime.carForward.set(0, 0, 1).applyQuaternion(_q);
    runtime.carYaw = Math.atan2(runtime.carForward.x, runtime.carForward.z);
    const body = bodyRef.current!;
    const lv = body.linvel();
    runtime.carVelocity.set(lv.x, lv.y, lv.z);

    car.wheels.forEach((w, i) => {
      const susp = v.wheelSuspensionLength(i) ?? TUNE.restLength;
      const conn = v.wheelChassisConnectionPointCs(i);
      if (conn) w.pivot.position.y = conn.y - susp;
      w.pivot.rotation.y = v.wheelSteering(i) ?? 0;
      w.spin.rotation.x = v.wheelRotation(i) ?? 0;
    });

    // Cartoon body lean from acceleration (spring-damped).
    const accel = _v.copy(runtime.carVelocity).sub(s.prevVel).divideScalar(Math.max(dt, 1e-3));
    s.prevVel.copy(runtime.carVelocity);
    const right = new THREE.Vector3(-runtime.carForward.z, 0, runtime.carForward.x);
    const latA = THREE.MathUtils.clamp(accel.dot(right), -30, 30);
    const lonA = THREE.MathUtils.clamp(accel.dot(runtime.carForward), -30, 30);
    const targetRoll = latA * 0.006;
    const targetPitch = -lonA * 0.004;
    const k = 120;
    const c = 14;
    s.leanVel.x += ((targetRoll - s.lean.x) * k - s.leanVel.x * c) * dt;
    s.leanVel.y += ((targetPitch - s.lean.y) * k - s.leanVel.y * c) * dt;
    s.lean.addScaledVector(s.leanVel, dt);
    car.leanPivot.rotation.z = THREE.MathUtils.clamp(s.lean.x, -0.12, 0.12);
    car.leanPivot.rotation.x = THREE.MathUtils.clamp(s.lean.y, -0.08, 0.08);

    // Tyre FX.
    const speed = Math.abs(runtime.carSpeed);
    for (let i = 2; i < 4; i++) {
      if (!v.wheelIsInContact(i)) continue;
      const cp = v.wheelContactPoint(i);
      if (!cp) continue;
      if (runtime.drifting) emitSkid(i, cp.x, cp.y, cp.z, runtime.carYaw);
      if ((runtime.drifting || (speed > 9 && Math.random() < 0.25)) && Math.random() < 0.6) emitDust(cp.x, cp.y, cp.z, runtime.drifting ? 1 : 0.5);
    }
    if (!runtime.drifting) emitSkid(-1, 0, 0, 0, 0);
    sfx.engine(speed / TUNE.maxSpeed, runtime.drifting && speed > 3);
  }, PRIORITY.vehicles);

  return (
    <RigidBody
      ref={bodyRef}
      position={SPAWN.position}
      rotation={[0, SPAWN.yaw, 0]}
      colliders={false}
      canSleep={false}
      ccd
      linearDamping={0.06}
      angularDamping={0.7}
      collisionGroups={groups.player}
      onContactForce={(e) => {
        const f = e.totalForceMagnitude;
        if (f > 160 && performance.now() - runtime.lastBumpAt > 220) {
          runtime.lastBumpAt = performance.now();
          sfx.bump(Math.min(1, f / 900));
          const p = runtime.carPosition;
          emitDust(p.x + runtime.carForward.x, 0.4, p.z + runtime.carForward.z, 1.5);
        }
      }}
    >
      <RoundCuboidCollider args={[0.58, 0.2, 1.08, 0.12]} position={[0, 0.6, 0]} density={0} friction={0.4} restitution={0.15} />
      <CuboidCollider args={[0.55, 0.2, 0.62]} position={[0, 1.02, -0.1]} density={0} friction={0.4} restitution={0.1} />
      <group ref={visualRef}>
        <primitive object={car.root} />
      </group>
    </RigidBody>
  );
}
