import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack} from './arrangement';
import {trackAnalysisSession} from './analysisSource';
import {renderRackedArrangement} from './rackRender';
import {emptyRack} from './rack';

const slot=(id:string)=>({id,pluginId:id,enabled:true,params:{}});
function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);
 s.tracks.push({...newTrack('a','Voice'),clips:[newClip('clip',source)],gainDb:-6,pan:0.5,rack:{...emptyRack(),slots:[slot('gain')]}},{...newTrack('b','Pads'),clips:[newClip('clip2',source,120)],gainDb:3});return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.2),new Float32Array(480).fill(0.1)]}];
const gainRack=(channels:[Float32Array,Float32Array],rack:ReturnType<typeof emptyRack>):[Float32Array,Float32Array]=>rack.bypass?channels:channels.map(ch=>Float32Array.from(ch,v=>rack.slots.filter(s=>s.enabled).reduce((v)=>v*2,v))) as [Float32Array,Float32Array];

test('stems: the per-track renders sum back to the full mix (master excluded)',()=>{
 const s=fixture();const full=renderRackedArrangement({...s,masterRack:emptyRack()},sources(),gainRack);
 const stemA=renderRackedArrangement(trackAnalysisSession(s,'a'),sources(),gainRack);
 const stemB=renderRackedArrangement(trackAnalysisSession(s,'b'),sources(),gainRack);
 assert.equal(stemA.channels[0].length,480,'a stem is exactly its own content plus its own tail');
 assert.equal(stemB.channels[0].length,600,'the longer track keeps the session end');
 for(let i=0;i<480;i+=117){
  assert.ok(Math.abs(stemA.channels[0][i]+stemB.channels[0][i]-full.channels[0][i])<1e-6,`left sums at ${i}`);
  assert.ok(Math.abs(stemA.channels[1][i]+stemB.channels[1][i]-full.channels[1][i])<1e-6,`right sums at ${i}`);
 }
});
test('stems: a clipless track is skipped by the caller and rejected by the session builder',()=>{
 const s=fixture();s.tracks.push(newTrack('empty','Empty'));
 assert.throws(()=>trackAnalysisSession(s,'empty'),/no clips/);
});
