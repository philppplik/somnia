// Synthetic adapter latency; not a Windows/native disk or application startup benchmark.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {cpus,platform} from 'node:os';
import {EditorProject} from '../packages/editor-core/src/index';
import {indexProjectRows,readProjectDocuments} from '../src/lib/projectIndex';
const results=[];
for(const count of [64,256,1000,2048]){
 const paths=Array.from({length:count},(_,i)=>`pages/group-${i%10}/page-${String(i).padStart(4,'0')}.html`);
 const content='<!doctype html><html><head><title>Page</title></head><body>'+Array.from({length:20},(_,i)=>`<section><h2>Title ${i}</h2><p>Sample text</p></section>`).join('')+'</body></html>';
 const samples=[];
 for(let run=0;run<6;run++){
  const start=performance.now();const rows=indexProjectRows(paths);const indexed=performance.now();
  const docs=await readProjectDocuments(paths,async()=>{await new Promise(r=>setTimeout(r,1));return{content,revision:null};});const read=performance.now();
  const files=Object.fromEntries(docs.map(d=>[d.path,d.content!]));const model=new EditorProject(files);const parsed=performance.now();
  assert.equal(Object.keys(model.files).length,count);assert.equal(rows.filter(r=>!r.dir).length,count);
  if(run)samples.push({indexMs:indexed-start,readMs:read-indexed,parseMs:parsed-read,totalMs:parsed-start});
 }
 const metrics=Object.fromEntries(['indexMs','readMs','parseMs','totalMs'].map(key=>{const values=samples.map(s=>s[key as keyof typeof s]).sort((a,b)=>a-b);return[key,{median:values[2],p95:values[4]}];}));
 assert.ok(metrics.indexMs.p95<100,'Index p95 budget: 100 ms');assert.ok(metrics.readMs.p95<2000,'Synthetic read p95 budget: 2 s');assert.ok(metrics.parseMs.p95<5000,'Model parse p95 budget: 5 s');
 results.push({count,bytes:Buffer.byteLength(content)*count,samples,metrics});
}
const report={date:new Date().toISOString(),node:process.version,platform:platform(),cpu:cpus()[0]?.model,fixture:'20 sections / HTML file, 1 ms simulated read latency, 1 warmup + 5 measured samples',results};
mkdirSync('validation/bench',{recursive:true});writeFileSync('validation/bench/projects.json',JSON.stringify(report,null,2)+'\n');console.table(results.map(r=>({files:r.count,indexP95:r.metrics.indexMs.p95.toFixed(2),readP95:r.metrics.readMs.p95.toFixed(2),parseP95:r.metrics.parseMs.p95.toFixed(2),totalP95:r.metrics.totalMs.p95.toFixed(2)})));
