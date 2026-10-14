import test from 'node:test';import assert from 'node:assert/strict';
import {localStudioTarget,proposeLocalStudio,studioSceneNote} from './localStudioAdapter';
import {interfaceSession} from '../interface/session';import {addNode} from '../interface/model';
import {AnimationSession,setAnimationSession} from '../animation/session';
import {patchStudio3D,resetStudio3D} from '../studio3d/session';
const frame=()=>{interfaceSession.start();let id='';interfaceSession.transact(d=>{id=addNode(d,d.pages[0].id,'frame');});interfaceSession.select(id);return id;};
test('Interface frame metadata proposal is review-only, one undo step and stale-safe',()=>{
 const id=frame();const before=interfaceSession.get().document!;const target=localStudioTarget('interface');assert.ok(!target.context.includes('data:image'));const p=proposeLocalStudio(target,'A login frame');assert.equal(interfaceSession.get().document,before);p.accept();assert.equal(interfaceSession.get().document!.nodes.find(n=>n.id===id)!.annotation,'A login frame');p.undo();assert.equal(interfaceSession.get().document!.nodes.find(n=>n.id===id)!.annotation,undefined);
 const stale=proposeLocalStudio(localStudioTarget('interface'),'Another frame');interfaceSession.transact(d=>{d.name='manual';});assert.throws(()=>stale.accept(),/changed/);
});
test('Interface image exposes only approved asset and bounded alt destination; later edit stops undo',()=>{
 const parent=frame();let image='';interfaceSession.transact(d=>{image=addNode(d,d.pages[0].id,'image',parent);d.assets=[{id:'asset-'+ 'a'.repeat(64),hash:'a'.repeat(64),mime:'image/png',width:1,height:1,data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',sourceName:'private-original.png',sourceType:'png',license:'user-provided-unverified'}];d.nodes.find(n=>n.id===image)!.imageFill={assetId:'asset-'+ 'a'.repeat(64),fit:'contain'};});interfaceSession.select(image);
 const target=localStudioTarget('interface',true);assert.equal(target.imageData,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');assert.ok(!target.context.includes('private-original'));const p=proposeLocalStudio(target,'A square',true);p.accept();assert.equal(interfaceSession.get().document!.nodes.find(n=>n.id===image)!.altText,'A square');interfaceSession.transact(d=>{d.name='later';});assert.throws(()=>p.undo(),/Later/);
});
test('Animation selected layer name stages without mutation and preserves animation on undo',()=>{
 const session=new AnimationSession();setAnimationSession(session);session.createBlank();session.dispatch({type:'layer.add',kind:'shape',id:'layer'});session.setView({selectedLayer:'layer'});const before=session.document!;const p=proposeLocalStudio(localStudioTarget('animation'),'Accent shape');assert.equal(session.document,before);p.accept();assert.equal(session.document!.compositions[0].layers[0].name,'Accent shape');p.undo();assert.equal(session.document,before);
 session.dispatch({type:'layer.update',layer:'layer',locked:true});assert.throws(()=>localStudioTarget('animation'),/unlocked/);setAnimationSession(null);
});
test('3D metadata description is session note only, no scene mutation or stale undo',()=>{
 resetStudio3D();const outline=[{id:1,name:'Cube',depth:0,kind:'mesh' as const}];patchStudio3D({status:'ready',name:'Scene',outline});const p=proposeLocalStudio(localStudioTarget('studio3d'),'One mesh in the scene');assert.equal(studioSceneNote(),'');p.accept();assert.equal(studioSceneNote(),'One mesh in the scene');p.undo();assert.equal(studioSceneNote(),'');
 const stale=proposeLocalStudio(localStudioTarget('studio3d'),'Scene summary');patchStudio3D({outline:[...outline]});assert.throws(()=>stale.accept(),/changed/);
});
test('Interface vision cannot be redirected to annotation or model data as code; invalid alt rejected',()=>{
 frame();assert.throws(()=>proposeLocalStudio(localStudioTarget('interface'),'alt',true),/Destination/);
 assert.throws(()=>interfaceSession.transact(d=>{d.nodes[0].altText='invalid for no image';}),/alt/);
});
test('Animation later edits block dedicated undo and names stay bounded',()=>{
 const session=new AnimationSession();setAnimationSession(session);session.createBlank();session.dispatch({type:'layer.add',kind:'solid',id:'solid'});session.setView({selectedLayer:'solid'});
 assert.throws(()=>proposeLocalStudio(localStudioTarget('animation'),'a'.repeat(201)),/length/);const p=proposeLocalStudio(localStudioTarget('animation'),'Background');p.accept();session.dispatch({type:'layer.update',layer:'solid',visible:false});assert.throws(()=>p.undo(),/Later/);setAnimationSession(null);
});
