import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement,curveDbAt,curvePanAt} from './arrangement';
import {renderRackedArrangement} from './rackRender';

const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.5),new Float32Array(480).fill(0.5)]}];
function fixture(){const s=emptyArrangement();s.sources.push(source);s.tracks.push({...newTrack('t','Voice'),clips:[newClip('c',source)]});return s;}

test('v10: tracks carry a gain curve, v9 migrates with an empty one',()=>{
 const s=fixture();assert.deepEqual(s.tracks[0].gainCurve,[]);
 s.tracks[0].gainCurve=[{at:0,db:0},{at:480,db:-12}];
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves the curve');
 const v9=JSON.parse(serializeArrangement(s));v9.version=9;for(const t of v9.tracks){delete t.gainCurve;delete t.panCurve;}
 const migrated=validateArrangement(v9);assert.equal(migrated.version,13);assert.deepEqual(migrated.tracks[0].gainCurve,[]);
 const dup=fixture();dup.tracks[0].gainCurve=[{at:100,db:0},{at:100,db:-3}];
 assert.throws(()=>validateArrangement(dup),/duplicate automation point/);
 const hot=fixture();hot.tracks[0].gainCurve=[{at:100,db:13}];
 assert.throws(()=>validateArrangement(hot));
});

test('track automation: per-sample gain follows fader plus curve, linear in dB, flat outside the points',()=>{
 const s=fixture();s.tracks[0].gainDb=-6;s.tracks[0].gainCurve=[{at:120,db:0},{at:360,db:-12}];
 const m=renderRackedArrangement(s,sources(),channels=>channels);
 assert.ok(Math.abs(m.channels[0][0]-0.5*10**(-6/20))<1e-6,'flat before the first point');
 assert.ok(Math.abs(m.channels[0][240]-0.5*10**(-12/20))<1e-5,'linear in dB between the points');
 assert.ok(Math.abs(m.channels[0][479]-0.5*10**(-18/20))<1e-6,'flat after the last point: fader plus final value');
 const ranged=renderRackedArrangement(s,sources(),channels=>channels,false,{start:240,end:360});
 assert.ok(Math.abs(ranged.channels[0][0]-0.5*10**(-12/20))<1e-5,'ranges evaluate the curve in session frames');
});

test('curveDbAt: empty curve is unity, bounds hold',()=>{
 assert.equal(curveDbAt([],100),0);
 assert.equal(curveDbAt([{at:50,db:-12}],0),-12);
 assert.equal(curveDbAt([{at:50,db:-12}],999),-12);
});

test('v11: tracks carry a pan curve, v10 migrates with an empty one, validation enforces bounds',()=>{
 const s=fixture();assert.deepEqual(s.tracks[0].panCurve,[]);
 s.tracks[0].panCurve=[{at:0,pan:-0.5},{at:480,pan:0.5}];
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves the pan curve');
 const v10=JSON.parse(serializeArrangement(s));v10.version=10;for(const t of v10.tracks)delete t.panCurve;
 const migrated=validateArrangement(v10);assert.equal(migrated.version,13);assert.deepEqual(migrated.tracks[0].panCurve,[]);
 const dup=fixture();dup.tracks[0].panCurve=[{at:100,pan:0},{at:100,pan:0.5}];
 assert.throws(()=>validateArrangement(dup),/duplicate automation point/);
 const wide=fixture();wide.tracks[0].panCurve=[{at:100,pan:1.5}];
 assert.throws(()=>validateArrangement(wide));
});

test('pan automation: per-sample pan offsets the static pan, clamped to the stereo field',()=>{
 const s=fixture();s.tracks[0].pan=0.5;s.tracks[0].panCurve=[{at:0,pan:-1},{at:480,pan:1}];
 const m=renderRackedArrangement(s,sources(),channels=>channels);
 assert.ok(Math.abs(m.channels[0][0]-0.5*1)<1e-6&&Math.abs(m.channels[1][0]-0.5*0.5)<1e-6,'start: 0.5 + (-1) pans left');
 const mid=m.channels[0][240]/(0.5),midR=m.channels[1][240]/0.5;
 assert.ok(Math.abs(mid-Math.min(1,1-0.5))<1e-5&&Math.abs(midR-1)<1e-5,'middle: back at the static 0.5');
 assert.ok(Math.abs(m.channels[1][479]-0.5*1)<1e-5,'end clamps at hard right instead of exceeding the field');
 const ranged=renderRackedArrangement(s,sources(),channels=>channels,false,{start:240,end:480});
 assert.ok(Math.abs(ranged.channels[0][0]/0.5-Math.min(1,1-0.5))<1e-5,'ranges evaluate the pan curve in session frames');
});

test('curvePanAt: empty curve is center, bounds hold',()=>{
 assert.equal(curvePanAt([],100),0);
 assert.equal(curvePanAt([{at:50,pan:-1}],0),-1);
 assert.equal(curvePanAt([{at:50,pan:1}],999),1);
});
