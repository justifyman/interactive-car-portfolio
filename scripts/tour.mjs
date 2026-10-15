// Dev helper: teleport the car to named spots and screenshot each.
//   node scripts/tour.mjs <outDir> [spot,...] [--zoom 1] [--w 1440 --h 900]
import { chromium } from 'playwright';
const SPOTS = {
  spawn: [5, 9.5, 2.4], about: [-12, -7, 1.57], experience: [-20, -31, 3.14], projects: [24, -31, 3.14],
  skills: [-20, 30, 0], contact: [45, -6, -1.57], dock: [30, 50, 0], tunnel: [6, -40, 3.14],
  windmill: [-46, 22, 1.57], ne: [50, -40, 0], se: [55, 40, 0], sw: [-55, 40, 0], nw: [-55, -40, 0], lake: [40, 41, 0],
};
const args = process.argv.slice(2);
const out = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const list = (args[1] && !args[1].startsWith('--') ? args[1].split(',') : Object.keys(SPOTS));
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +opt('w', 1440), height: +opt('h', 900) } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await p.goto(opt('url', 'http://localhost:5173/') , { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
await p.waitForTimeout(1500);
await p.evaluate((z) => { window.__game.camera.userZoom = z; window.__game.useGame.getState().start(); }, +opt('zoom', 1));
for (const name of list) {
  const [x, z, yaw] = SPOTS[name];
  await p.evaluate(([x, z, yaw]) => window.__game.runtime.teleport(x, z, yaw), [x, z, yaw]);
  await p.waitForTimeout(+opt('settle', 1800));
  await p.screenshot({ path: `${out}/${name}.png` });
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('fps ~', fps);
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await b.close();
