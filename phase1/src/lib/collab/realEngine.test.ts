import test from 'node:test';
import assert from 'node:assert/strict';
import {RealEngine,type EngineDeps} from './realEngine';
import {memoryServer} from './net/memoryTransport';
import {MSG_ENCRYPTED} from './net/protocol';
import type {ProjectPort} from './projectBridge';
import type {LanHostPort} from './lanHostPort';
import {getCollab} from './session';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>boolean,ms=4000,what='condition')=>{const t0=Date.now();while(!f()){if(Date.now()-t0>ms)throw new Error('timeout: '+what);await sleep(10);}};

/** A blind relay in memory: forwards every frame to the other connections, understands nothing (same contract as the Rust relay). */
function blindHub(){
 const {server,factory}=memoryServer();const frames:Uint8Array[]=[];const ends:typeof server.connections=[];
 server.onConnection(end=>{ends.push(end);end.transport.connect({onOpen(){end.transport.send(new TextEncoder().encode('\x04managed-room-v1'));},onMessage(b){frames.push(b);for(const o of ends)if(o!==end)o.transport.send(b);},onClose(){const i=ends.indexOf(end);if(i>=0)ends.splice(i,1);}});});
 return {factory,frames};}
/** Project stand-in with the same contract as the app store: files, write, change notifications. */
function fakeProject(initial:Record<string,string>={}){
 let files={...initial};const ls=new Set<()=>void>();
 const port:ProjectPort={files:()=>files,write(p,t){files={...files,[p]:t};ls.forEach(l=>l());},subscribe(f){ls.add(f);return()=>{ls.delete(f);};},
  adopt(f){files={...f};ls.forEach(l=>l());}};
 return {port,edit:(p:string,t:string)=>port.write(p,t),get files(){return files;}};}
const mk=(project:ReturnType<typeof fakeProject>,hub:ReturnType<typeof blindHub>,extra:Partial<EngineDeps>={})=>new RealEngine({
 project:project.port,hasFiles:()=>Object.keys(project.files).length>0,canJoin:()=>({ok:true}),transport:hub.factory,hostName:'Hanna',
 clientOptions:{syncTimeoutMs:150,baseDelayMs:10,maxDelayMs:50},...extra});

