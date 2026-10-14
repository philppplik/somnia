import {test} from 'node:test';import assert from 'node:assert/strict';import {rehearsalTarget,rehearsalPacing,pacedSlides} from './rehearsalPacing';test('private strict whole minute target and equal-share guide not clamped input',()=>{assert.equal(rehearsalTarget(' 180 '),10800000);assert.equal(rehearsalTarget('1'),60000);for(const input of ['','0','01','181','1.5','-1','+1','1e2','１０'])assert.equal(rehearsalTarget(input),null);assert.deepEqual(rehearsalPacing(60000,3,30000),{target:60000,perSlide:20000,remaining:30000,overtime:0,percent:50});assert.deepEqual(rehearsalPacing(60000,3,90000),{target:60000,perSlide:20000,remaining:0,overtime:30000,percent:100});for(const args of [[0,3,0],[60001,3,0],[60000,0,0],[60000,3,-1],[60000,3,NaN]])assert.throws(()=>rehearsalPacing(...args as [number,number,number]));});

test('pacedSlides skips hidden slides and falls back safely',()=>{
 assert.equal(pacedSlides([false,true,false,true],4),2);assert.equal(pacedSlides([false,false],2),2);
 assert.equal(pacedSlides([true,true],2),2);assert.equal(pacedSlides([false],3),3);assert.equal(pacedSlides([],0),0);
 assert.equal(rehearsalPacing(600000,pacedSlides([false,true],2),0).perSlide,600000);
});
