import test from 'node:test';import assert from 'node:assert/strict';
import {commandAvailable,createCommandScope,isNamespacedId,validateCommandMeta} from './commandMeta';
test('namespacing',()=>{
 assert.ok(isNamespacedId('photos.tone.open'));assert.ok(isNamespacedId('edit.undo'));
 assert.ok(!isNamespacedId('undo'));assert.ok(!isNamespacedId('Photos Tone'));
 assert.deepEqual(validateCommandMeta({id:'photos.tone.open',studio:'photos'}),[]);
 assert.equal(validateCommandMeta({id:'code.x',studio:'photos'}).length,1);
 assert.equal(validateCommandMeta({id:'edit.undo',studio:'photos'}).length,0);
 assert.equal(validateCommandMeta({id:'a.b',when:'x &&'}).length,1);
 assert.equal(validateCommandMeta({id:'a.b',agentCallable:true}).length,1);
 assert.equal(validateCommandMeta({id:'a.b',agentCallable:true,argsSchema:{type:'object'}}).length,0);
});
test('palette, menu and shortcut share one availability decision',()=>{
 const c={id:'photos.reset',studio:'photos',when:'document.dirty && !busy',enabled:()=>true};
 const ctx={studio:'photos',document:{dirty:true},busy:false};
 assert.equal(commandAvailable(c,ctx),true);
 assert.equal(commandAvailable(c,{...ctx,busy:true}),false);
 assert.equal(commandAvailable(c,{...ctx,studio:'code'}),false);
 assert.equal(commandAvailable({...c,enabled:()=>false},ctx),false);
 assert.equal(commandAvailable({id:'edit.undo'},{studio:'code'}),true);
 assert.equal(commandAvailable({id:'a.b',when:'bad &&'},ctx),false);
});
test('scope disposal removes commands and ignores late registrations',()=>{
 const reg=new Set<string>();const scope=createCommandScope<{id:string}>(c=>{reg.add(c.id);return()=>reg.delete(c.id);});
 scope.add({id:'a.one'});const off=scope.add({id:'a.two'});assert.equal(reg.size,2);off();assert.equal(reg.size,1);
 scope.add({id:'a.one'});assert.equal(reg.size,1);
 scope.dispose();assert.equal(reg.size,0);scope.add({id:'a.late'});assert.equal(reg.size,0);assert.equal(scope.live,false);
});
