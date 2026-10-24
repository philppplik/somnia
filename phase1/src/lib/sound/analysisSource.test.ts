import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,validateArrangement} from './arrangement';
import {trackAnalysisSession} from './analysisSource';
import {renderRackedArrangement} from './rackRender';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);const a={...newTrack('a','Voice'),clips:[newClip('ca',source)]},b={...newTrack('b','Music'),clips:[newClip('cb',source)]};s.tracks.push(a,b);return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.4),new Float32Array(480).fill(0.2)]}];

test('analysis source: one track with its own rack, no master chain, no other tracks',()=>{
 const s=fixture();s.tailFrames=48;s.masterRack.slots.push({id:'m',pluginId:'comp',enabled:true,params:{}});s.tracks[0].rack.slots.push({id:'r',pluginId:'eq',enabled:true,params:{}});s.tracks[0].mute=true;s.tracks[1].solo=true;
 const one=trackAnalysisSession(s,'a');
 assert.equal(one.tracks.length,1);
 assert.equal(one.tracks[0].id,'a');
 assert.equal(one.tracks[0].rack.slots.length,1,'track inserts stay');
 assert.equal(one.tracks[0].mute,false,'mute cleared so the track renders');
 assert.equal(one.masterRack.slots.length,0,'master chain is not part of a track analysis');
 assert.equal(one.tailFrames,48,'tail matches the full render');
 assert.equal(one.sources.length,1,'source descriptors stay for validation');
 assert.throws(()=>trackAnalysisSession(s,'nope'),'unknown track rejected');
 assert.throws(()=>trackAnalysisSession({...s,tracks:[...s.tracks,{...newTrack('e','Empty')}]},'e'),'clipless track rejected');
});

test('analysis source: the track render is real audio math through its own inserts',()=>{
 const s=fixture();s.tracks[0].gainDb=-6;
 const process=(channels:[Float32Array,Float32Array],rack:{slots:{pluginId:string}[]}):[Float32Array,Float32Array]=>rack.slots.length?channels.map(ch=>Float32Array.from(ch,v=>v*2)) as [Float32Array,Float32Array]:channels;
 s.tracks[0].rack.slots.push({id:'r',pluginId:'gain',enabled:true,params:{}});
 const one=renderRackedArrangement(trackAnalysisSession(s,'a'),sources(),process);
 assert.ok(Math.abs(one.channels[0][0]-0.4*2*10**(-6/20))<1e-6,'track inserts and level apply');
 assert.ok(Math.abs(renderRackedArrangement(trackAnalysisSession(s,'b'),sources(),ch=>ch).channels[0][0]-0.4)<1e-7,'other track renders neutrally');
});
