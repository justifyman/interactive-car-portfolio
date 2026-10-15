import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { renderClassic, renderHead } from './classic/render';
import type { Content } from './src/content';

// Injects SEO meta tags + the full classic-mode portfolio into index.html at build time,
// so crawlers and no-WebGL visitors get real content without running the 3D app.
function portfolioHtml(): Plugin {
  const contentPath = path.resolve(__dirname, 'src/content.json');
  return {
    name: 'portfolio-html',
    transformIndexHtml(html) {
      const content = JSON.parse(fs.readFileSync(contentPath, 'utf8')) as Content;
      return html.replace('<!--HEAD-->', renderHead(content)).replace('<!--CLASSIC-->', renderClassic(content));
    },
    handleHotUpdate({ file, server }) {
      if (file === contentPath) server.ws.send({ type: 'full-reload' });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'CREDITS.md', source: fs.readFileSync(path.resolve(__dirname, 'CREDITS.md'), 'utf8') });
    },
  };
}

export default defineConfig({
  plugins: [react(), portfolioHtml()],
  build: {
    target: 'es2022',
    // Rapier ships its WebAssembly inlined, so the physics chunk is large by design.
    chunkSizeWarningLimit: 2600,
  },
  server: { host: true },
});
