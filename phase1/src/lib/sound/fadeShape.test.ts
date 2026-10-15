import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,fadeShapeAt,newClip,newTrack,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:2 as const};
function session(shape:'linear'|'equalPower'){const s=emptyArrangement();s.sources.push(source);const clip={...newClip('c1',source,0),length:4800,fadeIn:4800,fadeShape:shape};s.tracks.push({...newTrack('t','T'),clips:[clip]});return s;}
const decoded={id:'src',sampleRate:48000,channels:[new Float32Array(48000).fill(1),new Float32Array(48000).fill(1)]};

test('fade shape: linear ramps straight, equal-power follows the sine law',()=>{
 assert.equal(fadeShapeAt('linear',0.5),0.5);
 assert.ok(Math.abs(fadeShapeAt('equalPower',0.5)-Math.SQRT1_2)<1e-9);
 assert.equal(fadeShapeAt('equalPower',0),0);
 assert.equal(fadeShapeAt('equalPower',1),1);
 assert.equal(fadeShapeAt('equalPower',2),1,'positions clamp');
 const linear=renderArrangement(session('linear'),[decoded]).channels;
 const curved=renderArrangement(session('equalPower'),[decoded]).channels;
 assert.ok(Math.abs(linear[0][2400]-0.5)<0.01,'linear half-way fade is -6 dBFS-ish');
 assert.ok(Math.abs(curved[0][2400]-Math.SQRT1_2)<0.01,'equal-power half-way fade is -3 dBFS-ish');
 assert.ok(Math.abs(curved[0][4799]-1)<0.01,'both reach unity at the fade end');
});

test('fade shape: schema v7 migrates v6 clips with linear and rejects unknown shapes',()=>{
 const v6=JSON.parse(JSON.stringify(session('equalPower'))) as Record<string,unknown>;
 v6.version=6;delete (v6 as Record<string,unknown>).bpm;delete (v6 as Record<string,unknown>).masterCurve;
 for(const t of (v6 as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)delete c.fadeShape;
 const migrated=validateArrangement(v6);
 assert.equal(migrated.version,14);
 assert.equal(migrated.tracks[0].clips[0].fadeShape,'linear','v6 clips keep the historical linear fades');
 const broken=JSON.parse(JSON.stringify(session('equalPower'))) as Record<string,unknown>;
 for(const t of (broken as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)c.fadeShape='exp';
 assert.throws(()=>validateArrangement(broken),/fade shape/,'unknown shapes are rejected');
});
