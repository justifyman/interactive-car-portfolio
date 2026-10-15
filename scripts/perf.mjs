// Perf probe: fps + renderer stats per quality tier, with the car driving around.
import { chromium, devices } from 'playwright';
const mobile = process.argv.includes('--mobile');
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const q of ['high', 'medium', 'low']) {
  const ctx = mobile ? await b.newContext({ ...devices['Pixel 7'] }) : await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', (m) => m.text().startsWith('[game]') && logs.push(m.text()));
  await p.goto(`http://localhost:5173/?quality=${q}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
  await p.evaluate(() => window.__game.useGame.getState().start());
  await p.waitForTimeout(1500);
  await p.keyboard.down('KeyW');
  await p.keyboard.down('KeyA');
  const r = await p.evaluate(() => new Promise((res) => {
    let n = 0; let worst = 0; let last = performance.now(); const t0 = last;
    const f = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++;
      if (now - t0 < 4000) requestAnimationFrame(f); else { const i = window.__game.renderer.info; const fi = window.__game.frameInfo; res({ fps: (n / 4).toFixed(1), worstFrameMs: worst.toFixed(1), calls: fi.calls, tris: fi.triangles, geos: i.memory.geometries, tex: i.memory.textures, q: window.__game.useGame.getState().quality }); } };
    requestAnimationFrame(f); }));
  console.log(q.padEnd(7), JSON.stringify(r), logs.join(' '));
  await ctx.close();
}
await b.close();
