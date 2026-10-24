import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack} from './arrangement';
import {glueSession,trackAnalysisSession} from './analysisSource';
import {renderRackedArrangement} from './rackRender';
import {emptyRack} from './rack';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);
 s.tracks.push({...newTrack('a','Voice'),clips:[{...newClip('c1',source,0),length:240,fadeIn:60},{...newClip('c2',source,480),length:240,gainDb:-6}],gainDb:-12,pan:0.5},
  {...newTrack('b','Pads'),clips:[newClip('c3',source,120)]});return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.2),new Float32Array(480).fill(0.1)]}];

test('glue session: only the selected clips, racks emptied, fader/pan neutralized, no tail',()=>{
 const s=fixture();const g=glueSession(s,'a',['c1','c2']);
 assert.deepEqual(g.tracks[0].clips.map(c=>c.id),['c1','c2']);
 assert.equal(g.tracks[0].gainDb,0);assert.equal(g.tracks[0].pan,0);
 assert.deepEqual(g.tracks[0].rack,emptyRack());assert.deepEqual(g.masterRack,emptyRack());
 assert.equal(g.tailFrames,0,'nothing rings, so no tail is rendered');
 assert.throws(()=>glueSession(s,'a',['c1']),/at least two/);
 assert.throws(()=>glueSession(s,'a',['c1','c3']),/same track/);
 assert.throws(()=>glueSession(s,'missing',['c1','c2']),/no longer exists/);
});

test('glue render equals the same material in the unfrozen track render',()=>{
 const s=fixture();
 const full=renderRackedArrangement(trackAnalysisSession(s,'a'),sources(),(channels)=>channels,true);
 const g=glueSession(s,'a',['c1','c2']);
 const glued=renderRackedArrangement(g,sources(),(channels)=>channels,true,{start:0,end:720});
 for(let i=0;i<720;i+=113){
  assert.ok(Math.abs(glued.channels[0][i]-full.channels[0][i]*10**(12/20)/Math.min(1,1-0.5))<1e-6,`left at ${i}: glue plus live fader/pan equals the track contribution`);
 }
});

test('glue ignores track volume automation: the curve stays live, never baked',()=>{
 const s=fixture();s.tracks[0].gainCurve=[{at:0,db:0},{at:720,db:-12}];s.tracks[0].panCurve=[{at:0,pan:-1}];
 const g=glueSession(s,'a',['c1','c2']);
 assert.equal(g.tracks[0].gainCurve.length,0,'glue session clears the gain curve so the live track keeps owning it');assert.equal(g.tracks[0].panCurve.length,0,'glue session clears the pan curve too');
 const plain=glueSession(fixture(),'a',['c1','c2']);
 const glued=renderRackedArrangement(g,sources(),c=>c,true,{start:0,end:720}),expected=renderRackedArrangement(plain,sources(),c=>c,true,{start:0,end:720});
 for(let i=0;i<720;i+=113)assert.ok(Math.abs(glued.channels[0][i]-expected.channels[0][i])<1e-7,`glued audio identical with and without a live curve at ${i}`);
});
