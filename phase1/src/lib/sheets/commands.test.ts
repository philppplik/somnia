import test from 'node:test';
import assert from 'node:assert/strict';
import {commandDispatcher, isCommandDispatchError} from '../commandDispatcher';
import {listCommands} from '../commands';
import {getSheetsCommandController,registerSheetsCommandController,registerSheetsCommands,sheetsCommandSpecs,type SheetsCommandController} from './commands';

function fakeController(over:Partial<SheetsCommandController>={}){
  const calls:string[]=[];
  const controller:SheetsCommandController={
    ready:()=>true,
    canUndo:()=>true,
    canRedo:()=>false,
    undo:()=>{calls.push('undo');},
    redo:()=>{calls.push('redo');},
    saveCopy:()=>{calls.push('saveCopy');},
    ...over,
  };
  return {controller,calls};
}

test('controller registry keeps exactly the mounted workbook',()=>{
  assert.equal(getSheetsCommandController(),null);
  const a=fakeController().controller,b=fakeController().controller;
  const offA=registerSheetsCommandController(a);
  assert.equal(getSheetsCommandController(),a);
  const offB=registerSheetsCommandController(b);
  assert.equal(getSheetsCommandController(),b);
  offA();
  assert.equal(getSheetsCommandController(),b,'a stale disposer must not clear the current controller');
  offB();
  assert.equal(getSheetsCommandController(),null);
});

test('sheets specs carry stable dotted ids, ui level and categories',()=>{
  const specs=sheetsCommandSpecs({controller:()=>null});
  assert.deepEqual(specs.map(s=>s.id),['sheets.undo','sheets.redo','sheets.saveCopy']);
  for(const spec of specs)assert.equal(spec.level,'ui',spec.id);
  assert.deepEqual(specs.map(s=>s.category),['Edit','Edit','Project']);
});

test('enabled follows the registered controller',()=>{
  const {controller}=fakeController();
  let current:SheetsCommandController|null=null;
  const specs=sheetsCommandSpecs({controller:()=>current});
  const ctx={origin:'ui' as const};
  for(const spec of specs)assert.equal(spec.enabled!(ctx),false,spec.id);
  current=controller;
  assert.equal(specs.find(s=>s.id==='sheets.undo')!.enabled!(ctx),true);
  assert.equal(specs.find(s=>s.id==='sheets.redo')!.enabled!(ctx),false);
  assert.equal(specs.find(s=>s.id==='sheets.saveCopy')!.enabled!(ctx),true);
});

test('runs delegate to the controller and its engine history',async()=>{
  const {controller,calls}=fakeController();
  const specs=sheetsCommandSpecs({controller:()=>controller});
  await specs.find(s=>s.id==='sheets.undo')!.run(undefined,{origin:'ui'});
  await specs.find(s=>s.id==='sheets.redo')!.run(undefined,{origin:'ui'});
  await specs.find(s=>s.id==='sheets.saveCopy')!.run(undefined,{origin:'ui'});
  assert.deepEqual(calls,['undo','redo','saveCopy']);
});

test('runs without a workbook fail as an expected error',()=>{
  const specs=sheetsCommandSpecs({controller:()=>null});
  for(const spec of specs){
    assert.throws(()=>spec.run(undefined,{origin:'ui'}),(e:unknown)=>e instanceof Error&&(e as {expected?:boolean}).expected===true&&/No workbook is open/.test(e.message));
  }
  const disposed=fakeController({ready:()=>false}).controller;
  const specs2=sheetsCommandSpecs({controller:()=>disposed});
  assert.throws(()=>specs2[0].run(undefined,{origin:'ui'}),/No workbook is open/);
});

test('dispatcher refuses agent origins and disabled commands, logs activity',async()=>{
  const offSpecs=registerSheetsCommands();
  const {controller,calls}=fakeController();
  const offController=registerSheetsCommandController(controller);
  try{
    await assert.rejects(commandDispatcher.runCommand('sheets.undo',undefined,{origin:'agent'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='forbidden-origin');
    await assert.rejects(commandDispatcher.runCommand('sheets.redo',undefined,{origin:'ui'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='disabled');
    await commandDispatcher.runCommand('sheets.undo',undefined,{origin:'palette'});
    await commandDispatcher.runCommand('sheets.saveCopy',undefined,{origin:'shortcut'});
    assert.deepEqual(calls,['undo','saveCopy']);
    assert.equal(commandDispatcher.recentActivity().at(-1)?.outcome,'ok');
    const listed=listCommands().map(c=>c.id);
    for(const id of ['sheets.undo','sheets.redo','sheets.saveCopy'])assert.ok(listed.includes(id),id);
  }finally{offController();offSpecs();}
  assert.equal(listCommands().some(c=>c.id==='sheets.undo'),false);
  assert.equal(commandDispatcher.has('sheets.undo'),false);
});

test('without a controller the dispatcher reports disabled',async()=>{
  const offSpecs=registerSheetsCommands();
  try{
    await assert.rejects(commandDispatcher.runCommand('sheets.saveCopy',undefined,{origin:'ui'}),(e:unknown)=>isCommandDispatchError(e)&&e.code==='disabled');
  }finally{offSpecs();}
});
