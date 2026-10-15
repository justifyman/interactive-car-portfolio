import{V as e,na as t,oo as n,q as r}from"./jsx-runtime-CAK5kFzM.js";var i={uTime:{value:0},uCarScreen:{value:new n(-1e5,-1e5)},uCarViewZ:{value:0},uHoleRadius:{value:140},uHoleStrength:{value:1}},a=`
float occBayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;function o(e,t){let n=t.wind??0,r=!!t.occluder,o=!!t.mergedBase;if(!n&&!r)return;let s=e.onBeforeCompile;e.onBeforeCompile=(t,c)=>{s?.call(e,t,c),Object.assign(t.uniforms,i,{uWindAmp:{value:n}}),t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
        uniform float uTime;
        uniform float uWindAmp;
        varying float vOccViewZ;
        varying float vOccWorldY;
        ${o?`attribute float aBaseY;`:``}`).replace(`#include <project_vertex>`,`vec4 wPos = vec4(transformed, 1.0);
        float baseY = modelMatrix[3].y;
        #ifdef USE_INSTANCING
          wPos = instanceMatrix * wPos;
          baseY = (modelMatrix * instanceMatrix[3]).y;
        #endif
        ${o?`baseY = aBaseY;`:``}
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
        vOccWorldY = wPos.y;`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
        uniform vec2 uCarScreen;
        uniform float uCarViewZ;
        uniform float uHoleRadius;
        uniform float uHoleStrength;
        varying float vOccViewZ;
        varying float vOccWorldY;
        ${a}`).replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>
        ${r?`{
          vec2 dd = (gl_FragCoord.xy - uCarScreen) / uHoleRadius;
          dd.y *= 0.85;
          float rr = length(dd);
          if (uHoleStrength > 0.0 && rr < 1.0 && vOccWorldY > 0.4 && vOccViewZ < uCarViewZ - 1.0) {
            float a = mix(1.0, mix(0.18, 1.0, smoothstep(0.45, 1.0, rr)), uHoleStrength);
            if (a < occBayer4(gl_FragCoord.xy)) discard;
          }
        }`:``}`)};let c=e.customProgramCacheKey?.bind(e);e.customProgramCacheKey=()=>`${c?c():``}|occ${+!!r}|wind${+(n>0)}|mb${+!!o}`}var s=new Map;function c(e,t={}){let n=`${e.uuid}|${+!!t.occluder}|${t.wind??0}|${+!!t.mergedBase}|${t.emissive??``}|${t.emissiveIntensity??``}`,i=s.get(n);if(i)return i;let a=e.clone();return a.isMeshStandardMaterial&&(a.roughness=Math.max(a.roughness,.85),a.metalness=0,a.envMapIntensity=.6,a.map&&(a.map.anisotropy=4),t.emissive&&(a.emissive=new r(t.emissive),a.emissiveIntensity=t.emissiveIntensity??1)),o(a,t),s.set(n,a),a}var l=new Map;function u(n,r,i,a,o=!0){let s=l.get(n);if(s)return s;let c=document.createElement(`canvas`);c.width=r,c.height=i,a(c.getContext(`2d`));let u=new e(c);return o&&(u.colorSpace=t),u.anisotropy=4,l.set(n,u),u}export{c as i,o as n,i as r,u as t};