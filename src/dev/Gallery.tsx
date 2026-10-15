// Dev-only asset gallery: /?gallery[&filter=ft-]  — shows every model in the bundles.
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { InstancedModel, Model, allProtoNames, getProto, useModelRegistry, type Placement } from '../game/assets';
import { buildWing, type WingSpec } from '../game/world/building';
import { urlParams } from '../game/store';

function Grid() {
  useModelRegistry();
  const filter = urlParams.get('filter') ?? '';
  const list = urlParams.get('names');
  const names = useMemo(() => (list ? list.split(',') : allProtoNames().filter((n) => n.includes(filter))), [filter, list]);
  const cols = Math.ceil(Math.sqrt(names.length));
  const cell = Number(urlParams.get('cell') ?? 9);
  return (
    <>
      {names.map((n, i) => {
        const x = (i % cols) * cell;
        const z = Math.floor(i / cols) * cell;
        const p = getProto(n);
        return (
          <group key={n} position={[x, 0, z]}>
            <Model name={n} />
            {urlParams.has('axes') && <axesHelper args={[2]} position={[0, 0.02, 0]} />}
            <Text position={[0, 0.05, cell * 0.42]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.6} color="#3b3542" anchorX="center">
              {`${n} ${p.size.x.toFixed(1)}×${p.size.y.toFixed(1)}×${p.size.z.toFixed(1)}`}
            </Text>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
              <planeGeometry args={[cell - 0.5, cell - 0.5]} />
              <meshStandardMaterial color="#9DB08A" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function BuilderTest() {
  useModelRegistry();
  const groups = useMemo(() => {
    const M = new THREE.Matrix4();
    const wings: WingSpec[] = [
      { x: 0, z: 0, length: 3, floors: 1, walls: ['stone'], doors: ['e1'], chimney: 2 },
      { x: 8, z: 0, length: 3, floors: 2, walls: ['stone', 'wood'], doors: ['e1'], depthScale: 1.6, roofHeight: 'high' },
      { x: 16, z: 0, length: 2, floors: 1, walls: ['wood'], wide: ['e0'], depthScale: 1.5 },
      { x: 24, z: 0, length: 1, floors: 2, walls: ['stone', 'wood'], doors: ['e0'] },
    ];
    const map = new Map<string, Placement[]>();
    for (const w of wings) {
      for (const p of buildWing(w, M).pieces) {
        if (!map.has(p.model)) map.set(p.model, []);
        map.get(p.model)!.push({ position: [0, 0, 0], matrix: p.matrix });
      }
    }
    return [...map];
  }, []);
  return (
    <>
      {groups.map(([name, items]) => (
        <InstancedModel key={name} name={name} items={items} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#9DB08A" />
      </mesh>
      <axesHelper args={[5]} position={[-4, 0.1, 4]} />
    </>
  );
}

export default function Gallery() {
  const cam = (urlParams.get('cam') ?? '40,60,90').split(',').map(Number) as [number, number, number];
  const target = (urlParams.get('target') ?? '40,0,40').split(',').map(Number) as [number, number, number];
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ position: cam, fov: 35 }}>
        <color attach="background" args={['#E8DCCB']} />
        <hemisphereLight args={['#c9d3ea', '#cbb89c', 1.2]} />
        <directionalLight position={[-30, 50, 20]} intensity={2.2} color="#ffe0b8" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} />
        <Suspense fallback={null}>
          {urlParams.has('builder') ? <BuilderTest /> : <Grid />}
        </Suspense>
        <OrbitControls target={target} />
      </Canvas>
    </div>
  );
}
