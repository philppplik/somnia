import test from 'node:test';import assert from 'node:assert/strict';
import {clockKey,localSerial} from './clock';
test('local wall-clock time maps to the 1900-system serial regardless of timezone',()=>{
 assert.equal(localSerial(new Date(2026,9,7,12,0,0)),46302.5);
 assert.equal(localSerial(new Date(2026,9,7,18,0,0)),46302.75);
 assert.equal(Math.floor(localSerial(new Date(2026,9,7,0,0,0))!),46302);
 assert.equal(Math.floor(localSerial(new Date(2026,9,7,23,59,59))!),46302);});
test('DST changeover days still land on the right calendar day',()=>{
 for(const [y,m,d] of [[2026,2,29],[2026,9,25],[2026,2,8],[2026,10,1]] as const){const s=localSerial(new Date(y,m,d,12,0,0))!;assert.equal(s-Math.floor(s),0.5);}
 const a=Math.floor(localSerial(new Date(2026,2,29,12))!),b=Math.floor(localSerial(new Date(2026,2,30,12))!);assert.equal(b-a,1);});
test('leap day 2028 and the 1900-system boundary',()=>{
 assert.equal(Math.floor(localSerial(new Date(2028,1,29,12))!)-Math.floor(localSerial(new Date(2028,1,28,12))!),1);
 assert.equal(localSerial(new Date(1899,11,29)),null,'before the epoch is rejected, not wrapped');
 assert.equal(localSerial(new Date(NaN)),null);assert.equal(localSerial(new Date(10000,0,1)),null);});
test('clockKey changes once a minute',()=>{
 const a=localSerial(new Date(2026,9,7,12,0,5))!,b=localSerial(new Date(2026,9,7,12,0,55))!,c=localSerial(new Date(2026,9,7,12,1,1))!;
 assert.equal(clockKey(a),clockKey(b));assert.notEqual(clockKey(b),clockKey(c));});
