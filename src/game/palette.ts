// Art-direction palette. Muted, warm, slightly desaturated — never neon.
// Model textures are retinted toward these at build time (scripts/palette.mjs);
// procedural surfaces (terrain, roads, water, UI) use them directly.
export const palette = {
  grass: '#9DB08A',
  grassDark: '#7F9670',
  grassLight: '#B3C29C',
  road: '#C9BFAE',
  roadDark: '#A89F90',
  curb: '#DCD2C1',
  cream: '#E3D5C1',
  terracotta: '#C98F7A',
  dustyBlue: '#8FA3B5',
  sand: '#D9B88A',
  mutedRed: '#B5706B',
  sageTeal: '#6E8C8A',
  skyTop: '#E8DCCB',
  skyBottom: '#B9C7CF',
  shadow: '#5B5878', // cool purple-blue, never black
  ink: '#3B3542',
  soil: '#9A7F6A',
  soilDark: '#7A6456',
  water: '#7FA3A3',
  waterDeep: '#5E8487',
  foam: '#EEF0E6',
  lampGlow: '#FFD9A0',
  sun: '#FFE7CC',
} as const;

export type PaletteKey = keyof typeof palette;
