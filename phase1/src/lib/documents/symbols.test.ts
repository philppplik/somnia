import test from 'node:test';
import assert from 'node:assert/strict';
import {SYMBOL_GROUPS,dateText,symbolProblem} from './symbols';
test('symbolProblem accepts symbols and refuses empty, long, control or line-break text',()=>{
 for(const g of ['\u00A9','\u2014','ab','\u{1F600}'])assert.equal(symbolProblem(g),null);
 for(const b of ['',3,null,undefined,'a\nb','a\u0000','\u2028','x'.repeat(17),'\uFFFC'])assert.notEqual(symbolProblem(b),null,String(b));
});
test('every offered symbol is insertable and unique',()=>{
 const all=SYMBOL_GROUPS.flatMap(g=>Array.from(g.chars));
 for(const c of all)assert.equal(symbolProblem(c),null,c);
 assert.equal(new Set(all).size,all.length);
});
test('dateText gives ISO with padding and a non-empty long form',()=>{
 const d=new Date(2026,0,5);assert.equal(dateText(d,'iso'),'2026-01-05');assert.ok(dateText(d,'long','en').includes('2026'));
});
