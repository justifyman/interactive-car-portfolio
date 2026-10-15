// Small hand-drawn icon set (24×24 stroke paths) + procedural wood textures,
// rendered to canvas so signs and markers stay crisp and on-palette.
import * as THREE from 'three';
import { canvasTexture } from '../materials';
import { palette } from '../palette';
import type { SectionId } from '../store';

export const ICONS: Record<SectionId, string> = {
  hero: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  about: 'M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M7.5 3.5c0 1.5 1 1.5 1 3 M11.5 3.5c0 1.5 1 1.5 1 3',
  projects: 'M14.5 5.5l4 4-2.5 2.5-4-4z M12 8l-8.5 8.5a1.8 1.8 0 0 0 2.5 2.5L14.5 10.5 M15.5 3.5l5 5',
  skills: 'M3 9h18v10H3z M8.5 9V6.5h7V9 M3 13.5h18 M11 12.5h2v2h-2z',
  experience: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z M4 20.5A2.5 2.5 0 0 1 6.5 18H20 M8 7h8 M8 10.5h6',
  contact: 'M3 6h18v12H3z M3.5 6.5l8.5 6.5 8.5-6.5',
  easter: 'M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6l-5.3 2.9 1.1-6L3.4 9.3l6-.8z',
};

export const ICON_COLORS: Record<SectionId, string> = {
  hero: palette.sageTeal,
  about: palette.terracotta,
  projects: palette.mutedRed,
  skills: palette.sand,
  experience: palette.dustyBlue,
  contact: palette.sageTeal,
  easter: palette.sand,
};

export function drawIcon(ctx: CanvasRenderingContext2D, id: SectionId, x: number, y: number, size: number, color: string, width = 2) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(ICONS[id]));
  ctx.restore();
}

/** Round marker badge: cream disc, coloured ring, icon. */
export function markerTexture(id: SectionId) {
  return canvasTexture(`marker-${id}`, 256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    // Soft drop shadow.
    ctx.fillStyle = 'rgba(70, 64, 100, 0.22)';
    ctx.beginPath();
    ctx.arc(128, 136, 104, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ICON_COLORS[id];
    ctx.beginPath();
    ctx.arc(128, 124, 104, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F6EFE3';
    ctx.beginPath();
    ctx.arc(128, 124, 84, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, id, 128, 124, 112, palette.ink, 2.1);
  });
}

/** Warm painted wood with grain and plank seams. */
export function woodTexture(key = 'wood', base = '#B88B67', planks = 4) {
  const t = canvasTexture(key, 512, 256, (ctx) => {
    const c = new THREE.Color(base);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 256);
    const ph = 256 / planks;
    for (let p = 0; p < planks; p++) {
      const shade = 0.92 + ((p * 37) % 10) / 70;
      ctx.fillStyle = `#${c.clone().multiplyScalar(shade).getHexString()}`;
      ctx.fillRect(0, p * ph, 512, ph);
      // Grain.
      for (let i = 0; i < 26; i++) {
        const y = p * ph + Math.random() * ph;
        ctx.strokeStyle = `rgba(90, 60, 40, ${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
        ctx.stroke();
      }
      // Knot.
      if (p % 2 === 0) {
        ctx.strokeStyle = 'rgba(90,60,40,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(80 + p * 110, p * ph + ph / 2, 12, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Seam.
      ctx.fillStyle = 'rgba(70, 48, 36, 0.35)';
      ctx.fillRect(0, p * ph, 512, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
