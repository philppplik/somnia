import { launch, sleep } from './lib.mjs';
const { p, close } = await launch();
const st = () => p.evaluate(() => { const S = window.__somnia.S; return { sel: S.sel, hist: S.undo.length, body: [...S.doc.body.children].map(c => c.localName + (c.className ? '.' + c.className : '')).join(' ') }; });
// Insert tab -> drag Heading block into hero section area
await p.click('#left-tabs [data-tab=insert]'); await sleep(200);
const blk = await p.evaluateHandle(() => [...document.querySelectorAll('.block')].find(b => b.textContent.includes('Card')));
const bb = await blk.boundingBox();
const fb = await (await p.$('#frame')).boundingBox();
const z = await p.evaluate(() => document.querySelector('#frame-wrap').getBoundingClientRect().width / 1280);
// target: between the cards region: use the cta section top edge
const tp = await p.evaluate(() => { const r = document.querySelector('#frame').contentDocument.querySelector('.cards').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 80, bb.y + 60, { steps: 4 }); await p.mouse.move(fb.x + tp[0] * z, fb.y + tp[1] * z, { steps: 8 });
await p.screenshot({ path: '/tmp/s4a.png' });
await p.mouse.up(); await sleep(300);
console.log('after insert', JSON.stringify(await st()));
console.log('cards children', await p.evaluate(() => window.__somnia.S.doc.querySelector('.cards').children.length));
await p.screenshot({ path: '/tmp/s4b.png' });
// split mode + code edit sync
await p.evaluate(() => window.__somnia.setMode('split')); await sleep(500);
await p.click('#cm .cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control');
await p.evaluate(() => { const v = document.querySelector('.cm-content').cmView; });
await p.screenshot({ path: '/tmp/s4c.png' });
// mobile
await p.evaluate(() => window.__somnia.setMode('design')); await p.click('#bp-seg [data-w="390"]'); await sleep(400);
await p.screenshot({ path: '/tmp/s4d.png' });
// palette
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await p.keyboard.type('mobile'); await sleep(200);
await p.screenshot({ path: '/tmp/s4e.png' });
await close();
