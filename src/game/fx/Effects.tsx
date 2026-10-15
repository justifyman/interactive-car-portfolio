// Subtle post-processing: bloom on emissive lamps/windows only, warm/cool split-tone
// grade (cool purple-blue shadows), gentle vignette and a light tilt-shift.
// Scaled down / disabled automatically on lower quality tiers.
import { EffectComposer, Bloom, ToneMapping, Vignette, TiltShift2, N8AO } from '@react-three/postprocessing';
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing';
import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { useGame } from '../store';

const GRADE_FRAG = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float saturation;
uniform float lift;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.05, 0.55, l);
  float hi = smoothstep(0.55, 1.0, l);
  c = mix(c, c * shadowTint, sh * 0.42);
  c = mix(c, c * highlightTint, hi * 0.3);
  c += lift * shadowTint * sh * 0.06; // lifted, tinted blacks — never pure black
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, saturation);
  outputColor = vec4(c, inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['shadowTint', new THREE.Uniform(new THREE.Color('#B3B0E0'))],
        ['highlightTint', new THREE.Uniform(new THREE.Color('#FFF1DE'))],
        ['saturation', new THREE.Uniform(1.0)],
        ['lift', new THREE.Uniform(1)],
      ]),
    });
  }
}

const Grade = forwardRef<GradeEffect>(function Grade(_, ref) {
  const effect = useMemo(() => new GradeEffect(), []);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

export function Effects() {
  const quality = useGame((s) => s.quality);
  if (quality === 'low') return null;
  const high = quality === 'high';
  return (
    <EffectComposer multisampling={high ? 4 : 0} enableNormalPass={false}>
      {high ? <N8AO aoRadius={1.4} intensity={1.1} distanceFalloff={1.0} halfRes color={new THREE.Color('#4B4870')} quality="performance" /> : <></>}
      <Bloom luminanceThreshold={1.05} luminanceSmoothing={0.15} intensity={0.85} mipmapBlur radius={0.65} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Grade />
      {high ? <TiltShift2 blur={0.07} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} samples={6} /> : <></>}
      <Vignette offset={0.35} darkness={0.36} eskil={false} />
    </EffectComposer>
  );
}
