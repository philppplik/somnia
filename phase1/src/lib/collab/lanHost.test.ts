import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lanHostAdapter,createLanSessionLinks,createLanInvite,startLanHost} from './lanHost';
import type {LanHostInfo,LanHostInvoke} from './lanHost';
import {linkKeyParam,importLinkKey,encryptFrame,decryptFrame} from './net/crypto';
const info:LanHostInfo={running:true,lan:true,port:48201,roomId:'0123456789abcdef0123456789abcdef',localUrl:'ws://127.0.0.1:48201/room/0123456789abcdef0123456789abcdef',guestUrls:['ws://192.168.1.8:48201/room/0123456789abcdef0123456789abcdef','ws://10.0.0.8:48201/room/0123456789abcdef0123456789abcdef']};
test('adapter invokes exactly the registered commands, validates port before start',async()=>{
 const calls:unknown[]=[];const call:LanHostInvoke=async<T>(cmd:string,args?:Record<string,unknown>)=>{calls.push([cmd,args]);return info as T;};
 const a=lanHostAdapter(call);assert.equal(await a.start({lan:true,port:0}),info);await a.status();await a.stop();
 assert.deepEqual(calls,[['collab_lan_start',{lan:true,port:0}],['collab_lan_status',undefined],['collab_lan_stop',undefined]]);
 for(const port of [-1,65536,NaN,1.5])await assert.rejects(a.start({lan:false,port}));assert.equal(calls.length,3);
});
test('browser cannot report fake hosting success',async()=>{await assert.rejects(startLanHost({lan:false,port:0}),/desktop app/);});
test('session links use a shared E2E key only in fragments, endpoints decrypt',async()=>{
 const links=await createLanSessionLinks(info);const key=linkKeyParam(links.localLink)!;assert.equal(key.length,43);
 for(const link of links.guestLinks){const u=new URL(link);assert.equal(u.search,'');assert.equal(linkKeyParam(link),key);}
 const host=await importLinkKey(key);const guest=await importLinkKey(linkKeyParam(links.guestLinks[0])!);
 assert.equal(host.fingerprint,links.keyFingerprint);assert.deepEqual(await decryptFrame(guest,await encryptFrame(host,new Uint8Array([0,1,2]))),new Uint8Array([0,1,2]));
 assert.notEqual(linkKeyParam((await createLanSessionLinks(info)).localLink),key);
});
test('stopped and mismatched sessions reject rather than creating plausible links',async()=>{
 await assert.rejects(createLanSessionLinks({...info,running:false}));
 await assert.rejects(createLanSessionLinks({...info,roomId:'differentroom'}));
 for(const url of ['https://example.org/room/abcdefgh','ws://user:pass@host/room/abcdefgh','ws://host/room/abcdefgh?key=secret','ws://host/room/abcdefgh#key=secret'])await assert.rejects(createLanInvite(url));
});
