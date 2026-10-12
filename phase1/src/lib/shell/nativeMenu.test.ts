import test from 'node:test';import assert from 'node:assert/strict';
import {toNativeTree,type NativeViewMode} from './nativeMenu';
import type {MenuModel} from './menuModel';

const model:MenuModel[]=[
 {menu:'Project',viewModes:false,disabled:false,entries:[{id:'project.save',title:'Save project',shortcut:'Mod+S',enabled:true},{id:'project.close',title:'Close project',enabled:false}]},
 {menu:'Edit',viewModes:false,disabled:false,entries:[{id:'edit.undo',title:'Undo',enabled:true},{separator:true},{id:'edit.redo',title:'Redo',enabled:false}]},
 {menu:'View',viewModes:true,disabled:false,entries:[{id:'zoom.in',title:'Zoom in',enabled:true}]},
 {menu:'Insert',viewModes:false,disabled:false,entries:[{id:'insert.element.0',title:'Section',enabled:true}]},
];
const viewModes:NativeViewMode[]=[
 {command:'view.design',label:'Design view',checked:true,enabled:true},
 {command:'view.split',label:'Split view',checked:false,enabled:false},
];

test('app menu first with About and Quit, then the model menus in order',()=>{
 const tree=toNativeTree(model,{appName:'Somnia',domain:'web',viewModes});
 assert.deepEqual(tree.app.items.map(i=>i.kind),['predefined','separator','predefined']);
 assert.deepEqual(tree.menus.map(m=>m.text),['Project','Edit','View','Insert']);
});

test('items carry id/text/enabled, separators preserved, no accelerators anywhere',()=>{
 const tree=toNativeTree(model,{appName:'Somnia',domain:'web',viewModes});
 const project=tree.menus[0];
 assert.deepEqual(project.items,[
  {kind:'item',id:'project.save',text:'Save project',enabled:true},
  {kind:'item',id:'project.close',text:'Close project',enabled:false},
 ]);
 assert.ok(!JSON.stringify(tree).includes('accelerator'));
 const edit=tree.menus[1];
 assert.deepEqual(edit.items[0],{kind:'item',id:'edit.undo',text:'Undo',enabled:true});
 assert.deepEqual(edit.items[1],{kind:'separator'});
 assert.deepEqual(edit.items[2],{kind:'item',id:'edit.redo',text:'Redo',enabled:false});
});

test('edit menu keeps the predefined clipboard roles after its items',()=>{
 const tree=toNativeTree(model,{appName:'Somnia',domain:'web',viewModes});
 const edit=tree.menus[1];
 assert.deepEqual(edit.items.slice(-5),[
  {kind:'separator'},
  {kind:'predefined',item:'Cut'},
  {kind:'predefined',item:'Copy'},
  {kind:'predefined',item:'Paste'},
  {kind:'predefined',item:'SelectAll'},
 ]);
});

test('view menu leads with the studio mode checks plus a separator',()=>{
 const tree=toNativeTree(model,{appName:'Somnia',domain:'web',viewModes});
 const view=tree.menus[2];
 assert.deepEqual(view.items.slice(0,3),[
  {kind:'check',id:'view.design',text:'Design view',checked:true,enabled:true},
  {kind:'check',id:'view.split',text:'Split view',checked:false,enabled:false},
  {kind:'separator'},
 ]);
 assert.deepEqual(view.items[3],{kind:'item',id:'zoom.in',text:'Zoom in',enabled:true});
});

test('insert items are disabled outside the web domain, enabled inside',()=>{
 const off=toNativeTree(model,{appName:'Somnia',domain:'empty',viewModes});
 assert.deepEqual(off.menus[3].items[0],{kind:'item',id:'insert.element.0',text:'Section',enabled:false});
 const on=toNativeTree(model,{appName:'Somnia',domain:'web',viewModes});
 assert.deepEqual(on.menus[3].items[0],{kind:'item',id:'insert.element.0',text:'Section',enabled:true});
});

test('empty menu mirrors the disabled flag',()=>{
 const m:MenuModel[]=[{menu:'Help',viewModes:false,disabled:true,entries:[]}];
 const tree=toNativeTree(m,{appName:'Somnia',domain:'web',viewModes:[]});
 assert.equal(tree.menus[0].enabled,false);
 assert.deepEqual(tree.menus[0].items,[]);
});
