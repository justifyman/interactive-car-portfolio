// Unified input: keyboard + on-screen touch controls write into one mutable object.
import { useGame } from './store';

export const input = {
  forward: 0, // 0..1
  backward: 0, // 0..1
  left: 0, // 0..1
  right: 0, // 0..1
  handbrake: false,
  /** Analog overrides from the touch joystick (-1..1); null when not touching. */
  joyX: null as number | null,
  joyY: null as number | null,
};

type Listener = () => void;
const actions: Record<'horn' | 'reset' | 'interact' | 'cycleCar', Set<Listener>> = {
  horn: new Set(),
  reset: new Set(),
  interact: new Set(),
  cycleCar: new Set(),
};

export function onAction(name: keyof typeof actions, fn: Listener) {
  actions[name].add(fn);
  return () => {
    actions[name].delete(fn);
  };
}
export function fireAction(name: keyof typeof actions) {
  actions[name].forEach((fn) => fn());
}

/** Combined throttle (-1..1) and steer (-1..1, positive = left). */
export function readAxes() {
  if (input.joyX !== null && input.joyY !== null) {
    return { throttle: input.joyY, steer: -input.joyX };
  }
  return { throttle: input.forward - input.backward, steer: input.left - input.right };
}

const KEYMAP: Record<string, keyof typeof input> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const state = useGame.getState();
    if (state.mode !== 'game') return;
    // While a panel is open, driving keys are released so the panel can use arrows/tab.
    if (state.openPanel) return;
    const k = KEYMAP[e.code];
    if (k) {
      (input as Record<string, unknown>)[k] = 1;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Space':
        input.handbrake = true;
        e.preventDefault();
        break;
      case 'KeyH':
        fireAction('horn');
        break;
      case 'KeyR':
        fireAction('reset');
        break;
      case 'KeyE':
      case 'Enter':
        fireAction('interact');
        break;
      case 'KeyC':
        fireAction('cycleCar');
        break;
    }
  };
  const up = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) (input as Record<string, unknown>)[k] = 0;
    if (e.code === 'Space') input.handbrake = false;
  };
  const blur = () => {
    input.forward = input.backward = input.left = input.right = 0;
    input.handbrake = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  const unsub = useGame.subscribe((s, prev) => {
    if (s.openPanel && !prev.openPanel) blur();
  });
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    unsub();
  };
}
