import test from 'node:test';
import assert from 'node:assert/strict';
import {createProblemsStore} from './problemsStore';
import {clearLogBuffer,clearRing,logEvent,reportError} from './log';
import {CATALOGUES} from './i18n';

test('captures all nine studios before panel mount, redacts details, keeps severity and origin',()=>{
 clearLogBuffer();clearRing();const store=createProblemsStore(()=>({studio:'code',file:'index.html'}));store.start();
 for(const studio of ['code','documents','sheets','slides','sound','video','design','vector','photos'])reportError(studio+'.engine',new Error(studio+' decode failed'),{context:{studio,file:studio+'.bin',password:'private',detail:'sk-abcdefghijklmnop'}});
 assert.equal(store.getSnapshot().length,9);
 for(const row of store.getSnapshot()){assert.equal(row.severity,'error');assert.equal(row.file,row.studio+'.bin');assert.match(row.details,/redacted/);assert.ok(!row.details.includes('private'));}
 reportError('sound.engine','Unsupported format',{level:'warn',context:{studio:'sound',file:'broken.mp3'}});
 assert.equal(store.getSnapshot().at(-1)?.severity,'warning');store.stop();
});
test('typed failures include registry/incident/cause and expected events stay quiet',()=>{
 clearLogBuffer();clearRing();const store=createProblemsStore(()=>({studio:'photos',file:'photo.png'}));store.start();
 logEvent('SOM-APP-004',{cause:new Error('Failed to fetch')});
 assert.equal(store.getSnapshot().length,1);assert.match(store.getSnapshot()[0].message,/Failed to fetch/);assert.ok(store.getSnapshot()[0].incidentId);
 logEvent('SOM-EXT-003');assert.equal(store.getSnapshot().length,1);store.stop();
});
test('bounded history, repeat counts and clear are honest',()=>{
 const store=createProblemsStore();const entry={studio:'video',severity:'error' as const,message:'decode failed',details:'codec',source:'video.engine',ts:'now'};
 store.add(entry);store.add(entry);assert.equal(store.getSnapshot()[0].count,2);
 for(let i=0;i<501;i++)store.add({...entry,message:String(i)});
 assert.equal(store.getSnapshot().length,500);assert.equal(store.getDropped(),2);
 store.clear();assert.deepEqual(store.getSnapshot(),[]);assert.equal(store.getDropped(),0);
});
test('new panel copy has exact locale and placeholder parity',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('problems.'));
 for(const locale of ['de','es','fr','pt-BR'])for(const key of keys){assert.ok(CATALOGUES[locale][key]);assert.deepEqual(CATALOGUES[locale][key].match(/\{\w+\}/g)??[],CATALOGUES.en[key].match(/\{\w+\}/g)??[]);}
});

test('log suppression does not hide a repeated runtime problem after clear, or cross-studio failures',()=>{
 clearLogBuffer();const store=createProblemsStore();store.start();
 reportError('engine','Decode failed',{context:{studio:'photos'}});store.clear();
 reportError('engine','Decode failed',{context:{studio:'photos'}});
 reportError('engine','Decode failed',{context:{studio:'sound'}});
 assert.deepEqual(store.getSnapshot().map(r=>r.studio),['photos','sound']);store.stop();
});
