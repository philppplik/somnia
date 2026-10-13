import test from 'node:test';import assert from 'node:assert/strict';
import {registerWorkspaceCommands} from './workspaceCommands';import {commandDispatcher} from '../lib/commandDispatcher';
import {patchState} from './appStore';import {dockLayout} from './dockLayoutStore';import {getStudio} from '../lib/studios';import {studioPanels,studioDefaultLayout} from '../lib/shell/codePanels';
test('workspace mutations are ui-only and panel movement uses shared command dispatch',async()=>{
 patchState({activeStudio:'code'});const off=registerWorkspaceCommands();try{
  await assert.rejects(()=>commandDispatcher.runCommand('workspace.docking',undefined,{origin:'mcp'}));
  await commandDispatcher.runCommand('workspace.resetDock',undefined,{origin:'test'});
  await commandDispatcher.runCommand('workspace.movePanel',{id:'layers',side:'right',index:0},{origin:'test'});
  const studio=getStudio('code'),panels=studioPanels(studio),def=studioDefaultLayout(studio),d=dockLayout('code',panels,{left:def.leftPanels,right:def.rightPanels});assert.equal(d.activeRight,'layers');assert.ok(!d.left.includes('layers'));
  await assert.rejects(()=>commandDispatcher.runCommand('workspace.movePanel',{id:'layers',side:'outside'},{origin:'test'}));
  await assert.rejects(()=>commandDispatcher.runCommand('workspace.openIn',{studio:'photos'},{origin:'mcp'}));
 }finally{off.forEach(f=>f());}
});
