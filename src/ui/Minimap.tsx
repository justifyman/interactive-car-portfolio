// Round minimap, rotated 45° to match the fixed isometric camera (map up = screen up).
import { useEffect, useRef } from 'react';
import { runtime } from '../game/store';
import { ICON_COLORS } from '../game/world/icons';
import { HOUSES, LOCATIONS, PLAZA } from '../game/world/layout';
import { loop, tunnelSpur, ROAD_WIDTH } from '../game/world/roads';
import { FENCE_X, SHORE_X, SHORE_Z, WALL_Z } from '../game/world/terrain';

const SIZE = 256;
const SCALE = 1.45;
const toMap = (x: number, z: number): [number, number] => [SIZE / 2 + ((x - z) / Math.SQRT2) * SCALE, SIZE / 2 + ((x + z) / Math.SQRT2) * SCALE];

function drawStatic() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#93A6A6'; // water
  ctx.fillRect(0, 0, SIZE, SIZE);
  const poly = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(...toMap(x, z)) : ctx.moveTo(...toMap(x, z))));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  poly([[-90, -90], [90, -90], [90, WALL_Z], [-90, WALL_Z]], '#8FA07E'); // north hills
  poly([[-90, -90], [FENCE_X, -90], [FENCE_X, 90], [-90, 90]], '#8FA07E'); // west hills
  poly([[FENCE_X, WALL_Z], [SHORE_X, WALL_Z], [SHORE_X, SHORE_Z], [FENCE_X, SHORE_Z]], '#B5C4A0'); // town
  const road = (pts: { p: { x: number; z: number } }[], closed: boolean) => {
    ctx.beginPath();
    pts.forEach((s, i) => (i ? ctx.lineTo(...toMap(s.p.x, s.p.z)) : ctx.moveTo(...toMap(s.p.x, s.p.z))));
    if (closed) ctx.closePath();
    ctx.strokeStyle = '#E3D9C8';
    ctx.lineWidth = ROAD_WIDTH * SCALE;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  road(loop.samples, true);
  road(tunnelSpur.samples, false);
  ctx.fillStyle = '#E3D9C8';
  ctx.beginPath();
  ctx.arc(...toMap(PLAZA.x, PLAZA.z), PLAZA.r * SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#D7C6B0';
  for (const h of HOUSES) {
    const [x, y] = toMap(h.x, h.z);
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }
  for (const l of LOCATIONS) {
    if (l.id === 'hero') continue;
    const [x, y] = toMap(l.pad[0], l.pad[1]);
    ctx.fillStyle = '#F6EFE3';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ICON_COLORS[l.id];
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const base = drawStatic();
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return;
      last = t;
      ctx.drawImage(base, 0, 0);
      const [x, y] = toMap(runtime.carPosition.x, runtime.carPosition.z);
      // Heading in map space.
      const fx = runtime.carForward.x;
      const fz = runtime.carForward.z;
      const a = Math.atan2((fx + fz) / Math.SQRT2, (fx - fz) / Math.SQRT2);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = '#B5706B';
      ctx.strokeStyle = '#FBF7F0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="minimap" aria-hidden="true">
      <canvas ref={ref} width={SIZE} height={SIZE} />
    </div>
  );
}
