import test from 'node:test';import assert from 'node:assert/strict';
import '../commands';
import '../collab/commands';
import {listCommands} from '../commands';
import {CATALOGUES,t} from '../i18n';
import {MAX_SUBMENU_DEPTH,SUBMENU_RULES,flattenItems,groupMenuEntries,type SubmenuRule} from './menuGrouping';
import {buildLegacyMenuModel,type MenuModelEntry,type MenuModelItem,type MenuModelSubmenu} from './menuModel';
import {MENU_IDS} from './types';

const item=(id:string,enabled=true):MenuModelItem=>({id,title:id,enabled});
const title=(id:string)=>'T:'+id;
const subs=(es:readonly MenuModelEntry[]):MenuModelSubmenu[]=>es.filter((e):e is MenuModelSubmenu=>'submenu' in e);
const depth=(es:readonly MenuModelEntry[]):number=>Math.max(0,...subs(es).map(s=>1+depth(s.entries)));
const allRuleIds=(rs:readonly SubmenuRule[]):string[]=>rs.flatMap(r=>[r.id,...allRuleIds(r.children??[])]);

test('families move into submenus, top-level entries stay first, one separator between',()=>{
 const out=groupMenuEntries('Project',[item('project.save'),item('deploy.plan'),item('project.open'),item('deploy.publish'),item('project.export'),item('project.export.md')],title);
 assert.deepEqual(out.map(e=>'separator' in e?'--':'submenu' in e?'sub:'+e.id:e.id),['project.save','project.open','--','sub:export','sub:publish']);
 assert.deepEqual(flattenItems(subs(out)[1].entries).map(i=>i.id),['deploy.plan','deploy.publish']);
 assert.equal(subs(out)[0].title,'T:export');
});

test('never loses a command: unmapped stay as tail, dissolved single-entry submenus go back to the top level',()=>{
 const input=[item('project.save'),item('something.new'),item('deploy.plan'),item('vector.openSvg')];
 const out=groupMenuEntries('Project',input,title);
 assert.deepEqual(flattenItems(out).map(i=>i.id).sort(),input.map(i=>i.id).sort());
 assert.equal(subs(out).length,0);
});

test('submenu enabled flag is false when every item inside is disabled',()=>{
 const out=groupMenuEntries('Project',[item('deploy.plan',false),item('deploy.publish',false),item('deploy.cancel',true)],title);
 assert.equal(subs(out)[0].enabled,true);
 const off=groupMenuEntries('Project',[item('deploy.plan',false),item('deploy.publish',false)],title);
 assert.equal(subs(off)[0].enabled,false);
});

test('nested rule builds a second level, never a third',()=>{
 const out=groupMenuEntries('Insert',['md.h1','md.h2','md.bold','md.italic','table.insert','table.merge'].map(id=>item(id)),title);
 const md=subs(out).find(s=>s.id==='markdown')!;
 assert.deepEqual(subs(md.entries).map(s=>s.id),['headings']);
 assert.ok(depth(out)<=MAX_SUBMENU_DEPTH);
 const deep={...SUBMENU_RULES,Project:[{id:'a',prefixes:['x.'],children:[{id:'b',prefixes:['x.y'],children:[{id:'c',prefixes:['x.y.']}]}]}]};
 const o2=groupMenuEntries('Project',['x.1','x.y1','x.y2','x.y.1','x.y.2'].map(id=>item(id)),title,deep);
 assert.ok(depth(o2)<=MAX_SUBMENU_DEPTH);
 assert.equal(flattenItems(o2).length,5);
});

test('insert.element.* stays flat, Undo/Redo/Save stay flat',()=>{
 const out=groupMenuEntries('Insert',Array.from({length:10},(_,i)=>item('insert.element.'+i)),title);
 assert.equal(subs(out).length,0);
 const e=groupMenuEntries('Edit',[item('edit.undo'),item('edit.redo'),item('edit.format'),item('edit.wrap')],title);
 assert.deepEqual(e.filter(x=>!('separator' in x)&&!('submenu' in x)).map(x=>(x as MenuModelItem).id),['edit.undo','edit.redo']);
});

test('the real registry: every command of every menu survives grouping, depth <= 2, no empty submenus',()=>{
 const commands=listCommands();
 for(const studio of ['photos','vector','documents','sheets','slides','design']){
  for(const m of buildLegacyMenuModel(studio,commands)){
   assert.ok(depth(m.entries)<=MAX_SUBMENU_DEPTH,studio+m.menu);
   const walk=(es:readonly MenuModelEntry[])=>{for(const s of subs(es)){assert.ok(flattenItems(s.entries).length>=2||s.entries.some(e=>'submenu' in e),s.id);walk(s.entries);}};
   walk(m.entries);
  }
 }
});

test('every submenu id has menu.sub.<id> in all five catalogues (key parity, no raw keys)',()=>{
 const ids=new Set(MENU_IDS.flatMap(m=>allRuleIds(SUBMENU_RULES[m])));
 for(const loc of Object.keys(CATALOGUES))for(const id of ids)assert.ok('menu.sub.'+id in CATALOGUES[loc as keyof typeof CATALOGUES],loc+' '+id);
 for(const id of ids)assert.notEqual(t('menu.sub.'+id),'menu.sub.'+id);
});

test('rule ids are unique across the table (a shared id may only repeat across different menus)',()=>{
 for(const m of MENU_IDS){const l=allRuleIds(SUBMENU_RULES[m]);assert.equal(new Set(l).size,l.length,m);}
});
