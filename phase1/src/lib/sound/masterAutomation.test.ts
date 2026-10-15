import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';
import {renderRackedArrangement} from './rackRender';
import {freezeSession,trackAnalysisSession} from './analysisSource';

const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};
function fixture(){const s=emptyArrangement();s.sources.push(source);s.tracks.push({...newTrack('t','Voice'),clips:[newClip('c',source)]});return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.5),new Float32Array(480).fill(0.5)]}];

test('v14: the session carries a master gain curve, v13 migrates with an empty one',()=>{
 const s=fixture();s.masterCurve=[{at:0,db:0},{at:480,db:-12}];
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves the master curve');
 const v13=JSON.parse(serializeArrangement(s));v13.version=13;delete v13.masterCurve;
 const migrated=validateArrangement(v13);assert.equal(migrated.version,14);assert.deepEqual(migrated.masterCurve,[]);
 const dup=fixture();dup.masterCurve=[{at:100,db:0},{at:100,db:-3}];
 assert.throws(()=>validateArrangement(dup),/duplicate automation point/);
 const hot=fixture();hot.masterCurve=[{at:100,db:13}];
 assert.throws(()=>validateArrangement(hot));
});

test('master automation: per-sample gain after the master rack, ranges in session frames',()=>{
 const s=fixture();s.masterCurve=[{at:120,db:0},{at:360,db:-12}];
 const m=renderRackedArrangement(s,sources(),channels=>channels);
 assert.ok(Math.abs(m.channels[0][0]-0.5)<1e-6,'flat before the first point');
 assert.ok(Math.abs(m.channels[0][240]-0.5*10**(-6/20))<1e-5,'linear in dB between the points');
 assert.ok(Math.abs(m.channels[0][479]-0.5*10**(-12/20))<1e-6,'flat after the last point');
 const ranged=renderRackedArrangement(s,sources(),channels=>channels,false,{start:240,end:360});
 assert.ok(Math.abs(ranged.channels[0][0]-0.5*10**(-6/20))<1e-5,'ranges evaluate the master curve in session frames');
 assert.throws(()=>renderArrangement(s,sources()),/rack renderer/,'the legacy renderer refuses master automation');
});

test('single-track sessions stay pre-master: no master curve baked into freeze or analysis',()=>{
 const s=fixture();s.masterCurve=[{at:0,db:-60}];
 assert.equal(freezeSession(s,'t').masterCurve.length,0);
 assert.equal(trackAnalysisSession(s,'t').masterCurve.length,0);
});
