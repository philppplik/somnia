import test from 'node:test';
import assert from 'node:assert/strict';
import {countFile,compareCounts,extractHooks,hasHook,missingHooks,reducedBudgets,enrollmentProposal} from './check-ds.mjs';
test('AST counts controls, inline objects and debt without comments or JSX-like strings',()=>{
 const actual=countFile(`// <button style={{}} />\nconst fake='<input />'; export const C=()=> <><button style={{color:'#aabbcc'}} className="text-[11px]"/><input/><select/><textarea/></>;`,'src/components/demo/Demo.tsx');
 assert.deepEqual(actual,{rawButton:1,rawInput:1,rawSelect:1,rawTextarea:1,hexTsx:1,hexCss:0,pixelText:1,inlineStyle:1});
});
test('exceptions are metric-scoped and comments in CSS do not count',()=>{
 assert.equal(countFile('/* #abc */ a{color:#abcdef}', 'src/styles/feature.css').hexCss,1);
 assert.equal(countFile('a{color:#abc}', 'src/styles/tokens.css').hexCss,0);
 const canvas=countFile('<button style={{fill:"#abcdef"}}/>','src/components/vectorstudio/VectorCanvas.tsx');
 assert.equal(canvas.hexTsx,0);assert.equal(canvas.rawButton,1);assert.equal(canvas.inlineStyle,1);
});
test('ratchet refuses growth and new-area debt, permits reductions',()=>{
 assert.deepEqual(compareCounts({area:{rawButton:2}},{area:{rawButton:1}}),['area.rawButton: 1 -> 2']);
 assert.equal(compareCounts({newArea:{rawInput:1}},{}).length,1);
 assert.deepEqual(compareCounts({area:{rawButton:0}},{area:{rawButton:1}}),[]);
});
test('inventory captures literal class, attribute, role, test ID and CSS variables',()=>{
 const hooks=extractHooks(`page.locator('.ext-consent [data-storage="local"]'); page.getAttribute('data-theme'); page.getByRole('button');page.getByTestId('editor');style.getPropertyValue('--accent');`,'tests/a.spec.ts');
 assert.deepEqual(hooks.map(h=>h.kind),['class','attribute','attribute','role','testId','variable']);
 assert.equal(hasHook('className="ext-consent"',hooks[0]),true);
 assert.equal(hasHook('className="ext-consent-new"',hooks[0]),false);
});
test('protected hooks cannot disappear with their tests; unbacked hooks are not false gates',()=>{
 const previous={hooks:[{kind:'class',value:'keep',owners:['src/a.tsx']},{kind:'class',value:'browser',owners:[]}]};
 assert.deepEqual(missingHooks({hooks:[]},previous),['class:keep']);
 assert.deepEqual(missingHooks({hooks:[{kind:'class',value:'keep',owners:['src/b.tsx']}]},previous),[]);
});

test('a class left only in CSS does not hide its removal from JSX',()=>{
 const previous={hooks:[{kind:'class',value:'keep',owners:['src/a.tsx','src/style.css']}]};
 assert.deepEqual(missingHooks({hooks:[{kind:'class',value:'keep',owners:['src/style.css']}]},previous),['class:keep']);
 assert.deepEqual(missingHooks({hooks:[{kind:'class',value:'keep',owners:['src/new.tsx']}]},previous),[]);
});
test('P1 backing-element exceptions do not allow color or inline debt',()=>{
 const count=countFile('<input style={{color:"#abcdef"}} className="text-[11px]"/>','src/components/ui/native-controls.tsx');
 assert.equal(count.rawInput,0);assert.equal(count.hexTsx,1);assert.equal(count.pixelText,1);assert.equal(count.inlineStyle,1);
});

test('reduction update preserves removed area at zero and refuses fresh debt budgets',()=>{const next=reducedBudgets({current:{rawButton:2}},{current:{rawButton:3},removed:{rawInput:5}});assert.equal(next.current.rawButton,2);assert.equal(next.removed.rawInput,0);assert.equal(reducedBudgets({newArea:{rawButton:9}},{}).newArea.rawButton,0);assert.equal(compareCounts({removed:{rawInput:1}},next).length,1);});
test('enrollment proposal distinguishes new areas from existing growth and never claims approval',()=>{const proposal=enrollmentProposal({old:{rawButton:2},fresh:{rawInput:4}},{old:{rawButton:1}});assert.equal(proposal.requiresApproval,true);assert.deepEqual(Object.keys(proposal.newAreas),['fresh']);assert.deepEqual(proposal.existingGrowth,['old.rawButton: 1 -> 2']);});
