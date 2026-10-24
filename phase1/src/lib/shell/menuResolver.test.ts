import test from 'node:test';import assert from 'node:assert/strict';
import {resolveMenu,resolveMenuBar} from './menuResolver';
import type {MenuItemDef} from './types';
const base:MenuItemDef[]=[
 {menu:'Project',command:'project.save',group:'file.save',order:10},
 {menu:'Project',command:'project.saveAll',group:'file.save',order:20},
 {menu:'Project',command:'project.new',group:'file.new',order:10},
 {menu:'Edit',command:'edit.undo',group:'edit.history',order:10},
];
const o={ctx:{studio:'photos'}};
const cmds=(m:ReturnType<typeof resolveMenu>)=>m.entries.map(e=>'separator' in e?'--':e.command);
test('groups ordered by lowest order, separators between',()=>{
 const m=resolveMenu('Project',{base},o);
 assert.deepEqual(cmds(m),['project.new','--','project.save','project.saveAll']);
});
test('studio adds, hides base, overrides label',()=>{
 const studio:MenuItemDef[]=[
  {menu:'Edit',command:'photos.reset',group:'edit.studio',order:10},
  {menu:'Project',command:'project.new',group:'file.new',order:1,hideBase:true},
  {menu:'Project',command:'project.save',group:'x',order:1,labelOverride:'menu.savePhoto'},
 ];
 assert.deepEqual(cmds(resolveMenu('Edit',{base,studio},o)),['edit.undo','--','photos.reset']);
 const p=resolveMenu('Project',{base,studio},o);
 assert.deepEqual(cmds(p),['project.save','project.saveAll']);
 assert.equal((p.entries[0] as any).label,'menu.savePhoto');
});
test('when and exists filter; unavailable shows enabled=false',()=>{
 const studio:MenuItemDef[]=[{menu:'Insert',command:'photos.layer.fromFile',group:'insert.main',order:1,when:'selection.count>0'},{menu:'Insert',command:'ghost.cmd',group:'insert.main',order:2}];
 const m=resolveMenu('Insert',{base,studio},{ctx:{selection:{count:1}},exists:c=>c!=='ghost.cmd',isEnabled:()=>false});
 assert.deepEqual(cmds(m),['photos.layer.fromFile']);assert.equal((m.entries[0] as any).enabled,false);
 assert.equal(resolveMenu('Insert',{base,studio},{ctx:{selection:{count:0}},exists:c=>c!=='ghost.cmd'}).disabled,true);
});
test('empty menu is disabled not missing; bar has six menus',()=>{
 const bar=resolveMenuBar({base},o);assert.equal(bar.length,6);
 assert.equal(bar.find(m=>m.menu==='Help')!.disabled,true);assert.equal(bar.find(m=>m.menu==='Edit')!.disabled,false);
});
test('submenus resolve, empty submenu dropped, extensions merged',()=>{
 const studio:MenuItemDef[]=[{menu:'Tools',command:'a.b',group:'t',order:1,submenu:[{menu:'Tools',command:'a.c',group:'s',order:1,when:'false'}]},{menu:'Tools',command:'a.d',group:'t',order:2,submenu:[{menu:'Tools',command:'a.e',group:'s',order:1}]}];
 const m=resolveMenu('Tools',{base:[],studio,extensions:[{menu:'Tools',command:'ext.x',group:'zz',order:1}]},o);
 assert.deepEqual(cmds(m),['a.d','--','ext.x']);assert.equal((m.entries[0] as any).submenu.length,1);
});
