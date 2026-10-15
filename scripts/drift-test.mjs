// Handling check: accelerate, handbrake-turn, release; log yaw/speed/slip over time.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.useGame?.getState().loaded, null, { timeout: 60000 });
await p.evaluate(() => { window.__game.useGame.getState().start(); window.__game.runtime.teleport(-14, 25.5, Math.PI / 2); });
await p.waitForTimeout(800);
const sample = () => p.evaluate(() => { const r = window.__game.runtime; const v = r.carVelocity; const f = r.carForward; const slip = Math.atan2(v.x * f.z - v.z * f.x, v.x * f.x + v.z * f.z); return `yaw=${r.carYaw.toFixed(2)} v=${r.carSpeed.toFixed(1)} slip=${(slip * 57.3).toFixed(0)}° drift=${r.drifting}`; });
const hold = async (keys, ms, label) => { for (const k of keys) await p.keyboard.down(k); const t0 = Date.now(); while (Date.now() - t0 < ms) { await p.waitForTimeout(150); console.log(label, await sample()); } for (const k of keys) await p.keyboard.up(k); };
await hold(['KeyW'], 1300, 'accel ');
await hold(['KeyW', 'KeyD'], 300, 'turn  ');
await hold(['KeyW', 'KeyD', 'Space'], 900, 'drift ');
await hold(['KeyW'], 1200, 'exit  ');
await p.screenshot({ path: process.argv[2] ?? 'drift.png' });
await b.close();
