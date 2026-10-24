import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack} from './arrangement';
import {freezeSession} from './analysisSource';
import {renderRackedArrangement} from './rackRender';
import {emptyRack} from './rack';

const slot=(id:string)=>({id,pluginId:id,enabled:true,params:{}});
function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);
 const a={...newTrack('a','Voice'),clips:[newClip('clip',source)],gainDb:-6,pan:0.5,rack:{...emptyRack(),slots:[slot('gain')]}};
 const b={...newTrack('b','Pads'),clips:[newClip('clip2',source,120)]};s.tracks.push(a,b);return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.2),new Float32Array(480).fill(0.1)]}];
const gainRack=(channels:[Float32Array,Float32Array],rack:ReturnType<typeof emptyRack>):[Float32Array,Float32Array]=>rack.bypass?channels:channels.map(ch=>Float32Array.from(ch,v=>rack.slots.filter(s=>s.enabled).reduce((v)=>v*2,v))) as [Float32Array,Float32Array];

test('freeze session: one track, rack intact, level and pan neutralized, master empty',()=>{
 const s=fixture();s.tracks[0].mute=true;const one=freezeSession(s,'a');
 assert.equal(one.tracks.length,1);
 assert.equal(one.tracks[0].rack.slots.length,1,'the rack is baked into the freeze');
 assert.equal(one.tracks[0].gainDb,0,'fader stays live afterwards');
 assert.equal(one.tracks[0].pan,0,'pan stays live afterwards');
 assert.equal(one.tracks[0].mute,false);
 assert.deepEqual(one.masterRack,emptyRack());
 assert.deepEqual(one.sources,s.sources,'sources survive for validation and render');
 assert.throws(()=>freezeSession(s,'missing'),/no longer exists/);
 assert.throws(()=>freezeSession({...s,tracks:[{...s.tracks[0],clips:[]}]},'a'),/no clips/);
});

test('freeze render bakes the rack without fader/pan, so the frozen track sums back identically',()=>{
 const s=fixture();const frozen=renderRackedArrangement(freezeSession(s,'a'),sources(),gainRack);
 assert.ok(Math.abs(frozen.channels[0][0]-0.4)<1e-7,'rack applied: 0.2 x 2');
 const full=renderRackedArrangement({...s,tracks:[s.tracks[0]]},sources(),gainRack);
 const gain=10**(-6/20),pan=Math.min(1,1-0.5);
 assert.ok(Math.abs(frozen.channels[0][0]*gain*pan-full.channels[0][0])<1e-7,'frozen audio plus live fader/pan equals the unfrozen contribution');
});

test('freeze ignores track volume automation: the curve stays live, never baked',()=>{
 const s=fixture();s.tracks[0].gainCurve=[{at:0,db:0},{at:480,db:-12}];s.tracks[0].panCurve=[{at:0,pan:-1}];
 const frozen=renderRackedArrangement(freezeSession(s,'a'),sources(),gainRack);
 const plain=fixture();const unfrozen=renderRackedArrangement(freezeSession(plain,'a'),sources(),gainRack);
 for(let i=0;i<480;i+=97)assert.ok(Math.abs(frozen.channels[0][i]-unfrozen.channels[0][i])<1e-7,`frozen audio identical with and without a live curve at ${i}`);
 assert.equal(freezeSession(s,'a').tracks[0].gainCurve.length,0,'freeze session clears the gain curve so the live track keeps owning it');assert.equal(freezeSession(s,'a').tracks[0].panCurve.length,0,'freeze session clears the pan curve too');
});
