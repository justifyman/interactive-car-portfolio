# Drivable portfolio town

A portfolio you explore by driving a small cartoon car around a cozy miniature town.
Each building holds one part of the portfolio. Drive onto its glowing ring and press **E** (or tap) to open that section.
A **Classic view** button is always visible for anyone who'd rather scroll a normal page. The same content is also pre-rendered into `index.html` for search engines and for browsers without WebGL.

Stack: Vite · TypeScript · React Three Fiber + drei · Rapier physics (`@react-three/rapier`) · `postprocessing` · Zustand.

---

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The 3D models are already built into `public/models/`. You only need the asset pipeline to change which models are used or how they're tinted (see [Assets](#assets)).

```bash
npm run build          # type-check + production build → dist/
npm run preview        # serve dist/ locally on http://localhost:4173
```

## Editing your content

All text, links and images live in **`src/content.json`**. You don't need to touch any 3D code.

| Field | What it's for |
|---|---|
| `name`, `title`, `intro` | Welcome sign, intro card, HUD badge, page `<title>` |
| `about` | About panel (café): heading, paragraphs, quick facts |
| `projects[]` | Display boards at the workshop and the Projects panel: `title`, `description`, `tech[]`, `image`, `live`, `repo` (leave a link `""` to hide its button) |
| `skills[]` | Skills panel (grouped by `group`). Each skill also becomes a labelled, knockable crate in the tool-shed yard |
| `experience[]` | Timeline at the library (`kind`: `work` or `education`) |
| `contact` | Email, socials, optional `formEndpoint` (any JSON form service, e.g. Formspree). With no endpoint, the form opens the visitor's mail app |
| `resume` | Path to your PDF. Replace `public/resume.pdf` |
| `site` | Canonical URL, meta description, Open Graph image path |
| `easterEgg` | Text for the secret spot at the end of the dock |

Other files to replace:
- `public/projects/project-*.svg`: project screenshots (any 16:10 image works; `.png`/`.jpg` are fine, just update the paths).
- `public/og/og-image.png`: social preview. To regenerate it from the live scene after changing your name, run `npm run dev` and then `node scripts/og-image.mjs`.
- `public/favicon.svg`.

## Controls

| Desktop | Mobile |
|---|---|
| **W A S D** / arrows: drive (tank-style: forward/turn relative to the car) | Joystick (bottom left) |
| **Space**: handbrake / drift | Drift button |
| **E** / Enter: open the section you're parked on | Tap the "Open …" button |
| **H**: honk · **R**: reset car · **Esc**: close panel · **?**: help & fast travel | Honk / Reset buttons |
| Mouse wheel: zoom (within limits) | Pinch to zoom |

The car resets itself if it stays flipped for a few seconds. The help panel (**?** button) has **fast travel** to every section.

## URL flags

| Flag | Effect |
|---|---|
| `?debug` | Show every Rapier collider as a wireframe |
| `?quality=high\|medium\|low` | Force a quality tier (turns adaptive quality off) |
| `?classic` | Open straight into the classic scrolling page |
| `?gallery` (`&filter=ft-`) | Dev asset gallery: every model in the bundles, with sizes |

## How it's built

```
src/
  content.json            ← your text
  App.tsx                 game vs classic mode, WebGL fallback
  game/
    Game.tsx              canvas, physics world, adaptive quality
    IsoCamera.tsx         fixed isometric ortho camera, follow, zoom, occlusion uniforms
    Lighting.tsx          warm sun + cool sky fill; shadow frustum follows the camera
    materials.ts          shared shader patches: wind sway + see-through dithering
    assets.tsx            loads the GLB bundles, model registry, instancing helpers
    vehicle/              player car (Rapier ray-cast vehicle), AI traffic, car rig
    world/                terrain, roads, water, buildings, signs, zones, props, life
    fx/                   dust, skid marks, post-processing
    audio/audio.ts        procedural Web Audio (no sound files)
  ui/                     HTML overlay: HUD, panels, loading, minimap, touch controls
classic/render.ts         renders the classic page + SEO tags into index.html at build time
scripts/                  asset pipeline + dev/test helpers
```

