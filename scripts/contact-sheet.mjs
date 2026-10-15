// Dev helper: render a grid of preview PNGs to a single image (uses Playwright).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const [out, cols, ...files] = process.argv.slice(2);
const cells = files.map(f => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${path.basename(f, '.png')}</figcaption></figure>`).join('');
const html = `<html><body style="margin:0;background:#555;font:12px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">${cells}</div><style>figure{margin:0;text-align:center}img{width:100%;background:#777}</style></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
