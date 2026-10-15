// Renders public/og/og-image.png (1200×630) from the live scene, UI hidden.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
await p.addStyleTag({ content: '.ui, .loading { display: none !important; }' });
await p.evaluate(() => {
  window.__game.useGame.getState().start();
  window.__game.camera.userZoom = 0.8;
  window.__game.runtime.teleport(4.5, 4.5, Math.PI * 0.8);
});
await p.waitForTimeout(3500);
await p.screenshot({ path: 'public/og/og-image.png' });
await b.close();
console.log('wrote public/og/og-image.png');
