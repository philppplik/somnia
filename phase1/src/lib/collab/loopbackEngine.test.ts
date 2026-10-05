import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopbackEngine} from './loopbackEngine';
const live=async(o={})=>{const e=new LoopbackEngine(o);await e.startHosting({lan:false,ttlMs:60_000});return e;};
const link=(e:LoopbackEngine,r:'editor'|'viewer')=>e.snapshot().host.invites.find(i=>i.role===r)!.link;
test('host starts with two invites and itself',async()=>{const e=await live();const h=e.snapshot().host;assert.equal(h.state,'live');assert.deepEqual(h.invites.map(i=>i.role),['editor','viewer']);assert.equal(h.participants.length,1);});
test('guest joins with the role of the code',async()=>{const e=await live();await e.join(link(e,'viewer'),'Ann');const s=e.snapshot();assert.equal(s.guest.state,'connected');assert.equal(s.guest.role,'viewer');assert.equal(s.host.participants.at(-1)!.name,'Ann');});
test('bad link, wrong code, no host',async()=>{
 const e=await live();await e.join('nope','A');assert.equal(e.snapshot().guest.error?.kind,'bad-link');
 await e.join('ws://127.0.0.1:48201/?code=wrongwrongwrongwrong','A');assert.equal(e.snapshot().guest.error?.kind,'refused');
 const off=new LoopbackEngine();await off.join('ws://127.0.0.1:1/?code=wrongwrongwrongwrong','A');assert.equal(off.snapshot().guest.error?.kind,'unreachable');});
test('five wrong tries block even the right code',async()=>{const e=await live();for(let i=0;i<5;i++)await e.join('ws://h:1/?code=wrongwrongwrongwrong','A');await e.join(link(e,'editor'),'A');assert.equal(e.snapshot().guest.error?.kind,'blocked');});
test('expired invite is refused, renewing replaces the old code',async()=>{
 let t=0;const e=await live({now:()=>t});const old=link(e,'editor');t=61_000;await e.join(old,'A');assert.equal(e.snapshot().guest.error?.kind,'expired');
 await e.renewInvite('editor',60_000);await e.join(old,'A');assert.equal(e.snapshot().guest.error?.kind,'refused');
 await e.join(link(e,'editor'),'A');assert.equal(e.snapshot().guest.state,'connected');});
test('session cap and stop',async()=>{const e=await live({maxClients:2});await e.join(link(e,'editor'),'A');await e.join(link(e,'editor'),'B');assert.equal(e.snapshot().guest.error?.kind,'full');await e.stopHosting();assert.equal(e.snapshot().host.state,'off');});
