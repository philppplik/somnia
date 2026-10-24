import test from 'node:test';
import assert from 'node:assert/strict';
import {countFile,compareCounts,controlOccurrences,fileControlCounts,compareFileControls,reducedFileBudgets,extractHooks,hasHook,missingHooks,reducedBudgets,enrollmentProposal} from './check-ds.mjs';
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

test('control occurrences carry lint locations and honor per-metric exceptions',()=>{
 const text='export const A=()=><div>\n  <button onClick={save}>Save</button>\n  <input value={x}/>\n  <span>{label}</span>\n</div>;';
 const hits=controlOccurrences(text,'src/components/demo/Demo.tsx');
 assert.deepEqual(hits.map(h=>[h.line,h.tag]),[[2,'button'],[3,'input']]);
 assert.deepEqual(hits.map(h=>h.metric),['rawButton','rawInput']);
 assert.deepEqual(controlOccurrences('const x=<><button/><input/></>','src/components/ui/native-controls.tsx'),[]);
 assert.equal(controlOccurrences('<button/>','src/components/demo/style.css').length,0);
});
test('file control counts skip tests, styles and clean files',()=>{
 const counts=fileControlCounts([['src/a/A.tsx','const x=<><button/><input/></>'],['src/a/A.test.tsx','<button/>'],['src/a/style.css','x'],['src/a/Clean.tsx','export const C=()=><div/>;']]);
 assert.deepEqual(counts,{'src/a/A.tsx':{rawButton:1,rawInput:1,rawSelect:0,rawTextarea:0}});
});
test('file ratchet flags growth lint-style, permits shrink, blocks reintroduction at zero',()=>{
 const occurrences=controlOccurrences('<div>\n<button/>\n<button/>\n</div>','src/a/A.tsx');
 const failures=compareFileControls(occurrences,{});
 assert.equal(failures.length,2);
 assert.match(failures[0],/^src\/a\/A\.tsx:2:1: raw <button> exceeds the file allowance \(0\)\./);
 assert.ok(failures[0].includes('migration-guide.md'));
 assert.deepEqual(compareFileControls(occurrences,{'src/a/A.tsx':{rawButton:2}}),[]);
 assert.equal(compareFileControls(occurrences,{'src/a/A.tsx':{rawButton:1}}).length,2);
});
test('file budgets only shrink and migrated files stay listed at zero',()=>{
 const next=reducedFileBudgets({'src/a/A.tsx':{rawButton:0,rawInput:0,rawSelect:0,rawTextarea:0}},{'src/a/A.tsx':{rawButton:2,rawInput:1,rawSelect:0,rawTextarea:0}});
 assert.ok(Object.hasOwn(next,'src/a/A.tsx'));
 assert.equal(next['src/a/A.tsx'].rawButton,0);
 assert.deepEqual(compareFileControls(controlOccurrences('const x=<button/>','src/a/A.tsx'),next).length,1);
 assert.deepEqual(reducedFileBudgets({'src/b/B.tsx':{rawButton:1,rawInput:0,rawSelect:0,rawTextarea:0}},{}),{'src/b/B.tsx':{rawButton:0,rawInput:0,rawSelect:0,rawTextarea:0}});
});
