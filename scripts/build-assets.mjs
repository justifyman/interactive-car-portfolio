// Builds the runtime model bundles in public/models/ from the cached CC0 packs.
//
//  1. Loads each model listed in scripts/asset-manifest.mjs
//  2. Retints palette-atlas textures and flat material colours to the shared palette
//  3. Bakes scale so every model is authored at world scale
//  4. Merges each bundle into one GLB (one request, shared textures)
//  5. dedup → weld → prune → quantize → meshopt compression
//  6. Writes CREDITS.md and a size report (src/game/assets/sizes.generated.json)
//
// Usage: npm run assets:fetch && npm run assets:build
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, weld, quantize, meshopt, unpartition, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLES, CREDITS } from './asset-manifest.mjs';
import { remapSrgb, remapLinear } from './palette.mjs';

const CACHE = path.resolve('.asset-cache');
const OUT_DIR = path.resolve('public/models');
const SIZES_OUT = path.resolve('src/game/assets/sizes.generated.json');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function sourcePath(item) {
  if (item.src === 'polypizza') return path.join(CACHE, 'polypizza', `${item.file}.glb`);
  const base = path.join(CACHE, 'kenney', item.pack);
  const candidates = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === `${item.file}.glb`) candidates.push(p);
    }
  };
  walk(base, 0);
  if (!candidates.length) throw new Error(`Missing model ${item.pack}/${item.file}.glb — run npm run assets:fetch`);
  // Prefer the GLB-format folder (textured palette version) when a pack ships several.
  return candidates.sort((a, b) => Number(b.includes('GLB format')) - Number(a.includes('GLB format')))[0];
}

// Per-pack retint options (see scripts/palette.mjs).
const PACK_OPTIONS = {
  'fantasy-town-kit': { warmStone: 0.75 },
  'survival-kit': { warmStone: 0.4 },
};

// Flat-colour materials (nature kit) mapped by name straight to palette colours.
const FLAT_COLORS = {
  grass: '#8EA67A',
  leafsGreen: '#89A276',
  leafsDark: '#6F8766',
  leafsFall: '#C98F7A',
  woodBark: '#9C7A62',
  woodBarkDark: '#7E6352',
  woodInner: '#D9C3A0',
  colorRed: '#B5706B',
  colorYellow: '#D9B88A',
  colorPurple: '#9C90B5',
  colorBlue: '#8FA3B5',
  stone: '#A8A097',
  stoneDark: '#8E877F',
  dirt: '#A8957C',
};
const hexToLinear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

const retintCache = new Map();
function retintPng(bytes, opts = {}) {
  const key = crypto.createHash('sha1').update(bytes).update(JSON.stringify(opts)).digest('hex');
  if (retintCache.has(key)) return retintCache.get(key);
  const png = PNG.sync.read(Buffer.from(bytes));
  for (let i = 0; i < png.data.length; i += 4) {
    const r = remapSrgb([png.data[i] / 255, png.data[i + 1] / 255, png.data[i + 2] / 255], opts);
    png.data[i] = Math.round(r[0] * 255);
    png.data[i + 1] = Math.round(r[1] * 255);
    png.data[i + 2] = Math.round(r[2] * 255);
  }
  const out = new Uint8Array(PNG.sync.write(png, { colorType: 6 }));
  retintCache.set(key, out);
  return out;
}

function retintDocument(doc, label, opts = {}) {
  const root = doc.getRoot();
  for (const tex of root.listTextures()) {
    const mime = tex.getMimeType();
    if (mime === 'image/png') {
      tex.setImage(retintPng(tex.getImage(), opts));
      tex.setURI('');
    } else {
      console.warn(`  ! ${label}: texture ${mime} not retinted`);
    }
  }
  for (const mat of root.listMaterials()) {
    // Kenney nature-kit ships unlit flat colours; we want them lit like everything else.
    mat.setExtension('KHR_materials_unlit', null);
    if (!mat.getBaseColorTexture()) {
      const [r, g, b, a] = mat.getBaseColorFactor();
      const named = FLAT_COLORS[mat.getName()];
      const [nr, ng, nb] = named ? hexToLinear(named) : remapLinear([r, g, b], opts);
      mat.setBaseColorFactor([nr, ng, nb, a]);
    }
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(Math.max(0.75, mat.getRoughnessFactor()));
  }
}

const sizes = {};
const usedModels = [];

