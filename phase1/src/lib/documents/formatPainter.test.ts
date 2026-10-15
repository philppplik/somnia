import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePaint,paintIsEmpty} from './formatPainter';
import {checkFormatPatch,checkParaPatch} from './protocol';
const f=(o:Record<string,unknown>={})=>({bold:'on',italic:'off',underline:'mixed',...o}) as never;
const p=(o:Record<string,unknown>={})=>({align:'center',indentLeft:null,indentFirst:null,spaceBefore:6,spaceAfter:null,lineSpacing:1.5,...o}) as never;
test('only shared values are copied; mixed ones are left out',()=>{
 const x=capturePaint(f({font:'Arial',size:null,color:'FF0000',highlight:'other',underlineStyle:'none',spacing:1,scale:120,vertAlign:'superscript',link:'https://x.org'}),p());
 assert.deepEqual(x.format,{bold:true,italic:false,font:'Arial',color:'FF0000',spacing:1,scale:120,vertAlign:'superscript'});
 assert.deepEqual(x.para,{align:'center',spaceBefore:6,lineRule:{rule:'multiple',value:1.5}});
 assert.equal(paintIsEmpty(x),false);
});
test('everything copied would pass the same checks as an edit',()=>{
 const x=capturePaint(f({font:'Arial',size:12,underlineStyle:'wave',underlineColor:'C0392B',charShading:'FFF2CC',highlight:'yellow'}),p({lineRule:{rule:'exactly',value:18},keepNext:true,contextualSpacing:false,shading:'EEEEEE',indentRight:10,tabs:[]}));
 checkFormatPatch(x.format);checkParaPatch(x.para);assert.equal((x.para as Record<string,unknown>).lineRule&&(x.para.lineRule as {rule:string}).rule,'exactly');
});
test('values the engine would refuse are dropped, nothing is copied from an empty state',()=>{
 const x=capturePaint(f({size:9999,scale:5}),p({spaceBefore:-3,align:'sideways'}));
 assert.equal('size' in x.format,false);assert.equal('scale' in x.format,false);assert.equal('spaceBefore' in x.para,false);assert.equal('align' in x.para,false);
 assert.equal(paintIsEmpty(capturePaint(null,null)),true);assert.equal(paintIsEmpty(null),true);
});