test('relay session: host shares, guest adopts, edits flow both ways, frames stay encrypted, leave is seen',async()=>{
 const hub=blindHub();
 const host=fakeProject({'index.html':'<h1>secret-marker</h1>','styles.css':'h1{color:red}','logo.png':'bin'});const guest=fakeProject();
 const h=mk(host,hub),g=mk(guest,hub);
 await h.startHosting({mode:'relay',relayUrl:'wss://relay.example.com'});
 let s=h.snapshot();
 assert.equal(s.role,'host');assert.equal(s.mode,'relay');assert.equal(s.state,'connected');
 assert.equal(s.guestLinks.length,1);assert.match(s.guestLinks[0],/^wss:\/\/relay\.example\.com\/room\/m1_\d{10}_[a-f0-9]{64}#key=[A-Za-z0-9_-]{43}&m=relay$/);
 assert.equal(s.security!.e2e,true);assert.match(s.security!.fingerprint!,/^[0-9a-f]{8}$/);
 assert.equal(s.synced,false,'nobody answered yet: must not claim synced');
 await g.join(s.guestLinks[0],'Gabi');
 const gs=g.snapshot();assert.equal(gs.role,'guest');assert.equal(gs.state,'connected');
 await until(()=>guest.files['index.html']==='<h1>secret-marker</h1>',4000,'guest adopted index.html');
 assert.equal(guest.files['styles.css'],'h1{color:red}');assert.equal('logo.png' in guest.files,false,'binary files are not shared');
 assert.equal(g.snapshot().security!.fingerprint,h.snapshot().security!.fingerprint,'same key fingerprint on both sides');
 await until(()=>h.snapshot().participants.length===2&&g.snapshot().participants.length===2,4000,'both see both');
 assert.deepEqual(h.snapshot().participants.map(p=>p.name).sort(),['Gabi','Hanna']);
 assert.equal(h.snapshot().participants.filter(p=>p.self).length,1);
 // edits both ways, via the project (design view / save path), not via the editor
 guest.edit('index.html','<h1>secret-marker</h1><p>from guest</p>');
 await until(()=>host.files['index.html']==='<h1>secret-marker</h1><p>from guest</p>',4000,'host got guest edit');
 host.edit('styles.css','h1{color:blue}');
 await until(()=>guest.files['styles.css']==='h1{color:blue}',4000,'guest got host edit');
 // a new file created on the guest appears on the host
 guest.edit('about.html','<p>about</p>');await until(()=>host.files['about.html']==='<p>about</p>',4000,'new file synced');
 // nothing but encrypted frames crossed the relay
 assert.ok(hub.frames.length>0);
 for(const f of hub.frames){assert.equal(f[0],MSG_ENCRYPTED);assert.equal(Buffer.from(f).includes('secret-marker'),false);}
 await g.leave();assert.equal(g.snapshot().role,'none');assert.equal(g.snapshot().state,'off');
 await until(()=>h.snapshot().participants.length===1,3000,'host sees guest leave');
 await h.stopHosting();assert.equal(h.snapshot().role,'none');assert.equal(getCollab(),null);
});

test('a stale project copy never overwrites a newer remote edit',async()=>{
 const hub=blindHub();const host=fakeProject({'a.html':'one'});const guest=fakeProject();
 const h=mk(host,hub),g=mk(guest,hub);
 await h.startHosting({mode:'relay',relayUrl:'wss://r.example'});await g.join(h.snapshot().guestLinks[0],'G');
 await until(()=>guest.files['a.html']==='one');
 host.edit('a.html','two');await until(()=>guest.files['a.html']==='two');
 // unrelated project change on the guest (a new file) must not push 'a.html' back
 guest.edit('b.html','x');await sleep(150);
 assert.equal(host.files['a.html'],'two');assert.equal(guest.files['a.html'],'two');
 await g.leave();await h.stopHosting();});

test('errors are honest: no project, bad relay, no LAN host, bad link, unsaved project',async()=>{
 const hub=blindHub();
 const empty=mk(fakeProject(),hub);await empty.startHosting({mode:'relay',relayUrl:'wss://r.example'});
 assert.equal(empty.snapshot().error!.kind,'no-project');assert.equal(empty.snapshot().role,'none');
 const e1=mk(fakeProject({'a.html':'x'}),hub);
 await e1.startHosting({mode:'relay',relayUrl:'not a url'});assert.equal(e1.snapshot().error!.kind,'start-failed');assert.equal(e1.snapshot().role,'none');
 await e1.startHosting({mode:'lan-direct',lan:false,port:0});assert.match(e1.snapshot().error!.message,/desktop app/);assert.equal(e1.snapshot().role,'none');
 await e1.join('hello','x');assert.equal(e1.snapshot().error!.kind,'bad-link');
 const e2=mk(fakeProject({'a.html':'x'}),hub,{canJoin:()=>({ok:false,reason:'unsaved-project'})});
 await e2.join('wss://r.example/room/'+'a'.repeat(24)+'#key='+'A'.repeat(43),'x');assert.equal(e2.snapshot().error!.kind,'unsaved-project');assert.equal(e2.snapshot().role,'none');});

test('unreachable host ends in an error state, not a fake connected one',async()=>{
 const refuse=()=>({connect(h:{onClose(c:number,r:string):void}){queueMicrotask(()=>h.onClose(1006,''));},send(){},close(){}});
 const g=new RealEngine({project:fakeProject().port,hasFiles:()=>false,canJoin:()=>({ok:true}),transport:refuse as never,clientOptions:{maxAttempts:2,baseDelayMs:5,maxDelayMs:10,syncTimeoutMs:50}});
 await g.join('wss://nowhere.example/room/'+'b'.repeat(24)+'#key='+'A'.repeat(43),'G');
 assert.equal(g.snapshot().state,'error');assert.equal(g.snapshot().error!.kind,'unreachable');assert.equal(g.snapshot().role,'none');});

test('LAN-Direct host uses the registered desktop host, shares one key, and reports a missing network address',async()=>{
 const hub=blindHub();const host=fakeProject({'index.html':'<p>lan</p>'});const guest=fakeProject();
 const KEY='K'.repeat(43);let stopped=0;let guests=['ws://192.168.1.20:48201/room/'+'c'.repeat(24)];
 const lan:LanHostPort={
  async startLanHost({lan,port}){return {running:true,lan,port:port||48201,localUrl:'ws://127.0.0.1:48201/room/'+'c'.repeat(24),guestUrls:lan?guests:[],roomId:'c'.repeat(24)};},
  async stopLanHost(){stopped++;},
  async createLanSessionLinks(info){return {localLink:info.localUrl+'#key='+KEY,guestLinks:info.guestUrls.map(u=>u+'#key='+KEY),keyFingerprint:'deadbeef'};}};
 const h=mk(host,hub,{lan:()=>lan}),g=mk(guest,hub);
 await h.startHosting({mode:'lan-direct',lan:true,port:0});
 let s=h.snapshot();assert.equal(s.mode,'lan-direct');assert.equal(s.state,'connected');assert.equal(s.guestLinks.length,1);assert.equal(s.noNetworkAddress,false);
 await g.join(s.guestLinks[0],'G');assert.equal(g.snapshot().mode,'lan-direct');
 await until(()=>guest.files['index.html']==='<p>lan</p>');
 await g.leave();await h.stopHosting();assert.equal(stopped,1,'LAN host stopped with the session');
 guests=[];
 await h.startHosting({mode:'lan-direct',lan:true,port:0});s=h.snapshot();
 assert.equal(s.noNetworkAddress,true);assert.equal(s.guestLinks.length,0);assert.ok(s.localLink);
 await h.stopHosting();});

test('relay session shares images and PDFs: bytes arrive intact, status comes from the transfer, frames stay encrypted',async()=>{
 const hub=blindHub();
 const png=new Uint8Array(300_000);for(let i=0;i<png.length;i++)png[i]=(i*31)&255;png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 const mkMedia=()=>{const files=new Map<string,Uint8Array>();const ls=new Set<()=>void>();
  const port={list:()=>[...files].map(([path,b])=>({path,id:path+b.length,size:b.length,read:async()=>b})),
   async add(p:string,b:Uint8Array){files.set(p,b);ls.forEach(l=>l());return{ok:true as const};},
   subscribe(f:()=>void){ls.add(f);return()=>{ls.delete(f);};}};return{files,port,put(p:string,b:Uint8Array){files.set(p,b);ls.forEach(l=>l());}};};
 const hm=mkMedia(),gm=mkMedia();hm.put('img/hero.png',png);
 const host=fakeProject({'index.html':'<img src="img/hero.png">','a.html':'x'});const guest=fakeProject();
 const opts={blobOptions:{jitterMs:5,retryMs:100,bytesPerSec:50_000_000}};
 const h=mk(host,hub,{media:hm.port,...opts}),g=mk(guest,hub,{media:gm.port,...opts});
 await h.startHosting({mode:'relay',relayUrl:'wss://relay.example.com'});
 await g.join(h.snapshot().guestLinks[0],'Gabi');
 await until(()=>gm.files.has('img/hero.png'),6000,'guest received the image');
 assert.deepEqual(gm.files.get('img/hero.png'),png);
 await until(()=>g.snapshot().media?.received===1&&g.snapshot().media?.pending===0,3000,'status');
 assert.deepEqual(g.snapshot().media?.failed,[]);assert.equal(h.snapshot().media?.shared,1);
 for(const f of hub.frames)assert.equal(f[0],MSG_ENCRYPTED);
 await g.leave();await h.stopHosting();assert.equal(h.snapshot().media,null);
});