A few notes on the design:
- **Art direction.** Every model comes from CC0 packs (mostly Kenney). `scripts/build-assets.mjs` retints each pack's palette texture in OKLCH toward the brand palette, so different packs look like one world: dusty and warm, with cool purple-blue darks. Procedural parts (terrain, roads, curbs, water, signs, stone walls, rings) use the same palette in their shaders.
- **Landmarks** are assembled in code from the modular fantasy-town kit (`world/building.ts`), so each portfolio building is unique.
- **Collisions.** Everything in the world has a collider: buildings (one oriented box per wing), trees (trunk cylinders), lamps, signs, fences, rocks, the mailbox, and a physical boundary all the way round. The boundary has a visible reason everywhere: a stone retaining wall, a fence with hedges, a rope fence along the beach, and dock railings. Check them with `?debug`.
- **Knockable props** (cones, crates, barrels, bins, parcels, skill crates) are dynamic bodies that tumble and settle. If one gets knocked far away, it quietly respawns in place once it has settled and you've driven off.
- **Traffic.** One or two AI cars come out of the tunnel, do a few laps in either direction, yield to you, honk if you block them, then leave. A boom barrier lifts to let them through.
- **See-through buildings.** Buildings and trees between the camera and the car dither away inside a small circle around the car, so it's never fully hidden.
- **Performance.** Static geometry is merged into spatial chunks per material, so draw calls stay low and frustum culling works for the shadow pass too. The shadow map follows the camera and is snapped to texels. A `PerformanceMonitor` steps quality down (shadow resolution, AO/tilt-shift/bloom, pixel ratio) when the frame rate drops. Initial download is about 3 MB gzipped.

## Assets

The built bundles in `public/models/` are committed, so deploys don't need the source packs. To rebuild them (for example after changing `scripts/asset-manifest.mjs` or the palette):

```bash
npm run assets:fetch   # downloads the CC0 packs into .asset-cache/ (needs curl + unzip)
npm run assets:build   # retint → rescale → merge → meshopt-compress → public/models/*.glb, regenerates CREDITS.md
```

- `scripts/asset-manifest.mjs`: which models go in which bundle, and their world size.
- `scripts/palette.mjs`: the palette remap (hue anchors, chroma caps, warm/cool neutrals).
- Textures are tiny 512×512 palette atlases, so KTX2 wouldn't save anything here. Geometry is quantized and meshopt-compressed; the decoder is bundled, so nothing loads from a CDN.

All asset credits are in [`CREDITS.md`](CREDITS.md), and also shown in-site via the ♥ button.

## Deploying

The site is fully static: build once, serve `dist/`.

### Vercel
1. Push the repo to GitHub, GitLab or Bitbucket.
2. In Vercel, choose **Add New → Project** and import the repo. `vercel.json` already sets the Vite framework, `npm run build`, the `dist` output and cache headers.
3. Click **Deploy**. Then set your domain and update `site.url` in `src/content.json` so the canonical and OG URLs are right.

To deploy from the CLI instead: `npm i -g vercel && vercel --prod`.

### Netlify
1. Push the repo, then in Netlify choose **Add new site → Import an existing project**.
2. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`), Node 22 and cache headers.
3. Click **Deploy**.

To deploy from the CLI instead: `npm i -g netlify-cli && netlify deploy --build --prod`.

Requirements: Node 20+ (tested with Node 24) and npm 10+.

## Dev & test scripts

These need the dev server running (`npm run dev`) and use Playwright's Chromium (`npx playwright install chromium`):

| Script | What it does |
|---|---|
| `node scripts/tour.mjs <outDir> [spots]` | Teleports to each location and screenshots it |
| `node scripts/collide-test.mjs` | Drives full-throttle into walls, fences and buildings, and checks the car never passes through |
| `node scripts/traffic-test.mjs` | Samples AI car positions to confirm traffic flows |
| `node scripts/ui-test.mjs <outDir> [--mobile]` | Runs the intro → drive → panel → classic flow |
| `node scripts/perf.mjs [--mobile]` | FPS, draw calls and triangles for each quality tier |
| `node scripts/og-image.mjs` | Regenerates the Open Graph image |
