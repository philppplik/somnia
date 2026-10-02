import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
export async function launch(root = 'dist', w = 1480, h = 900) {
  const srv = http.createServer((q, s) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); });
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type() + ':', m.text()); }); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 800));
  return { p, b, close: async () => { await b.close(); srv.close(); }, url: `http://localhost:${port}/` };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
