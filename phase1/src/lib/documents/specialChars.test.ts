import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SPECIAL_CHARS,specialChar,symbolProblem,timeText} from './symbols';
test('special characters are single, valid symbol inserts',()=>{
 assert.deepEqual(SPECIAL_CHARS.map(x=>x.id),['nbsp','nbHyphen','softHyphen']);
 assert.equal(specialChar('nbsp'),'\u00A0');assert.equal(specialChar('nbHyphen'),'\u2011');assert.equal(specialChar('softHyphen'),'\u00AD');
 for(const x of SPECIAL_CHARS)assert.equal(symbolProblem(x.ch),null,x.id);
});
test('timeText gives a time, or a date with a time',()=>{
 const d=new Date(2026,9,15,14,5);
 assert.match(timeText(d,false,'en'),/2:05/);assert.match(timeText(d,true,'en'),/Oct 15, 2026.*2:05/);assert.match(timeText(d,false,'de'),/14:05/);
});
