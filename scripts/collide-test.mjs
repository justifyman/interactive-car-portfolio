// Physics check: drive full-throttle into obstacles and verify the car never passes through.
import { chromium } from 'playwright';
const TESTS = [
  // name, start x, z, yaw, obstacle check: the car must not end beyond `limit` along its heading
  { name: 'library wall', x: -20, z: -30, yaw: Math.PI, axis: 'z', limit: -34.5, dir: -1 },
  { name: 'workshop wall', x: 30, z: -29, yaw: Math.PI, axis: 'z', limit: -35.5, dir: -1 },
  { name: 'north retaining wall', x: -30, z: -40, yaw: Math.PI, axis: 'z', limit: -46.0, dir: -1 },
  { name: 'west fence', x: -55, z: 20, yaw: -Math.PI / 2, axis: 'x', limit: -62.2, dir: -1 },
  { name: 'south rope fence', x: 0, z: 38, yaw: 0, axis: 'z', limit: 44.3, dir: 1 },
  { name: 'east rope fence', x: 56, z: 20, yaw: Math.PI / 2, axis: 'x', limit: 62.3, dir: 1 },
  { name: 'tunnel gate', x: 6, z: -36, yaw: Math.PI, axis: 'z', limit: -45.6, dir: -1 },
  { name: 'post office', x: 51.5, z: -1, yaw: Math.PI, axis: 'z', limit: -6.3, dir: -1 }, // front wall at z≈-7.1, car half-length ≈1.25
  { name: 'fountain', x: 0, z: 8, yaw: Math.PI, axis: 'z', limit: 1.5, dir: -1 },
  { name: 'dock end railing', x: 30, z: 46, yaw: 0, axis: 'z', limit: 56.9, dir: 1 },
];
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
await p.evaluate(() => window.__game.useGame.getState().start());
await p.waitForTimeout(1500);
let fails = 0;
for (const t of TESTS) {
  await p.evaluate(([x, z, yaw]) => window.__game.runtime.teleport(x, z, yaw), [t.x, t.z, t.yaw]);
  await p.waitForTimeout(600);
  await p.keyboard.down('KeyW');
  let worst = -Infinity;
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(200);
    const v = await p.evaluate((axis) => window.__game.runtime.carPosition[axis], t.axis);
    worst = Math.max(worst, v * t.dir);
  }
  await p.keyboard.up('KeyW');
  const ok = worst <= t.limit * t.dir;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name.padEnd(22)} furthest ${t.axis}=${(worst * t.dir).toFixed(2)}  limit ${t.limit}`);
  if (!ok) await p.screenshot({ path: `${process.argv[2] ?? '.'}/fail-${t.name.replace(/\s+/g, '-')}.png` });
}
console.log(fails ? `${fails} failures` : 'all collision tests passed');
await b.close();
