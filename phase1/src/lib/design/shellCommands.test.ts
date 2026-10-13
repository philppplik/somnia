import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand,listCommands} from '../commands';
import {commandDispatcher} from '../commandDispatcher';
import {clearDesign,getDesignState,selectDesignNode,selectDesignNodes,startDesign} from './session';
import {registerDesignCommands} from './commands';
import {addDesignNode} from './panelAdapter';
import {getDesignView,setDesignViewport,setDesignZoom} from './view';
import {DESIGN_SHELL_COMMANDS} from '../studios/design';
const board=()=>{const s=getDesignState();return s.document!.artboards.find(a=>a.id===s.artboardId)!;};
const withDesign=async(fn:()=>Promise<void>)=>{clearDesign();startDesign();setDesignZoom(0.65);const off=registerDesignCommands();try{await fn();}finally{off();clearDesign();setDesignViewport(null);}};
test('every command the design shell names is registered while the canvas is mounted',async()=>{
 await withDesign(async()=>{for(const id of DESIGN_SHELL_COMMANDS){assert.ok(listCommands().some(c=>c.id===id),id);assert.ok(commandDispatcher.has(id),id);}});
 for(const id of DESIGN_SHELL_COMMANDS)assert.ok(!listCommands().some(c=>c.id===id),`${id} stays registered after dispose`);
});
test('tool commands switch the tool; the artboard tool adds one artboard',async()=>{
 await withDesign(async()=>{
  assert.equal(await executeCommand('design.tool.rectangle'),true);assert.equal(getDesignState().tool,'rectangle');
  assert.equal(await executeCommand('design.tool.hand'),true);assert.equal(getDesignState().tool,'hand');
  assert.equal(await executeCommand('design.tool.frame'),true);assert.equal(getDesignState().document!.artboards.length,2);
 });
});
test('artboard add, preset, resize, rotate, rename, reorder, delete are single undo steps',async()=>{
 await withDesign(async()=>{
  const before=getDesignState().past.length;
  assert.equal(await executeCommand('design.artboard.add',{preset:'story'}),true);
  let s=getDesignState();assert.equal(s.document!.artboards.length,2);assert.equal(s.past.length,before+1);
  assert.deepEqual([board().width,board().height],[1080,1920]);assert.equal(s.artboardId,board().id);
  assert.equal(await executeCommand('design.artboard.rotate'),true);assert.deepEqual([board().width,board().height],[1920,1080]);
  assert.equal(await executeCommand('design.artboard.preset',{preset:'mobile'}),true);assert.deepEqual([board().width,board().height],[390,844]);
  assert.equal(await executeCommand('design.artboard.resize',{width:500,height:300}),true);assert.deepEqual([board().width,board().height],[500,300]);
  assert.equal(await executeCommand('design.artboard.rename',{name:'Hero'}),true);assert.equal(board().name,'Hero');
  assert.equal(await executeCommand('design.artboard.moveUp'),true);assert.equal(getDesignState().document!.artboards[0].name,'Hero');
  assert.equal(await executeCommand('design.artboard.moveUp'),false,'already first');
  assert.equal(await executeCommand('design.undo'),true);assert.equal(getDesignState().document!.artboards[1].name,'Hero');
  assert.equal(await executeCommand('design.artboard.delete'),true);assert.equal(getDesignState().document!.artboards.length,1);
  assert.equal(await executeCommand('design.artboard.delete'),false,'the last artboard stays');
 });
});
test('invalid input is refused without touching the document',async()=>{
 await withDesign(async()=>{
  const json=JSON.stringify(getDesignState().document);
  assert.equal(await executeCommand('design.artboard.preset',{preset:'nope'}),false);
  assert.equal(await executeCommand('design.artboard.resize',{width:0,height:10}),false);
  assert.equal(await executeCommand('design.artboard.resize',{width:20000,height:10}),false);
  assert.equal(await executeCommand('design.artboard.rename',{name:''}),false);
  assert.equal(await executeCommand('design.color.apply',{target:'fill',color:'red'}),false);
  assert.equal(await executeCommand('design.artboard.select',{index:5}),false);
  assert.equal(JSON.stringify(getDesignState().document),json);
 });
});
test('artboard.duplicate copies layers; select and next/previous move the active board',async()=>{
 await withDesign(async()=>{
  addDesignNode('rectangle');
  assert.equal(await executeCommand('design.artboard.duplicate'),true);
  const s=getDesignState();assert.equal(s.document!.artboards.length,2);assert.equal(board().nodes.length,1);assert.notEqual(board().nodes[0].id,s.document!.artboards[0].nodes[0].id);
  assert.equal(await executeCommand('design.artboard.next'),false);
  assert.equal(await executeCommand('design.artboard.previous'),true);assert.equal(getDesignState().artboardId,s.document!.artboards[0].id);
  assert.equal(await executeCommand('design.artboard.select',{index:1}),true);assert.equal(getDesignState().artboardId,s.document!.artboards[1].id);
 });
});
test('colour apply targets the selection or the background',async()=>{
 await withDesign(async()=>{
  const id=addDesignNode('rectangle')!;
  assert.equal(await executeCommand('design.color.apply',{target:'fill',color:'#00ff00'}),true);assert.equal(board().nodes[0].fill,'#00ff00');
  assert.equal(await executeCommand('design.color.apply',{target:'stroke',color:'#0000ff'}),true);assert.equal(board().nodes[0].stroke,'#0000ff');
  assert.equal(await executeCommand('design.color.apply',{target:'fill',color:null}),true);assert.equal(board().nodes[0].fill,null);
  assert.equal(await executeCommand('design.color.apply',{target:'background',color:'#101010'}),true);assert.equal(board().background,'#101010');
  selectDesignNode(null);assert.equal(await executeCommand('design.color.apply',{target:'fill',color:'#ffffff'}),false,'no selection');
  assert.equal(board().nodes[0].id,id);
 });
});
test('zoom commands step, reset, set and fit',async()=>{
 await withDesign(async()=>{
  assert.equal(await executeCommand('design.zoomIn'),true);assert.equal(getDesignView().zoom,0.75);
  assert.equal(await executeCommand('design.zoomOut'),true);assert.equal(getDesignView().zoom,0.65);
  assert.equal(await executeCommand('design.zoomReset'),true);assert.equal(getDesignView().zoom,1);
  assert.equal(await executeCommand('design.zoomSet',{zoom:2.5}),true);assert.equal(getDesignView().zoom,2.5);
  assert.equal(await executeCommand('design.zoomSet',{zoom:9}),false);
  assert.equal(await executeCommand('design.zoomFit'),false,'no measured viewport yet');
  setDesignViewport({width:1160,height:880});assert.equal(await executeCommand('design.zoomFit'),true);
  assert.equal(getDesignView().zoom,Math.floor(Math.min(1000/960,720/640)*100)/100);
 });
});
test('stacking, visibility, lock, nudge and select-all act on the selection',async()=>{
 await withDesign(async()=>{
  const a=addDesignNode('rectangle')!,b=addDesignNode('text')!,c=addDesignNode('rectangle')!;
  assert.equal(await executeCommand('design.selectAll'),true);assert.deepEqual([...getDesignState().selectedIds].sort(),[a,b,c].sort());
  assert.equal(await executeCommand('design.deselect'),true);assert.deepEqual(getDesignState().selectedIds,[]);
  selectDesignNode(a);assert.equal(await executeCommand('design.layer.front'),true);assert.deepEqual(board().nodes.map(n=>n.id),[b,c,a]);
  assert.equal(await executeCommand('design.layer.back'),true);assert.deepEqual(board().nodes.map(n=>n.id),[a,b,c]);
  assert.equal(await executeCommand('design.layer.forward'),true);assert.deepEqual(board().nodes.map(n=>n.id),[b,a,c]);
  assert.equal(await executeCommand('design.layer.backward'),true);assert.deepEqual(board().nodes.map(n=>n.id),[a,b,c]);
  const x=board().nodes[0].x;
  assert.equal(await executeCommand('design.nudge',{dx:5,dy:-3}),true);assert.equal(board().nodes[0].x,x+5);
  assert.equal(await executeCommand('design.layer.toggleVisible'),true);assert.equal(board().nodes[0].hidden,true);
  assert.equal(await executeCommand('design.layer.toggleVisible'),true);assert.equal(board().nodes[0].hidden,false);
  assert.equal(await executeCommand('design.layer.toggleLocked'),true);assert.equal(board().nodes[0].locked,true);
  assert.equal(await executeCommand('design.nudge',{dx:5,dy:0}),true);assert.equal(board().nodes[0].x,x+5,'locked layer does not move');
  assert.equal(await executeCommand('design.layer.toggleLocked'),true);assert.equal(board().nodes[0].locked,false);
  selectDesignNodes([a,b]);assert.equal(await executeCommand('design.layer.front'),true);assert.deepEqual(board().nodes.map(n=>n.id),[c,a,b]);
 });
});
test('project rename writes one undo step and ignores blanks',async()=>{
 await withDesign(async()=>{
  assert.equal(await executeCommand('design.rename',{name:'  Brand kit '}),true);assert.equal(getDesignState().document!.name,'Brand kit');
  assert.equal(await executeCommand('design.undo'),true);assert.equal(getDesignState().document!.name,'Untitled design');
  assert.equal(await executeCommand('design.rename',{name:'   '}),true);assert.equal(getDesignState().document!.name,'Untitled design');
 });
});
test('agent origin may not run the new ui commands',async()=>{
 await withDesign(async()=>{await assert.rejects(commandDispatcher.runCommand('design.artboard.add',undefined,{origin:'agent'}));});
});
