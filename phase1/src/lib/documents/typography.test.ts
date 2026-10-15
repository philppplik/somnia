import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFormatPatch,checkParaPatch,lineRuleProblem,PARA_FLAG_KEYS} from './protocol';
import {buildParagraphPatch} from '../../components/documents/ParagraphDialog';
import {buildLookPatch,lookFromState} from '../../components/documents/CharLookDialog';
import type {ParaState,FormatState} from './protocol';
const base={align:null,indentLeft:null,indentFirst:null,spaceBefore:null,spaceAfter:null,lineSpacing:null} as ParaState;
test('character width is a whole percent from 20 to 400',()=>{
 checkFormatPatch({scale:20});checkFormatPatch({scale:400});
 for(const bad of [19,401,100.5,'100',Number.NaN,null])assert.throws(()=>checkFormatPatch({scale:bad}),JSON.stringify(bad));
});
test('line rule is checked per rule and refuses extras',()=>{
 assert.equal(lineRuleProblem({rule:'exactly',value:18}),null);
 assert.equal(lineRuleProblem({rule:'multiple',value:1.5}),null);
 for(const bad of [null,1,[],{rule:'exactly'},{rule:'exactly',value:0},{rule:'exactly',value:1585},{rule:'multiple',value:11},{rule:'x',value:2},{rule:'exactly',value:2,z:1},{rule:'atLeast',value:Number.NaN}])assert.notEqual(lineRuleProblem(bad),null,JSON.stringify(bad));
 checkParaPatch({lineRule:{rule:'atLeast',value:14}});assert.throws(()=>checkParaPatch({lineRule:{rule:'atLeast',value:0}}));
});
test('contextual spacing is a paragraph flag',()=>{
 assert.ok((PARA_FLAG_KEYS as readonly string[]).includes('contextualSpacing'));
 checkParaPatch({contextualSpacing:true});assert.throws(()=>checkParaPatch({contextualSpacing:1}));
 assert.deepEqual(buildParagraphPatch(base,{contextualSpacing:true},''),{contextualSpacing:true});
});
test('the paragraph dialog sends only a changed or valid rule',()=>{
 const p={...base,lineRule:{rule:'exactly',value:18}} as ParaState;
 assert.equal(buildParagraphPatch(p,{},'',undefined,{rule:'exactly',value:'18'}),null);
 assert.deepEqual(buildParagraphPatch(p,{},'',undefined,{rule:'atLeast',value:'14,5'}),{lineRule:{rule:'atLeast',value:14.5}});
 assert.equal(buildParagraphPatch(p,{},'',undefined,{rule:'exactly',value:'0'}),null);
 assert.equal(buildParagraphPatch(p,{},'',undefined,{rule:'exactly',value:''}),null);
});
test('the character dialog sends a changed width only when valid',()=>{
 const f={scale:100} as FormatState;const form=lookFromState(f);
 assert.equal(buildLookPatch(f,form),null);
 assert.deepEqual(buildLookPatch(f,{...form,scale:'150'}),{scale:150});
 for(const bad of ['5','1000','abc','50.5'])assert.equal(buildLookPatch(f,{...form,scale:bad}),null,bad);
});
