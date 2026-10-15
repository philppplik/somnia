import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCommandSpec} from '../commandBridge';
import {commandDispatcher, isCommandDispatchError} from '../commandDispatcher';
import {listCommands} from '../commands';
import {registerSlidesCommands,slidesCommandSpecs,slidesScopedCommand,type SlidesCommandDeps} from './commands';

type State=ReturnType<SlidesCommandDeps['state']>;
function fakeDeps(over:Partial<State>={}){
  const calls:string[]=[];
  const deps:SlidesCommandDeps={openExport:()=>{},
    state:()=>({busy:false,working:true,canUndo:true,canRedo:false,slides:3,index:0,presenting:false,...over}),
    present:fromStart=>{calls.push(`present:${fromStart}`);},
    exitPresent:()=>{calls.push('exit');},
    history:direction=>{calls.push(`history:${direction}`);},
    saveCopy:()=>{calls.push('saveCopy');},
    showSlide:index=>{calls.push(`show:${index}`);},
  };
  return {deps,calls};
}

test('slides specs carry stable dotted ids, ui level and categories',()=>{
  const {deps}=fakeDeps();
  const specs=slidesCommandSpecs(deps);
  assert.deepEqual(specs.map(s=>s.id),['slides.present','slides.present.fromStart','slides.present.exit','slides.undo','slides.redo','slides.export.advanced','slides.saveCopy','slides.showSlide']);
  for(const spec of specs)assert.equal(spec.level,'ui',spec.id);
  assert.deepEqual(specs.map(s=>s.category),['View','View','View','Edit','Edit','Project','Project','View']);
});

test('slides.showSlide declares a real params schema',()=>{
  const {deps}=fakeDeps();
  const spec=slidesCommandSpecs(deps).find(s=>s.id==='slides.showSlide')!;
  assert.deepEqual(spec.params,{type:'object',properties:{index:{type:'integer',minimum:0,description:'Zero-based slide index.'}},required:['index'],additionalProperties:false});
});

test('enabled follows the session snapshot',()=>{
  const {deps}=fakeDeps({canUndo:false});
  const specs=slidesCommandSpecs(deps);
  const ctx={origin:'ui' as const};
  assert.equal(specs.find(s=>s.id==='slides.undo')!.enabled!(ctx),false);
  assert.equal(specs.find(s=>s.id==='slides.redo')!.enabled!(ctx),false);
  assert.equal(specs.find(s=>s.id==='slides.saveCopy')!.enabled!(ctx),true);
  assert.equal(specs.find(s=>s.id==='slides.showSlide')!.enabled!(ctx),true);
  const busy=fakeDeps({busy:true}).deps;
  for(const spec of slidesCommandSpecs(busy))assert.equal(spec.enabled!(ctx),false,spec.id);
  const empty=fakeDeps({slides:0,working:false,canUndo:false}).deps;
  assert.equal(slidesCommandSpecs(empty).find(s=>s.id==='slides.showSlide')!.enabled!(ctx),false);
});

test('runs delegate to the studio session and keep its own history',async()=>{
  const {deps,calls}=fakeDeps();
  const specs=slidesCommandSpecs(deps);
  await specs.find(s=>s.id==='slides.undo')!.run(undefined,{origin:'ui'});
  await specs.find(s=>s.id==='slides.redo')!.run(undefined,{origin:'ui'});
  await specs.find(s=>s.id==='slides.saveCopy')!.run(undefined,{origin:'ui'});
  await specs.find(s=>s.id==='slides.showSlide')!.run({index:2},{origin:'ui'});
  assert.deepEqual(calls,['history:undo','history:redo','saveCopy','show:2']);
});

test('slides.showSlide rejects an out-of-range index as an expected error',()=>{
  const {deps}=fakeDeps({slides:3});
  const spec=slidesCommandSpecs(deps).find(s=>s.id==='slides.showSlide')!;
  assert.throws(()=>spec.run({index:3},{origin:'ui'}),(e:unknown)=>e instanceof Error&&(e as {expected?:boolean}).expected===true);
});

