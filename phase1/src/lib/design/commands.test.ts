import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand,listCommands} from '../commands';
import {commandDispatcher,isCommandDispatchError} from '../commandDispatcher';
import {clearDesign,editDesign,getDesignState,selectDesignNode,startDesign} from './session';
import {getState} from '../../store/appStore';
import {createNode} from './model';
import {registerDesignCommands} from './commands';
import {DESIGN_CATALOGUES} from './i18n';

const IDS=['design.getState','design.new','design.undo','design.redo','design.setTool','design.addRectangle','design.addText','design.deleteSelection','design.duplicateSelection','design.alignSelection','design.distributeSelection','design.exportProject','design.exportSvg'];

test('registration mirrors every spec into palette registry and dispatcher, disposal removes both',()=>{
 clearDesign();
 const off=registerDesignCommands();
 try{
  const listed=listCommands().map(c=>c.id);
  for(const id of IDS){assert.ok(listed.includes(id),id);assert.ok(commandDispatcher.has(id),id);}
  assert.equal(listCommands().find(c=>c.id==='design.undo')?.title,'Design: Undo');
 }finally{off();}
 for(const id of IDS){assert.ok(!listCommands().some(c=>c.id===id),id);assert.ok(!commandDispatcher.has(id),id);}
});

test('design.getState is read-level: agent origin allowed, ui commands refuse agent origin',async()=>{
 clearDesign();
 const off=registerDesignCommands();
 try{
  const summary=await commandDispatcher.runCommand('design.getState',undefined,{origin:'agent'});
  assert.deepEqual(summary,{open:false,dirty:false,name:'',artboards:0,layers:0,selected:0,tool:'select',canUndo:false,canRedo:false});
  await assert.rejects(commandDispatcher.runCommand('design.undo',undefined,{origin:'agent'}),error=>isCommandDispatchError(error)&&error.code==='forbidden-origin');
 }finally{off();clearDesign();}
});

test('add/undo/redo run through the legacy executeCommand path with validation and history',async()=>{
 clearDesign();startDesign();
 const off=registerDesignCommands();
 try{
  assert.equal(await executeCommand('design.addRectangle',{x:10,y:20}),true);
  let s=getDesignState();
  assert.equal(s.document!.artboards[0].nodes.length,1);
  assert.equal(s.document!.artboards[0].nodes[0].x,10);
  assert.equal(s.selection,s.document!.artboards[0].nodes[0].id);
  assert.equal(await executeCommand('design.undo'),true);
  assert.equal(getDesignState().document!.artboards[0].nodes.length,0);
  assert.equal(await executeCommand('design.redo'),true);
  s=getDesignState();
  assert.equal(s.document!.artboards[0].nodes.length,1);
  assert.equal(commandDispatcher.recentActivity().at(-1)!.outcome,'ok');
 }finally{off();clearDesign();}
});

test('disabled specs refuse through the unavailable notice',async()=>{
 clearDesign();startDesign();
 const off=registerDesignCommands();
 try{
  assert.equal(await executeCommand('design.undo'),false);
  assert.match(getState().notice,/unavailable/);
  assert.equal(await executeCommand('design.deleteSelection'),false);
 }finally{off();clearDesign();}
});

test('params schemas reject bad input and bad values',async()=>{
 clearDesign();startDesign();
 const off=registerDesignCommands();
 try{
  await assert.rejects(commandDispatcher.runCommand('design.setTool',{tool:'nope'}),error=>isCommandDispatchError(error)&&error.code==='invalid-params');
  await assert.rejects(commandDispatcher.runCommand('design.setTool',{}),error=>isCommandDispatchError(error)&&error.code==='invalid-params');
  await assert.rejects(commandDispatcher.runCommand('design.addRectangle',{x:99999}),error=>isCommandDispatchError(error)&&error.code==='invalid-params');
  editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>({...a,nodes:[{...createNode('rectangle',0),id:'p1'},{...createNode('rectangle',1),id:'p2'}]}))}));
  selectDesignNode('p1');selectDesignNode('p2',true);
  await assert.rejects(commandDispatcher.runCommand('design.alignSelection',{kind:'middle'}),error=>isCommandDispatchError(error)&&error.code==='invalid-params');
 }finally{off();clearDesign();}
});

test('setTool frame adds an artboard as one undo step, other tools only switch',async()=>{
 clearDesign();startDesign();
 const off=registerDesignCommands();
 try{
  await commandDispatcher.runCommand('design.setTool',{tool:'hand'});
  assert.equal(getDesignState().tool,'hand');
  assert.equal(getDesignState().past.length,0);
  await commandDispatcher.runCommand('design.setTool',{tool:'frame'});
  const s=getDesignState();
  assert.equal(s.document!.artboards.length,2);
  assert.equal(s.artboardId,s.document!.artboards[1].id);
  assert.equal(s.tool,'select');
  assert.equal(s.past.length,1);
 }finally{off();clearDesign();}
});

test('align and duplicate act on the selection as single transactions',async()=>{
 clearDesign();startDesign();
 const off=registerDesignCommands();
 try{
  editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>({...a,nodes:[
   {...createNode('rectangle',0),id:'n1',name:'A',x:0,y:0,width:10,height:10},
   {...createNode('rectangle',1),id:'n2',name:'B',x:40,y:30,width:20,height:10},
  ]}))}));
  selectDesignNode('n1');selectDesignNode('n2',true);
  await commandDispatcher.runCommand('design.alignSelection',{kind:'left'});
  let nodes=getDesignState().document!.artboards[0].nodes;
  assert.deepEqual(nodes.map(n=>n.x),[0,0]);
  assert.equal(getDesignState().past.length,2);
  await commandDispatcher.runCommand('design.duplicateSelection');
  nodes=getDesignState().document!.artboards[0].nodes;
  assert.equal(nodes.length,4);
  assert.ok(nodes.filter(n=>n.name.endsWith(' copy')).length===2);
 }finally{off();clearDesign();}
});

test('every cmd.design.* key exists in all five design locales',()=>{
 const base=Object.keys(DESIGN_CATALOGUES.en).filter(k=>k.startsWith('cmd.design.'));
 assert.deepEqual([...base].sort(),[...IDS].sort().map(id=>`cmd.${id}`));
 for(const [locale,catalogue] of Object.entries(DESIGN_CATALOGUES))assert.deepEqual(base.filter(k=>!(k in catalogue)),[],locale);
});
