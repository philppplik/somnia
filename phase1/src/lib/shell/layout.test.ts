import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createShellLayoutStore,editPanelStack,sanitizeShellLayout} from '../../store/shellLayoutStore';
import {CODE_LAYOUT,CODE_PANELS,studioPanels,studioRail} from './codePanels';
import {codeStudio} from '../studios/code';
test('layout persists independently per studio, including stack order/collapse/rail overrides',()=>{
 const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const store=createShellLayoutStore(storage);
 store.update('code',{leftWidth:350,leftOpen:false,leftPanels:['files','layers'],collapsedPanels:['layers'],railOverrides:{order:['files'],hidden:['css'],pinned:[]}},CODE_LAYOUT,CODE_PANELS);
 store.update('photos',{rightWidth:390,rightOpen:false},CODE_LAYOUT,CODE_PANELS);
 const reload=createShellLayoutStore(storage);
 assert.equal(reload.get('code',CODE_LAYOUT,CODE_PANELS).leftWidth,350);
 assert.deepEqual(reload.get('code',CODE_LAYOUT,CODE_PANELS).leftPanels,['files','layers']);
 assert.deepEqual(reload.get('code',CODE_LAYOUT,CODE_PANELS).collapsedPanels,['layers']);
 assert.equal(reload.get('photos',CODE_LAYOUT,CODE_PANELS).leftWidth,260);
 assert.equal(reload.get('photos',CODE_LAYOUT,CODE_PANELS).rightWidth,390);
 assert.deepEqual(reload.reset('code',CODE_LAYOUT,CODE_PANELS).railOverrides,{order:[],pinned:[],hidden:[],unpinned:[]});
 assert.equal(reload.get('photos',CODE_LAYOUT,CODE_PANELS).rightOpen,false);
});
test('malformed, stale, and duplicate values are bounded and sanitized',()=>{
 const layout=sanitizeShellLayout({leftWidth:Infinity,rightWidth:10000,leftPanels:['unknown','files','files','design'],rightPanels:['code'],activeLeft:'unknown'},CODE_LAYOUT,CODE_PANELS);
 assert.equal(layout.leftWidth,260);assert.equal(layout.rightWidth,400);assert.deepEqual(layout.leftPanels,['files']);assert.equal(layout.activeLeft,'files');
 const store=createShellLayoutStore({getItem:()=>'{bad',setItem:()=>{throw Error('quota');}});assert.doesNotThrow(()=>store.update('code',{leftOpen:false},CODE_LAYOUT,CODE_PANELS));
});
test('open, close, reorder and focus do not lose other panels',()=>{
 const original=sanitizeShellLayout(undefined,CODE_LAYOUT,CODE_PANELS);
 const opened={...original,...editPanelStack(original,'left','files','open')};
 assert.deepEqual(opened.leftPanels,['layers','files']);assert.equal(opened.activeLeft,'files');
 const moved={...opened,...editPanelStack(opened,'left','files','focus',0)};assert.deepEqual(moved.leftPanels,['files','layers']);
 const closed={...moved,...editPanelStack(moved,'left','files','close')};assert.deepEqual(closed.leftPanels,['layers']);assert.equal(closed.activeLeft,'layers');
 assert.equal(editPanelStack(closed,'left','layers','toggle').leftOpen,false);
});
test('Code panels and rails are declarative, without migrating another studio',()=>{
 assert.equal(studioPanels(codeStudio),CODE_PANELS);assert.deepEqual(studioRail(codeStudio,'left').map(i=>i.id),codeStudio.shell.leftRail.map(i=>i.id));
 assert.deepEqual(studioPanels({...codeStudio,id:'legacy'}),[]);
});
