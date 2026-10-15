// Dev helper: triangle counts per model in the built bundles.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const rows = [];
for (const b of ['vehicles', 'town', 'nature', 'props']) {
  const doc = await io.read(`public/models/${b}.glb`);
  for (const root of doc.getRoot().getDefaultScene().listChildren()) {
    let tris = 0;
    root.traverse((n) => { const m = n.getMesh(); if (m) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; });
    rows.push([root.getName(), tris]);
  }
}
const want = process.argv.slice(2);
rows.filter(([n]) => !want.length || want.includes(n)).sort((a, b) => b[1] - a[1]).slice(0, 60).forEach(([n, t]) => console.log(String(t).padStart(6), n));
