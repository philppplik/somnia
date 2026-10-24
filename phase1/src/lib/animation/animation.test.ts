import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEdit,applyEdits,EditError,type Edit} from './edit';
import {createDocument,createComposition,findComp,findLayer,validateDocument,type AnimationDocument} from './model';
import {cubicBezier,evaluate} from './interpolate';
import {frameToTick,tickToFrame,snapToFrame,timecode,TICKS_PER_SECOND,frameCount} from './time';
import {sceneAt} from './scene';
import {AnimationSession} from './session';
import {RECOVERY_KEY,readJournal,type KeyValueStore} from './recovery';
import {animationCommandSpecs,ANIMATION_COMMANDS} from './commands';
import {ANIMATION_CATALOGUES} from './i18n';
import {animationShell,animationStudio} from '../studios/animation';
import {validateStudioShell,resolveInspectorSections} from '../shell/panels';
import {hasRailIcon} from '../shell/railIcons';
import '../../components/shell/railIconSet';
import {resolveHeroAction as resolveHero} from '../shell/heroAction';
const fps30={num:30,den:1};
const memStore=():KeyValueStore&{data:Map<string,string>}=>{const data=new Map<string,string>();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>void data.set(k,v),removeItem:k=>void data.delete(k)};};
const withLayer=(kind:'solid'|'text'|'shape'|'null'='shape'):{doc:AnimationDocument;id:string}=>{
 const doc=applyEdit(createDocument('t',createComposition({fps:fps30,duration:TICKS_PER_SECOND*2})),{type:'layer.add',kind,id:'L1'});return {doc,id:'L1'};
};
const sec=(s:number)=>s*TICKS_PER_SECOND;
const layerOf=(d:AnimationDocument,id='L1')=>findLayer(findComp(d),id)!;

