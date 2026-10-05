import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,filterAndSort,installState,matchScore,permissionRisk} from './catalogUx';
import type {CatalogEntry} from './catalog';

const e=(id:string,name:string,description:string,permissions:CatalogEntry['permissions']=[],version='1.0.0',author='Somnia'):CatalogEntry=>({id,name,version,author,description,repo:'https://github.com/a/b',download:'https://raw.githubusercontent.com/a/b/c/d.zip',sha256:'0'.repeat(64),apiVersion:1,permissions});

test('permission risk takes the highest level',()=>{
 assert.equal(permissionRisk([]),'none');
 assert.equal(permissionRisk(['commands','storage']),'low');
 assert.equal(permissionRisk(['commands','project.write']),'medium');
});
test('version compare is numeric, not textual',()=>{
 assert.equal(compareVersions('1.10.0','1.9.0'),1);
 assert.equal(compareVersions('1.0','1.0.0'),0);
 assert.equal(compareVersions('0.9.9','1.0.0'),-1);
});
test('install state shows update only for newer index versions',()=>{
 assert.equal(installState(e('a','A','d')),'available');
 assert.equal(installState(e('a','A','d',[],'1.2.0'),'1.1.0'),'update');
 assert.equal(installState(e('a','A','d',[],'1.2.0'),'1.2.0'),'installed');
 assert.equal(installState(e('a','A','d',[],'1.0.0'),'2.0.0'),'installed');
});
test('search needs every word and ranks name above description',()=>{
 const list=[e('x.one','Palette','a quiet theme'),e('x.two','Quiet Colors','colors'),e('x.three','Other','nothing')];
 const r=filterAndSort(list,'quiet',  'relevance').map(x=>x.id);
 assert.deepEqual(r,['x.two','x.one']);
 assert.deepEqual(filterAndSort(list,'quiet colors','relevance').map(x=>x.id),['x.two']);
 assert.equal(matchScore(list[2],'zzz'),0);
 assert.equal(filterAndSort(list,'  ','name').length,3);
});
test('safest sort puts permission-free first, ties by name',()=>{
 const list=[e('b','B','d',['project.write']),e('a','A','d',['commands']),e('c','C','d')];
 assert.deepEqual(filterAndSort(list,'','safest').map(x=>x.id),['c','a','b']);
});
