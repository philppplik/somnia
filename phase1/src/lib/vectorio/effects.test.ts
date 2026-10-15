import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,fxSpec,checkFxPatch,FX_LIMITS,SvgImportError} from './index';
import type {VectorDocument} from './index';
const doc=(style:Record<string,unknown>):VectorDocument=>({width:200,height:100,paths:[{id:'a',closed:true,nodes:[{id:'n1',x:10,y:10,kind:'corner'},{id:'n2',x:90,y:10,kind:'corner'},{id:'n3',x:90,y:60,kind:'corner'}],style:{fill:'#ff0000',...style}}]} as VectorDocument);
test('blur and shadow roundtrip through export and strict import',()=>{
 const s={blur:2.5,shadowDx:6,shadowDy:-3,shadowBlur:4,shadowColor:'#112233',shadowOpacity:0.4};
 const svg=exportSvg(doc(s));assert.match(svg,/<filter id="vs-fx-b2p5-s6_m3_4_112233_0p4" data-vs-fx="1"/);assert.match(svg,/filter="url\(#vs-fx-/);
 const back=importSvg(svg).doc.paths[0].style!;
 for(const [k,v] of Object.entries(s))assert.equal((back as any)[k],v,k);
 assert.equal(exportSvg(importSvg(svg).doc),svg);
});
test('blur only, shadow only, none',()=>{
 assert.equal(fxSpec({blur:0,shadowOpacity:0}),null);assert.ok(fxSpec({blur:3})!.shadow===undefined);
 const sh=importSvg(exportSvg(doc({shadowOpacity:0.5}))).doc.paths[0].style!;assert.equal(sh.shadowDx,4);assert.equal(sh.blur,undefined);
 assert.doesNotMatch(exportSvg(doc({})),/filter/);
});
test('two objects with the same effect share one filter',()=>{
 const d=doc({blur:2});d.paths.push({...d.paths[0],id:'b'});assert.equal(exportSvg(d).match(/<filter /g)!.length,1);
});
test('stored out-of-range values are clamped when exporting',()=>{
 const f=fxSpec({blur:1e9,shadowOpacity:7,shadowDx:-1e9,shadowColor:'javascript:'})!;assert.equal(f.blur,FX_LIMITS.blurMax);assert.equal(f.shadow!.opacity,1);assert.equal(f.shadow!.dx,-FX_LIMITS.offsetMax);assert.equal(f.shadow!.color,'#000000');
 assert.equal(fxSpec({blur:NaN,shadowOpacity:NaN}),null);
});
const wrap=(filter:string,attr='filter="url(#f)"')=>`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs>${filter}</defs><path d="M0 0L10 0L10 10Z" ${attr}/></svg>`;
test('importer refuses foreign or malformed filters (strict)',()=>{
 const ok='<filter id="f" data-vs-fx="1" filterUnits="userSpaceOnUse" x="0" y="0" width="1" height="1"><feGaussianBlur stdDeviation="2"/></filter>';
 assert.equal(importSvg(wrap(ok)).doc.paths[0].style!.blur,2);
 const bads=['<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>',
  ok.replace('stdDeviation="2"','stdDeviation="500"'),ok.replace('stdDeviation="2"','stdDeviation="abc"'),ok.replace('filterUnits="userSpaceOnUse"','filterUnits="objectBoundingBox"'),
  ok.replace('<feGaussianBlur stdDeviation="2"/>','<feOffset dx="3"/>'),ok.replace('<feGaussianBlur stdDeviation="2"/>',''),ok.replace('<feGaussianBlur stdDeviation="2"/>','<feGaussianBlur stdDeviation="2" in="SourceAlpha"/>'),
  ok.replace('<feGaussianBlur stdDeviation="2"/>','<feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="red" flood-opacity="0.5"/>'),
  ok.replace('<feGaussianBlur stdDeviation="2"/>','<feDropShadow dx="1000" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.5"/>')];
 for(const b of bads)assert.throws(()=>importSvg(wrap(b)),SvgImportError,b);
 assert.throws(()=>importSvg(wrap(ok,'filter="url(#missing)"')),SvgImportError);
 assert.throws(()=>importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><defs>${ok}</defs><g filter="url(#f)"><path d="M0 0L5 0L5 5Z"/></g></svg>`),SvgImportError);
 assert.equal(importSvg(wrap(ok,'filter="none"')).doc.paths[0].style?.blur,undefined);
});
test('checkFxPatch rejects bad values',()=>{
 for(const bad of [{blur:-1},{blur:101},{blur:'2'},{blur:NaN},{shadowOpacity:2},{shadowDx:501},{shadowBlur:-0.1},{shadowColor:'red'},{shadowColor:'#12345'}])assert.throws(()=>checkFxPatch(bad),RangeError,JSON.stringify(bad));
 checkFxPatch({blur:100,shadowOpacity:1,shadowDx:-500,shadowColor:'#AbCdEf'});checkFxPatch({fill:'#000'});
});
