// Lightweight event bus between gameplay code and the pooled FX renderers.

export interface DustEvent {
  x: number;
  y: number;
  z: number;
  strength: number;
  color?: number; // hex
}

export const dustQueue: DustEvent[] = [];
export function emitDust(x: number, y: number, z: number, strength = 1, color?: number) {
  if (dustQueue.length < 64) dustQueue.push({ x, y, z, strength, color });
}

export interface SkidEvent {
  wheel: number; // -1 = break all strips
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export const skidQueue: SkidEvent[] = [];
export function emitSkid(wheel: number, x: number, y: number, z: number, yaw: number) {
  if (skidQueue.length < 32) skidQueue.push({ wheel, x, y, z, yaw });
}

export interface BurstEvent {
  x: number;
  y: number;
  z: number;
  kind: 'confetti' | 'splash' | 'sparkle';
}
export const burstQueue: BurstEvent[] = [];
export function emitBurst(kind: BurstEvent['kind'], x: number, y: number, z: number) {
  burstQueue.push({ kind, x, y, z });
}
