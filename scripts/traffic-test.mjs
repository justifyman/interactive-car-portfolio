// Traffic check: sample AI car positions over time to confirm they drive the loop.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
await p.evaluate(() => window.__game.useGame.getState().start());
for (let i = 0; i < +(process.argv[3] ?? 12); i++) {
  await p.waitForTimeout(2500);
  const cars = await p.evaluate(() => [...window.__game.traffic.entries()].map(([k, v]) => `#${k} (${v.pos.x.toFixed(1)}, ${v.pos.y.toFixed(2)}, ${v.pos.z.toFixed(1)})`));
  console.log(`t=${((i + 1) * 2.5).toFixed(1)}s  ${cars.join('  ')}`);
}
if (process.argv[2]) {
  const pos = await p.evaluate(() => { const v = [...window.__game.traffic.values()][0]; return v ? [v.pos.x, v.pos.z] : null; });
  if (pos) { await p.evaluate(([x, z]) => window.__game.runtime.teleport(x + 6, z + 6, 0), pos); await p.waitForTimeout(1200); await p.screenshot({ path: process.argv[2] }); }
}
console.log(logs.join('\n') || 'no errors');
await b.close();
