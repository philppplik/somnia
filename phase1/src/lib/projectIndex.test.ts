import test from 'node:test';
import assert from 'node:assert/strict';
import {indexProjectRows,readProjectDocuments,MAX_PROJECT_DOCUMENTS,MAX_PROJECT_TEXT_BYTES} from './projectIndex';
test('index preserves every path with one directory row and deterministic ordering',()=>{
 const paths=Array.from({length:1000},(_,i)=>`pages/group-${i%10}/page-${i}.html`);
 const rows=indexProjectRows(paths);assert.equal(rows.filter(r=>!r.dir).length,1000);assert.equal(rows.filter(r=>r.dir).length,11);
 assert.deepEqual(indexProjectRows([...paths].reverse()),rows);
});
test('reads 1000 documents, ignores binary assets, bounds concurrency and yields',async()=>{
 let running=0,peak=0,yields=0;const docs=await readProjectDocuments([...Array.from({length:1000},(_,i)=>`p${i}.html`),'a.png'],async path=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,0));running--;return{content:path,revision:path};},async()=>{yields++;});
 assert.equal(docs.length,1000);assert.equal(peak,8);assert.ok(yields>=31);assert.ok(docs.every(d=>d.content===d.path));
});
test('document and byte budgets reject rather than returning a partial project',async()=>{
 let reads=0;await assert.rejects(readProjectDocuments(Array.from({length:MAX_PROJECT_DOCUMENTS+1},(_,i)=>`${i}.txt`),async()=>{reads++;return{content:'',revision:null};}),/2048/);assert.equal(reads,0);
 await assert.rejects(readProjectDocuments(['a.txt','b.txt'],async()=>({content:'x'.repeat(MAX_PROJECT_TEXT_BYTES/2+1),revision:null})),/64 MiB/);
});
test('failed read waits for in-flight workers before candidate cleanup',async()=>{
 let finished=false;await assert.rejects(readProjectDocuments(['a.txt','b.txt'],async p=>{if(p==='a.txt')throw Error('denied');await new Promise(r=>setTimeout(r,15));finished=true;return{content:'',revision:null};}),/denied/);assert.equal(finished,true);
});
