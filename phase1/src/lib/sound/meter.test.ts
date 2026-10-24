import {test} from 'node:test';import assert from 'node:assert/strict';
import {meterDb,meterFill,meterLevel,meterPeak} from './meter';

test('meterPeak finds the absolute peak, negative samples included',()=>{
 assert.equal(meterPeak(new Float32Array(0)),0);
 assert.equal(meterPeak(new Float32Array([0.1,-0.5,0.3])),0.5);
});

test('meterLevel attacks fast, releases slowly, decays to silence',()=>{
 const loud=new Float32Array([0.8]),quiet=new Float32Array([0]);
 const up=meterLevel(0,loud);assert.ok(up>0.4&&up<0.8,'attack moves most of the way');
 const down=meterLevel(up,quiet);assert.ok(down<up&&down>up*0.8,'release moves only a little');
 let level=1;for(let i=0;i<200;i++)level=meterLevel(level,quiet);
 assert.ok(level<0.001,'decays to silence');
});

test('meterDb and meterFill map level onto the -60..0 dB bar',()=>{
 assert.equal(meterDb(0),-Infinity);assert.equal(meterFill(0),0);
 assert.ok(Math.abs(meterDb(0.5)+6.02)<0.01);
 assert.equal(meterFill(1),1);assert.ok(Math.abs(meterFill(10**(-30/20))-0.5)<1e-9);
});
