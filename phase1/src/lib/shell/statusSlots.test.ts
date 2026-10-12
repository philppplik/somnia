import test from 'node:test';import assert from 'node:assert/strict';
import {layoutStatusBar,visibleSlots,statusSlotsFor,registerStatusSlots,DEFAULT_STATUS_SLOTS,CODE_STATUS_SLOTS,STATUS_FRAME} from './statusSlots';
import {createProblemsRegistry,summarizeProblems} from './problemsProvider';
import type {StatusSlotDef} from './types';
const key=(l:readonly {kind:string;id:string}[])=>l.map(i=>`${i.kind[0]}:${i.id}`);
const code={domain:'web',surface:'code',studio:'code',media:{active:false}};
test('code status bar: today\'s order (save, problems, context, view mode, viewport)',()=>{
 const l=layoutStatusBar(statusSlotsFor('code'),code);
 assert.deepEqual(key(l.before),['g:drag-hint','s:save','g:notices','s:problems','g:update','g:collab','g:math','g:message']);
 assert.deepEqual(key(l.center),['s:selection','s:line-col']);
 assert.deepEqual(key(l.after),['s:view-mode','g:version','g:revision','s:viewport']);
});
test('canvas surface drops Ln/Col; markdown adds words; media hides view mode',()=>{
 assert.deepEqual(key(layoutStatusBar(DEFAULT_STATUS_SLOTS,{...code,surface:'canvas'}).center),['s:selection']);
 assert.deepEqual(key(layoutStatusBar(DEFAULT_STATUS_SLOTS,{domain:'markdown',surface:'code',studio:'code',media:{active:false}}).center),['s:line-col','s:words']);
 assert.ok(!key(layoutStatusBar(DEFAULT_STATUS_SLOTS,{...code,media:{active:true}}).after).includes('s:view-mode'));
 assert.ok(!key(layoutStatusBar(DEFAULT_STATUS_SLOTS,{...code,studio:'vector'}).after).includes('s:view-mode'));
});
test('studios without a declaration use the default set; Code declares the same slots',()=>{
 assert.equal(statusSlotsFor('photos'),DEFAULT_STATUS_SLOTS);assert.deepEqual(CODE_STATUS_SLOTS,DEFAULT_STATUS_SLOTS);
});
test('a studio can drop Problems and add its own slots by align',()=>{
 const defs:StatusSlotDef[]=[{id:'save',align:'left',component:'status.save'},{id:'zoom',align:'right',component:'x.zoom'},{id:'info',align:'center',component:'x.info'},{id:'cs',align:'left',component:'x.cs'}];
 const off=registerStatusSlots('photos-test',defs);
 const l=layoutStatusBar(statusSlotsFor('photos-test'),{});
 assert.ok(!key(l.before).includes('s:problems'));
 assert.deepEqual(key(l.before).slice(-1),['g:message']);assert.ok(key(l.before).indexOf('s:cs')===key(l.before).indexOf('g:notices')+1);
 assert.deepEqual(key(l.center),['s:info']);assert.deepEqual(key(l.after).slice(-1),['s:zoom']);
 off();assert.equal(statusSlotsFor('photos-test'),DEFAULT_STATUS_SLOTS);
});
test('bad when is hidden, duplicates keep the first, frame has all globals',()=>{
 const v=visibleSlots([{id:'a',align:'left',component:'c',when:'((('},{id:'b',align:'left',component:'c'},{id:'b',align:'left',component:'d'}],{});
 assert.deepEqual(v.map(d=>d.component),['c']);
 for(const g of ['update','collab','math','version','revision','notices'])assert.ok(STATUS_FRAME.includes('g:'+g));
});
test('problems registry: per-studio collect, throwing provider skipped, summary',()=>{
 const r=createProblemsRegistry();const mk=(studio:string,sev:'error'|'warning')=>({studio,severity:sev,message:'m',source:'s',key:studio});
 r.register({id:'a',studio:'code',collect:()=>[mk('code','error'),mk('code','warning')]});
 r.register({id:'b',studio:'slides',collect:()=>{throw new Error('boom');}});
 const off=r.register({id:'c',studio:'slides',collect:()=>[mk('slides','warning')]});
 assert.equal(r.collect({files:{}}).length,3);assert.equal(r.collect({files:{}},'slides').length,1);
 assert.deepEqual(summarizeProblems(r.collect({files:{}})),{errors:1,warnings:2,total:3});
 assert.ok(r.has('code')&&!r.has('sound'));off();assert.equal(r.collect({files:{}},'slides').length,0);
});
