import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {buildParagraphPatch,parseIndentPt,initialLook,EMPTY_LOOK} from './ParagraphDialog';
import {checkParaPatch} from '../../lib/documents/protocol';
const para:any={keepNext:false,pageBreakBefore:null,indentRight:null};
describe('paragraph options',()=>{
 it('parses right indent',()=>{assert.equal(parseIndentPt('12,5'),12.5);assert.equal(parseIndentPt('1441'),null);assert.equal(parseIndentPt('-1'),null);assert.equal(parseIndentPt('abc'),null);});
 it('patches only changes',()=>{
  assert.equal(buildParagraphPatch(para,{},''),null);
  assert.equal(buildParagraphPatch(para,{keepNext:false},''),null);
  assert.deepEqual(buildParagraphPatch(para,{keepNext:true,pageBreakBefore:true},'18'),{keepNext:true,pageBreakBefore:true,indentRight:18});
  assert.equal(buildParagraphPatch(para,{},'9999'),null);
 });
 it('validates patches',()=>{
  assert.doesNotThrow(()=>checkParaPatch({keepNext:true,indentRight:10}));
  assert.throws(()=>checkParaPatch({keepNext:'yes'} as any));
  assert.throws(()=>checkParaPatch({indentRight:2000}));
  assert.throws(()=>checkParaPatch({bogus:true} as any));
 });
 it('shading and border: only changes, validated',()=>{
  const sh:any={shading:'FFF2CC',border:'none'};const l=initialLook(sh);assert.equal(l.shading,'FFF2CC');
  assert.equal(buildParagraphPatch(sh,{},'',l),null);
  assert.deepEqual(buildParagraphPatch(sh,{},'',{...l,shading:''}),{shading:'none'});
  assert.deepEqual(buildParagraphPatch(para,{},'',{...EMPTY_LOOK,shading:'#c0392b'}),{shading:'C0392B'});
  assert.equal(buildParagraphPatch(para,{},'',{...EMPTY_LOOK,shading:'red'}),null);
  assert.deepEqual(buildParagraphPatch(para,{},'',{...EMPTY_LOOK,border:'none'}),{border:'none'});
  assert.deepEqual(buildParagraphPatch(para,{},'',{...EMPTY_LOOK,border:'double',width:'1,5',color:'#c0392b'}),{border:{style:'double',width:1.5,color:'C0392B'}});
  for(const bad of [{border:'wavy'},{border:'single',width:'0'},{border:'single',width:'13'},{border:'single',width:'x'},{border:'single',color:'zz'}])assert.equal(buildParagraphPatch(para,{},'',{...EMPTY_LOOK,...bad}),null,JSON.stringify(bad));
 });
 it('checkParaPatch validates shading and border',()=>{
  checkParaPatch({shading:'none'});checkParaPatch({shading:'ABCDEF'});checkParaPatch({border:'none'});checkParaPatch({border:{style:'thick',width:2,color:'000000'}});
  for(const bad of [{shading:'red'},{shading:3},{border:'box'},{border:{style:'x',width:1,color:'000000'}},{border:{style:'single',width:0,color:'000000'}},{border:{style:'single',width:1,color:'000000',z:1}}])assert.throws(()=>checkParaPatch(bad));
 });
});
