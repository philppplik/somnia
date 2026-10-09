import test from 'node:test';
import assert from 'node:assert/strict';
import {codeStudio,getStudio,listStudios,registerStudio,acceptsFormat} from './studios';
import {getState,patchState,requestStudio} from '../store/appStore';
test('only runtime-ready Code is registered; context adapter is an identity',()=>{
 assert.ok(listStudios().some(s=>s.id==='code'));assert.equal(listStudios()[0].id,'code');
 for(const domain of ['web','markdown','code-only','empty']){const context={domain};assert.equal(codeStudio.deriveContext(context),context);}
 assert.deepEqual(codeStudio.shell.leftRail.map(x=>x.id),['layers','files','search','components','css','versions']);
 assert.deepEqual(codeStudio.shell.rightRail.map(x=>x.id),['design','prototype']);
 assert.equal(codeStudio.canvas,'code.canvas');assert.equal(acceptsFormat(codeStudio,'logo.svg'),true);
 assert.throws(()=>getStudio('photo'),/not loaded/);
});
test('manual selection wins, pending tools never commit, documents/history and global Agent stay untouched',()=>{
 const off=registerStudio({...codeStudio,id:'test.ready',order:5});
 const files={'index.html':'dirty source'};patchState({activeFile:'index.html',activeStudio:'code',files,agentOpen:true,isDirty:true,revision:5,studioChoice:'automatic'});
 assert.equal(requestStudio('test.ready','manual',true),'pending-tool');assert.equal(getState().activeStudio,'code');
 assert.equal(requestStudio('test.ready'),'changed');assert.equal(requestStudio('code','automatic'),'manual-wins');
 const s=getState();assert.equal(s.files,files);assert.equal(s.revision,5);assert.equal(s.isDirty,true);assert.equal(s.agentOpen,true);
 patchState({activeFile:'other.html'});assert.equal(getState().activeStudio,'code');patchState({activeFile:'index.html'});assert.equal(getState().activeStudio,'test.ready');
 requestStudio('code');off();patchState({activeFile:'',studioByTab:{},files:{},isDirty:false,agentOpen:false,revision:0});
});
test('Studio labels and command strings exist in all five catalogues',async()=>{
 const {CATALOGUES}=await import('./i18n');
 for(const catalogue of Object.values(CATALOGUES))for(const key of ['studio.code','studio.switcher','studio.viewMode','studio.announcement','studio.shortcutConflict','cmd.studio.code','studio.sheets','cmd.studio.sheets'])assert.ok(catalogue[key],key);
});
