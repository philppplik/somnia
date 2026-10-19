import test from 'node:test';
import assert from 'node:assert/strict';
import {SLIDE_ICONS,SLIDE_ICON_PX,SLIDE_ICON_COLOR,slideIconSvg} from './slideIcons';

test('catalog has unique keys and usable entries',()=>{
 assert.ok(SLIDE_ICONS.length>=20);
 assert.equal(new Set(SLIDE_ICONS.map(e=>e.key)).size,SLIDE_ICONS.length);
 for(const e of SLIDE_ICONS){assert.match(e.key,/^[a-zA-Z]+$/);assert.equal(typeof e.Icon,'function');}
});

test('slideIconSvg renders a sized, colored svg',()=>{
 const svg=slideIconSvg('check');
 assert.ok(svg.startsWith('<svg'));
 assert.ok(svg.includes(`width="${SLIDE_ICON_PX}"`));
 assert.ok(svg.includes(`#${SLIDE_ICON_COLOR}`));
 assert.ok(svg.includes('data-icon="vadivam:check"'));
 const custom=slideIconSvg('zap','ff0000',64);
 assert.ok(custom.includes('#ff0000'));
 assert.ok(custom.includes('width="64"'));
});

test('slideIconSvg rejects bad input',()=>{
 assert.throws(()=>slideIconSvg('nope'),/Unknown icon/);
 assert.throws(()=>slideIconSvg('check','red'),/hex/);
 assert.throws(()=>slideIconSvg('check','1f2937',8),/16 to 2048/);
 assert.throws(()=>slideIconSvg('check','1f2937',4096),/16 to 2048/);
});
