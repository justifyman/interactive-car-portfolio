// Warm late-afternoon sun + cool sky fill. The shadow frustum follows the camera
// target (snapped to texels so shadows don't shimmer), keeping maps small & crisp.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cameraState } from './IsoCamera';
import { palette } from './palette';
import { PRIORITY } from './physics';
import { useGame } from './store';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.72, 0.42).normalize();

const SHADOW = {
  high: { size: 2048, extent: 36 },
  medium: { size: 1536, extent: 34 },
  low: { size: 1024, extent: 30 },
};

export function Lighting() {
  const light = useRef<THREE.DirectionalLight>(null);
  const quality = useGame((s) => s.quality);
  const scene = useThree((s) => s.scene);
  const cfg = SHADOW[quality];
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useEffect(() => {
    const l = light.current!;
    l.target = target;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -cfg.extent;
    cam.right = cfg.extent;
    cam.top = cfg.extent;
    cam.bottom = -cfg.extent;
    cam.near = 1;
    cam.far = 160;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(cfg.size, cfg.size);
    l.shadow.map?.dispose();
    l.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.035;
    l.shadow.radius = 3;
    l.shadow.needsUpdate = true;
  }, [cfg, target]);

  const snap = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // Snap the light's view to whole shadow texels to avoid shimmering while driving.
    const texel = (cfg.extent * 2) / cfg.size;
    const lightRot = new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const inv = lightRot.clone().invert();
    snap.copy(cameraState.target).applyMatrix4(inv);
    snap.x = Math.round(snap.x / texel) * texel;
    snap.y = Math.round(snap.y / texel) * texel;
    snap.applyMatrix4(lightRot);
    target.position.copy(snap);
    target.updateMatrixWorld();
    l.position.copy(snap).addScaledVector(SUN_DIR, 70);
  }, PRIORITY.camera + 1);

  return (
    <>
      <hemisphereLight args={['#C6CAEC', '#E0CFB4', 1.95]} />
      <directionalLight ref={light} color={palette.sun} intensity={3.15} castShadow />
    </>
  );
}
