import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhotoBatch,uniqueFileNames} from './batchExport';
test('batch collects saved and skipped in order and reports progress',async()=>{
 const seen:string[]=[];const progress:number[]=[];
 const out=await runPhotoBatch(['a.png','b.png','c.png'],async n=>{seen.push(n);return n==='b.png'?'cancelled':'saved';},p=>progress.push(p.done));
 assert.deepEqual(seen,['a.png','b.png','c.png']);
 assert.deepEqual(out,{saved:['a.png','c.png'],skipped:['b.png'],failed:[]});
 assert.deepEqual(progress,[0,1,2,3]);
});
test('a failed photo never aborts the batch',async()=>{
 const out=await runPhotoBatch(['a.png','b.png','c.png'],async n=>{if(n==='b.png')throw Error('boom');return 'saved';});
 assert.deepEqual(out.saved,['a.png','c.png']);
 assert.deepEqual(out.skipped,[]);
 assert.equal(out.failed.length,1);
 assert.equal(out.failed[0].name,'b.png');
 assert.equal(out.failed[0].message,'boom');
});
test('copy name collisions get numeric suffixes',async()=>{
 const m=uniqueFileNames(['a.jpg','a.png','b.png','a.jpeg'],'png');
 assert.equal(m.get('a.jpg'),'a-edited.png');
 assert.equal(m.get('a.png'),'a-edited-2.png');
 assert.equal(m.get('b.png'),'b-edited.png');
 assert.equal(m.get('a.jpeg'),'a-edited-3.png');
});
test('without collisions every copy name stays the default',async()=>{
 const m=uniqueFileNames(['x.png','y.jpg'],'jpg');
 assert.equal(m.get('x.png'),'x-edited.jpg');
 assert.equal(m.get('y.jpg'),'y-edited.jpg');
});
