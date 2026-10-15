// Renders the "classic" scrolling version of the portfolio as static HTML.
// Used by vite.config.ts at build time so the content is in the initial HTML for
// crawlers, no-JS visitors, and as the fallback when WebGL is unavailable.
import type { Content } from '../src/content';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const link = (href: string, label: string, cls = '') =>
  href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';

export function renderHead(c: Content): string {
  const title = `${c.name} — ${c.title}`;
  const og = c.site.url.replace(/\/$/, '') + c.site.ogImage;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: c.name,
    jobTitle: c.title,
    description: c.intro,
    email: `mailto:${c.contact.email}`,
    url: c.site.url,
    sameAs: c.contact.socials.map((s) => s.url),
  };
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(c.site.description)}" />`,
    `<link rel="canonical" href="${esc(c.site.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(c.site.description)}" />`,
    `<meta property="og:url" content="${esc(c.site.url)}" />`,
    `<meta property="og:image" content="${esc(og)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(c.site.description)}" />`,
    `<meta name="twitter:image" content="${esc(og)}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
}

export function renderClassic(c: Content): string {
  const groups = new Map<string, string[]>();
  for (const s of c.skills) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s.name);
  }

  const projects = c.projects
    .map(
      (p) => `
      <article class="c-project">
        <img src="${esc(p.image)}" alt="Screenshot of ${esc(p.title)}" loading="lazy" width="640" height="400" />
        <div class="c-project__body">
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <ul class="c-tags" aria-label="Technologies">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          <p class="c-links">${link(p.live, 'Live site ↗', 'c-btn')}${link(p.repo, 'Source code ↗', 'c-btn c-btn--ghost')}</p>
        </div>
      </article>`,
    )
    .join('');

  const timeline = c.experience
    .map(
      (e) => `
      <li class="c-timeline__item c-timeline__item--${esc(e.kind)}">
        <span class="c-timeline__period">${esc(e.period)}</span>
        <h3>${esc(e.role)} <span class="c-at">· ${esc(e.org)}</span></h3>
        <p>${esc(e.summary)}</p>
      </li>`,
    )
    .join('');

  return `
  <main id="classic" class="classic" aria-label="Portfolio content">
    <header class="c-hero">
      <p class="c-eyebrow">Portfolio</p>
      <h1>${esc(c.name)}</h1>
      <p class="c-title">${esc(c.title)}</p>
      <p class="c-intro">${esc(c.intro)}</p>
      <nav class="c-nav" aria-label="Sections">
        <a href="#about">About</a><a href="#projects">Projects</a><a href="#skills">Skills</a><a href="#experience">Experience</a><a href="#contact">Contact</a>
      </nav>
      <button type="button" class="c-btn c-play" data-action="play" hidden>▶ Play the 3D version</button>
    </header>

    <section id="about" class="c-section">
      <h2>About</h2>
      <h3 class="c-sub">${esc(c.about.heading)}</h3>
      ${c.about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      <dl class="c-facts">${c.about.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>
    </section>

    <section id="projects" class="c-section">
      <h2>Projects</h2>
      <div class="c-projects">${projects}</div>
    </section>

    <section id="skills" class="c-section">
      <h2>Skills</h2>
      <div class="c-skill-groups">
        ${[...groups]
          .map(([g, items]) => `<div><h3>${esc(g)}</h3><ul class="c-tags">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`)
          .join('')}
      </div>
    </section>

    <section id="experience" class="c-section">
      <h2>Experience &amp; Education</h2>
      <ol class="c-timeline">${timeline}</ol>
      <p>${link(c.resume, 'Download résumé (PDF) ↓', 'c-btn')}</p>
    </section>

    <section id="contact" class="c-section">
      <h2>Contact</h2>
      <p>${esc(c.contact.message)}</p>
      <p><a class="c-btn" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></p>
      <ul class="c-socials">${c.contact.socials.map((s) => `<li>${link(s.url, s.label)}</li>`).join('')}</ul>
    </section>

    <footer class="c-footer">
      <p>© ${new Date().getFullYear()} ${esc(c.name)} · 3D models by Kenney &amp; Isa Lousberg (CC0) · <a href="/CREDITS.md">Credits</a></p>
    </footer>
  </main>`;
}
