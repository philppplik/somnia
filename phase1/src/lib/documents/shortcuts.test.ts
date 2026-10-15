import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extraShortcut,SHORTCUTS} from './shortcuts';
const k=(key:string,o:{shift?:boolean;alt?:boolean;mod?:boolean}={})=>extraShortcut({key,mod:o.mod??true,shift:!!o.shift,alt:!!o.alt});
test('Word-style shortcuts map to their actions',()=>{
 assert.equal(k('1'),'lineSingle');assert.equal(k('2'),'lineDouble');assert.equal(k('5'),'line15');
 assert.equal(k('Enter'),'pageBreak');assert.equal(k('d'),'charLook');assert.equal(k('D'),'charLook');
 assert.equal(k('L',{shift:true}),'bullets');assert.equal(k('c',{shift:true}),'painterCopy');assert.equal(k('V',{shift:true}),'painterPaste');
 assert.equal(k('A',{shift:true}),'allCaps');assert.equal(k('K',{shift:true}),'smallCaps');assert.equal(k('N',{shift:true}),'normalStyle');
});
test('indent and hanging indent shortcuts',()=>{
 assert.equal(k('m'),'indent');assert.equal(k('M',{shift:true}),'outdent');assert.equal(k('t'),'hanging');assert.equal(k('T',{shift:true}),'unhang');
 assert.equal(k('t',{mod:false}),null);assert.equal(k('m',{alt:true}),null);
});
test('plain keys, Alt combinations and unknown keys do nothing',()=>{
 assert.equal(k('1',{mod:false}),null);assert.equal(k('Enter',{mod:false}),null);
 assert.equal(k('1',{alt:true}),null,'Ctrl+Alt+digit is the paragraph style shortcut');assert.equal(k('d',{alt:true}),null);
 for(const key of ['a','b','x','z','3','Tab','F1'])assert.equal(k(key),null,key);
 assert.equal(k('1',{shift:true}),null);assert.equal(k('Enter',{shift:true}),null);assert.equal(k('q',{shift:true}),null);
});
test('every shortcut row has a label key and keys',()=>{for(const [l,keys] of SHORTCUTS){assert.ok(l.startsWith('documents.'));assert.ok(keys.length>0);}});
