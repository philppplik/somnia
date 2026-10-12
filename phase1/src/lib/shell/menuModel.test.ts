import test from 'node:test';import assert from 'node:assert/strict';
import '../commands';
import '../collab/commands';
import {commandEnabled,listCommands,registerCommand} from '../commands';
import {getStudio} from '../studios';
import {buildLegacyMenuModel,buildMenuModel,legacyMenuCommands} from './menuModel';
import {MENU_IDS,type MenuId} from './types';

const ids=(entries:({id:string}|{separator:true})[])=>entries.filter(e=>!('separator' in e)).map(e=>(e as {id:string}).id);

test('migrated studio: buildMenuModel returns null without shellV2 menus',()=>{
 assert.equal(buildMenuModel('photos'),null);
});

test('code model covers exactly the legacy category filter (same ids per menu, all six menus)',()=>{
 const commands=listCommands();
 const model=buildMenuModel('code',commands);
 assert.ok(model);
 assert.deepEqual(model.map(m=>m.menu),MENU_IDS);
 for(const m of model){
  // Registry order differs between host environments (fileAdapter re-registration moves
  // project.open/project.save); the manifest pins the settled desktop order. Sets must match.
  assert.deepEqual([...ids(m.entries)].sort(),legacyMenuCommands('code',m.menu,commands).map(c=>c.id).sort(),m.menu);
 }
});

test('code model order follows the manifest, claimed missing commands drop out',()=>{
 const commands=listCommands();
 const model=buildMenuModel('code',commands)!;
 const defs=getStudio('code').shellV2!.menus!;
 for(const m of model){
  const manifestOrder=defs.filter(d=>d.menu===m.menu&&commands.some(c=>c.id===d.command)).map(d=>d.command);
  const claimedInModel=ids(m.entries).filter(id=>defs.some(d=>d.menu===m.menu&&d.command===id));
  assert.deepEqual(claimedInModel,manifestOrder,m.menu);
 }
});

test('code model carries registry titles, shortcuts and enabled flags',()=>{
 const commands=listCommands();
 const model=buildMenuModel('code',commands)!;
 const byId=new Map(commands.map(c=>[c.id,c]));
 for(const m of model)for(const e of m.entries){
  if('separator' in e)continue;
  const c=byId.get(e.id)!;
  assert.equal(e.title,c.title,e.id);
  assert.equal(e.shortcut,c.shortcut,e.id);
  assert.equal(e.enabled,commandEnabled(c),e.id);
 }
});

test('view menu excludes studio.* and the studio view-mode commands, viewModes flag set only on View',()=>{
 const model=buildMenuModel('code',listCommands())!;
 const view=model.find(m=>m.menu==='View')!;
 assert.ok(view.viewModes);
 assert.equal(model.filter(m=>m.viewModes).length,1);
 assert.ok(!ids(view.entries).some(id=>id.startsWith('studio.')));
 for(const id of getStudio('code').menus.view)assert.ok(!ids(view.entries).includes(id));
});

test('unclaimed runtime commands still appear as a tail in registry order',()=>{
 const off=registerCommand({id:'project.runtimeExtra',title:'Runtime extra',category:'Project',run:()=>{}});
 try{
  const model=buildMenuModel('code',listCommands())!;
  const project=model.find(m=>m.menu==='Project')!;
  assert.equal(ids(project.entries).at(-1),'project.runtimeExtra');
 }finally{off();}
});

test('no separators inside a single-group menu; every menu has items',()=>{
 const model=buildMenuModel('code',listCommands())!;
 for(const m of model){
  assert.ok(!m.entries.some(e=>'separator' in e),m.menu);
  assert.equal(m.disabled,false,m.menu);
 }
});

test('legacy model mirrors header.menus for unmigrated studios',()=>{
 const commands=listCommands();
 const legacy=buildLegacyMenuModel('photos',commands);
 assert.deepEqual(legacy.map(m=>m.menu),getStudio('photos').shell.header.menus);
 for(const m of legacy)assert.deepEqual(ids(m.entries),legacyMenuCommands('photos',m.menu as MenuId,commands).map(c=>c.id),m.menu);
});
