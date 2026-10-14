import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLook, DEFAULT_LOOK, textOnAccent} from './look';
function mockRoot(){const values=new Map<string,string>();return {values,root:{style:{setProperty:(k:string,v:string)=>values.set(k,v),removeProperty:(k:string)=>values.delete(k)},dataset:{}} as unknown as HTMLElement};}
test('custom accent sets the fill and readable ink from sanitized intent; reset removes every override',()=>{
 const {root,values}=mockRoot();
 for(const accent of ['#FFFF00','#000000','#ffffff','#00ffff','#ff0000','#075d96']) {
  applyLook({...DEFAULT_LOOK,accent},root);
  assert.equal(values.get('--accent'),accent.toLowerCase());
  assert.equal(values.get('--accent-fill'),accent.toLowerCase());
  assert.equal(values.get('--accent-ink'),textOnAccent(accent));
  assert.match(values.get('--accent-soft')!,new RegExp(accent.toLowerCase()));
 }
 applyLook(DEFAULT_LOOK,root);
 for(const key of ['--accent','--accent-fill','--accent-soft','--accent-ink'])assert.equal(values.has(key),false);
});
test('invalid accent does not inject untrusted CSS even when applyLook receives unsanitized input',()=>{
 const {root,values}=mockRoot();applyLook({...DEFAULT_LOOK,accent:'red; color: red'},root);
 assert.equal(values.has('--accent'),false);assert.equal(values.has('--accent-fill'),false);
});
