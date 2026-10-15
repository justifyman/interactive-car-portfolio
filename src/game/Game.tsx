// The 3D scene: renderer setup, physics world and everything in it.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { preloadBundles, useModelRegistry } from './assets';
import { IsoCamera } from './IsoCamera';
import { Lighting } from './Lighting';
import { sharedUniforms, canvasTexture } from './materials';
import { palette } from './palette';
import { PRIORITY } from './physics';
import { runtime, urlParams, useGame } from './store';
import { PlayerCar } from './vehicle/PlayerCar';
import { World } from './world/World';
import { Dust } from './fx/Dust';
import { SkidMarks } from './fx/SkidMarks';
import { SPAWN } from './world/layout';
import { Effects } from './fx/Effects';
import { Traffic } from './vehicle/Traffic';
import { Props } from './world/Props';

preloadBundles();

function Background() {
  const scene = useThree((s) => s.scene);
  const tex = useMemo(
    () =>
      canvasTexture('sky-gradient', 4, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, palette.skyTop);
        g.addColorStop(1, palette.skyBottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 256);
      }),
    [],
  );
  useEffect(() => {
    scene.background = tex;
    scene.fog = new THREE.Fog(palette.skyBottom, 120, 230);
  }, [scene, tex]);
  return null;
}

/** Steps quality down when the frame rate can't keep up (and back up, once, if it recovers). */
function AdaptiveQuality() {
  const gl = useThree((s) => s.gl);
  const g = (window as unknown as { __game: Record<string, unknown> }).__game;
  useEffect(() => {
    g.renderer = gl;
    gl.info.autoReset = false;
  }, [gl, g]);
  // Capture full-frame stats (all passes) for debugging / the perf probe.
  useFrame(() => {
    g.frameInfo = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -100);
  const forced = urlParams.has('quality');
  const order = ['low', 'medium', 'high'] as const;
  const step = (d: number) => {
    if (forced) return;
    const { quality, setQuality } = useGame.getState();
    const i = Math.max(0, Math.min(2, order.indexOf(quality) + d));
    if (order[i] !== quality) {
      console.info(`[game] quality → ${order[i]}`);
      setQuality(order[i]);
    }
  };
  return <PerformanceMonitor ms={500} iterations={8} threshold={0.75} bounds={(refresh) => (refresh > 90 ? [50, 90] : [40, 58])} flipflops={2} onDecline={() => step(-1)} onIncline={() => step(1)} />;
}

function Clock() {
  useFrame((_, dt) => {
    runtime.elapsed += Math.min(dt, 0.1);
    sharedUniforms.uTime.value = runtime.elapsed;
  }, PRIORITY.world);
  return null;
}

function Content() {
  useModelRegistry(); // suspends until every bundle is ready
  const setLoaded = useGame((s) => s.setLoaded);
  useEffect(() => setLoaded(), [setLoaded]);
  return (
    <>
      <World />
      <PlayerCar />
      <Traffic />
      <Props />
    </>
  );
}

export default function Game({ paused = false }: { paused?: boolean }) {
  const quality = useGame((s) => s.quality);
  const debug = useGame((s) => s.debug);
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1];
  runtime.carPosition.set(...SPAWN.position);

  return (
    <Canvas
      className="game-canvas"
      frameloop={paused ? 'never' : 'always'}
      orthographic
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={dpr}
      camera={{ zoom: 34, position: [60, 60, 60], near: 1, far: 400 }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
    >
      <Background />
      <Clock />
      <AdaptiveQuality />
      <Lighting />
      <IsoCamera />
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -18, 0]} updatePriority={PRIORITY.physics} debug={debug}>
          <Content />
        </Physics>
        <Dust />
        <SkidMarks />
        <Effects />
      </Suspense>
    </Canvas>
  );
}
