import test from 'node:test';
import assert from 'node:assert/strict';
import {presentationKey,presentationScale,sectionJump,sectionStartIndexes,sectionNameAt} from './presentKeyboard';
import {SLIDES_PRESENT_CATALOGUES} from './panelI18n';
const state={index:1,count:4,digits:'',black:false};
test('presentation keyboard clamps and supports all navigation keys',()=>{
 for(const key of ['ArrowRight',' ','PageDown'])assert.equal(presentationKey(key,state)?.index,2);
 for(const key of ['ArrowLeft','PageUp'])assert.equal(presentationKey(key,state)?.index,0);
 assert.equal(presentationKey('Home',state)?.index,0);assert.equal(presentationKey('End',state)?.index,3);
 assert.equal(presentationKey('ArrowRight',{...state,index:3})?.index,3);
 assert.equal(presentationKey('ArrowLeft',{...state,index:0})?.index,0);
 assert.equal(presentationKey('a',state),null);
});
test('numeric jumps are one-based, bounded, and clear on commit',()=>{
 const digits=presentationKey('3',state)!;assert.equal(digits.index,1);assert.equal(presentationKey('Enter',digits)?.index,2);
 for(const digits of ['0','9','999999'])assert.equal(presentationKey('Enter',{...state,digits})?.index,1);
 assert.equal(presentationKey('Backspace',{...state,digits:'23'})?.digits,'2');
 assert.equal(presentationKey('4',{...state,digits:'123456'})?.digits.length,6);
 assert.equal(presentationKey('Enter',{...state,digits:'4'})?.digits,'');
});
test('black screen toggles without changing slide; navigation restores image',()=>{
 const black=presentationKey('B',state)!;assert.equal(black.black,true);assert.equal(black.index,1);
 assert.equal(presentationKey('b',black)?.black,false);assert.equal(presentationKey('Home',black)?.black,false);
});
test('screen-size presentation scales up beyond the editor preview but caps at 4K',()=>{
 assert.equal(presentationScale(720,405,1920,1080,1),1920/720);
 const scale=presentationScale(720,405,7680,4320,2);assert.ok(scale<=3840/720);assert.ok(720*scale*405*scale<8_000_000);
 assert.equal(presentationScale(720,405,1000,1000,1),1000/720);
});
test('all five locales contain every presentation key and placeholders',()=>{
 assert.deepEqual(Object.keys(SLIDES_PRESENT_CATALOGUES).sort(),['de','en','es','fr','pt-BR']);
 for(const strings of Object.values(SLIDES_PRESENT_CATALOGUES)){
  assert.deepEqual(Object.keys(strings),Object.keys(SLIDES_PRESENT_CATALOGUES.en));
  assert.match(strings['slides.present.counter'],/\{number\}/);assert.match(strings['slides.present.counter'],/\{count\}/);
 }
});

test('hidden slides are skipped by stepping and Home/End, but explicit jumps can land on them',()=>{
 const hidden=[true,false,true,false,true],state={index:1,count:5,digits:'',black:false,hidden};
 assert.equal(presentationKey('ArrowRight',state)?.index,3);assert.equal(presentationKey('ArrowRight',{...state,index:3})?.index,3);
 assert.equal(presentationKey('ArrowLeft',{...state,index:3})?.index,1);assert.equal(presentationKey('ArrowLeft',state)?.index,1);
 assert.equal(presentationKey('Home',{...state,index:3})?.index,1);assert.equal(presentationKey('End',state)?.index,3);
 assert.equal(presentationKey('Enter',{...state,digits:'3'})?.index,2);
 assert.equal(presentationKey('ArrowRight',{...state,hidden:undefined})?.index,2);
});

test('section jumps: next/previous section start, skip hidden, stay put at the ends, stale ids ignored',()=>{
 const ids=[10,11,12,13,14,15],starts=sectionStartIndexes([{ids:[10,11]},{ids:[12,13]},{ids:[14,15]},{ids:[99]},{ids:[]}],ids);
 assert.deepEqual(starts,[0,2,4]);assert.deepEqual(sectionStartIndexes(null,ids),[]);assert.deepEqual(sectionStartIndexes([{ids:[15,14]}],ids),[4]);
 assert.equal(sectionJump(starts,undefined,0,6,1),2);assert.equal(sectionJump(starts,undefined,3,6,1),4);assert.equal(sectionJump(starts,undefined,4,6,1),4);
 assert.equal(sectionJump(starts,undefined,3,6,-1),2);assert.equal(sectionJump(starts,undefined,2,6,-1),0);assert.equal(sectionJump(starts,undefined,0,6,-1),0);
 const hid=[false,false,true,false,false,false];assert.equal(sectionJump(starts,hid,0,6,1),3);assert.equal(sectionJump(starts,hid,3,6,-1),0);
 const all=[false,false,true,true,false,false];assert.equal(sectionJump(starts,all,0,6,1),4);assert.equal(sectionJump(starts,all,4,6,-1),0);
 assert.equal(sectionJump([],undefined,1,6,1),1);assert.equal(sectionJump(undefined,undefined,1,6,-1),1);
 const st={index:0,count:6,digits:'12',black:true,sections:starts};
 assert.deepEqual(presentationKey(']',st),{...st,index:2,digits:'',black:false});assert.equal(presentationKey('[',{...st,index:3})?.index,2);
 assert.equal(presentationKey(']',{...st,sections:undefined})?.index,0);
});

test('section name at a slide: first matching section, none without sections or for unknown slides',()=>{
 const secs=[{name:'Intro',ids:[10,11]},{name:'Body',ids:[12]}],ids=[10,11,12,13];
 assert.equal(sectionNameAt(secs,ids,0),'Intro');assert.equal(sectionNameAt(secs,ids,1),'Intro');assert.equal(sectionNameAt(secs,ids,2),'Body');
 assert.equal(sectionNameAt(secs,ids,3),null);assert.equal(sectionNameAt(secs,ids,9),null);assert.equal(sectionNameAt(null,ids,0),null);assert.equal(sectionNameAt(undefined,ids,0),null);
});
