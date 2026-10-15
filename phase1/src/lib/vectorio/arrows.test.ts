import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,normalizeDoc,SvgImportError} from './index';
const N=(id:string,x:number,y:number)=>({id,x,y,kind:'corner'});
const open=(style:object,extra:object={})=>({id:'a',closed:false,nodes:[N('n1',0,0),N('n2',50,0)],style,...extra});
const doc=(p:object)=>normalizeDoc({width:100,height:50,paths:[p]} as any);
test('arrowheads export as editor-owned markers and roundtrip, colour follows the stroke',()=>{
 const out=exportSvg(doc(open({stroke:'#ff0000',strokeWidth:2,arrowEnd:'triangle',arrowStart:'circle'})));
 assert.match(out,/<marker id="vs-arrow-triangle-ff0000" data-vs-arrow="triangle"/);assert.match(out,/marker-end="url\(#vs-arrow-triangle-ff0000\)"/);assert.match(out,/marker-start="url\(#vs-arrow-circle-ff0000\)"/);
 const st=importSvg(out).doc.paths[0].style!;assert.equal(st.arrowEnd,'triangle');assert.equal(st.arrowStart,'circle');
 assert.equal(importSvg(exportSvg(doc(open({stroke:'#0f0',arrowEnd:'open'})))).doc.paths[0].style?.arrowEnd,'open');
});
test('no arrows: no markers; closed and compound paths export without them',()=>{
 assert.ok(!/marker/.test(exportSvg(doc(open({stroke:'#000'})))));
 assert.ok(!/marker/.test(exportSvg(doc({...open({arrowEnd:'triangle'}),closed:true,nodes:[N('n1',0,0),N('n2',10,0),N('n3',10,10)]}))));
 assert.ok(!/marker/.test(exportSvg(doc(open({arrowEnd:'triangle'},{compound:'c1'})))));
});
test('foreign markers, unknown references and group-level markers are refused',()=>{
 const S=(defs:string,attrs:string,wrap=['',''])=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><defs>${defs}</defs>${wrap[0]}<path d="M0 0H50" stroke="#000" ${attrs}/>${wrap[1]}</svg>`;
 assert.throws(()=>importSvg(S('<marker id="m"><path d="M0 0L5 5"/></marker>','marker-end="url(#m)"')),SvgImportError);
 assert.throws(()=>importSvg(S('','marker-end="url(#nope)"')),SvgImportError);
 const ok='<marker id="m" data-vs-arrow="open" viewBox="0 0 10 10"><path d="M1 1L9 5L1 9"/></marker>';
 assert.equal(importSvg(S(ok,'marker-end="url(#m)"')).doc.paths[0].style?.arrowEnd,'open');
 assert.throws(()=>importSvg(S(ok,'',['<g marker-end="url(#m)">','</g>'])),SvgImportError);
});
