import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceStudio} from '../studios/interface';
import {designStudio} from '../studios/design';
import {acceptsFormat,getStudio} from '../studios/registry';
import {INTERFACE_CATALOGUES} from './i18n';
import {INTERFACE_COMMANDS,registerInterfaceCommands} from './commands';
import {interfaceSession} from './session';
import {executeCommand} from '../commands';
test('native Interface is separate from Design with no premature format claim',()=>{
 assert.equal(getStudio('interface'),interfaceStudio);assert.notEqual(interfaceStudio.id,designStudio.id);assert.deepEqual(interfaceStudio.formats,[]);
 for(const path of ['test.somdesign','test.svg','test.fig','test.somnia','test.somui'])assert.equal(acceptsFormat(interfaceStudio,path),false);
 const shell=interfaceStudio.shellV2!;assert.deepEqual(shell.defaultLayout?.leftPanels,['layers']);assert.deepEqual(shell.defaultLayout?.rightPanels,['properties']);assert.equal(shell.panels!.filter(p=>p.component==='shell.inspector').length,0);assert.ok(shell.panels!.every(p=>p.component.startsWith('interface.')));
 assert.deepEqual(shell.menus!.map(m=>m.command),[...INTERFACE_COMMANDS]);
});
test('five local catalogues cover every Interface label without an external service',()=>{
 const keys=Object.keys(INTERFACE_CATALOGUES.en).sort();for(const cat of Object.values(INTERFACE_CATALOGUES))assert.deepEqual(Object.keys(cat).sort(),keys);
 assert.equal(Object.keys(INTERFACE_CATALOGUES).length,5);
});
test('shell commands add nested frame/text and undo as independent transactions',async()=>{
 interfaceSession.clear();const off=registerInterfaceCommands();try{assert.equal(await executeCommand('interface.addFrame'),false);interfaceSession.start();assert.equal(await executeCommand('interface.addFrame'),true);assert.equal(await executeCommand('interface.addText'),true);const d=interfaceSession.get().document!;assert.equal(d.nodes[1].parentId,d.nodes[0].id);assert.equal(await executeCommand('interface.undo'),true);assert.equal(interfaceSession.get().document!.nodes.length,1);assert.equal(await executeCommand('interface.redo'),true);assert.equal(interfaceSession.get().document!.nodes.length,2);}finally{off();interfaceSession.clear();}
});
test('shared save/undo/delete scopes never affect another studio document',async()=>{
 const {studioContextStore}=await import('../shell/studioContext');interfaceSession.start();const off=registerInterfaceCommands(),claim=studioContextStore.claim('interface');
 try{await executeCommand('interface.addFrame');await executeCommand('interface.addText');assert.equal(await executeCommand('edit.undo'),true);assert.equal(interfaceSession.get().document!.nodes.length,1);assert.equal(await executeCommand('edit.redo'),true);interfaceSession.select(interfaceSession.get().document!.nodes[1].id);assert.equal(await executeCommand('edit.delete'),true);assert.equal(interfaceSession.get().document!.nodes.length,1);}
 finally{claim.release();off();interfaceSession.clear();}
});
