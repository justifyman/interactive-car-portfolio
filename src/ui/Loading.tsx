// Loading screen with real progress: a little car drives along a road bar.
import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';

function CarSvg() {
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true">
      <ellipse cx="32" cy="37" rx="26" ry="2.6" fill="rgba(70,62,105,0.18)" />
      <path d="M6 27c0-4 2-6 6-7l6-9c1.2-1.8 3-3 5.4-3h15.4c2.4 0 4.3 1.2 5.4 3l5 9c4 .8 7 3 7 7v4H6z" fill="#B5706B" />
      <path d="M20.5 19l4-7c.6-1 1.4-1.5 2.6-1.5h11c1.2 0 2 .5 2.6 1.5l3.6 7z" fill="#DCE6EA" />
      <rect x="31" y="10.5" width="2.4" height="8.5" fill="#B5706B" />
      <rect x="6" y="25" width="6" height="3" rx="1.5" fill="#F3D9A4" />
      <circle cx="17" cy="31" r="5.5" fill="#4E4A5E" />
      <circle cx="17" cy="31" r="2.2" fill="#C9C3D6" />
      <circle cx="47" cy="31" r="5.5" fill="#4E4A5E" />
      <circle cx="47" cy="31" r="2.2" fill="#C9C3D6" />
    </svg>
  );
}

export function Loading() {
  const { progress, active } = useProgress();
  const loaded = useGame((s) => s.loaded);
  const setMode = useGame((s) => s.setMode);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(() => useGame.getState().loaded);

  // Smooth the bar so it never jumps backwards between files.
  useEffect(() => {
    const target = loaded ? 100 : Math.min(96, progress);
    setShown((s) => Math.max(s, target));
  }, [progress, loaded]);

  useEffect(() => {
    if (loaded && !active) {
      const t = setTimeout(() => setDone(true), 500);
      return () => clearTimeout(t);
    }
  }, [loaded, active]);

  return (
    <div className={`loading${done ? ' is-done' : ''}`} role="status" aria-live="polite" aria-hidden={done}>
      <div className="loading__card">
        <p className="loading__title">Building a tiny town…</p>
        <p className="loading__sub">{shown < 30 ? 'Pouring the roads' : shown < 70 ? 'Planting the trees' : shown < 100 ? 'Polishing the car' : 'Ready!'}</p>
        <div className="road-bar" aria-hidden="true">
          <div className="road-bar__fill" style={{ width: `${shown}%` }} />
          <div className="road-bar__dash" />
          <div className="road-bar__car" style={{ left: `${Math.max(6, Math.min(94, shown))}%` }}>
            <CarSvg />
          </div>
        </div>
        <p className="loading__pct">{Math.round(shown)}%</p>
        <button className="btn btn--ghost loading__skip" onClick={() => setMode('classic')}>
          Skip to the classic portfolio
        </button>
      </div>
    </div>
  );
}
