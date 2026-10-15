import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:1 as const};
function session(pan:number){const s=emptyArrangement();s.sources.push(source);const clip={...newClip('c1',source,0),length:4800,pan};s.tracks.push({...newTrack('t','T'),clips:[clip]});return s;}
const decoded={id:'src',sampleRate:48000,channels:[new Float32Array(48000).fill(1)]};

test('clip pan: equal-power panning moves a mono clip between the channels',()=>{
 const mid=renderArrangement(session(0),[decoded]).channels;
 assert.ok(Math.abs(mid[0][100]-mid[1][100])<1e-6,'center keeps both channels equal');
 const right=renderArrangement(session(1),[decoded]).channels;
 assert.ok(Math.abs(right[0][100])<1e-6,'hard right silences the left channel');
 assert.ok(right[1][100]>0.9,'hard right keeps the right channel near unity');
 const left=renderArrangement(session(-1),[decoded]).channels;
 assert.ok(Math.abs(left[1][100])<1e-6,'hard left silences the right channel');
});

test('clip pan: clip pan adds to the track pan and clamps at the edges',()=>{
 const s=session(0.6);s.tracks[0].pan=0.6;
 const channels=renderArrangement(s,[decoded]).channels;
 assert.ok(Math.abs(channels[0][100])<1e-6,'0.6 + 0.6 clamps to hard right');
});

test('clip pan: schema v6 migrates v5 clips with pan 0 and strict v6 requires it',()=>{
 const v5=JSON.parse(JSON.stringify(session(0.5))) as Record<string,unknown>;
 v5.version=5;
 for(const t of (v5 as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)delete c.pan;
 const migrated=validateArrangement(v5);
 assert.equal(migrated.version,7);
 assert.equal(migrated.tracks[0].clips[0].pan,0,'v5 clips gain a neutral pan');
 const broken=JSON.parse(JSON.stringify(session(0))) as Record<string,unknown>;
 for(const t of (broken as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)delete c.pan;
 assert.throws(()=>validateArrangement(broken),/unknown or missing field/,'strict v6 rejects clips without pan');
});
