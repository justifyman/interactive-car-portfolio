// App shell: decides between the 3D game and the classic scrolling portfolio
// (which is pre-rendered into index.html at build time).
import { lazy, Suspense, useEffect, useState } from 'react';
import { bindKeyboard } from './game/input';
import { useGame } from './game/store';
import { Loading } from './ui/Loading';
import { Overlay } from './ui/Overlay';

const Game = lazy(() => import('./game/Game'));

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export default function App() {
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);
  const [supported] = useState(webglSupported);
  // Mount the 3D scene once; keep it alive (paused) while in classic mode.
  const [gameMounted, setGameMounted] = useState(mode === 'game' && supported);

  useEffect(() => bindKeyboard(), []);

  useEffect(() => {
    if (!supported) setMode('classic');
  }, [supported, setMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('mode-game', mode === 'game');
    root.classList.toggle('mode-classic', mode === 'classic');
    if (mode === 'game' && supported) setGameMounted(true);
    if (mode === 'classic') window.scrollTo({ top: 0 });
  }, [mode, supported]);

  // Wire the "Play the 3D version" button that lives in the static classic HTML.
  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>('.classic [data-action="play"]');
    if (!btn) return;
    btn.hidden = !supported;
    const onClick = () => setMode('game');
    btn.addEventListener('click', onClick);
    return () => btn.removeEventListener('click', onClick);
  }, [supported, setMode]);

  if (!supported) return null;
  return (
    <div className="game-root" aria-hidden={mode !== 'game'}>
      {gameMounted && (
        <Suspense fallback={null}>
          <Game paused={mode !== 'game'} />
        </Suspense>
      )}
      {mode === 'game' && <Overlay />}
      {mode === 'game' && <Loading />}
    </div>
  );
}
