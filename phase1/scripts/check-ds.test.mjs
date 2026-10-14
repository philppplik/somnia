import test from 'node:test';
import assert from 'node:assert/strict';
import {countFile,compareCounts,extractHooks,hasHook,missingHooks} from './check-ds.mjs';
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
