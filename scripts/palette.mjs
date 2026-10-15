// Palette remapping used to make assets from different packs feel like one world.
// Works in OKLCH: hues are pulled toward anchors taken from the art-direction palette,
// chroma is reduced (dusty / pastel), blacks are lifted and tinted cool purple-blue,
// light neutrals get a warm cream cast.

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export const hexToSrgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function srgbToOklch(rgb) {
  const [L, a, b] = linearToOklab(rgb.map(srgbToLinear));
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}

export function oklchToSrgb([L, C, h]) {
  const r = (h * Math.PI) / 180;
  const lin = oklabToLinear([L, C * Math.cos(r), C * Math.sin(r)]);
  return lin.map((c) => Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, c))))));
}

// Source hue (typical saturated Kenney colours) → target hue, chroma multiplier, chroma cap.
// Targets are measured from the brief's palette (see src/game/palette.ts).
const ANCHORS = [
  { from: 25, to: 26, k: 0.55, cap: 0.1 }, // red      → muted red #B5706B
  { from: 48, to: 54, k: 0.52, cap: 0.09 }, // orange   → terracotta / warm wood #C98F7A
  { from: 82, to: 78, k: 0.52, cap: 0.085 }, // yellow   → sand #D9B88A
  { from: 150, to: 130, k: 0.5, cap: 0.075 }, // green    → sage grass #9DB08A
  { from: 180, to: 188, k: 0.45, cap: 0.055 }, // teal     → sage teal #6E8C8A
  { from: 258, to: 248, k: 0.42, cap: 0.06 }, // blue     → dusty blue #8FA3B5
  { from: 290, to: 275, k: 0.45, cap: 0.035 }, // lavender → cool stone
  { from: 340, to: 10, k: 0.4, cap: 0.06 }, // pink     → dusty rose
];

function interpAnchor(h) {
  // Find the two anchors around h on the circle and blend linearly.
  const n = ANCHORS.length;
  for (let i = 0; i < n; i++) {
    const a = ANCHORS[i];
    const b = ANCHORS[(i + 1) % n];
    const span = (b.from - a.from + 360) % 360;
    const off = (h - a.from + 360) % 360;
    if (off <= span) {
      const t = span === 0 ? 0 : off / span;
      const dTo = ((b.to - a.to + 540) % 360) - 180;
      return {
        to: (a.to + dTo * t + 360) % 360,
        k: a.k + (b.k - a.k) * t,
        cap: a.cap + (b.cap - a.cap) * t,
      };
    }
  }
  return ANCHORS[0];
}

const WARM_HUE = 75; // cream
const COOL_HUE = 285; // purple-blue for dark / shadowy neutrals

/** Remap one sRGB colour (0..1 components) to the world palette. */
export function remapSrgb(rgb, opts = {}) {
  const { chroma = 1, lift = 1, warmStone = 0 } = opts;
  let [L, C, h] = srgbToOklch(rgb);
  // Optionally pull light lavender "stone" toward warm cream (fantasy-town walls & rocks).
  if (warmStone > 0 && h > 235 && h < 325 && C < 0.13 && L > 0.42) {
    const t = warmStone * Math.min(1, (L - 0.42) / 0.15);
    const warm = remapSrgb(oklchToSrgb([Math.min(0.95, L + 0.03), 0.028, 72]), { lift });
    const cool = remapSrgb(rgb, { chroma, lift });
    return cool.map((c, i) => c + (warm[i] - c) * t);
  }
  const a = interpAnchor(h);
  // Saturated colours follow the anchors; near-neutrals get a temperature tint.
  const sat = Math.min(1, C / 0.05);
  let newC = Math.min(C * a.k, a.cap) * chroma;
  let newH = a.to;
  // Lift blacks toward a soft slate, compress whites slightly.
  let newL = 0.14 * lift + L * (1 - 0.14 * lift) - 0.025 * Math.max(0, L - 0.85);
  if (sat < 1) {
    const neutralTint = L > 0.6 ? { h: WARM_HUE, c: 0.018 } : { h: COOL_HUE, c: 0.03 };
    const t = 1 - sat;
    // Blend hue via vector mix to avoid wrap issues.
    const ax = Math.cos((newH * Math.PI) / 180) * newC * (1 - t) + Math.cos((neutralTint.h * Math.PI) / 180) * neutralTint.c * t;
    const ay = Math.sin((newH * Math.PI) / 180) * newC * (1 - t) + Math.sin((neutralTint.h * Math.PI) / 180) * neutralTint.c * t;
    newC = Math.hypot(ax, ay);
    newH = ((Math.atan2(ay, ax) * 180) / Math.PI + 360) % 360;
  }
  return oklchToSrgb([newL, newC, newH]);
}

export function remapLinear(lin, opts) {
  const s = lin.map(linearToSrgb);
  return remapSrgb(s, opts).map(srgbToLinear);
}
