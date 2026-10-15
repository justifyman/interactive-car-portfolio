// Downloads the CC0 source asset packs into .asset-cache/ (gitignored).
// Run once: `npm run assets:fetch`, then `npm run assets:build`.
// Requires `curl` and `unzip` on PATH (present on macOS and most Linux CI images).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.resolve('.asset-cache');

// Kenney asset page slugs. The zip URL contains a content hash that changes when
// Kenney updates a pack, so we scrape the current link from each page.
const KENNEY = [
  'car-kit',
  'city-kit-suburban',
  'city-kit-commercial',
  'city-kit-roads',
  'nature-kit',
  'fantasy-town-kit',
  'survival-kit',
  'watercraft-kit',
  'racing-kit',
  'mini-market',
  'furniture-kit',
  'platformer-kit',
];

// Individual CC0 models from Poly Pizza (direct static links).
const POLY_PIZZA = [
  { name: 'mailbox', url: 'https://static.poly.pizza/0414c2a4-9104-439a-a7e4-23db9adca97b.glb' },
];

fs.mkdirSync(path.join(CACHE, 'zips'), { recursive: true });

for (const slug of KENNEY) {
  const dest = path.join(CACHE, 'kenney', slug);
  if (fs.existsSync(dest)) {
    console.log(`✓ ${slug} (cached)`);
    continue;
  }
  const html = execFileSync('curl', ['-sL', '--max-time', '30', `https://kenney.nl/assets/${slug}`]).toString();
  const zip = html.match(/https?:\/\/[^"']+\.zip/)?.[0];
  if (!zip) throw new Error(`Could not find a download link on https://kenney.nl/assets/${slug}`);
  const zipPath = path.join(CACHE, 'zips', `${slug}.zip`);
  console.log(`↓ ${slug}  ${zip}`);
  execFileSync('curl', ['-sL', '--max-time', '300', '-o', zipPath, zip]);
  fs.mkdirSync(dest, { recursive: true });
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', dest]);
}

fs.mkdirSync(path.join(CACHE, 'polypizza'), { recursive: true });
for (const { name, url } of POLY_PIZZA) {
  const dest = path.join(CACHE, 'polypizza', `${name}.glb`);
  if (fs.existsSync(dest)) {
    console.log(`✓ ${name} (cached)`);
    continue;
  }
  console.log(`↓ ${name}  ${url}`);
  execFileSync('curl', ['-sL', '--max-time', '60', '-o', dest, url]);
}

console.log('\nDone. Now run: npm run assets:build');
