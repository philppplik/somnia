import { launch, sleep } from './lib.mjs';
const { p, close } = await launch();
const fr = await p.$('#frame'); const box = await fr.boundingBox();
const S = () => p.evaluate(() => ({ sel: window.__somnia.S.sel, hist: window.__somnia.S.undo.length, h1: window.__somnia.S.doc.querySelector('h1').outerHTML }));
// click h1 in canvas
const h1 = await p.evaluate(() => { const r = document.querySelector('#frame').contentDocument.querySelector('h1').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 10]; });
const z = await p.evaluate(() => document.querySelector('#frame-wrap').getBoundingClientRect().width / 1280);
await p.mouse.click(box.x + h1[0] * z, box.y + h1[1] * z);
console.log('after click', JSON.stringify(await S()));
await p.screenshot({ path: '/tmp/s2.png' });
// double click to edit
await p.mouse.click(box.x + h1[0] * z, box.y + h1[1] * z, { count: 2 }); await sleep(200);
await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
await p.keyboard.type('Calm sites, built to last.'); 
await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control'); await sleep(300);
console.log('after edit', JSON.stringify(await S()));
// style change via props: font-size
await p.evaluate(() => window.__somnia.setStyle(window.__somnia.S.sel, { 'font-size': '44px', color: '#5b5bf0' }));
await sleep(300);
console.log('after style', JSON.stringify(await S()));
console.log('file h1 in text:', await p.evaluate(() => window.__somnia.S.files['index.html'].split('\n').filter(l => l.includes('<h1')).join('|')));
await p.screenshot({ path: '/tmp/s3.png' });
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(200);
console.log('after undo', JSON.stringify(await S()));
await close();
