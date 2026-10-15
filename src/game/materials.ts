// Shared material variants built on top of the retinted pack materials.
//  - occluder: fragments between the camera and the car are dithered away inside a
//    screen-space circle around the car, so buildings and trees never hide it.
//  - wind: vertices sway with height above the object's base (trees, grass, flowers).
import * as THREE from 'three';

export const sharedUniforms = {
  uTime: { value: 0 },
  uCarScreen: { value: new THREE.Vector2(-1e5, -1e5) }, // drawing-buffer pixels
  uCarViewZ: { value: 0 },
  uHoleRadius: { value: 140 },
  uHoleStrength: { value: 1 },
};

export interface VariantOptions {
  occluder?: boolean;
  wind?: number; // sway amplitude factor (0 = none)
  /** Geometry was merged: read each object's base height from the aBaseY attribute. */
  mergedBase?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const BAYER = /* glsl */ `
float occBayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;

export function patchShader(material: THREE.Material, opts: VariantOptions) {
  const wind = opts.wind ?? 0;
  const occluder = !!opts.occluder;
  const merged = !!opts.mergedBase;
  if (!wind && !occluder) return;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, sharedUniforms, { uWindAmp: { value: wind } });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindAmp;
        varying float vOccViewZ;
        varying float vOccWorldY;
        ${merged ? 'attribute float aBaseY;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 wPos = vec4(transformed, 1.0);
        float baseY = modelMatrix[3].y;
        #ifdef USE_INSTANCING
          wPos = instanceMatrix * wPos;
          baseY = (modelMatrix * instanceMatrix[3]).y;
        #endif
        ${merged ? 'baseY = aBaseY;' : ''}
        wPos = modelMatrix * wPos;
        if (uWindAmp > 0.0) {
          float hgt = max(0.0, wPos.y - baseY);
          float sway = hgt * hgt * uWindAmp;
          float ph = wPos.x * 0.21 + wPos.z * 0.17;
          wPos.x += (sin(uTime * 1.4 + ph) + 0.35 * sin(uTime * 3.1 + ph * 2.3)) * sway;
          wPos.z += (cos(uTime * 1.1 + ph * 1.3)) * sway * 0.6;
        }
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;
        vOccViewZ = -mvPosition.z;
        vOccWorldY = wPos.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uCarScreen;
        uniform float uCarViewZ;
        uniform float uHoleRadius;
        uniform float uHoleStrength;
        varying float vOccViewZ;
        varying float vOccWorldY;
        ${BAYER}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${
          occluder
            ? `{
          vec2 dd = (gl_FragCoord.xy - uCarScreen) / uHoleRadius;
          dd.y *= 0.85;
          float rr = length(dd);
          if (uHoleStrength > 0.0 && rr < 1.0 && vOccWorldY > 0.4 && vOccViewZ < uCarViewZ - 1.0) {
            float a = mix(1.0, mix(0.18, 1.0, smoothstep(0.45, 1.0, rr)), uHoleStrength);
            if (a < occBayer4(gl_FragCoord.xy)) discard;
          }
        }`
            : ''
        }`,
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|occ${occluder ? 1 : 0}|wind${wind > 0 ? 1 : 0}|mb${merged ? 1 : 0}`;
}

const cache = new Map<string, THREE.Material>();

/** Returns a cached clone of a pack material with the requested behaviour. */
export function variantMaterial(src: THREE.Material, opts: VariantOptions = {}): THREE.Material {
  const key = `${src.uuid}|${opts.occluder ? 1 : 0}|${opts.wind ?? 0}|${opts.mergedBase ? 1 : 0}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = src.clone() as THREE.MeshStandardMaterial;
  if (m.isMeshStandardMaterial) {
    m.roughness = Math.max(m.roughness, 0.85);
    m.metalness = 0;
    m.envMapIntensity = 0.6;
    if (m.map) {
      m.map.anisotropy = 4;
    }
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
  }
  patchShader(m, opts);
  cache.set(key, m);
  return m;
}

/** Procedural canvas textures, generated once and shared. */
const texCache = new Map<string, THREE.Texture>();
export function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
