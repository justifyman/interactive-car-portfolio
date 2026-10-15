import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import path from 'node:path';
import fs from 'node:fs';
const io = new NodeIO();
const files = process.argv.slice(2);
for (const f of files) {
  try {
    const doc = await io.read(f);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() || root.listScenes()[0];
    const b = getBounds(scene);
    const sz = b.max.map((v, i) => (v - b.min[i]).toFixed(2));
    const tex = root.listTextures().map(t => t.getURI() || ('embedded:' + (t.getImage()?.byteLength||0))).join(',');
    const mats = root.listMaterials().map(m => m.getName()).join(',');
    const nodes = root.listNodes().map(n => n.getName()).join(',');
    console.log(path.basename(f), 'size', sz.join('x'), 'min', b.min.map(v=>v.toFixed(2)).join(','), 'tris?', root.listMeshes().length, 'mats', mats, 'tex', tex, 'nodes', nodes.slice(0,120), (fs.statSync(f).size/1024).toFixed(0)+'KB');
  } catch (e) { console.log(f, 'ERR', e.message); }
}
