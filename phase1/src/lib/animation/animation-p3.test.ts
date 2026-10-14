import test from 'node:test';import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createDocument,findComp,validateDocument,type AnimationDocument} from './model';
import {applyEdit,applyEdits} from './edit';
import {AnimationSession} from './session';
import {effectPrimitives,effectBounds,revealedText} from './effects';
import {presetEdits} from './presets';
import {serializeAnimationSnapshot,parseAnimationSnapshot,saveAnimationSnapshot,SNAPSHOT_LIMIT} from './persistence';
import {defaultView,RECOVERY_KEY} from './recovery';
import {worldMatrix} from './scene';
import {frameSvg} from './exportFrames';
import {TICKS_PER_SECOND as sec} from './time';
const base=()=>applyEdit(createDocument(),{type:'layer.add',kind:'text',id:'text',over:{source:{text:'Hello 😎 world',size:40,color:'#ffffff'}}});
const layer=(d:AnimationDocument)=>findComp(d)!.layers.find(l=>l.id==='text')!;
const effect=()=>({id:'blur',kind:'blur' as const,enabled:true,amount:0,color:'#ffffff'});
const keyed=()=>applyEdits(base(),[{type:'layer.effects',layer:'text',effects:[effect()]},{type:'effect.animate',layer:'text',effect:'blur',on:true,t:0},{type:'effect.amount',layer:'text',effect:'blur',value:20,t:sec}]);
test('animated effect strength interpolates in both filter primitives and bounds, undo/reopen retain keys',()=>{
 const d=keyed(),l=layer(d);assert.ok(effectPrimitives(l,sec/2).includes('stdDeviation="10"'));assert.equal(effectBounds(l,sec/2).x,-30);
 assert.ok(frameSvg(findComp(d)!,sec).includes('stdDeviation="20"'));
 const s=new AnimationSession(null);s.open(d);s.dispatch({type:'effect.amount',layer:'text',effect:'blur',value:5,t:sec});assert.equal(layer(s.document!).effects![0].animation!.keys[1].v,5);s.undo();assert.equal(layer(s.document!).effects![0].animation!.keys[1].v,20);
 assert.deepEqual(parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView())).doc,d);
});
test('effect animation removal/bake, bounds and lock checks cannot bypass owner',()=>{
 let d=keyed();d=applyEdit(d,{type:'effect.animate',layer:'text',effect:'blur',on:false,t:sec/2});assert.equal(layer(d).effects![0].amount,10);assert.equal(layer(d).effects![0].animation,undefined);
 d=keyed();d=applyEdit(d,{type:'effect.key.remove',layer:'text',effect:'blur',t:sec});assert.equal(layer(d).effects![0].animation!.keys.length,1);
 assert.throws(()=>applyEdit(d,{type:'effect.amount',layer:'text',effect:'blur',value:65,t:0}));
 d=applyEdit(d,{type:'layer.update',layer:'text',locked:true});assert.throws(()=>applyEdit(d,{type:'effect.amount',layer:'text',effect:'blur',value:5,t:0}));
});
test('null hierarchy drives child world transform and rejects cycles, deleting a parent clears references',()=>{
 let d=applyEdit(base(),{type:'layer.add',kind:'null',id:'null'});d=applyEdit(d,{type:'layer.parent',layer:'text',parent:'null'});
 assert.throws(()=>applyEdit(d,{type:'layer.parent',layer:'null',parent:'text'}));const before=worldMatrix(findComp(d)!,layer(d),0);
 d=applyEdit(d,{type:'prop.set',layer:'null',prop:'position',value:[100,200],t:0});const after=worldMatrix(findComp(d)!,layer(d),0);assert.notDeepEqual(after,before);
 d=applyEdit(d,{type:'layer.remove',layer:'null'});assert.equal(layer(d).parent,null);assert.deepEqual(validateDocument(d),[]);
});
test('fade/slide/bounce presets are atomic, bounded, deterministic and never overwrite keys',()=>{
 for(const preset of ['fade','slide','bounce'] as const){const s=new AnimationSession(null);s.open(base());const edits=presetEdits(s.document!,'text',preset,0);s.dispatch(edits);const prop=preset==='fade'?'opacity':'position';const keys=layer(s.document!).transform[prop].keys;assert.ok(keys.length>=2);assert.ok(keys.length<=61);assert.equal(keys[0].t,0);assert.equal(keys.at(-1)!.t,sec);assert.throws(()=>presetEdits(s.document!,'text',preset,0));s.undo();assert.equal(layer(s.document!).transform[prop].keys.length,0);}
 assert.throws(()=>presetEdits(base(),'text','fade',sec*5));assert.throws(()=>presetEdits(base(),'text','bounce',0,Infinity));
});
test('typewriter reveals Unicode text without broken surrogate pairs and renders at exact tick',()=>{
 const d=applyEdits(base(),presetEdits(base(),'text','typewriter',0));assert.equal(revealedText(layer(d),0),'');assert.equal(revealedText(layer(d),sec),'Hello 😎 world');assert.equal(revealedText(layer(d),sec/2),'Hello ');assert.ok(!frameSvg(findComp(d)!,0).includes('Hello'));assert.throws(()=>presetEdits(d,'text','typewriter',0));
});
test('markers are bounded, sorted and reversible, invalid markers preserve session',()=>{
 const s=new AnimationSession(null);s.open(base());s.dispatch({type:'markers.set',markers:[{id:'b',t:sec,label:'Beat'},{id:'a',t:0,label:'Start'}]});assert.equal(findComp(s.document!)!.markers![0].id,'a');const before=s.document;
 assert.throws(()=>s.dispatch({type:'markers.set',markers:[{id:'end',t:sec*5,label:'outside'}]}));assert.equal(s.document,before);s.undo();assert.equal(findComp(s.document!)!.markers,undefined);
});
test('snapshot round-trip uses only proposed local animation entries and rejects foreign/newer/malformed/bomb data',()=>{
 const d=keyed(),view={...defaultView(),playhead:sec,selectedLayer:'text',graphMode:'speed' as const};const bytes=serializeAnimationSnapshot(d,view),parsed=parseAnimationSnapshot(bytes);assert.deepEqual(parsed.doc,d);assert.equal(parsed.view.playhead,sec);assert.equal(parsed.view.selectedLayer,'text');assert.equal(parsed.view.graphMode,'speed');
 for(const doc of [{...d,schema:99},{...d,compositions:[]},{...d,assets:[{id:'bad'}]}])assert.throws(()=>parseAnimationSnapshot(zipSync({'animation/document.json':strToU8(JSON.stringify(doc))})));
 assert.throws(()=>parseAnimationSnapshot(zipSync({'../evil':strToU8('bad'),'animation/document.json':strToU8(JSON.stringify(d))})));
 assert.throws(()=>parseAnimationSnapshot(zipSync({'animation/document.json':new Uint8Array(SNAPSHOT_LIMIT+1)},{level:9})));
 assert.throws(()=>parseAnimationSnapshot(new Uint8Array([1,2,3])));
});
test('successful confirmed local save clears dirty/recovery only for unchanged revision',async()=>{
 const map=new Map<string,string>(),store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k)};const s=new AnimationSession(store);s.open(base());s.dispatch({type:'layer.update',layer:'text',name:'Saved'});let written:Uint8Array=new Uint8Array();
 assert.equal(await saveAnimationSnapshot(s,{showSaveFilePicker:async()=>({createWritable:async()=>({write:async b=>{written=b;},close:async()=>{}})})}),true);assert.equal(s.getState().dirty,false);assert.equal(map.has(RECOVERY_KEY),false);assert.equal(parseAnimationSnapshot(written).doc.name,s.document!.name);
 s.dispatch({type:'layer.update',layer:'text',name:'Before save'});assert.equal(await saveAnimationSnapshot(s,{showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{s.dispatch({type:'layer.update',layer:'text',name:'During save'});},close:async()=>{}})})}),false);assert.equal(s.getState().dirty,true);assert.ok(map.has(RECOVERY_KEY));
});
test('failed or cancelled save never clears dirty or journal and aborts provisional writer',async()=>{
 const s=new AnimationSession(null);s.open(base());s.dispatch({type:'layer.update',layer:'text',name:'Dirty'});let aborted=false;
 await assert.rejects(saveAnimationSnapshot(s,{showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}})})}));assert.equal(aborted,true);assert.equal(s.getState().dirty,true);
 assert.equal(await saveAnimationSnapshot(s,{showSaveFilePicker:async()=>{throw new DOMException('cancel','AbortError');}}),false);assert.equal(s.getState().dirty,true);
});
test('save identity guard rejects divergent undo/edit branch even when revision numbers match',async()=>{
 const s=new AnimationSession(null);s.open(base());s.dispatch({type:'layer.update',layer:'text',name:'Original save'});const revision=s.document!.revision;
 const saved=await saveAnimationSnapshot(s,{showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{s.undo();s.dispatch({type:'layer.update',layer:'text',name:'Divergent edit'});assert.equal(s.document!.revision,revision);},close:async()=>{}})})});assert.equal(saved,false);assert.equal(s.getState().dirty,true);
});
