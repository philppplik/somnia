import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPrintHtml,printProblem,MAX_PRINT_PAGES} from './print';
import {extraShortcut} from './shortcuts';
test('print is refused for no pages, fractions and too many pages',()=>{
 assert.equal(printProblem(1),null);assert.equal(printProblem(MAX_PRINT_PAGES),null);
 for(const n of [0,-1,1.5,Number.NaN,MAX_PRINT_PAGES+1])assert.ok(printProblem(n),String(n));
});
test('the print page holds one image per page and only blob addresses',()=>{
 const h=buildPrintHtml(['blob:null/abc-1','blob:http://x/2']);
 assert.equal(h.match(/<img /g)?.length,2);assert.match(h,/@page\{margin:0\}/);
 for(const bad of ['http://evil/x.png','javascript:alert(1)','blob:x"onerror="1','data:image/png;base64,AA','blob:a b'])assert.throws(()=>buildPrintHtml([bad]),bad);
 assert.throws(()=>buildPrintHtml([]));assert.throws(()=>buildPrintHtml(Array(MAX_PRINT_PAGES+1).fill('blob:a/b')));
});
test('Ctrl+P asks for printing, plain P and Shift+P do not',()=>{
 assert.equal(extraShortcut({key:'p',mod:true,shift:false,alt:false}),'print');assert.equal(extraShortcut({key:'P',mod:true,shift:false,alt:false}),'print');
 assert.equal(extraShortcut({key:'p',mod:false,shift:false,alt:false}),null);assert.equal(extraShortcut({key:'p',mod:true,shift:true,alt:false}),null);
});
