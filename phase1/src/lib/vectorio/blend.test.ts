import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,normalizeDoc,SvgImportError} from './index';
const P=(style:object)=>({id:'a',closed:true,nodes:[{id:'n1',x:0,y:0,kind:'corner'},{id:'n2',x:10,y:0,kind:'corner'},{id:'n3',x:10,y:10,kind:'corner'}],style});
const doc=(style:object)=>normalizeDoc({width:20,height:20,paths:[P(style)]} as any);
const svg=(attrs:string,wrap='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${wrap?`<g ${wrap}>`:''}<path d="M0 0H10V10Z" ${attrs}/>${wrap?'</g>':''}</svg>`;
test('blend mode roundtrips through style="mix-blend-mode:..."; normal exports nothing',()=>{
 const out=exportSvg(doc({fill:'#f00',blendMode:'multiply'}));assert.match(out,/style="mix-blend-mode:multiply"/);
 assert.equal(importSvg(out).doc.paths[0].style?.blendMode,'multiply');
 assert.ok(!/mix-blend/.test(exportSvg(doc({fill:'#f00',blendMode:'normal'}))));
 assert.equal(importSvg(svg('style="mix-blend-mode:normal"')).doc.paths[0].style?.blendMode,undefined);
});
test('malformed or unknown blend values never reach the file; strict import rejects them',()=>{
 assert.ok(!/mix-blend/.test(exportSvg(doc({blendMode:'x;fill:red'}))));
 assert.throws(()=>importSvg(svg('style="mix-blend-mode:plus-lighter"')),SvgImportError);
 assert.throws(()=>importSvg(svg('style="mix-blend-mode:multiply" ','' ).replace('<path','<g style="mix-blend-mode:screen"><path').replace('/></svg>','/></g></svg>')),SvgImportError);
});
test('blend mode is not inherited by children of a normal group',()=>{
 assert.equal(importSvg(svg('', 'opacity="0.5"')).doc.paths[0].style?.blendMode,undefined);
});
