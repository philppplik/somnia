import test from 'node:test';import assert from 'node:assert/strict';
import '../commands';
import '../collab/commands';
import {commandEnabled,listCommands,registerCommand} from '../commands';
import {getStudio} from '../studios';
import {buildLegacyMenuModel,buildMenuModel,legacyMenuCommands} from './menuModel';
import {flattenItems} from './menuGrouping';
import {MENU_IDS,type MenuId} from './types';

const ids=(entries:Parameters<typeof flattenItems>[0])=>flattenItems(entries).map(e=>e.id);

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
  // Grouping moves families into submenus: the manifest order holds inside every list (top level and each submenu), and nothing is lost.
  const lists=(es:Parameters<typeof flattenItems>[0]):Parameters<typeof flattenItems>[0][]=>[es,...es.flatMap(e=>'submenu' in e?lists(e.entries):[])];
  const own=(es:Parameters<typeof flattenItems>[0])=>es.filter(e=>!('separator' in e)&&!('submenu' in e)).map(e=>(e as {id:string}).id).filter(id=>manifestOrder.includes(id));
  for(const l of lists(m.entries)){const got=own(l);assert.deepEqual(got,manifestOrder.filter(id=>got.includes(id)),m.menu);}
  assert.deepEqual([...ids(m.entries).filter(id=>manifestOrder.includes(id))].sort(),[...manifestOrder].sort(),m.menu);
 }
});

test('code model carries registry titles, shortcuts and enabled flags',()=>{
 const commands=listCommands();
 const model=buildMenuModel('code',commands)!;
 const byId=new Map(commands.map(c=>[c.id,c]));
 for(const m of model)for(const e of flattenItems(m.entries)){
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
  const top=project.entries.filter(e=>!('separator' in e)&&!('submenu' in e)).map(e=>(e as {id:string}).id);
  assert.equal(top.at(-1),'project.runtimeExtra');
 }finally{off();}
});

test('no leading, trailing or doubled separators; every menu has items',()=>{
 const model=buildMenuModel('code',listCommands())!;
 for(const m of model){
  assert.ok(!('separator' in m.entries[0])&&!('separator' in m.entries.at(-1)!),m.menu);
  assert.ok(!m.entries.some((e,i)=>'separator' in e&&i>0&&'separator' in m.entries[i-1]),m.menu);
  assert.equal(m.disabled,false,m.menu);
 }
});

test('legacy model mirrors header.menus for unmigrated studios',()=>{
 const commands=listCommands();
 const legacy=buildLegacyMenuModel('photos',commands);
 assert.deepEqual(legacy.map(m=>m.menu),getStudio('photos').shell.header.menus);
 for(const m of legacy)assert.deepEqual([...ids(m.entries)].sort(),legacyMenuCommands('photos',m.menu as MenuId,commands).map(c=>c.id).sort(),m.menu);
});