test('time: frames convert exactly at NTSC and integer rates',()=>{
 assert.equal(frameToTick(30,fps30),TICKS_PER_SECOND);
 const ntsc={num:30000,den:1001};
 assert.equal(frameToTick(30000,ntsc),1001*TICKS_PER_SECOND);
 for(const f of [0,1,29,30,1799,100000])assert.equal(tickToFrame(frameToTick(f,ntsc),ntsc),f);
 assert.equal(snapToFrame(frameToTick(5,fps30)+10,fps30),frameToTick(5,fps30));
 assert.equal(frameCount(sec(2),fps30),60);
 assert.equal(timecode(sec(61)+frameToTick(3,fps30),fps30),'00:01:01:03');
});
test('interpolation: hold, linear, bezier, clamping and vectors',()=>{
 let {doc}=withLayer();
 doc=applyEdits(doc,[{type:'prop.animate',layer:'L1',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'L1',prop:'opacity',value:0,t:0},{type:'prop.set',layer:'L1',prop:'opacity',value:100,t:sec(1)}]);
 const p=()=>layerOf(doc).transform.opacity;
 doc=applyEdit(doc,{type:'key.interp',layer:'L1',prop:'opacity',t:0,interp:'linear'});
 assert.equal(evaluate(p(),sec(0.5)),50);assert.equal(evaluate(p(),-5),0);assert.equal(evaluate(p(),sec(9)),100);
 doc=applyEdit(doc,{type:'key.interp',layer:'L1',prop:'opacity',t:0,interp:'hold'});
 assert.equal(evaluate(p(),sec(0.99)),0);assert.equal(evaluate(p(),sec(1)),100);
 doc=applyEdit(doc,{type:'key.interp',layer:'L1',prop:'opacity',t:0,interp:'bezier',out:[0.42,0]});
 doc=applyEdit(doc,{type:'key.interp',layer:'L1',prop:'opacity',t:sec(1),interp:'hold',in:[0.58,1]});
 const mid=evaluate(p(),sec(0.5)) as number;assert.ok(Math.abs(mid-50)<0.5);
 assert.ok((evaluate(p(),sec(0.25)) as number)<25);
 assert.ok(Math.abs(cubicBezier(0.25,0.1,0.25,1,0.5)-0.8024)<0.002);
 doc=applyEdits(doc,[{type:'prop.animate',layer:'L1',prop:'position',on:true,t:0},{type:'prop.set',layer:'L1',prop:'position',value:[0,0],t:0},{type:'prop.set',layer:'L1',prop:'position',value:[100,200],t:sec(1)},{type:'key.interp',layer:'L1',prop:'position',t:0,interp:'linear'}]);
 assert.deepEqual(evaluate(layerOf(doc).transform.position,sec(0.5)),[50,100]);
});
test('prop.set on an unanimated property edits the base value; animated edits add a key at the playhead',()=>{
 let {doc}=withLayer();
 doc=applyEdit(doc,{type:'prop.set',layer:'L1',prop:'rotation',value:45,t:0});
 assert.equal(layerOf(doc).transform.rotation.value,45);assert.equal(layerOf(doc).transform.rotation.keys.length,0);
 doc=applyEdit(doc,{type:'prop.animate',layer:'L1',prop:'rotation',on:true,t:sec(1)});
 assert.equal(layerOf(doc).transform.rotation.keys.length,1);
 doc=applyEdit(doc,{type:'prop.set',layer:'L1',prop:'rotation',value:90,t:sec(2)});
 assert.deepEqual(layerOf(doc).transform.rotation.keys.map(k=>[k.t,k.v]),[[sec(1),45],[sec(2),90]]);
});
test('disabling animation bakes the current value and is undoable',()=>{
 const s=new AnimationSession(null);
 s.open(withLayer().doc);
 s.dispatch([{type:'prop.animate',layer:'L1',prop:'rotation',on:true,t:0},{type:'prop.set',layer:'L1',prop:'rotation',value:90,t:sec(1)}]);
 s.dispatch({type:'prop.animate',layer:'L1',prop:'rotation',on:false,t:sec(1)});
 assert.equal(layerOf(s.document!).transform.rotation.keys.length,0);assert.equal(layerOf(s.document!).transform.rotation.value,90);
 assert.ok(s.undo());assert.equal(layerOf(s.document!).transform.rotation.keys.length,2);
});
test('keys: one per tick, collision needs explicit replace, removal of last key keeps the value',()=>{
 let {doc}=withLayer();
 doc=applyEdits(doc,[{type:'prop.animate',layer:'L1',prop:'opacity',on:true,t:0},{type:'key.add',layer:'L1',prop:'opacity',t:sec(1)}]);
 const mv:Edit={type:'key.move',layer:'L1',prop:'opacity',from:0,to:sec(1)};
 assert.throws(()=>applyEdit(doc,mv),(e:unknown)=>e instanceof EditError&&e.code==='collision');
 const replaced=applyEdit(doc,{...mv,replace:true});assert.equal(layerOf(replaced).transform.opacity.keys.length,1);
 const gone=applyEdits(replaced,[{type:'prop.set',layer:'L1',prop:'opacity',value:30,t:sec(1)},{type:'key.remove',layer:'L1',prop:'opacity',t:sec(1)}]);
 assert.equal(layerOf(gone).transform.opacity.keys.length,0);assert.equal(layerOf(gone).transform.opacity.value,30);
 assert.throws(()=>applyEdit(doc,{type:'key.remove',layer:'L1',prop:'opacity',t:sec(1.5)}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'key.add',layer:'L1',prop:'opacity',t:sec(99)}),EditError);
});
test('validation: ranges, units and locked layers are enforced',()=>{
 const {doc}=withLayer();
 assert.throws(()=>applyEdit(doc,{type:'prop.set',layer:'L1',prop:'opacity',value:150,t:0}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'prop.set',layer:'L1',prop:'position',value:5 as never,t:0}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'prop.set',layer:'L1',prop:'rotation',value:NaN,t:0}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'prop.set',layer:'nope',prop:'rotation',value:1,t:0}),(e:unknown)=>e instanceof EditError&&e.code==='missing');
 const locked=applyEdit(doc,{type:'layer.update',layer:'L1',locked:true});
 assert.throws(()=>applyEdit(locked,{type:'prop.set',layer:'L1',prop:'rotation',value:1,t:0}),(e:unknown)=>e instanceof EditError&&e.code==='locked');
 assert.throws(()=>applyEdit(locked,{type:'layer.remove',layer:'L1'}),EditError);
 assert.throws(()=>applyEdit(locked,{type:'layer.update',layer:'L1',name:'x'}),EditError);
 assert.equal(layerOf(applyEdit(locked,{type:'layer.update',layer:'L1',locked:false})).locked,false);
 assert.throws(()=>applyEdit(doc,{type:'comp.update',settings:{width:0}}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'comp.update',settings:{fps:{num:1000,den:1}}}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'layer.timing',layer:'L1',inT:10,outT:5}),EditError);
 assert.throws(()=>applyEdit(doc,{type:'layer.update',layer:'L1',source:{color:'red'}}),EditError);
});
test('parenting rejects cycles and orphaned parents are cleared when a layer is deleted',()=>{
 let doc=createDocument('p');
 doc=applyEdits(doc,[{type:'layer.add',kind:'null',id:'A'},{type:'layer.add',kind:'shape',id:'B'},{type:'layer.add',kind:'shape',id:'C'},{type:'layer.parent',layer:'B',parent:'A'},{type:'layer.parent',layer:'C',parent:'B'}]);
 assert.throws(()=>applyEdit(doc,{type:'layer.parent',layer:'A',parent:'C'}),(e:unknown)=>e instanceof EditError&&e.code==='cycle');
 assert.throws(()=>applyEdit(doc,{type:'layer.parent',layer:'A',parent:'A'}),EditError);
 const del=applyEdit(doc,{type:'layer.remove',layer:'A'});assert.equal(layerOf(del,'B').parent,null);assert.deepEqual(validateDocument(del),[]);
});
test('scene: parent transforms compose, solo and visibility filter, timing gates layers',()=>{
 let doc=createDocument('s',createComposition({width:100,height:100,fps:fps30,duration:sec(2)}));
 doc=applyEdits(doc,[{type:'layer.add',kind:'null',id:'P'},{type:'layer.add',kind:'shape',id:'K'},
  {type:'prop.set',layer:'P',prop:'position',value:[10,0],t:0},{type:'layer.parent',layer:'K',parent:'P'},
  {type:'prop.set',layer:'K',prop:'position',value:[5,0],t:0},{type:'prop.set',layer:'K',prop:'anchor',value:[0,0],t:0},{type:'prop.set',layer:'P',prop:'anchor',value:[0,0],t:0}]);
 const c=findComp(doc)!;const s=sceneAt(c,0);assert.equal(s.length,1);assert.deepEqual([s[0].matrix[4],s[0].matrix[5]],[15,0]);
 doc=applyEdit(doc,{type:'prop.set',layer:'P',prop:'rotation',value:90,t:0});
 const r=sceneAt(findComp(doc)!,0)[0].matrix;assert.ok(Math.abs(r[4]-10)<1e-9&&Math.abs(r[5]-5)<1e-9);
 doc=applyEdit(doc,{type:'layer.timing',layer:'K',inT:sec(1),outT:sec(2)});
 assert.equal(sceneAt(findComp(doc)!,sec(0.5)).length,0);assert.equal(sceneAt(findComp(doc)!,sec(1)).length,1);
 doc=applyEdit(doc,{type:'layer.update',layer:'K',visible:false});assert.equal(sceneAt(findComp(doc)!,sec(1)).length,0);
});
test('undo/redo: one step per dispatch, a new edit clears redo, history is bounded',()=>{
 const s=new AnimationSession(null);s.createBlank();
 s.dispatch({type:'layer.add',kind:'text'});s.dispatch({type:'layer.add',kind:'solid'});
 assert.equal(findComp(s.document!)!.layers.length,2);
 assert.ok(s.undo());assert.equal(findComp(s.document!)!.layers.length,1);assert.ok(s.getState().canRedo);
 s.dispatch({type:'layer.add',kind:'shape'});assert.equal(s.getState().canRedo,false);
 s.undo();s.undo();assert.equal(s.undo(),false);assert.equal(findComp(s.document!)!.layers.length,0);
 s.redo();assert.equal(findComp(s.document!)!.layers.length,1);
 for(let i=0;i<260;i++)s.dispatch({type:'comp.update',settings:{name:`n${i}`}});
 let n=0;while(s.undo())n++;assert.equal(n,200);
});
test('failed dispatch changes nothing, multi-edit dispatch is atomic',()=>{
 const s=new AnimationSession(null);s.open(withLayer().doc);const before=s.document;
 assert.throws(()=>s.dispatch([{type:'prop.set',layer:'L1',prop:'rotation',value:5,t:0},{type:'prop.set',layer:'L1',prop:'opacity',value:500,t:0}]),EditError);
 assert.equal(s.document,before);assert.equal(s.getState().canUndo,false);
});
test('drag preview commits once, cancel restores, and preview never reaches history or the journal',()=>{
 const store=memStore();const s=new AnimationSession(store);s.open(withLayer().doc);
 s.dispatch([{type:'prop.animate',layer:'L1',prop:'position',on:true,t:0}]);
 const committed=s.document;const journalBefore=store.data.get(RECOVERY_KEY);
 for(const x of [10,20,30])s.previewEdits([{type:'prop.set',layer:'L1',prop:'position',value:[x,0],t:sec(1)}]);
 assert.equal(s.document,committed);assert.ok(s.visible!==committed);assert.equal(store.data.get(RECOVERY_KEY),journalBefore);
 s.cancelPreview();assert.equal(s.visible,committed);
 s.previewEdits([{type:'prop.set',layer:'L1',prop:'position',value:[30,0],t:sec(1)}]);assert.ok(s.commitPreview());
 assert.deepEqual(layerOf(s.document!).transform.position.keys.at(-1)!.v,[30,0]);
 s.undo();assert.equal(layerOf(s.document!).transform.position.keys.length,1);
});
test('dirty state follows the revision and is independent of view state',()=>{
 const s=new AnimationSession(null);s.open(withLayer().doc);assert.equal(s.getState().dirty,false);
 s.setView({playhead:sec(1)});assert.equal(s.getState().dirty,false);
 s.dispatch({type:'comp.update',settings:{name:'x'}});assert.equal(s.getState().dirty,true);
 s.undo();assert.equal(s.getState().dirty,false);// back at the saved revision
 s.redo();assert.equal(s.getState().dirty,true);
});
test('playhead snaps to frames and clamps to the composition',()=>{
 const s=new AnimationSession(null);s.open(withLayer().doc);
 s.setView({playhead:frameToTick(3,fps30)+7});assert.equal(s.getState().view.playhead,frameToTick(3,fps30));
 s.setView({playhead:sec(99)});assert.equal(s.getState().view.playhead,sec(2));
 s.setView({playhead:-5});assert.equal(s.getState().view.playhead,0);
});
test('recovery: journal restores document, history-free, and view state; survives a new session',()=>{
 const store=memStore();const a=new AnimationSession(store,()=>42);
 a.createBlank('Lower third');a.dispatch([{type:'layer.add',kind:'text',id:'T'},{type:'prop.animate',layer:'T',prop:'opacity',on:true,t:0}]);
 a.setView({selectedLayer:'T'});a.suspend();
 const b=new AnimationSession(store);assert.equal(b.recover(),true);
 assert.deepEqual(b.document,a.document);assert.equal(b.getState().view.selectedLayer,'T');assert.equal(b.getState().dirty,true);assert.equal(b.getState().canUndo,false);
 assert.equal(JSON.parse(store.data.get(RECOVERY_KEY)!).savedAt,42);
});
test('recovery rejects corrupt, foreign and tampered journals without touching the open document',()=>{
 for(const raw of ['not json','{"v":2}','{"v":1,"doc":{"schema":1}}',JSON.stringify({v:1,doc:{...createDocument('x'),compositions:[]},view:{}})]){
  const store=memStore();store.data.set(RECOVERY_KEY,raw);assert.equal(readJournal(store),null);
  const s=new AnimationSession(store);s.createBlank('keep');const before=s.document;
  store.data.set(RECOVERY_KEY,raw);assert.equal(s.recover(),false);assert.equal(s.document,before);
 }
 const bad=createDocument('b');const doc={...bad,compositions:[{...bad.compositions[0],layers:[{...createLayer0(),transform:{}}]}]} as unknown as AnimationDocument;
 assert.ok(validateDocument(doc).length>0);
});
function createLayer0(){const d=applyEdit(createDocument('z'),{type:'layer.add',kind:'null',id:'Z'});return findComp(d)!.layers[0];}
test('failed journal write is reported and keeps the in-memory document',()=>{
 const store:KeyValueStore={getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{}};
 const s=new AnimationSession(store);s.createBlank();assert.equal(s.getState().recoveryFailed,true);
 s.dispatch({type:'layer.add',kind:'solid'});assert.equal(findComp(s.document!)!.layers.length,1);
});
test('close discards the journal; recover then finds nothing',()=>{
 const store=memStore();const s=new AnimationSession(store);s.createBlank();assert.ok(store.data.has(RECOVERY_KEY));
 s.close();assert.equal(store.data.has(RECOVERY_KEY),false);assert.equal(s.recover(),false);
});
test('document validation catches non-ascending keys, bad ease handles and missing media-free assets',()=>{
 let {doc}=withLayer();doc=applyEdits(doc,[{type:'prop.animate',layer:'L1',prop:'opacity',on:true,t:0},{type:'key.add',layer:'L1',prop:'opacity',t:sec(1)}]);
 assert.deepEqual(validateDocument(doc),[]);
 const c=doc.compositions[0];const l=c.layers[0];const keys=[...l.transform.opacity.keys].reverse();
 const broken={...doc,compositions:[{...c,layers:[{...l,transform:{...l.transform,opacity:{...l.transform.opacity,keys}}}]}]};
 assert.ok(validateDocument(broken).some(m=>m.includes('ascending')));
 const ease={...doc,compositions:[{...c,layers:[{...l,transform:{...l.transform,opacity:{...l.transform.opacity,keys:l.transform.opacity.keys.map(k=>({...k,out:[2,0] as const}))}}}]}]};
 assert.ok(validateDocument(ease).some(m=>m.includes('ease')));
 assert.deepEqual(JSON.parse(JSON.stringify(doc)),doc);
});
test('composition changes clip layers and keep work area valid',()=>{
 let {doc}=withLayer();
 doc=applyEdit(doc,{type:'comp.update',settings:{duration:sec(1)}});
 assert.equal(layerOf(doc).outT,sec(1));assert.equal(findComp(doc)!.workArea.out,sec(1));assert.deepEqual(validateDocument(doc),[]);
 doc=applyEdit(doc,{type:'comp.add',settings:{name:'Second'}});assert.equal(doc.compositions.length,2);
 const first=doc.compositions[0].id;doc=applyEdit(doc,{type:'comp.remove',comp:doc.activeComp});assert.equal(doc.activeComp,first);
 assert.throws(()=>applyEdit(doc,{type:'comp.remove',comp:first}),EditError);
});
test('commands: specs have unique valid ids, enabled follows open state, edits go through the session',async()=>{
 assert.equal(new Set(ANIMATION_COMMANDS).size,ANIMATION_COMMANDS.length);
 const specs=animationCommandSpecs();const byId=new Map(specs.map(s=>[s.id,s]));
 const {setAnimationSession,animationSession}=await import('./session');
 const s=new AnimationSession(null);setAnimationSession(s);
 const ctx={origin:'ui'} as never;
 assert.equal(byId.get('animation.layer.add')!.enabled!(ctx),false);assert.equal(byId.get('animation.project.new')!.enabled!(ctx),true);
 await byId.get('animation.project.new')!.run(undefined,ctx);assert.equal(byId.get('animation.layer.add')!.enabled!(ctx),true);
 await byId.get('animation.layer.add')!.run({kind:'text'},ctx);
 assert.equal(animationSession().getState().view.selectedLayer,findComp(s.document!)!.layers[0].id);
 await byId.get('animation.prop.animate')!.run({prop:'opacity',on:true},ctx);
 await byId.get('animation.playhead.set')!.run({seconds:1},ctx);
 await byId.get('animation.prop.set')!.run({prop:'opacity',value:10},ctx);
 const l=findComp(s.document!)!.layers[0];assert.deepEqual(l.transform.opacity.keys.map(k=>[k.t,k.v]),[[0,100],[sec(1),10]]);
 await assert.rejects(async()=>byId.get('animation.prop.set')!.run({prop:'opacity',value:999},ctx),(e:{expected?:boolean})=>e.expected===true);
 await byId.get('animation.edit.undo')!.run(undefined,ctx);assert.equal(findComp(s.document!)!.layers[0].transform.opacity.keys.length,1);
 await byId.get('animation.render.open')!.run(undefined,ctx);assert.equal(s.getState().renderSetup,true);
 setAnimationSession(null);
});
test('manifest validates hosts, commands and icons; hero is Render and only opens setup',()=>{
 const hosts=new Set(['code.files','shell.inspector','animation.compositions']);
 const sections=new Set(['animation.inspector.properties','animation.inspector.composition','animation.inspector.render']);
 assert.deepEqual(validateStudioShell('animation',animationShell,{hostExists:id=>hosts.has(id),sectionHostExists:id=>sections.has(id),commandExists:id=>ANIMATION_COMMANDS.includes(id),iconExists:hasRailIcon}),[]);
 assert.equal(animationStudio.shellV2,animationShell);assert.equal(animationStudio.shell.header.heroAction!.id,'animation.render.open');
 assert.deepEqual(animationStudio.formats,[]);
 const ids=(c:unknown)=>resolveInspectorSections(animationShell.inspector!.sections,c).map(x=>x.id);
 const ctx=(sel:boolean,ready:boolean,setup=false)=>({studio:'animation',selection:{kind:sel?'one':'none',count:sel?1:0},services:{ready,renderSetup:setup}});
 assert.deepEqual(ids(ctx(false,false)),[]);assert.deepEqual(ids(ctx(false,true)),['composition']);
 assert.deepEqual(ids(ctx(true,true,true)),['properties','composition','render']);
 const hero=resolveHero(animationStudio.shell.header.heroAction,ctx(false,true),id=>({id,title:'Render',enabled:true}));
 assert.notEqual(hero.kind,'default');
});
test('all command and shell titles have five-locale keys',()=>{
 const en=Object.keys(ANIMATION_CATALOGUES.en).sort();
 for(const tag of ['de','es','fr','pt-BR'])assert.deepEqual(Object.keys(ANIMATION_CATALOGUES[tag]).sort(),en);
 for(const id of ANIMATION_COMMANDS)for(const c of Object.values(ANIMATION_CATALOGUES))assert.ok(c['cmd.'+id],id);
 for(const key of ['studio.animation','cmd.studio.animation','animation.hero.render'])for(const c of Object.values(ANIMATION_CATALOGUES))assert.ok(c[key]);
 const keys=[...animationShell.panels!.map(p=>p.titleKey),...animationShell.leftRail!.map(r=>r.labelKey),...animationShell.rightRail!.map(r=>r.labelKey),...animationShell.inspector!.sections.map(s=>s.titleKey),animationShell.inspector!.emptyKey];
 for(const k of keys)for(const c of Object.values(ANIMATION_CATALOGUES))assert.ok(c[k!],k);
});
