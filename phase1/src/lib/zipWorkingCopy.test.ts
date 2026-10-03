import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {dirFromZip} from './zipWorkingCopy';
import {createWebFsPort} from './webFsPort';
test('ZIP becomes a working copy that saves with a verified write',async()=>{
 const zip=zipSync({'site/index.html':strToU8('<h1>Hi</h1>'),'site/css/a.css':strToU8('h1{}'),'site/img.bin':new Uint8Array([0,1,2])});
 const root=dirFromZip(zip,'site');
 const journal=new Map<string,{content:string;clientRevision:number}>();
 const port=createWebFsPort({pickDirectory:async()=>root as never,journal:{get:async k=>journal.get(k),put:async(k,v)=>{journal.set(k,v);},delete:async k=>{journal.delete(k);},keys:async p=>[...journal.keys()].filter(k=>k.startsWith(p))},handles:{get:async()=>undefined,put:async()=>{}}});
 const opened=await port.invoke<{projectId:string}>('choose_project');
 const files=await port.invoke<string[]>('list_files',{projectId:opened.projectId});
 assert.deepEqual(files.sort(),['site/css/a.css','site/index.html']);
});
test('unsafe ZIP paths are rejected',()=>{assert.throws(()=>dirFromZip(zipSync({'../evil.html':strToU8('x')}),'x'),/Unsafe path/);});
