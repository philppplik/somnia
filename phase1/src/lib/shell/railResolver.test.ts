import test from 'node:test';import assert from 'node:assert/strict';
import {effectiveRail,railEdits,sanitizeOverrides,EMPTY_RAIL_OVERRIDES} from './railResolver';
import type {RailItemDef} from './types';
const r=(id:string,order:number,x:Partial<RailItemDef>={}):RailItemDef=>({id,icon:id,label:id,kind:'panel',panel:id,order,...x});
const base=[r('layers',10),r('files',20),r('levels',30),r('diff',40,{kind:'action',command:'code.diff.toggle',defaultPinned:false}),r('hist',50,{when:'document.dirty'})];
const ids=(l:readonly RailItemDef[])=>l.map(i=>i.id);
test('defaults: base order, defaultPinned false goes to overflow, when hides',()=>{
 const e=effectiveRail(base,undefined,{ctx:{}});
 assert.deepEqual(ids(e.visible),['layers','files','levels']);assert.deepEqual(ids(e.overflow),['diff']);
 assert.deepEqual(ids(effectiveRail(base,undefined,{ctx:{document:{dirty:true}}}).visible),['layers','files','levels','hist']);
});
test('reorder, hide, pin/unpin persist as data',()=>{
 let o=EMPTY_RAIL_OVERRIDES;
 o=railEdits.reorder(o,['layers','files','levels','diff','hist'],'levels',0);
 o=railEdits.hide(o,'files');o=railEdits.pin(o,'diff');o=railEdits.unpin(o,'layers');
 const e=effectiveRail(base,o,{ctx:{}});
 assert.deepEqual(ids(e.visible),['levels','diff']);assert.deepEqual(ids(e.overflow),['layers']);
 assert.deepEqual(ids(effectiveRail(base,railEdits.reset(),{ctx:{}}).visible),['layers','files','levels']);
});
test('pinned item stays hidden when `when` is false',()=>{
 const o=railEdits.pin(EMPTY_RAIL_OVERRIDES,'hist');
 assert.ok(!ids(effectiveRail(base,o,{ctx:{}}).visible).includes('hist'));
});
test('unknown ids ignored, new base item appears at default position and is flagged',()=>{
 const o={order:['levels','gone','layers'],pinned:['zzz'],hidden:['old']};
 const e=effectiveRail([...base,r('fresh',15)],o,{ctx:{},seen:['layers','files','levels','diff','hist']});
 assert.deepEqual(ids(e.visible),['levels','layers','fresh','files']);assert.deepEqual(e.fresh,['fresh']);
 assert.deepEqual(sanitizeOverrides(o,base),{order:['levels','layers'],pinned:[],hidden:[],unpinned:[]});
});
test('no leak between studios and bad input is safe',()=>{
 const a=railEdits.hide(EMPTY_RAIL_OVERRIDES,'layers');
 assert.deepEqual(ids(effectiveRail(base,EMPTY_RAIL_OVERRIDES,{ctx:{}}).visible).includes('layers'),true);
 assert.doesNotThrow(()=>effectiveRail(base,{order:'x' as any,hidden:null as any},{ctx:{}}));
 assert.equal(a.hidden[0],'layers');
});
