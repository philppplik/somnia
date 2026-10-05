import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,installStateOf,filterEntries,categoryOf,categoryCounts,updatesAvailable,describeCatalogError,DEFAULT_FILTER} from './catalogView';
import type {CatalogEntry} from './catalog';
const e=(o:Partial<CatalogEntry>&{id:string}):CatalogEntry=>({name:o.id,version:'1.0.0',author:'A',description:'d',repo:'https://github.com/a/b',download:'https://raw.githubusercontent.com/a/b/v/x.zip',sha256:'0'.repeat(64),apiVersion:1,permissions:[],...o});

test('compareVersions orders numerically, handles pre-release and junk',()=>{
 assert.equal(compareVersions('1.2.10','1.2.9'),1);assert.equal(compareVersions('1.0','1.0.0'),0);assert.equal(compareVersions('v2.0.0','1.9.9'),1);
 assert.equal(compareVersions('1.0.0-beta','1.0.0'),-1);assert.equal(compareVersions('1.0.0','1.0.0-beta'),1);assert.equal(compareVersions('abc','1.0.0'),null);
});
test('install state: none, same, update, newer local, unparsable',()=>{
 const x=e({id:'a',version:'1.1.0'});
 assert.equal(installStateOf(x,[]).state,'not-installed');
 assert.equal(installStateOf(x,[{id:'a',version:'1.1.0'}]).state,'installed');
 assert.deepEqual(installStateOf(x,[{id:'a',version:'1.0.0'}]),{state:'update-available',installedVersion:'1.0.0'});
 assert.equal(installStateOf(x,[{id:'a',version:'2.0.0'}]).state,'newer-installed');
 assert.equal(installStateOf(x,[{id:'b',version:'0.1.0'}]).state,'not-installed');
 assert.equal(installStateOf(e({id:'a',version:'weird'}),[{id:'a',version:'odd'}]).state,'update-available');
});
test('category: known (case-insensitive), unknown and missing fall back to Other',()=>{
 assert.equal(categoryOf({permissions:[],category:'themes'}),'Themes');assert.equal(categoryOf({permissions:[],category:'Nope'}),'Other');assert.equal(categoryOf({permissions:[]}),'Other');assert.equal(categoryOf({permissions:[],category:5}),'Other');
});
test('filters combine: query, category, status, no-permissions; sorted by name',()=>{
 const list=[e({id:'z',name:'Zed',description:'dark theme',category:'Themes'}),e({id:'a',name:'Alpha',category:'Tools',permissions:['project.read']}),e({id:'m',name:'Mid',version:'2.0.0',category:'Themes'})];
 const inst=[{id:'m',version:'1.0.0'},{id:'a',version:'1.0.0'}];
 assert.deepEqual(filterEntries(list,inst,DEFAULT_FILTER).map(x=>x.id),['a','m','z']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,query:' DARK '}).map(x=>x.id),['z']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,category:'Themes'}).map(x=>x.id),['m','z']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,status:'update-available'}).map(x=>x.id),['m']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,status:'installed'}).map(x=>x.id),['a','m']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,status:'not-installed'}).map(x=>x.id),['z']);
 assert.deepEqual(filterEntries(list,inst,{...DEFAULT_FILTER,noPermissionsOnly:true}).map(x=>x.id),['m','z']);
 assert.deepEqual(filterEntries(list,[],{...DEFAULT_FILTER,query:'nothing'}),[]);
 assert.equal(updatesAvailable(list,inst),1);assert.equal(categoryCounts(list).Themes,2);assert.equal(categoryCounts(list).Other,0);
});
test('error messages are plain and keep the SHA-256 case distinct',()=>{
 assert.match(describeCatalogError('GitHub download failed (429).').title,/limiting/);assert.match(describeCatalogError('GitHub download failed (503).').title,/trouble/);
 assert.match(describeCatalogError('GitHub download failed (404).').title,/not found/);assert.match(describeCatalogError('Failed to fetch').title,/Could not reach/);
 assert.match(describeCatalogError('SHA-256 mismatch. Nothing was installed.').hint,/Nothing was installed/);assert.match(describeCatalogError('???').title,/went wrong/);
});
