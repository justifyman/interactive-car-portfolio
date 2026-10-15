// Dev helper: screenshot the running dev server with Playwright, optionally
// driving the car with a scripted key sequence.
//   node scripts/shot.mjs <url> <out.png> [--w 1440 --h 900] [--wait 4000]
//        [--keys "KeyW:2000,KeyW+KeyA:1500"] [--eval "JS expr"] [--shots 3] [--mobile]
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const context = flag('mobile')
  ? await browser.newContext({ ...devices['iPhone 13'] })
  : await browser.newContext({ viewport: { width: +opt('w', 1440), height: +opt('h', 900) }, deviceScaleFactor: +opt('dpr', 1) });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[game]')) logs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(+opt('wait', 4000));

const pre = opt('pre', '');
if (pre) await page.evaluate(pre);

const keys = opt('keys', '');
const shots = +opt('shots', 1);
const evalExpr = opt('eval', '');
const report = async (label) => {
  if (!evalExpr) return;
  try {
    const v = await page.evaluate(evalExpr);
    console.log(`${label}: ${JSON.stringify(v)}`);
  } catch (e) {
    console.log(`${label}: eval error ${e.message}`);
  }
};
await report('start');
if (keys) {
  let step = 0;
  for (const seg of keys.split(',')) {
    const [combo, ms] = seg.split(':');
    const ks = combo.split('+').filter(Boolean);
    for (const k of ks) if (k !== 'wait') await page.keyboard.down(k);
    await page.waitForTimeout(+ms);
    for (const k of ks) if (k !== 'wait') await page.keyboard.up(k);
    step++;
    await report(`after ${combo}`);
    if (shots > 1) await page.screenshot({ path: out.replace('.png', `-${step}.png`) });
  }
}
await page.waitForTimeout(+opt('settle', 300));
await page.screenshot({ path: out });
await report('end');
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
