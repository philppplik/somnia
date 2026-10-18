import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {closeRisk,closeVerdict,windowCloseBlocked} from './closeRisk';
import {resetRecoveryIndexForTests,trackLive,type LiveSession} from './recoveryIndex';
const text={recoverable:(n:string)=>`safe:${n}`,unprotected:(n:string)=>`unsafe:${n}`};
const live=(id:string,dirty:boolean,current:boolean,pinned=false)=>trackLive(id,{studio:id.split(':')[0],isDirty:()=>dirty,cp:{pinned:pinned?{reason:'storage-full',detail:''}:null,isCurrent:()=>current,checkpoint:async()=>({ok:true}),close(){},idle:async()=>undefined}} as unknown as LiveSession);
beforeEach(()=>resetRecoveryIndexForTests());
test('nothing dirty never blocks and never asks',()=>{
 live('documents:a.docx',false,true);let asked=0;
 assert.equal(windowCloseBlocked('documents',text,()=>{asked++;return false;}),false);assert.equal(asked,0);assert.equal(closeVerdict(closeRisk('documents')),'allow');
});
test('dirty sessions with a verified checkpoint ask with the recoverable message',()=>{
 live('sheets:b.xlsx',true,true);const msgs:string[]=[];
 assert.equal(windowCloseBlocked('sheets',text,m=>{msgs.push(m);return false;}),true);
 assert.deepEqual(msgs,['safe:b.xlsx']);
 assert.equal(windowCloseBlocked('sheets',text,()=>true),false,'confirming lets the window close');
});
test('a stale or pinned checkpoint is called out as unprotected and only those names are listed',()=>{
 live('documents:ok.docx',true,true);live('documents:stale.docx',true,false);live('documents:pinned.docx',true,true,true);const msgs:string[]=[];
 assert.equal(windowCloseBlocked('documents',text,m=>{msgs.push(m);return false;}),true);
 assert.deepEqual(msgs,['unsafe:stale.docx, pinned.docx']);
});
test('studios are independent',()=>{live('documents:a.docx',true,false);assert.equal(closeVerdict(closeRisk('sheets')),'allow');});
