// Fixed-angle isometric orthographic camera that follows the car with lag,
// leads slightly in the direction of travel, zooms in when a panel opens,
// and feeds the occlusion-dither uniforms.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sharedUniforms } from './materials';
import { PRIORITY } from './physics';
import { runtime, useGame } from './store';

export const ISO_ELEVATION = THREE.MathUtils.degToRad(35.264);
export const ISO_AZIMUTH = THREE.MathUtils.degToRad(45);
export const CAMERA_DIR = new THREE.Vector3(
  Math.cos(ISO_ELEVATION) * Math.sin(ISO_AZIMUTH),
  Math.sin(ISO_ELEVATION),
  Math.cos(ISO_ELEVATION) * Math.cos(ISO_AZIMUTH),
);
const DISTANCE = 90;

export const cameraState = {
  target: new THREE.Vector3(),
  shake: 0,
  userZoom: 1,
};

(window as unknown as { __game: Record<string, unknown> }).__game.camera = cameraState;

export function IsoCamera() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const smoothed = useRef(new THREE.Vector3(runtime.carPosition.x, 0, runtime.carPosition.z));
  const lead = useRef(new THREE.Vector3());
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const initialized = useRef(false);

  // Wheel + pinch zoom within limits.
  useEffect(() => {
    const el = gl.domElement;
    const clamp = (z: number) => THREE.MathUtils.clamp(z, 0.7, 1.7);
    const onWheel = (e: WheelEvent) => {
      if (useGame.getState().openPanel) return;
      e.preventDefault();
      cameraState.userZoom = clamp(cameraState.userZoom * Math.exp(-e.deltaY * 0.0012));
    };
    let pinch = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch > 0) {
        const d = dist(e.touches);
        cameraState.userZoom = clamp(cameraState.userZoom * (d / pinch));
        pinch = d;
      }
    };
    const onTouchEnd = () => (pinch = 0);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const car = runtime.carPosition;
    const { openPanel } = useGame.getState();

    // Look-ahead in the direction of travel.
    tmp.set(runtime.carVelocity.x, 0, runtime.carVelocity.z).multiplyScalar(0.32);
    if (tmp.length() > 4.5) tmp.setLength(4.5);
    if (openPanel) tmp.set(0, 0, 0);
    lead.current.lerp(tmp, 1 - Math.exp(-dt * 2.5));
    const desired = tmp.set(car.x, 0, car.z).add(lead.current);
    // With a side panel open on wide screens, frame the car in the free left area.
    if (openPanel && size.width > 640) {
      const shift = Math.min(260, size.width * 0.17) / Math.max(camera.zoom, 1);
      desired.x += shift / Math.SQRT2;
      desired.z -= shift / Math.SQRT2;
    }
    if (!initialized.current) {
      smoothed.current.copy(desired);
      initialized.current = true;
    }
    smoothed.current.lerp(desired, 1 - Math.exp(-dt * 4.2));
    cameraState.target.copy(smoothed.current);

    // Shake decays quickly.
    cameraState.shake = Math.max(0, cameraState.shake - dt * 3);
    const sh = cameraState.shake * cameraState.shake * 0.35;
    camera.position.copy(smoothed.current).addScaledVector(CAMERA_DIR, DISTANCE);
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.z += (Math.random() - 0.5) * sh;
    camera.lookAt(smoothed.current.x, smoothed.current.y, smoothed.current.z);

    // Zoom: fit ~22 world units vertically on landscape, ~16 horizontally on portrait.
    const base = Math.min(size.height / 22, size.width / 16);
    const speedOut = 1 - Math.min(1, Math.abs(runtime.carSpeed) / 16) * 0.08;
    const target = base * cameraState.userZoom * (openPanel ? 1.45 : speedOut);
    camera.zoom += (target - camera.zoom) * (1 - Math.exp(-dt * (openPanel ? 3 : 2)));
    camera.near = 1;
    camera.far = 400;
    camera.updateProjectionMatrix();

    // Occlusion dither uniforms (drawing-buffer pixel space).
    const dpr = gl.getPixelRatio();
    const p = tmp.set(car.x, car.y + 0.7, car.z);
    const viewZ = -p.clone().applyMatrix4(camera.matrixWorldInverse).z;
    p.project(camera);
    sharedUniforms.uCarScreen.value.set((p.x * 0.5 + 0.5) * size.width * dpr, (p.y * 0.5 + 0.5) * size.height * dpr);
    sharedUniforms.uCarViewZ.value = viewZ;
    sharedUniforms.uHoleRadius.value = 3.4 * camera.zoom * dpr;
  }, PRIORITY.camera);

  return null;
}
