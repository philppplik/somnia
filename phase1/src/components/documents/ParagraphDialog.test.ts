import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {buildParagraphPatch,parseIndentPt} from './ParagraphDialog';
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
});
