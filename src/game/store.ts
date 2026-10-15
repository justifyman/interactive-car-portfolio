import { create } from 'zustand';
import * as THREE from 'three';

export type SectionId = 'hero' | 'about' | 'projects' | 'skills' | 'experience' | 'contact' | 'easter';
export type Quality = 'high' | 'medium' | 'low';

const params = new URLSearchParams(location.search);

function detectTouch() {
  return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function initialQuality(): Quality {
  const forced = params.get('quality');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (detectTouch()) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  return cores <= 4 || mem <= 4 ? 'medium' : 'high';
}

interface GameState {
  mode: 'game' | 'classic';
  loaded: boolean;
  started: boolean; // visitor dismissed the intro overlay
  muted: boolean;
  quality: Quality;
  isTouch: boolean;
  debug: boolean;
  nearZone: SectionId | null;
  openPanel: SectionId | null;
  projectIndex: number;
  eggFound: boolean;
  carSkin: number;
  showCredits: boolean;
  setMode: (m: GameState['mode']) => void;
  setLoaded: () => void;
  start: () => void;
  toggleMute: () => void;
  setQuality: (q: Quality) => void;
  setNearZone: (z: SectionId | null) => void;
  open: (p: SectionId, projectIndex?: number) => void;
  close: () => void;
  findEgg: () => void;
  cycleCar: () => void;
  setShowCredits: (v: boolean) => void;
}

export const useGame = create<GameState>((set, get) => ({
  mode: params.has('classic') ? 'classic' : 'game',
  loaded: false,
  started: false,
  muted: true,
  quality: initialQuality(),
  isTouch: detectTouch(),
  debug: params.has('debug'),
  nearZone: null,
  openPanel: null,
  projectIndex: 0,
  eggFound: false,
  carSkin: 0,
  showCredits: false,
  setMode: (mode) => set({ mode, openPanel: null }),
  setLoaded: () => set({ loaded: true }),
  start: () => set({ started: true }),
  toggleMute: () => set({ muted: !get().muted }),
  setQuality: (quality) => set({ quality }),
  setNearZone: (nearZone) => set({ nearZone }),
  open: (openPanel, projectIndex = 0) => set({ openPanel, projectIndex }),
  close: () => set({ openPanel: null }),
  findEgg: () => set({ eggFound: true }),
  cycleCar: () => set({ carSkin: (get().carSkin + 1) % 4 }),
  setShowCredits: (showCredits) => set({ showCredits }),
}));

/** Per-frame shared state. Mutated in place; never triggers React renders. */
export const runtime = {
  carPosition: new THREE.Vector3(0, 0, 0),
  carVelocity: new THREE.Vector3(),
  carForward: new THREE.Vector3(0, 0, -1),
  carSpeed: 0, // signed forward speed (m/s)
  carYaw: 0,
  drifting: false,
  grounded: true,
  cameraZoomBias: 1,
  /** Player car rigid-body handle (Rapier), for AI avoidance & reset. */
  carBodyHandle: -1,
  lastBumpAt: 0,
  elapsed: 0,
  /** Set by PlayerCar: move the car (debug / tests / reset). */
  teleport: (_x: number, _z: number, _yaw?: number) => {},
};

export const urlParams = params;

// Test/debug hook (used by scripts/shot.mjs to verify physics headlessly).
(window as unknown as { __game: Record<string, unknown> }).__game = { runtime, useGame };
