import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PanelSession} from './panelSession';
const mk=()=>{const posted:{msg:any;ports:any[]}[]=[];const win={postMessage:(msg:any,_o:string,ports:any[])=>{posted.push({msg,ports});}} as unknown as Window;
 let nav=0;const calls:string[]=[];
 const s=new PanelSession({token:'T',onNavigated:()=>{nav++;},handle:(m,a)=>{calls.push(m);if(m==='boom')throw new Error('no');return a[0]??null;}});
 return {s,win,posted,nav:()=>nav,calls};};
const tick=()=>new Promise(r=>setTimeout(r,10));
const bind=(x:ReturnType<typeof mk>)=>{x.s.onLoad();assert.ok(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'T'}));return x.posted[0].ports[0] as MessagePort;};
test('hello with the token binds one port and calls work over it',async()=>{
 const x=mk();const port=bind(x);const got:any[]=[];port.onmessage=e=>got.push(e.data);
 port.postMessage({type:'api.call',requestId:1,method:'storage.get',args:['k']});port.postMessage({type:'api.call',requestId:2,method:'boom',args:[]});await tick();
 assert.deepEqual(got,[{type:'api.result',requestId:1,ok:true,value:'k'},{type:'api.result',requestId:2,ok:false,error:'no'}]);port.close();
});
test('wrong token, wrong source, wrong type or second hello get nothing',()=>{
 const x=mk();
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'bad'}),false);
 assert.equal(x.s.onWindowMessage({} as never,x.win,{type:'somnia.hello',token:'T'}),false);
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'api.call'}),false);
 assert.equal(x.posted.length,0);
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'T'}),true);
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'T'}),false);
 (x.posted[0].ports[0] as MessagePort).close();x.s.dispose();
});
test('a second load kills the session: port closed, no new hello, no calls served',async()=>{
 const x=mk();const port=bind(x);
 x.s.onLoad();assert.equal(x.nav(),1);assert.equal(x.s.alive,false);
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'T'}),false);
 port.postMessage({type:'api.call',requestId:9,method:'storage.get',args:[]});await tick();assert.deepEqual(x.calls,[]);
});
test('a navigated frame cannot rebind even with the token (hello after second load)',()=>{
 const x=mk();x.s.onLoad();x.s.onLoad();
 assert.equal(x.s.onWindowMessage(x.win as never,x.win,{type:'somnia.hello',token:'T'}),false);
});
test('dispose closes the port and drops pending calls',async()=>{
 const x=mk();const port=bind(x);x.s.dispose();
 port.postMessage({type:'api.call',requestId:1,method:'storage.get',args:[]});await tick();assert.deepEqual(x.calls,[]);
});
