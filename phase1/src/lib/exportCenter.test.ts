import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EXPORT_GROUP_IDS,exportGroups} from './exportCenter';
import type {Command} from './commandRegistry';

const cmd=(id:string):Command=>({id,title:id,category:'Project',level:'ui',run:()=>{}});

test('exportGroups keeps group and command order, drops unknown ids and empty groups',()=>{
 const all=[cmd('project.export.md'),cmd('slides.saveCopy'),cmd('project.export'),cmd('documents.saveCopy'),cmd('documents.export.open')];
 const g=exportGroups(all);
 assert.deepEqual(g.map(x=>x.studio),['project','documents','slides']);
 assert.deepEqual(g[0].commands.map(c=>c.id),['project.export','project.export.md']);
 assert.deepEqual(g[1].commands.map(c=>c.id),['documents.export.open','documents.saveCopy']);
 assert.deepEqual(g[2].commands.map(c=>c.id),['slides.saveCopy']);
});

test('exportGroups returns nothing when no export command is registered',()=>{
 assert.deepEqual(exportGroups([cmd('edit.undo')]),[]);
});

test('every listed group id is a non-empty unique command id list',()=>{
 const seen=new Set<string>();
 for(const [studio,ids] of Object.entries(EXPORT_GROUP_IDS)){
  assert.ok(ids.length>0,studio);
  for(const id of ids){assert.ok(!seen.has(id),id);seen.add(id);}
 }
});
