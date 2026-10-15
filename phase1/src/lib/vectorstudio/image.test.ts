import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as S from './session';
import {exportAreaDoc} from './exportArea';
import {vectorShellCommandSpecs} from './shellCommands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import {PNG} from '../vectorio/imageFixture';
test('place, edit and delete an image: one undo step each, selection follows',()=>{
 S.resetVectorSession();S.createBlankVector(400,300);
 const id=S.placeImage({href:PNG,width:100,height:50,x:10,y:20});assert.equal(S.getVectorSession().imageSel,id);assert.equal(S.getVectorSession().doc.images![0].x,10);
 S.updateImage(id,{x:30,opacity:0.5});assert.equal(S.getVectorSession().doc.images![0].x,30);assert.equal(S.getVectorSession().doc.images![0].opacity,0.5);
 S.undo();assert.equal(S.getVectorSession().doc.images![0].x,10);S.undo();assert.equal(S.getVectorSession().doc.images,undefined);assert.equal(S.getVectorSession().imageSel,null);
 S.redo();S.selectImage(id);S.deleteImage(id);assert.equal(S.getVectorSession().doc.images,undefined);S.undo();assert.equal(S.getVectorSession().doc.images!.length,1);
});
test('selecting a path or text clears the image selection',()=>{
 S.resetVectorSession();S.createBlankVector(400,300);const id=S.placeImage({href:PNG,width:10,height:10});
 const t=S.addText({x:5,y:5});assert.equal(S.getVectorSession().imageSel,null);S.selectImage(id);assert.equal(S.getVectorSession().textSel,null);S.selectText(t);assert.equal(S.getVectorSession().imageSel,null);
});
test('invalid input throws before history is touched',()=>{
 S.resetVectorSession();S.createBlankVector(400,300);const before=S.getVectorSession().doc;
 for(const bad of [{href:'nope',width:1,height:1},{href:PNG,width:0,height:1},{href:PNG,width:NaN,height:1},{href:PNG,width:1,height:1e9},{href:PNG,width:1,height:1,x:Infinity}])assert.throws(()=>S.placeImage(bad as any),RangeError,JSON.stringify(bad).slice(0,60));
 assert.equal(S.getVectorSession().doc,before);assert.equal(S.getVectorSession().canUndo,false);
 const id=S.placeImage({href:PNG,width:5,height:5});assert.throws(()=>S.updateImage(id,{x:NaN}));assert.throws(()=>S.updateImage(id,{href:'x'} as any),RangeError);assert.throws(()=>S.updateImage('zz',{x:1}));assert.throws(()=>S.deleteImage('zz'));
 for(let i=1;i<10;i++)S.placeImage({href:PNG,width:5,height:5});assert.throws(()=>S.placeImage({href:PNG,width:5,height:5}),RangeError);
});
test('commands: ui only, schema checked; content export includes images, selection export does not',async()=>{
 S.resetVectorSession();S.createBlankVector(400,300);const d=new CommandDispatcher();vectorShellCommandSpecs(()=>true).forEach(s=>d.register(s));
 const o={origin:'test'} as const;await d.runCommand('vector.placeImage',{href:PNG,width:20,height:10,x:50,y:60},o);
 const id=S.getVectorSession().imageSel!;await d.runCommand('vector.setImage',{id,patch:{width:40}},o);assert.equal(S.getVectorSession().doc.images![0].width,40);
 await assert.rejects(d.runCommand('vector.setImage',{id,patch:{width:0}},o),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.setImage',{id,patch:{href:'x'}},o),CommandDispatchError);
 await assert.rejects(d.runCommand('vector.placeImage',{href:PNG,width:1,height:1},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 const c=exportAreaDoc(S.getVectorSession().doc,[],'content');assert.equal(c.images![0].x,0);assert.equal(c.width,40);
 S.addPath({id:'p',closed:true,nodes:[{id:'a',x:0,y:0,kind:'corner'},{id:'b',x:9,y:0,kind:'corner'},{id:'c',x:9,y:9,kind:'corner'}]} as any);
 assert.equal(exportAreaDoc(S.getVectorSession().doc,['p'],'selection').images,undefined);
 await d.runCommand('vector.deleteImage',{id},o).catch(()=>{});
});
