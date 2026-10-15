// On-screen joystick + buttons for touch devices (auto-detected).
import { useRef, useState } from 'react';
import { fireAction, input } from '../game/input';
import { useGame } from '../game/store';
import { Icon, type UiIconName } from './Icon';

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const ny = -dy / max;
    // Small dead zone, then a gentle curve for finer steering.
    const shape = (v: number) => (Math.abs(v) < 0.12 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - 0.12) / 0.8));
    input.joyX = shape(nx);
    input.joyY = shape(ny);
  };
  const end = () => {
    pointer.current = null;
    input.joyX = input.joyY = null;
    if (knob.current) knob.current.style.transform = '';
  };
  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Driving joystick"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="joystick__knob" />
    </div>
  );
}

function HoldButton({ icon, label, onDown, onUp }: { icon: UiIconName; label: string; onDown: () => void; onUp?: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <button
      className={`btn touch-btn${down ? ' is-down' : ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        setDown(true);
        onDown();
      }}
      onPointerUp={() => {
        setDown(false);
        onUp?.();
      }}
      onPointerCancel={() => {
        setDown(false);
        onUp?.();
      }}
      onPointerLeave={() => {
        if (down) {
          setDown(false);
          onUp?.();
        }
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function TouchControls() {
  const eggFound = useGame((s) => s.eggFound);
  return (
    <div className="touch-controls">
      <Joystick />
      <div className="touch-buttons">
        <HoldButton icon="drift" label="Drift" onDown={() => (input.handbrake = true)} onUp={() => (input.handbrake = false)} />
        <HoldButton icon="horn" label="Honk" onDown={() => fireAction('horn')} />
        <HoldButton icon="reset" label="Reset" onDown={() => fireAction('reset')} />
        {eggFound && <HoldButton icon="car" label="Car" onDown={() => fireAction('cycleCar')} />}
      </div>
    </div>
  );
}
