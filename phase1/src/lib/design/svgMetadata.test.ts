import {test} from 'node:test';
import assert from 'node:assert/strict';
import {injectSvgMetadata} from './exportArtboards';
test('replaces an existing title and inserts desc after it',()=>{
 const out=injectSvgMetadata('<svg xmlns="x" width="10" height="10"><title>Old</title><rect width="1" height="1"/></svg>',{title:'New & <T>',description:'Line1\nLine2'});
 assert.match(out,/<title>New &amp; &lt;T&gt;<\/title><desc>Line1 Line2<\/desc>/);
 assert.equal(out.match(/<title>/g)!.length,1);
 assert.match(out,/<desc>Line1 Line2<\/desc><rect/);
});
test('inserts title and desc when missing; empty fields leave the svg untouched',()=>{
 const out=injectSvgMetadata('<svg width="10" height="10"><rect width="1" height="1"/></svg>',{title:'T',description:'D'});
 assert.match(out,/<svg width="10" height="10"><title>T<\/title><desc>D<\/desc>/);
 const same=injectSvgMetadata('<svg width="10" height="10"><title>Keep</title></svg>',{title:' ',description:''});
 assert.equal(same,'<svg width="10" height="10"><title>Keep</title></svg>');
});
