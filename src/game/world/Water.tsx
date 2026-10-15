// Lake water: one plane at water level, coloured by depth (from a baked terrain
// height texture), with shoreline foam, gentle waves and soft sparkles.
import { useMemo } from 'react';
import * as THREE from 'three';
import { sharedUniforms } from '../materials';
import { palette } from '../palette';
import { GLSL_NOISE } from './noise';
import { terrainHeight, WATER_LEVEL, WORLD } from './terrain';

export function Water() {
  const { geometry, material } = useMemo(() => {
    const w = WORLD.maxX - WORLD.minX;
    const d = WORLD.maxZ - WORLD.minZ;
    // Height texture (R = height), 1 texel per unit.
    const tw = Math.round(w) + 1;
    const td = Math.round(d) + 1;
    const data = new Float32Array(tw * td);
    for (let k = 0; k < td; k++) for (let i = 0; i < tw; i++) data[k * tw + i] = terrainHeight(WORLD.minX + i, WORLD.minZ + k);
    const tex = new THREE.DataTexture(data, tw, td, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    const g = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2));
    g.rotateX(-Math.PI / 2);
    g.translate((WORLD.minX + WORLD.maxX) / 2, WATER_LEVEL, (WORLD.minZ + WORLD.maxZ) / 2);

    const m = new THREE.MeshStandardMaterial({
      color: palette.water,
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sharedUniforms.uTime;
      shader.uniforms.uHeight = { value: tex };
      shader.uniforms.uWorld = { value: new THREE.Vector4(WORLD.minX, WORLD.minZ, w, d) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWaterPos;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          transformed.y += sin(wp.x * 0.35 + uTime * 1.2) * 0.04 + cos(wp.z * 0.42 + uTime * 0.9) * 0.04;
          vWaterPos = wp;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform sampler2D uHeight;
          uniform vec4 uWorld;
          varying vec3 vWaterPos;
          ${GLSL_NOISE}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 huv = (vWaterPos.xz - uWorld.xy + 0.5) / (uWorld.zw + 1.0);
          float ground = texture2D(uHeight, huv).r;
          float depth = ${WATER_LEVEL.toFixed(3)} - ground;
          if (depth < -0.05) discard;
          vec3 shallow = vec3(${new THREE.Color('#9FC0B8').toArray().map((v) => v.toFixed(3)).join(',')});
          vec3 mid = vec3(${new THREE.Color(palette.water).toArray().map((v) => v.toFixed(3)).join(',')});
          vec3 deep = vec3(${new THREE.Color(palette.waterDeep).toArray().map((v) => v.toFixed(3)).join(',')});
          vec3 wc = mix(shallow, mid, smoothstep(0.0, 0.8, depth));
          wc = mix(wc, deep, smoothstep(0.8, 2.4, depth));
          // Drifting ripples.
          vec2 p = vWaterPos.xz;
          float rip = vnoise(p * 0.9 + vec2(uTime * 0.25, uTime * 0.18)) * vnoise(p * 1.7 - vec2(uTime * 0.2, -uTime * 0.12));
          wc += smoothstep(0.42, 0.6, rip) * 0.06;
          // Shoreline foam (animated band).
          float foamLine = smoothstep(0.32, 0.0, depth + sin(uTime * 1.4 + p.x * 0.5 + p.y * 0.3) * 0.05);
          float foamNoise = vnoise(p * 3.0 + uTime * 0.4);
          float foam = foamLine * smoothstep(0.25, 0.7, foamNoise + foamLine * 0.4);
          wc = mix(wc, vec3(${new THREE.Color(palette.foam).toArray().map((v) => v.toFixed(3)).join(',')}), foam * 0.85);
          diffuseColor.rgb = wc;
          diffuseColor.a = mix(0.55, 0.93, smoothstep(0.0, 1.2, depth)) + foam * 0.3;`,
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          {
            vec2 q = vWaterPos.xz;
            float e = 0.15;
            float h0 = vnoise(q * 1.3 + uTime * 0.3);
            float hx = vnoise((q + vec2(e, 0.0)) * 1.3 + uTime * 0.3);
            float hz = vnoise((q + vec2(0.0, e)) * 1.3 + uTime * 0.3);
            vec3 bump = normalize(vec3((h0 - hx) * 1.2, 1.0, (h0 - hz) * 1.2));
            normal = normalize((viewMatrix * vec4(bump, 0.0)).xyz);
          }`,
        );
    };
    return { geometry: g, material: m };
  }, []);

  return <mesh geometry={geometry} material={material} receiveShadow renderOrder={1} />;
}
