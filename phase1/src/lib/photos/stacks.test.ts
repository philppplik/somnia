import test from 'node:test';
import assert from 'node:assert/strict';
import {getStack,groupForStrip,groupPhotos,stackMembers,ungroupStacks} from './stacks.ts';
test('group, members and ungroup',()=>{
 assert.equal(groupPhotos(['solo.png']),null); // a stack needs two
 const id=groupPhotos(['g1.png','g2.png','g3.png'])!;
 assert.ok(id);assert.equal(getStack('g1.png'),id);
 assert.deepEqual(stackMembers(id).sort(),['g1.png','g2.png','g3.png']);
 const id2=groupPhotos(['g3.png','g4.png']);assert.equal(id2,id); // joining pulls the new name into the existing stack
 assert.equal(getStack('g4.png'),id);
 ungroupStacks([id]);assert.equal(getStack('g1.png'),null);assert.equal(getStack('g4.png'),null);
});
test('groupForStrip collapses consecutive members and expands',()=>{
 const stacks={'b.png':'x','c.png':'x','e.png':'y'};
 const rows=groupForStrip(['a.png','b.png','c.png','d.png','e.png'],stacks,{});
 assert.deepEqual(rows,[{kind:'single',name:'a.png'},{kind:'stack',id:'x',members:['b.png','c.png']},{kind:'single',name:'d.png'},{kind:'single',name:'e.png'}]); // a one-member stack stays single
 const open=groupForStrip(['a.png','b.png','c.png','d.png'],stacks,{x:true});
 assert.deepEqual(open,[{kind:'single',name:'a.png'},{kind:'single',name:'b.png'},{kind:'single',name:'c.png'},{kind:'single',name:'d.png'}]);
});
