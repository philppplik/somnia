import test from 'node:test';
import assert from 'node:assert/strict';
import {stylePatchProblem,type StyleItem} from './protocol';
import {formFromSelection,buildStylePatch,EMPTY_STYLE_FORM,formFromStyle,parseStyleNum} from '../../components/documents/StylesDialog';
const item=(o:Partial<StyleItem>={}):StyleItem=>({id:'s1',name:'Note',kind:'paragraph',builtin:false,basedOn:'Normal',font:null,size:11,bold:null,italic:null,color:null,align:null,spaceBefore:null,spaceAfter:null,lineSpacing:null,...o});
test('stylePatchProblem accepts good and rejects bad patches',()=>{
 for(const g of [{name:'A',kind:'paragraph'},{name:'C',kind:'character',bold:true},{id:'s1',size:12},{id:'s1',color:null}])assert.equal(stylePatchProblem(g),null,JSON.stringify(g));
 for(const b of [null,[],{},{name:'',kind:'paragraph'},{name:'A'},{name:'A',kind:'x'},{id:'s1'},{id:'a b',size:3},{id:'s1',size:0},{id:'s1',size:401},{id:'s1',color:'red'},{id:'s1',align:'x'},{id:'s1',bold:1},{id:'s1',lineSpacing:9},{id:'s1',zzz:1},{name:'x'.repeat(200),kind:'paragraph'},{name:'C',kind:'character',align:'left'}])assert.notEqual(stylePatchProblem(b),null,JSON.stringify(b));
});
test('parseStyleNum',()=>{assert.equal(parseStyleNum(''),null);assert.equal(parseStyleNum('12,5'),12.5);assert.equal(parseStyleNum('abc'),undefined);assert.equal(parseStyleNum('-1'),undefined);});
test('buildStylePatch: new style carries filled fields, unchanged existing style is null',()=>{
 assert.equal(buildStylePatch(null,EMPTY_STYLE_FORM),null);
 const p=buildStylePatch(null,{...EMPTY_STYLE_FORM,name:' Note ',size:'12',bold:'on'});
 assert.deepEqual(p,{name:'Note',kind:'paragraph',basedOn:'Normal',size:12,bold:true});
 const s=item();assert.equal(buildStylePatch(s,formFromStyle(s)),null);
});
test('buildStylePatch: modify sends only the diff; bad numbers give null',()=>{
 const s=item();const f=formFromStyle(s);
 assert.deepEqual(buildStylePatch(s,{...f,size:'14'}),{id:'s1',size:14});
 assert.deepEqual(buildStylePatch(s,{...f,color:'#c0392b'}),{id:'s1',color:'C0392B'});
 assert.equal(buildStylePatch(s,{...f,size:'x'}),null);
 assert.equal(buildStylePatch(s,{...f,size:'500'}),null);
});
test('buildStylePatch: character styles do not carry paragraph fields',()=>{
 const p=buildStylePatch(null,{...EMPTY_STYLE_FORM,name:'Em',kind:'character',basedOn:'',italic:'on',spaceBefore:'5'});
 assert.deepEqual(p,{name:'Em',kind:'character',italic:true});
});
test('formFromSelection copies shared character formatting and keeps mixed or automatic values',()=>{
 const f={...EMPTY_STYLE_FORM,name:'Em',font:'Old',size:'9'};
 assert.equal(formFromSelection(f,null),f);
 const o=formFromSelection(f,{bold:'on',italic:'mixed',underline:'off',font:'Inter',size:12.345,color:'c0392b'} as never);
 assert.deepEqual([o.bold,o.italic,o.font,o.size,o.color],['on','','Inter','12.35','C0392B']);
 const k=formFromSelection(f,{bold:'off',italic:'off',underline:'off',font:null,size:null,color:'auto'} as never);
 assert.deepEqual([k.font,k.size,k.color,k.bold],['Old','9','','off']);
});
