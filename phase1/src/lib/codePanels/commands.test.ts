import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorProject} from '@somnia/editor-core';
import {CommandDispatcher} from '../commandDispatcher';
import {codePanelSpecs} from './commands';
import {codePanelActions} from '../../store/codePanelCommands';
import {connectEditorProject,getState,patchState,applyHistory,closeCore} from '../../store/appStore';
import {studioContextStore} from '../shell/studioContext';
const dispatcher=new CommandDispatcher();codePanelSpecs(codePanelActions).forEach(s=>dispatcher.register(s));
function setup(){connectEditorProject(new EditorProject({'index.html':'<a href="/old">Go</a>'}));patchState({activeStudio:'code',activeFile:'index.html',designFile:'index.html'});const claim=studioContextStore.claim('code',{id:'index.html',kind:'html',dirty:false,readOnly:false});return {id:getState().nodes[0].id,claim};}
test('attribute writes are validated, undoable and refuse agents, locks and read-only contexts',async()=>{
 const {id,claim}=setup();
 await assert.rejects(()=>dispatcher.runCommand('code.attribute.set',{id,name:'href',value:'/new'},{origin:'agent'}));
 await assert.rejects(()=>dispatcher.runCommand('code.attribute.set',{id,name:'onclick',value:'x'},{origin:'ui'}));
 await dispatcher.runCommand('code.attribute.set',{id,name:'href',value:'/new'},{origin:'ui'});assert.match(getState().files['index.html'],/\/new/);
 applyHistory('undo');assert.match(getState().files['index.html'],/\/old/);
 claim.report({document:{id:'index.html',kind:'html',dirty:false,readOnly:true}});await assert.rejects(()=>dispatcher.runCommand('code.attribute.set',{id,name:'href',value:'/x'},{origin:'ui'}));
 claim.release();closeCore();
});
test('outline reveal selects the engine node and moves the cursor; stale IDs fail',async()=>{
 const {id,claim}=setup();await dispatcher.runCommand('code.outline.reveal',{id},{origin:'ui'});assert.equal(getState().selectedElementId,id);assert.equal(getState().jumpTo?.line,1);
 await assert.rejects(()=>dispatcher.runCommand('code.outline.reveal',{id:'missing'},{origin:'ui'}));claim.release();closeCore();
});
test('preview width rejects out of bounds and fractional parameters',async()=>{
 patchState({activeStudio:'code'});await assert.rejects(()=>dispatcher.runCommand('code.preview.width',{width:199},{origin:'ui'}));await assert.rejects(()=>dispatcher.runCommand('code.preview.width',{width:820.5},{origin:'ui'}));await dispatcher.runCommand('code.preview.width',{width:820},{origin:'ui'});assert.equal(getState().viewport,820);
});
