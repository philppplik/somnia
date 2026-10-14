import test from 'node:test';
import assert from 'node:assert/strict';
import {presentationKey,presentationScale} from './presentKeyboard';
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
