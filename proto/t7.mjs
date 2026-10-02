import { launch, sleep } from './lib.mjs';
const { p, b, close } = await launch();
const r = await p.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const d = await root.getDirectoryHandle('proj', { create: true });
  const w = async (n, t) => { const f = await d.getFileHandle(n, { create: true }); const s = await f.createWritable(); await s.write(t); await s.close(); };
  await w('index.html', '<!DOCTYPE html><html><head><link rel="stylesheet" href="s.css"></head><body><h1 id="t">Hello</h1></body></html>');
  await w('s.css', 'h1{color:red}');
  window.showDirectoryPicker = async () => d;
  return 'seeded';
});
console.log(r);
await p.click('#btn-open'); await sleep(1200);
console.log('name:', await p.$eval('#project-name', e => e.textContent));
const fr = p.frames().find(f => f !== p.mainFrame());
console.log('h1:', await fr.$eval('h1', e => e.textContent));
// edit text
await fr.evaluate(() => {}); 
const box = await (await p.$('#frame-wrap')).boundingBox();
const h1 = await p.evaluate(() => { const r = document.querySelector('#frame').contentDocument.querySelector('h1').getBoundingClientRect(); return [r.left + 20, r.top + 10]; });
const z = box.width / 1280;
await p.mouse.click(box.x + h1[0] * z, box.y + h1[1] * z); await sleep(200);
await p.mouse.click(box.x + h1[0] * z, box.y + h1[1] * z, { count: 2 }); await sleep(200);
await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
await p.keyboard.type('Edited on disk');
await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control'); await sleep(400);
console.log('state:', await p.$eval('#save-state', e=>e.textContent));
await p.keyboard.down('Control'); await p.keyboard.press('s'); await p.keyboard.up('Control'); await sleep(800);
const saved = await p.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('proj'); return await (await (await d.getFileHandle('index.html')).getFile()).text(); });
console.log('saved:', saved);
// preview
const pg = new Promise(r => b.once('targetcreated', async t => r(await t.page())));
await p.click('#btn-preview'); const np = await pg; await sleep(500);
console.log('preview:', await np.evaluate(() => document.querySelector('h1').textContent + ' ' + getComputedStyle(document.querySelector('h1')).color));
await close();