test('dispatcher validates params and refuses agent origins',async()=>{
  const {deps,calls}=fakeDeps();
  const offs=slidesCommandSpecs(deps).map(spec=>registerCommandSpec(spec));
  try{
    await assert.rejects(commandDispatcher.runCommand('slides.showSlide',{index:-1},{origin:'ui'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='invalid-params');
    await assert.rejects(commandDispatcher.runCommand('slides.showSlide',{index:'2'},{origin:'ui'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='invalid-params');
    await assert.rejects(commandDispatcher.runCommand('slides.undo',undefined,{origin:'agent'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='forbidden-origin');
    await assert.rejects(commandDispatcher.runCommand('slides.saveCopy',undefined,{origin:'mcp'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='forbidden-origin');
    await commandDispatcher.runCommand('slides.showSlide',{index:1},{origin:'palette'});
    assert.deepEqual(calls,['show:1']);
    assert.equal(commandDispatcher.recentActivity().at(-1)?.id,'slides.showSlide');
  }finally{for(const off of offs)off();}
});

test('a disabled spec is refused with the disabled code',async()=>{
  const {deps}=fakeDeps({canUndo:false});
  const off=registerCommandSpec(slidesCommandSpecs(deps).find(s=>s.id==='slides.undo')!);
  try{
    await assert.rejects(commandDispatcher.runCommand('slides.undo',undefined,{origin:'ui'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='disabled');
  }finally{off();}
});

test('the legacy scope routes shared ids to the specs',()=>{
  const undo=slidesScopedCommand('edit.undo')!;
  assert.equal(undo.title,'Undo slide text');
  assert.equal(undo.category,'Edit');
  const save=slidesScopedCommand('project.save')!;
  assert.equal(save.title,'Save presentation copy');
  assert.equal(slidesScopedCommand('edit.redo')!.title,'Redo slide text');
  assert.equal(slidesScopedCommand('edit.delete'),undefined);
  assert.equal(slidesScopedCommand('view.code'),undefined);
});

test('registerSlidesCommands mirrors the specs into the legacy registry and disposes cleanly',()=>{
  const off=registerSlidesCommands();
  try{
    const listed=listCommands().map(c=>c.id);
    for(const id of ['slides.undo','slides.redo','slides.export.advanced','slides.saveCopy','slides.showSlide'])assert.ok(listed.includes(id),id);
    assert.ok(commandDispatcher.has('slides.undo'));
  }finally{off();}
  assert.equal(listCommands().some(c=>c.id==='slides.undo'),false);
  assert.equal(commandDispatcher.has('slides.undo'),false);
});

test('presentation commands are typed, disabled without a deck and refuse remote origins',async()=>{
 const {deps,calls}=fakeDeps();const offs=slidesCommandSpecs(deps).map(spec=>registerCommandSpec(spec));
 try{
  await commandDispatcher.runCommand('slides.present',undefined,{origin:'shortcut'});
  await commandDispatcher.runCommand('slides.present',{fromStart:true},{origin:'ui'});
  await commandDispatcher.runCommand('slides.present.fromStart',undefined,{origin:'shortcut'});
  assert.deepEqual(calls,['present:false','present:true','present:true']);
  await assert.rejects(commandDispatcher.runCommand('slides.present',{fromStart:'yes'},{origin:'ui'}),e=>isCommandDispatchError(e)&&e.code==='invalid-params');
  await assert.rejects(commandDispatcher.runCommand('slides.present',{}, {origin:'agent'}),e=>isCommandDispatchError(e)&&e.code==='forbidden-origin');
  await assert.rejects(commandDispatcher.runCommand('slides.present.exit',undefined,{origin:'ui'}),e=>isCommandDispatchError(e)&&e.code==='disabled');
 }finally{offs.forEach(off=>off());}
 const empty=slidesCommandSpecs(fakeDeps({slides:0}).deps);assert.equal(empty.find(s=>s.id==='slides.present')!.enabled!({origin:'ui'}),false);
 const active=slidesCommandSpecs(fakeDeps({presenting:true,busy:true}).deps);assert.equal(active.find(s=>s.id==='slides.present.exit')!.enabled!({origin:'ui'}),true);
});