for (const [bundleName, items] of Object.entries(BUNDLES)) {
  console.log(`\n▸ ${bundleName} (${items.length} models)`);
  const target = new Document();
  target.createBuffer();
  const mainScene = target.createScene(bundleName);
  target.getRoot().setDefaultScene(mainScene);
  sizes[bundleName] = {};

  for (const item of items) {
    const name = item.name ?? `${item.prefix ?? ''}${item.file}`;
    const file = sourcePath(item);
    const src = await io.read(file);
    retintDocument(src, name, PACK_OPTIONS[item.pack] ?? {});
    const srcRoot = src.getRoot();
    const srcScene = srcRoot.getDefaultScene() ?? srcRoot.listScenes()[0];
    // Strip the root transforms some exporters add (e.g. RootNode wrappers) into one group.
    const b = getBounds(srcScene);
    const height = b.max[1] - b.min[1];
    const scale = item.s ?? item.h / height;
    const group = src.createNode(name).setScale([scale, scale, scale]);
    for (const child of srcScene.listChildren()) {
      srcScene.removeChild(child);
      group.addChild(child);
    }
    srcScene.addChild(group);

    const map = mergeDocuments(target, src);
    const merged = map.get(srcScene);
    for (const child of merged.listChildren()) {
      merged.removeChild(child);
      mainScene.addChild(child);
    }
    merged.dispose();

    const size = [0, 1, 2].map((i) => +((b.max[i] - b.min[i]) * scale).toFixed(3));
    const min = [0, 1, 2].map((i) => +(b.min[i] * scale).toFixed(3));
    sizes[bundleName][name] = { size, min };
    usedModels.push({ bundle: bundleName, name, item });
  }

  await target.transform(
    unpartition(),
    dedup(),
    weld(),
    prune({ keepLeaves: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${bundleName}.glb`);
  await io.write(outFile, target);
  console.log(`  → ${path.relative(process.cwd(), outFile)}  ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB, ${target.getRoot().listTextures().length} textures`);
}

fs.mkdirSync(path.dirname(SIZES_OUT), { recursive: true });
fs.writeFileSync(SIZES_OUT, JSON.stringify(sizes, null, 1));

// ── CREDITS.md ───────────────────────────────────────────────────────────────
const byPack = new Map();
for (const { item, name } of usedModels) {
  const key = item.src === 'kenney' ? `kenney:${item.pack}` : `${item.src}:${item.file}`;
  if (!byPack.has(key)) byPack.set(key, []);
  byPack.get(key).push(`${item.file}${name !== item.file ? ` (as \`${name}\`)` : ''}`);
}
const lines = [
  '# Credits',
  '',
  'Every 3D model in this site is free-licensed. Models were retinted to a shared palette, rescaled,',
  'merged and compressed by `scripts/build-assets.mjs`; the original files are unchanged at the source.',
  '',
  '## 3D models',
  '',
];
for (const [key, files] of byPack) {
  if (key.startsWith('kenney:')) {
    const pack = key.slice(7);
    lines.push(`### ${pack.replace(/(^|-)(\w)/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase())} — ${CREDITS.kenney.author}`);
    lines.push(`- Source: https://kenney.nl/assets/${pack}`);
    lines.push(`- License: ${CREDITS.kenney.license} (https://creativecommons.org/publicdomain/zero/1.0/)`);
  } else {
    const c = CREDITS[key];
    lines.push(`### ${c.title} — ${c.author}`);
    lines.push(`- Source: ${c.url}`);
    lines.push(`- License: ${c.license} (https://creativecommons.org/publicdomain/zero/1.0/)`);
  }
  lines.push(`- Files: ${files.join(', ')}`);
  lines.push('');
}
lines.push(
  '## Everything else',
  '',
  '- Terrain, roads, water, clouds, trigger rings, signs, particles and skid marks are generated procedurally in code.',
  '- All sound effects and ambience are synthesised at runtime with the Web Audio API (no audio files).',
  '- UI font: Fredoka by Milena Brandão & Hafontia (SIL Open Font License 1.1), self-hosted via @fontsource.',
  '- Libraries: three.js, React Three Fiber, drei, Rapier, postprocessing, zustand (MIT / Apache-2.0).',
  '',
);
fs.writeFileSync(path.resolve('CREDITS.md'), lines.join('\n'));
console.log('\n✓ CREDITS.md and size report written');
