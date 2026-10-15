import { ICONS } from '../game/world/icons';
import type { SectionId } from '../game/store';

const UI_ICONS = {
  soundOn: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 8.5a5 5 0 0 1 0 7 M18 6a8.5 8.5 0 0 1 0 12',
  soundOff: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M16 9.5l5 5 M21 9.5l-5 5',
  close: 'M6 6l12 12 M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  horn: 'M4 10v4h3l6 4V6L7 10z M16.5 9a4 4 0 0 1 0 6',
  reset: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4.5h4.5',
  brake: 'M6 12h12 M12 6v12 M4.5 4.5l15 15',
  drift: 'M5 17c4 0 4-10 8-10s4 6 6 6 M5 7h3',
  copy: 'M9 9h10v11H9z M5 15V4h10',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  mail: ICONS.contact,
  car: 'M4 15v-3l2-5h12l2 5v3 M3 15h18v3H3z M7 18v1.5 M17 18v1.5 M6.5 12h11',
} as const;

export type UiIconName = keyof typeof UI_ICONS;

export function Icon({ name, section, size = 22, strokeWidth = 2 }: { name?: UiIconName; section?: SectionId; size?: number; strokeWidth?: number }) {
  const d = section ? ICONS[section] : UI_ICONS[name ?? 'help'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
