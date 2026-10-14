import test from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';import {prepareLocalIndexChunks} from './localIndexChunks';
test('maximum allowed 32-source/256KiB preparation retains full text with generous CPU regression guard',async()=>{
 const sources=Array.from({length:32},(_,i)=>({id:'source-'+i+'.md',text:('Café 😀\r\n').repeat(512)+'x'.repeat(2048)}));
 // Each source is 8192 raw UTF-8 bytes, total exact byte boundary.
 assert.equal(sources.reduce((n,s)=>n+Buffer.byteLength(s.text),0),262144);
 const start=performance.now();const result=await prepareLocalIndexChunks(sources);const elapsed=performance.now()-start;
 assert.equal(result.sources.length,32);assert.ok(result.chunks.length<=256);
 for(const source of sources)assert.equal(result.chunks.filter(c=>c.sourceId===source.id).map(c=>c.text).join(''),source.text.replace(/\r\n?/g,'\n').normalize('NFC'));
 assert.ok(elapsed<10000,`bounded synthetic preparation took ${elapsed.toFixed(0)}ms (10s regression ceiling, not a device performance promise)`);
 await assert.rejects(prepareLocalIndexChunks([...sources.slice(0,-1),{...sources[31],text:sources[31].text+'x'}]));
});
