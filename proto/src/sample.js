export const SAMPLE = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lumen Studio</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <header class="nav">
      <a class="brand" href="#">Lumen</a>
      <nav class="nav-links">
        <a href="#work">Work</a>
        <a href="#services">Services</a>
        <a href="#contact">Contact</a>
      </nav>
      <a class="btn btn-small" href="#contact">Start a project</a>
    </header>
    <section class="hero">
      <p class="eyebrow">Independent design studio</p>
      <h1>We shape calm, fast websites that people remember.</h1>
      <p class="lead">Lumen is a small team in Hamburg. We design and build brand sites, shops and product pages with clean code you fully own.</p>
      <div class="hero-actions">
        <a class="btn" href="#work">See our work</a>
        <a class="btn btn-ghost" href="#contact">Book a call</a>
      </div>
    </section>
    <section class="cards" id="services">
      <article class="card">
        <h3>Brand sites</h3>
        <p>A clear story, a sharp look and a page that loads before you blink.</p>
      </article>
      <article class="card">
        <h3>Shops</h3>
        <p>Small catalogs, simple checkout and product pages that sell.</p>
      </article>
      <article class="card">
        <h3>Design systems</h3>
        <p>Tokens, components and docs so your team can ship without us.</p>
      </article>
    </section>
    <section class="cta" id="contact">
      <h2>Have something in mind?</h2>
      <p>Tell us about it. We reply within one working day.</p>
      <a class="btn" href="mailto:hello@example.com">hello@example.com</a>
    </section>
    <footer class="footer">
      <p>2026 Lumen Studio. Made with care in Hamburg.</p>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`,
  'style.css': `:root {
  --ink: #16161d;
  --muted: #5d5d6b;
  --paper: #fafaf7;
  --accent: #5b5bf0;
  --line: #e6e6e0;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
  line-height: 1.6;
}
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 48px;
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; font-size: 20px; color: var(--ink); text-decoration: none; letter-spacing: -0.02em; }
.nav-links { display: flex; gap: 28px; }
.nav-links a { color: var(--muted); text-decoration: none; font-size: 15px; }
.btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  text-decoration: none;
  font-weight: 500;
  font-size: 15px;
}
.btn-small { padding: 9px 16px; font-size: 14px; }
.btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.hero {
  padding: 96px 48px 88px;
  max-width: 920px;
  margin: 0 auto;
  text-align: center;
}
.eyebrow { color: var(--accent); font-weight: 600; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 16px; }
.hero h1 { font-size: 56px; line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 20px; }
.lead { font-size: 19px; color: var(--muted); max-width: 640px; margin: 0 auto 32px; }
.hero-actions { display: flex; gap: 12px; justify-content: center; }
.cards {
  display: flex;
  gap: 24px;
  padding: 0 48px 80px;
  max-width: 1120px;
  margin: 0 auto;
}
.card { flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 28px; }
.card h3 { margin: 0 0 8px; font-size: 20px; letter-spacing: -0.01em; }
.card p { margin: 0; color: var(--muted); }
.cta {
  margin: 0 48px 64px;
  padding: 64px 32px;
  border-radius: 28px;
  background: linear-gradient(135deg, #5b5bf0, #a855f7);
  color: #fff;
  text-align: center;
}
.cta h2 { font-size: 36px; margin: 0 0 8px; letter-spacing: -0.02em; }
.cta p { margin: 0 0 24px; opacity: 0.85; }
.cta .btn { background: #fff; color: var(--ink); }
.footer { padding: 28px 48px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
.footer p { margin: 0; }
@media (max-width: 720px) {
  .nav { padding: 16px 20px; }
  .nav-links { display: none; }
  .hero { padding: 56px 20px; }
  .hero h1 { font-size: 36px; }
  .cards { flex-direction: column; padding: 0 20px 48px; }
  .cta { margin: 0 20px 40px; padding: 40px 20px; }
}
`,
  'script.js': `// Lumen Studio - scripts run in Preview, not on the design canvas.
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
  });
});
`,
};

export const BLOCKS = [
  { id: 'section', label: 'Section', icon: 'layout-template', html: '<section style="padding: 64px 48px;">\n  <h2>Section title</h2>\n  <p>Section text goes here.</p>\n</section>' },
  { id: 'container', label: 'Flex row', icon: 'columns-2', html: '<div style="display: flex; gap: 24px;">\n  <div style="flex: 1; padding: 24px; border: 1px solid #e6e6e0; border-radius: 12px;">Column one</div>\n  <div style="flex: 1; padding: 24px; border: 1px solid #e6e6e0; border-radius: 12px;">Column two</div>\n</div>' },
  { id: 'heading', label: 'Heading', icon: 'heading', html: '<h2>New heading</h2>' },
  { id: 'text', label: 'Paragraph', icon: 'pilcrow', html: '<p>New paragraph. Double-click to edit this text.</p>' },
  { id: 'button', label: 'Button', icon: 'mouse-pointer-click', html: '<a href="#" style="display: inline-block; padding: 12px 22px; border-radius: 999px; background: #16161d; color: #ffffff; text-decoration: none; font-weight: 500;">Button</a>' },
  { id: 'image', label: 'Image', icon: 'image', html: '<img src="data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27640%27 height=%27360%27%3E%3Crect width=%27640%27 height=%27360%27 fill=%27%23e9e9f7%27/%3E%3Cpath d=%27M200 250l70-90 60 70 40-40 70 60z%27 fill=%27%23b4b4ee%27/%3E%3Ccircle cx=%27230%27 cy=%2790%27 r=%2724%27 fill=%27%23b4b4ee%27/%3E%3C/svg%3E" alt="Placeholder" style="max-width: 100%; border-radius: 12px;">' },
  { id: 'card', label: 'Card', icon: 'square', html: '<article style="background: #ffffff; border: 1px solid #e6e6e0; border-radius: 20px; padding: 28px;">\n  <h3>Card title</h3>\n  <p>Short description for this card.</p>\n</article>' },
  { id: 'list', label: 'List', icon: 'list', html: '<ul>\n  <li>First item</li>\n  <li>Second item</li>\n  <li>Third item</li>\n</ul>' },
  { id: 'divider', label: 'Divider', icon: 'minus', html: '<hr style="border: 0; border-top: 1px solid #e6e6e0; margin: 32px 0;">' },
];
