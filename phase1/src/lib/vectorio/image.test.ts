import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,isImageUri,normalizeImages,IMAGE_LIMITS,SvgImportError} from './index';
import type {VectorDocument} from './index';
import {PNG} from './imageFixture';
const JPG='data:image/jpeg;base64,/9j/4AAQSkZJRg==',WEBP='data:image/webp;base64,UklGRgAAAABXRUJQ';
const doc=(images:unknown[]):VectorDocument=>({width:200,height:100,paths:[],images} as VectorDocument);
test('data URI check accepts the three types and rejects everything else',()=>{
 for(const u of [PNG,JPG,WEBP])assert.ok(isImageUri(u),u.slice(0,24));
 for(const bad of ['',123,null,'data:image/gif;base64,R0lGODlh','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)','https://x/y.png','data:image/png;base64,AAAA'+'A'.repeat(8),'data:image/png;base64,!!!!','data:image/png;base64,iVBORw0KGgo','data:image/jpeg;base64,'+PNG.split(',')[1],'data:image/png;base64,'+'A'.repeat(IMAGE_LIMITS.maxUriChars)])assert.equal(isImageUri(bad),false,String(bad).slice(0,30));
});
test('images roundtrip through export and strict import, drawn behind everything',()=>{
 const d=doc([{id:'i1',x:5,y:6.5,width:80,height:40,href:PNG,opacity:0.5},{id:'i2',x:0,y:0,width:10,height:10,href:JPG}]);
 d.paths=[{id:'p',closed:true,nodes:[{id:'a',x:0,y:0,kind:'corner'},{id:'b',x:9,y:0,kind:'corner'},{id:'c',x:9,y:9,kind:'corner'}]}] as any;
 const svg=exportSvg(d);assert.ok(svg.indexOf('<image')<svg.indexOf('<path'));
 const back=importSvg(svg).doc;assert.equal(back.images!.length,2);assert.equal(back.images![0].opacity,0.5);assert.equal(back.images![0].href,PNG);assert.equal(back.images![1].y,0);
 assert.equal(exportSvg(back),svg);
 assert.doesNotMatch(exportSvg(doc([])),/image/);
});
const wrap=(inner:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${inner}</svg>`;
const img=(over='',href=PNG)=>`<image data-vs-image="1" x="0" y="0" width="10" height="10" preserveAspectRatio="none" ${over} href="${href}"/>`;
test('importer refuses foreign or malformed images',()=>{
 assert.equal(importSvg(wrap(img())).doc.images!.length,1);
 const bads=[`<image x="0" y="0" width="10" height="10" href="${PNG}"/>`,img('',  'https://example.com/a.png'),img('','data:image/gif;base64,R0lGODlh'),img('onload="x()"'),img('transform="rotate(5)"'),img('opacity="2"'),img().replace('width="10"','width="0"'),
  img('preserveAspectRatio="xMidYMid"').replace('preserveAspectRatio="none"',''),`<g>${img()}</g>`,`<image data-vs-image="1" x="0" y="0" width="10" height="10" xlink:href="${PNG}" href="${PNG}"/>`,
  img('').replace('/>','><title>x</title></image>')];
 for(const b of bads)assert.throws(()=>importSvg(wrap(b)),SvgImportError,b.slice(0,80));
 assert.throws(()=>importSvg(wrap(Array.from({length:IMAGE_LIMITS.maxImages+1},()=>img()).join(''))),SvgImportError);
});
test('normalizeImages drops invalid entries, duplicates and over-limit totals',()=>{
 const n=normalizeImages([{id:'a',href:PNG},{id:'a',href:PNG},{id:'b',href:'nope'},{id:'c',href:PNG,width:-5,height:1e9,x:NaN}] as any)!;
 assert.deepEqual(n.map(i=>i.id),['a','c']);assert.equal(n[1].width,IMAGE_LIMITS.minSize);assert.equal(n[1].height,IMAGE_LIMITS.maxSize);assert.equal(n[1].x,0);
 assert.equal(normalizeImages([]),undefined);
});
