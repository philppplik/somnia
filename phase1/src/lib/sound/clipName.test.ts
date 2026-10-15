import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement} from './arrangement';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('t','Voice'),clips:[newClip('c',source)]});return s;}

test('v9: clips carry a name, empty by default and strict on control characters',()=>{
 const s=fixture();assert.equal(s.tracks[0].clips[0].name,'');
 s.tracks[0].clips[0].name='Take 3';
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves the name');
 const bad=fixture();bad.tracks[0].clips[0].name='bad\nname';
 assert.throws(()=>validateArrangement(bad));
 const long=fixture();long.tracks[0].clips[0].name='x'.repeat(161);
 assert.throws(()=>validateArrangement(long));
});

test('v8 sessions migrate: every clip gains an empty name',()=>{
 const s=fixture();const v8=JSON.parse(serializeArrangement(s));
 v8.version=8;for(const t of v8.tracks)for(const c of t.clips)delete c.name;
 const migrated=validateArrangement(v8);
 assert.equal(migrated.version,11);
 assert.deepEqual(migrated,s);
});
