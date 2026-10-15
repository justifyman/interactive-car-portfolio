import { interactionGroups } from '@react-three/rapier';

// Collision layers.
export const G = {
  STATIC: 0, // terrain, buildings, trees, posts, walls
  PLAYER: 1,
  AI: 2,
  PROPS: 3, // knockable dynamic objects
  WHEEL_RAY: 4,
} as const;

export const groups = {
  static: interactionGroups(G.STATIC),
  player: interactionGroups(G.PLAYER, [G.STATIC, G.AI, G.PROPS]),
  ai: interactionGroups(G.AI, [G.STATIC, G.PLAYER, G.AI, G.PROPS]),
  props: interactionGroups(G.PROPS, [G.STATIC, G.PLAYER, G.AI, G.PROPS]),
  /** Wheel ray-casts only see static ground/world, never props or other cars. */
  wheelRay: interactionGroups(G.WHEEL_RAY, [G.STATIC]),
};

// Frame-loop priorities (lower runs first; >0 would take over rendering).
export const PRIORITY = {
  physics: -50,
  vehicles: -40,
  camera: -30,
  world: -20,
} as const;
