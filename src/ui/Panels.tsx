// HTML content panels (readable, accessible) that slide in over the 3D scene.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { content } from '../content';
import { sfx } from '../game/audio/audio';
import { runtime, useGame, type SectionId } from '../game/store';
import { ICON_COLORS } from '../game/world/icons';
import { LOCATIONS } from '../game/world/layout';
import { Icon } from './Icon';

const TITLES: Record<SectionId, { kicker: string; title: string }> = {
  hero: { kicker: 'Welcome to town', title: content.name },
  about: { kicker: 'The cozy café', title: 'About me' },
  projects: { kicker: 'The workshop', title: 'Projects' },
  skills: { kicker: 'The tool shed', title: 'Skills' },
  experience: { kicker: 'The library', title: 'Experience' },
  contact: { kicker: 'The post office', title: 'Contact' },
  easter: { kicker: 'Secret spot', title: content.easterEgg.title },
};

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])')];
    (focusables()[0] ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [ref, onClose]);
}

function PanelShell({ id, children, foot }: { id: SectionId; children: ReactNode; foot?: ReactNode }) {
  const close = useGame((s) => s.close);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const doClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    sfx.close();
    setTimeout(close, 200);
  }, [close, closing]);
  useFocusTrap(ref, doClose);
  const t = TITLES[id];
  return (
    <>
      <div className="panel-backdrop" onClick={doClose} aria-hidden="true" />
      <div ref={ref} className={`panel${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`panel-${id}-title`} tabIndex={-1}>
        <div className="panel__head">
          <div className="panel__badge" style={{ background: ICON_COLORS[id], color: '#fffaf2' }}>
            <Icon section={id} />
          </div>
          <div>
            <p className="panel__kicker">{t.kicker}</p>
            <h2 className="panel__title" id={`panel-${id}-title`}>
              {t.title}
            </h2>
          </div>
          <button className="btn icon-btn panel__close" onClick={doClose} aria-label="Close panel (Esc)">
            <Icon name="close" />
          </button>
        </div>
        <div className="panel__body">{children}</div>
        {foot && <div className="panel__foot">{foot}</div>}
      </div>
    </>
  );
}

function ExternalLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  if (!href) return null;
  return (
    <a className={`btn ${primary ? 'btn--primary' : 'btn--ghost'}`} href={href} target="_blank" rel="noopener noreferrer" onClick={() => sfx.click()}>
      {children} <Icon name="external" size={16} />
    </a>
  );
}

function HeroPanel() {
  const isTouch = useGame((s) => s.isTouch);
  const travel = (id: SectionId) => {
    const l = LOCATIONS.find((x) => x.id === id)!;
    useGame.getState().close();
    sfx.click();
    // Arrive right on the pad so the prompt appears immediately.
    setTimeout(() => runtime.teleport(l.pad[0], l.pad[1], Math.atan2(-1, -1)), 120);
  };
  return (
    <PanelShell id="hero">
      <p>
        <strong>{content.title}</strong> — {content.intro}
      </p>
      <h3>How to play</h3>
      {isTouch ? (
        <p>Drag the joystick to drive. Roll onto a glowing ring and tap the button to open a section.</p>
      ) : (
        <div className="kbd-list">
          <kbd>W A S D</kbd>
          <span>Drive (arrow keys work too)</span>
          <kbd>Space</kbd>
          <span>Handbrake / drift</span>
          <kbd>E</kbd>
          <span>Open a section when on a glowing ring</span>
          <kbd>H</kbd>
          <span>Honk</span>
          <kbd>R</kbd>
          <span>Reset the car</span>
          <kbd>Esc</kbd>
          <span>Close panels</span>
        </div>
      )}
      <h3>Fast travel</h3>
      <ul className="fast-travel">
        {LOCATIONS.filter((l) => l.id !== 'hero' && l.id !== 'easter').map((l) => (
          <li key={l.id}>
            <span className="ft-icon" style={{ background: ICON_COLORS[l.id], color: '#fffaf2' }}>
              <Icon section={l.id} />
            </span>
            <span className="ft-label">{l.label}</span>
            <button className="btn btn--ghost" onClick={() => travel(l.id)}>
              Drive there
            </button>
            <button className="btn" onClick={() => useGame.getState().open(l.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function AboutPanel() {
  return (
    <PanelShell id="about">
      <h3 style={{ marginTop: 0 }}>{content.about.heading}</h3>
      {content.about.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <dl className="facts">
        {content.about.facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </PanelShell>
  );
}

function ProjectsPanel() {
  const start = useGame((s) => s.projectIndex);
  const [i, setI] = useState(start);
  const n = content.projects.length;
  const go = useCallback(
    (d: number) => {
      setI((v) => (v + d + n) % n);
      sfx.click();
    },
    [n],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const p = content.projects[i];
  return (
    <PanelShell
      id="projects"
      foot={
        <>
          <button className="btn icon-btn" onClick={() => go(-1)} aria-label="Previous project">
            <Icon name="left" />
          </button>
          <button className="btn icon-btn" onClick={() => go(1)} aria-label="Next project">
            <Icon name="right" />
          </button>
          <div className="dots" role="tablist" aria-label="Projects">
            {content.projects.map((pp, k) => (
              <button key={pp.title} role="tab" aria-current={k === i} aria-label={pp.title} onClick={() => setI(k)} />
            ))}
          </div>
        </>
      }
    >
      <article aria-live="polite">
        <img className="project__img" src={p.image} alt={`Screenshot of ${p.title}`} width={640} height={400} />
        <h3 className="project__title">{p.title}</h3>
        <p>{p.description}</p>
        <ul className="tags" aria-label="Technologies">
          {p.tech.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <ExternalLink href={p.live} primary>
            Live site
          </ExternalLink>
          <ExternalLink href={p.repo}>Source code</ExternalLink>
        </div>
      </article>
    </PanelShell>
  );
}

function SkillsPanel() {
  const groups = new Map<string, string[]>();
  for (const s of content.skills) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s.name);
  }
  return (
    <PanelShell id="skills">
      <div className="skill-groups">
        {[...groups].map(([g, items]) => (
          <div key={g}>
            <h3>{g}</h3>
            <ul className="tags">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="tip">Psst — every crate in the yard outside is one of these skills. Go on, give them a bump.</p>
    </PanelShell>
  );
}

function ExperiencePanel() {
  return (
    <PanelShell
      id="experience"
      foot={
        content.resume ? (
          <a className="btn btn--primary" href={content.resume} download onClick={() => sfx.click()}>
            <Icon name="download" size={18} /> Download résumé
          </a>
        ) : undefined
      }
    >
      <ol className="timeline">
        {content.experience.map((e, k) => (
          <li key={k} className={e.kind === 'education' ? 'is-education' : ''}>
            <span className="timeline__period">{e.period}</span>
            <h3>
              {e.role} <span className="at">· {e.org}</span>
            </h3>
            <p style={{ margin: 0 }}>{e.summary}</p>
          </li>
        ))}
      </ol>
    </PanelShell>
  );
}

function ContactPanel() {
  const c = content.contact;
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.email);
      setCopied(true);
      sfx.click();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the mailto link still works */
    }
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!c.formEndpoint) {
      const body = encodeURIComponent(`${data.message}\n\n— ${data.name} (${data.email})`);
      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent(`Hello from ${data.name}`)}&body=${body}`;
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch(c.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  };
  return (
    <PanelShell id="contact">
      <p>{c.message}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--primary" href={`mailto:${c.email}`} onClick={() => sfx.click()}>
          <Icon name="mail" size={18} /> {c.email}
        </a>
        <button className="btn btn--ghost" onClick={copy}>
          <Icon name="copy" size={16} /> {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <ul className="socials">
        {c.socials.map((s) => (
          <li key={s.label}>
            <ExternalLink href={s.url}>{s.label}</ExternalLink>
          </li>
        ))}
      </ul>
      <h3>Send a note</h3>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input name="name" required autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Message
          <textarea name="message" required />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn--teal" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </button>
          <span className="form__status" role="status">
            {status === 'sent' ? 'Thanks! Message delivered.' : status === 'error' ? 'Hmm, that failed — try email instead.' : ''}
          </span>
        </div>
      </form>
    </PanelShell>
  );
}

function EasterPanel() {
  return (
    <PanelShell id="easter">
      <p>{content.easterEgg.message}</p>
      <p className="tip">
        <strong>Unlocked:</strong> press <kbd>C</kbd> (or the car button) to swap rides, and honk with <kbd>H</kbd> for a little tune.
      </p>
    </PanelShell>
  );
}

export function Panels() {
  const open = useGame((s) => s.openPanel);
  switch (open) {
    case 'hero':
      return <HeroPanel />;
    case 'about':
      return <AboutPanel />;
    case 'projects':
      return <ProjectsPanel />;
    case 'skills':
      return <SkillsPanel />;
    case 'experience':
      return <ExperiencePanel />;
    case 'contact':
      return <ContactPanel />;
    case 'easter':
      return <EasterPanel />;
    default:
      return null;
  }
}
