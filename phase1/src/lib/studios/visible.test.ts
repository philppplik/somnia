import test from 'node:test';
import assert from 'node:assert/strict';
import {splitStudios,clampMaxStudios,MAX_VISIBLE_STUDIOS} from './visible';
import {sanitizeUiPrefs,DEFAULT_UI_PREFS} from '../uiPrefs';
const all=['a','b','c','d','e','f','g'].map(id=>({id}));
const ids=(x:{id:string}[])=>x.map(s=>s.id).join('');
test('never more than 5 studios are visible, whatever is asked',()=>{
 assert.equal(MAX_VISIBLE_STUDIOS,5);
 for(const max of [5,6,99,Infinity,undefined,'x'])assert.ok(splitStudios(all,'a',max).visible.length<=5);
 assert.equal(clampMaxStudios(0),1);assert.equal(clampMaxStudios(2.6),3);assert.equal(clampMaxStudios(NaN),5);
});
test('default shows the first five and moves the rest to overflow',()=>{
 const r=splitStudios(all,'a',5);assert.equal(ids(r.visible),'abcde');assert.equal(ids(r.hidden),'fg');
});
test('the active studio always stays visible and order is kept',()=>{
 const r=splitStudios(all,'g',5);assert.equal(ids(r.visible),'abcdg');assert.equal(ids(r.hidden),'ef');
 assert.equal(ids(splitStudios(all,'f',1).visible),'f');assert.equal(ids(splitStudios(all,'b',3).visible),'abc');
});
test('few studios: nothing hidden',()=>{const r=splitStudios(all.slice(0,3),'a',5);assert.equal(r.hidden.length,0);});
test('maxStudios preference defaults to 5, is clamped to 1-5 and stored as an integer',()=>{
 assert.equal(DEFAULT_UI_PREFS.maxStudios,5);assert.equal(sanitizeUiPrefs({}).maxStudios,5);
 assert.equal(sanitizeUiPrefs({maxStudios:9}).maxStudios,5);assert.equal(sanitizeUiPrefs({maxStudios:0}).maxStudios,1);assert.equal(sanitizeUiPrefs({maxStudios:3.4}).maxStudios,3);
});
