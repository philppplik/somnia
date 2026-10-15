import test from 'node:test';import assert from 'node:assert/strict';
import {SYMBOL_GROUPS,isSymbol,parseSymbolCommand,symbolCode} from './symbols';
test('every listed symbol passes the same check as the bridge',()=>{
 for(const list of Object.values(SYMBOL_GROUPS))for(const c of list)assert.ok(isSymbol(c),c);
 assert.equal(new Set(Object.values(SYMBOL_GROUPS).flat()).size,Object.values(SYMBOL_GROUPS).flat().length);
});
test('symbols are one safe character',()=>{
 for(const bad of ['','ab','A',' ','\n','\u200B','\u202E','\u00AD','😀','€€',5,null])assert.equal(isSymbol(bad),false,String(bad));
 assert.deepEqual(parseSymbolCommand({char:'€'}),{char:'€'});assert.throws(()=>parseSymbolCommand({char:'x'}));assert.throws(()=>parseSymbolCommand({char:'€',y:1}));assert.throws(()=>parseSymbolCommand([]));
 assert.equal(symbolCode('€'),'U+20AC');assert.equal(symbolCode('Ω'),'U+03A9');
});
