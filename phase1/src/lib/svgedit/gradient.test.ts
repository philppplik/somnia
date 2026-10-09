import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanSvg} from './source';
import {gradientSource,readGradient,urlId} from './gradient';
test('gradient source round trips through the reader',()=>{
 const g={type:'linear' as const,angle:45,stops:[{offset:0,color:'#ff0000',opacity:1},{offset:.5,color:'#00ff00',opacity:.5},{offset:1,color:'#0000ff',opacity:1}]};
 const r=scanSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${gradientSource('g1',g)}</defs></svg>`);assert.ok(r.ok);if(!r.ok)return;
 assert.deepEqual(readGradient(r.root,'g1'),g);});
test('radial and url ids',()=>{const r=scanSvg(`<svg xmlns="http://www.w3.org/2000/svg"><radialGradient id="a"><stop offset="0%" style="stop-color:#fff"/><stop offset="100%" stop-color="#000"/></radialGradient></svg>`);if(!r.ok)throw 0;
 const g=readGradient(r.root,'a')!;assert.equal(g.type,'radial');assert.equal(g.stops[0].color,'#fff');assert.equal(g.stops[1].offset,1);
 assert.equal(urlId('url(#a)'),'a');assert.equal(urlId('url("#b")'),'b');assert.equal(urlId('#fff'),null);});
