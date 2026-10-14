import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {commentProblem,MAX_COMMENT_CHARS} from './protocol';
import {commentsOpen,setCommentsOpen} from './comments';
test('comment text is bounded and cleaned',()=>{
 assert.equal(commentProblem('Looks good'),null);
 assert.equal(commentProblem('two\nlines'),null);
 for(const bad of ['',' \n ',undefined,42,'x'.repeat(MAX_COMMENT_CHARS+1),'bell\u0007','tab\there'])assert.notEqual(commentProblem(bad),null,String(bad));
 assert.equal(commentProblem('x'.repeat(MAX_COMMENT_CHARS)),null);
});
test('the panel opens and closes',()=>{setCommentsOpen(true);assert.equal(commentsOpen(),true);setCommentsOpen(false);assert.equal(commentsOpen(),false);});
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  comments(){return '[{"id":0,"parent":null,"author":"A","initials":"A","date":"2026-01-01T00:00:00Z","resolved":false,"text":"hi","quote":"q","block":0}]';}
  add_comment(b:number,s:number,e:number,t:string,a:string,d:string){calls.push(`add ${b} ${s} ${e} ${t} ${a} ${d}`);}
  reply_comment(p:number,t:string,a:string,d:string){calls.push(`reply ${p} ${t} ${a} ${d}`);}
  resolve_comment(id:number,r:boolean){calls.push(`res ${id} ${r}`);}delete_comment(id:number){calls.push(`del ${id}`);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);return{k,calls};
}
const h=(k:DocumentsCore,req:Record<string,unknown>)=>k.handle({id:9,...req} as never).res;
test('the engine lists comments',()=>{const {k}=core();const r=h(k,{kind:'commentsState'}) as {ok:boolean;comments:{text:string}[]};assert.equal(r.ok,true);assert.equal(r.comments[0].text,'hi');});
test('add, resolve and delete reach the engine only with valid input',()=>{
 const {k,calls}=core();const D='2026-10-14T12:00:00.000Z';
 assert.equal(h(k,{kind:'addComment',block:0,start:0,end:3,text:' Check ',author:'Somnia user',date:D}).ok,true);
 assert.equal(calls[0],`add 0 0 3 Check Somnia user ${D}`);
 for(const bad of [{block:-1},{start:3,end:3},{start:4,end:3},{end:1.5},{text:''},{text:'x'.repeat(MAX_COMMENT_CHARS+1)},{author:'a'.repeat(61)},{author:'bad\n'},{date:'yesterday'},{date:'x'.repeat(41)}])
  assert.equal(h(k,{kind:'addComment',block:0,start:0,end:3,text:'ok',author:'A',date:D,...bad}).ok,false,JSON.stringify(bad));
 assert.equal(calls.length,1,'refused input never reaches the engine');
 assert.equal(h(k,{kind:'resolveComment',commentId:2,resolved:true}).ok,true);
 assert.equal(h(k,{kind:'deleteComment',commentId:2}).ok,true);
 assert.deepEqual(calls.slice(1),['res 2 true','del 2']);
 for(const bad of [{commentId:-1},{commentId:1.5},{commentId:'1'},{commentId:2**31}]){assert.equal(h(k,{kind:'deleteComment',...bad}).ok,false);assert.equal(h(k,{kind:'resolveComment',resolved:true,...bad}).ok,false);}
 assert.equal(h(k,{kind:'resolveComment',commentId:1,resolved:'yes'}).ok,false);
 assert.equal(calls.length,3);
});
test('replies reach the engine only with valid input',()=>{
 const {k,calls}=core();const D='2026-10-14T12:00:00.000Z';
 assert.equal(h(k,{kind:'replyComment',parent:0,text:' Done ',author:'A B',date:D}).ok,true);
 assert.equal(calls[0],`reply 0 Done A B ${D}`);
 for(const bad of [{parent:-1},{parent:1.5},{parent:'0'},{parent:2**31},{text:''},{text:'x'.repeat(MAX_COMMENT_CHARS+1)},{author:'a'.repeat(61)},{author:'bad\n'},{date:'now'}])
  assert.equal(h(k,{kind:'replyComment',parent:0,text:'ok',author:'A',date:D,...bad}).ok,false,JSON.stringify(bad));
 assert.equal(calls.length,1);
});
