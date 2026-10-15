// HTML UI layered over the 3D scene: HUD, prompt, intro card, panels, credits.
import { useEffect, useMemo, useRef, useState } from 'react';
import creditsMd from '../../CREDITS.md?raw';
import { content } from '../content';
import { sfx } from '../game/audio/audio';
import { fireAction } from '../game/input';
import { useGame } from '../game/store';
import { LOCATIONS } from '../game/world/layout';
import { Icon } from './Icon';
import { Minimap } from './Minimap';
import { Panels } from './Panels';
import { TouchControls } from './TouchControls';

function Hud() {
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const setMode = useGame((s) => s.setMode);
  const open = useGame((s) => s.open);
  const setShowCredits = useGame((s) => s.setShowCredits);
  useEffect(() => sfx.setMuted(muted), [muted]);
  return (
    <div className="hud-top">
      <button className="brand btn" style={{ minHeight: 48 }} onClick={() => open('hero')} aria-label={`${content.name} — open the welcome panel`}>
        <span className="brand__dot" aria-hidden="true">
          {content.name.replace(/[^A-Za-z]/g, '').charAt(0) || '★'}
        </span>
        <span style={{ textAlign: 'left' }}>
          <span className="brand__name" style={{ display: 'block' }}>
            {content.name}
          </span>
          <span className="brand__title">{content.title}</span>
        </span>
      </button>
      <div className="hud-actions">
        <button className="btn icon-btn" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted} title={muted ? 'Sound off' : 'Sound on'}>
          <Icon name={muted ? 'soundOff' : 'soundOn'} />
        </button>
        <button className="btn icon-btn" onClick={() => open('hero')} aria-label="Help and fast travel" title="Help & fast travel">
          <Icon name="help" />
        </button>
        <button className="btn icon-btn" onClick={() => setShowCredits(true)} aria-label="Credits" title="Credits">
          <Icon name="heart" />
        </button>
        <button className="btn btn--primary classic-btn" onClick={() => setMode('classic')} title="Skip the game: plain scrolling version" aria-label="Classic view">
          <Icon name="list" size={18} />
          <span className="label">Classic view</span>
        </button>
      </div>
    </div>
  );
}

function Prompt() {
  const near = useGame((s) => s.nearZone);
  const open = useGame((s) => s.openPanel);
  const isTouch = useGame((s) => s.isTouch);
  if (!near || open || near === 'easter') return null;
  const label = near === 'projects' ? 'Projects' : LOCATIONS.find((l) => l.id === near)?.label ?? near;
  return (
    <div className="prompt" role="status">
      {isTouch ? (
        <button className="btn btn--primary" onClick={() => fireAction('interact')}>
          Open {label}
        </button>
      ) : (
        <>
          <span>
            Press <kbd>E</kbd> to open <strong>{label}</strong>
          </span>
          <button className="btn btn--primary" style={{ minHeight: 38 }} onClick={() => fireAction('interact')}>
            Open
          </button>
        </>
      )}
    </div>
  );
}

function Intro() {
  const start = useGame((s) => s.start);
  const setMode = useGame((s) => s.setMode);
  const isTouch = useGame((s) => s.isTouch);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const go = () => {
    start();
    sfx.click();
    (document.querySelector('.game-canvas canvas') as HTMLCanvasElement | null)?.focus();
  };
  return (
    <div className="intro" role="dialog" aria-labelledby="intro-title" aria-describedby="intro-line">
      <p className="intro__eyebrow">Welcome to my little town</p>
      <h1 id="intro-title">{content.name}</h1>
      <p className="intro__title">{content.title}</p>
      <p className="intro__line" id="intro-line">
        {content.intro} Hop in the car and drive to each building to explore my work.
      </p>
      <div className="intro__actions">
        <button ref={ref} className="btn btn--primary" onClick={go}>
          <Icon name="car" size={18} /> Start driving
        </button>
        <button className="btn btn--ghost" onClick={() => setMode('classic')}>
          Classic portfolio
        </button>
      </div>
      <p className="intro__hint">{isTouch ? 'Joystick to drive · tap rings to explore' : 'WASD / arrows to drive · Space to drift · E to open · H to honk'}</p>
    </div>
  );
}

function ControlsHint() {
  const started = useGame((s) => s.started);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => setHidden(true), 14000);
    return () => clearTimeout(t);
  }, [started]);
  if (hidden || !started) return null;
  return (
    <div className="controls-hint" aria-hidden="true">
      <kbd>W</kbd>
      <kbd>A</kbd>
      <kbd>S</kbd>
      <kbd>D</kbd> drive · <kbd>Space</kbd> drift
      <br />
      <kbd>E</kbd> open · <kbd>H</kbd> honk · <kbd>R</kbd> reset
    </div>
  );
}

/** Tiny markdown → HTML for CREDITS.md (headings, lists, links, code). */
function mdToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  let html = '';
  let inList = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('- ')) {
      if (!inList) html += '<ul>';
      inList = true;
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    if (line.startsWith('### ')) html += `<h3>${inline(line.slice(4))}</h3>`;
    else if (line.startsWith('## ')) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (line.startsWith('# ')) continue;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html;
}

function Credits() {
  const show = useGame((s) => s.showCredits);
  const setShow = useGame((s) => s.setShowCredits);
  const html = useMemo(() => mdToHtml(creditsMd), []);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShow(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, setShow]);
  if (!show) return null;
  return (
    <>
      <div className="panel-backdrop" onClick={() => setShow(false)} aria-hidden="true" />
      <div ref={ref} className="panel" role="dialog" aria-modal="true" aria-labelledby="credits-title" tabIndex={-1}>
        <div className="panel__head">
          <div className="panel__badge" style={{ background: '#B5706B', color: '#fffaf2' }}>
            <Icon name="heart" />
          </div>
          <div>
            <p className="panel__kicker">Made with</p>
            <h2 className="panel__title" id="credits-title">
              Credits
            </h2>
          </div>
          <button className="btn icon-btn panel__close" onClick={() => setShow(false)} aria-label="Close credits">
            <Icon name="close" />
          </button>
        </div>
        <div className="panel__body credits" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}

export function Overlay() {
  const loaded = useGame((s) => s.loaded);
  const started = useGame((s) => s.started);
  const isTouch = useGame((s) => s.isTouch);
  const openPanel = useGame((s) => s.openPanel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !useGame.getState().openPanel) useGame.getState().open('hero');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={`ui${isTouch ? ' is-touch' : ''}`}>
      {loaded && <Hud />}
      {loaded && started && !openPanel && <Minimap />}
      {loaded && started && isTouch && !openPanel && <TouchControls />}
      {loaded && started && <Prompt />}
      {loaded && started && <ControlsHint />}
      {loaded && !started && <Intro />}
      <Panels />
      <Credits />
    </div>
  );
}
