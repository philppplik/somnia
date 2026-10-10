import test from 'node:test';
import assert from 'node:assert/strict';
import {watchGitInvalidation,type GitInvalidation} from './git/invalidation';
test('invalidation rejects other project and stale generations, never implies mutation',async()=>{
 let send:(event:{payload:GitInvalidation})=>void=()=>{};const seen:number[]=[];let stops=0;
 const stop=watchGitInvalidation({listen:async(_event,fn)=>{send=fn;return()=>{stops++;};}},'p',e=>seen.push(e.generation));
 const event=(projectId:string,generation:number)=>send({payload:{projectId,generation,watcherFailed:false}});
 event('other',1);event('p',1);event('p',1);event('p',0);event('p',NaN);event('p',2);
 assert.deepEqual(seen,[1,2]);await Promise.resolve();stop();event('p',3);assert.deepEqual(seen,[1,2]);assert.equal(stops,1);
});
test('listener registration finishing after disposal is immediately released',async()=>{
 let finish:(stop:()=>void)=>void=()=>{};let calls=0;
 const stop=watchGitInvalidation({listen:()=>new Promise(resolve=>{finish=resolve;})},'p',()=>{calls++;});
 stop();finish(()=>{calls++;});await Promise.resolve();assert.equal(calls,1);
});

import {ChangesController} from '../components/versions/controller';
import type {GitBackend,GitStatus,GitRepoInfo} from './git/types';
const repo:GitRepoInfo={root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:'a'.repeat(40),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43'};
test('watcher refresh queues while commit is running and keeps user message',async()=>{
 let statusReads=0,release:()=>void=()=>{};
 const status:GitStatus={repo,changes:[{path:'a.txt',kind:'modified',binary:false,staged:false,unstaged:true}],stateToken:'token',truncated:false};
 const backend={detect:async()=>({kind:'ready',repo}),status:async()=>{statusReads++;return status;},commit:async()=>{await new Promise<void>(r=>release=r);return {sha:'b'.repeat(40),subject:'User title',body:'',authorName:'Test',time:1,parents:[],changedFiles:1};}} as unknown as GitBackend;
 const controller=new ChangesController(backend,(key)=>key);await controller.refresh();
 controller.setSubject('User title');controller.setBody('User notes');
 const committing=controller.commit();controller.invalidate();controller.invalidate();
 assert.equal(statusReads,1);assert.equal(controller.getState().busy,'commit');
 release();await committing;await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(controller.getState().busy,null);assert.ok(statusReads>=2);
});
test('watcher refresh preserves edited title and notes while reconciling file selection',async()=>{
 let path='old.txt';
 const backend={detect:async()=>({kind:'ready',repo}),status:async()=>({repo,changes:[{path,kind:'modified',binary:false,staged:false,unstaged:true}],stateToken:path,truncated:false})} as unknown as GitBackend;
 const c=new ChangesController(backend,k=>k);await c.refresh();c.setSubject('My text');c.setBody('My notes');path='new.txt';c.invalidate();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(c.getState().subject,'My text');assert.equal(c.getState().body,'My notes');assert.ok(!c.getState().selected.has('old.txt'));
});
