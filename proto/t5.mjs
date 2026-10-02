import { launch, sleep } from './lib.mjs';
const { p, close } = await launch();
const S = () => p.evaluate(() => { const s = window.__somnia.S; return { sel: s.sel, undo: s.undo.length, cards: [...s.doc.querySelector('.cards').children].map(c => c.querySelector('h3').textContent).join(',') }; });
await p.evaluate(() => window.__somnia.select([2, 0])); await sleep(100);
await p.keyboard.down('Control'); await p.keyboard.press('d'); await p.keyboard.up('Control'); await sleep(200);
console.log('dup', JSON.stringify(await S()));
await p.keyboard.down('Alt'); await p.keyboard.press('ArrowDown'); await p.keyboard.up('Alt'); await sleep(200);
console.log('move', JSON.stringify(await S()));
await p.keyboard.press('Delete'); await sleep(200);
console.log('del', JSON.stringify(await S()));
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(200);
console.log('undo', JSON.stringify(await S()));
await p.keyboard.down('Control'); await p.keyboard.down('Shift'); await p.keyboard.press('z'); await p.keyboard.up('Shift'); await p.keyboard.up('Control'); await sleep(200);
console.log('redo', JSON.stringify(await S()));
// layers drag: drag row 'h1' (hero) to before section.cards via HTML5 dnd emulation
await p.evaluate(() => { const rows = [...document.querySelectorAll('.lyr')]; const from = rows.find(r => r.textContent.startsWith('h1')); const to = rows.find(r => r.textContent.startsWith('section.cards') || r.textContent.includes('#services')); const dt = new DataTransfer(); const fire = (el, t, y) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y })); fire(from, 'dragstart', 0); const r = to.getBoundingClientRect(); fire(to, 'dragover', r.top + 2); fire(to, 'drop', r.top + 2); });
await sleep(300);
console.log('layers dnd body order:', await p.evaluate(() => [...window.__somnia.S.doc.body.children].map(c => c.localName).join(',')), await p.evaluate(() => window.__somnia.S.doc.querySelector('section.hero').children.length));
// code edit -> canvas
await p.evaluate(() => window.__somnia.setMode('split')); await sleep(300);
await p.evaluate(() => { const v = window.__somnia.editor.view; const t = v.state.doc.toString(); const i = t.indexOf('Have something in mind?'); v.dispatch({ changes: { from: i, to: i + 'Have something in mind?'.length, insert: 'Typed in code' } }); });
await sleep(500);
console.log('canvas h2:', await p.evaluate(() => document.querySelector('#frame').contentDocument.querySelector('.cta h2').textContent), '| model undo', (await S()).undo);
await close();
