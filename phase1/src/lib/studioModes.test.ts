import test from 'node:test';
import assert from 'node:assert/strict';
import {codeStudio,getStudio,registerStudio} from './studios';
import {modeKey,studioModes,resolveStudioMode,rememberStudioMode} from './studios/modes';
import {getState,patchState,requestStudio,studioDocumentKey} from '../store/appStore';

test('legacy Code modes use real commands, studios without modes expose nothing',()=>{
 assert.deepEqual(studioModes(codeStudio).map(m=>m.command),['view.design','view.split','view.code']);
 for(const id of ['documents','sheets','slides','sound','video'])assert.deepEqual(studioModes(getStudio(id)),[]);
});
test('memory separates studio and document, unknown mode falls back without mutation',()=>{
 const memory=rememberStudioMode(codeStudio,{},'text:a.html','split');
 assert.equal(resolveStudioMode(codeStudio,memory,'text:a.html')?.id,'split');
 assert.equal(resolveStudioMode(codeStudio,memory,'text:b.html')?.id,'design');
 assert.equal(rememberStudioMode(codeStudio,memory,'text:a.html','fake'),memory);
 assert.equal(resolveStudioMode(codeStudio,{[modeKey('code','text:a.html')]:'removed'},'text:a.html')?.id,'design');
 assert.notEqual(modeKey('a:b','c'),modeKey('a','b:c'));
 assert.notEqual(modeKey('code','media:same.svg'),modeKey('code','text:same.svg'));
});
test('explicit contributed modes replace legacy views and remember independently',()=>{
 const studio={...codeStudio,id:'mode-test',modes:[{id:'edit',label:'Edit',command:'test.edit'},{id:'review',label:'Review',command:'test.review'}]};
 const memory=rememberStudioMode(studio,{},'text:a.html','review');
 assert.equal(resolveStudioMode(studio,memory,'text:a.html')?.id,'review');
 assert.equal(resolveStudioMode(codeStudio,memory,'text:a.html')?.id,'design');
});
test('tab and studio round trips restore views without editing documents or Agent',()=>{
 const off=registerStudio({...codeStudio,id:'mode-test',order:99});
 const files={'a.html':'a','b.html':'b'};
 patchState({activeStudio:'code',activeFile:'a.html',files,studioByTab:{},studioModeByDocument:{},viewMode:'split',isDirty:true,agentOpen:true,revision:17});
 assert.equal(studioDocumentKey(),'text:a.html');
 patchState({activeFile:'b.html'});assert.equal(getState().viewMode,'design');
 patchState({viewMode:'code'});
 patchState({activeFile:'a.html'});assert.equal(getState().viewMode,'split');
 assert.equal(requestStudio('mode-test','manual',true),'pending-tool');assert.equal(getState().viewMode,'split');
 requestStudio('mode-test');assert.equal(getState().viewMode,'design');
 patchState({viewMode:'code'});requestStudio('code');assert.equal(getState().viewMode,'split');
 assert.equal(getState().files,files);assert.equal(getState().revision,17);assert.equal(getState().isDirty,true);assert.equal(getState().agentOpen,true);
 requestStudio('code');off();patchState({activeFile:'',files:{},studioByTab:{},studioModeByDocument:{},viewMode:'design',agentOpen:false,isDirty:false,revision:0});
});

test('keyboard/palette cannot change Code view or Split layout inside Video',async()=>{
 const {executeCommand}=await import('./commands');
 patchState({activeStudio:'video',activeFile:'',studioByTab:{},studioModeByDocument:{}});
 const before=getState();
 for(const id of ['view.code','view.design','view.split','split.vertical','split.horizontal','split.swap'])assert.equal(await executeCommand(id),false);
 assert.equal(getState().viewMode,before.viewMode);assert.equal(getState().splitLayout,before.splitLayout);assert.equal(getState().splitSwap,before.splitSwap);
 patchState({activeStudio:'code'});
});
