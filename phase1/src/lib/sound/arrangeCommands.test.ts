import {test} from 'node:test';import assert from 'node:assert/strict';
import {registerArrangeCommands} from './arrangeCommands';
import {commandDispatcher} from '../commandDispatcher';
import {getArrangementState,resetArrangement,editArrangement,loadArrangement} from './arrangeStore';
import {serializeArrangement,newClip,newTrack} from './arrangement';
test('session commands validate payloads, preserve state on errors and reject external execution',async()=>{resetArrangement();const off=registerArrangeCommands();try{await commandDispatcher.runCommand('sound.arrange.track.add');assert.equal(getArrangementState().document.tracks.length,1);const track=getArrangementState().document.tracks[0];await commandDispatcher.runCommand('sound.arrange.track.set',{id:track.id,gainDb:-12});assert.equal(getArrangementState().document.tracks[0].gainDb,-12);await assert.rejects(commandDispatcher.runCommand('sound.arrange.track.set',{id:track.id,pan:3}));assert.equal(getArrangementState().document.tracks[0].pan,0);await assert.rejects(commandDispatcher.runCommand('sound.arrange.track.set',{id:track.id,extra:true}));await assert.rejects(commandDispatcher.runCommand('sound.arrange.undo',{}, {origin:'agent'}));await commandDispatcher.runCommand('sound.arrange.undo');assert.equal(getArrangementState().document.tracks[0].gainDb,0);await commandDispatcher.runCommand('sound.arrange.redo');assert.equal(getArrangementState().document.tracks[0].gainDb,-12);}finally{off();resetArrangement();}});
test('malformed reopen is atomic and valid reopen starts a clean history',()=>{resetArrangement();editArrangement(s=>s.tracks.push(newTrack('t','Voice')));const before=serializeArrangement(getArrangementState().document);assert.throws(()=>loadArrangement('{"version":900}'));assert.equal(serializeArrangement(getArrangementState().document),before);loadArrangement(before);assert.equal(getArrangementState().canUndo,false);assert.equal(getArrangementState().savedText,before);resetArrangement();});

test('Arrange view blocks unrelated single-clip header exports and releases its block',async()=>{const {blockSoundClipCommands,activeSoundName}=await import('./commands');const one=blockSoundClipCommands(),two=blockSoundClipCommands();assert.equal(activeSoundName(),null);one();assert.equal(activeSoundName(),null);two();});

test('track removal and fades are atomic undoable edits; work registry sees session changes',async()=>{const {dirtyDocs,openDocCount}=await import('../workDocs');resetArrangement();const off=registerArrangeCommands();try{await commandDispatcher.runCommand('sound.arrange.track.add');const id=getArrangementState().document.tracks[0].id;assert.ok(dirtyDocs().some(d=>d.studio==='sound-session'));assert.ok(openDocCount()>=1);await commandDispatcher.runCommand('sound.arrange.track.delete',{id});assert.equal(getArrangementState().document.tracks.length,0);await commandDispatcher.runCommand('sound.arrange.undo');assert.equal(getArrangementState().document.tracks[0].id,id);await assert.rejects(commandDispatcher.runCommand('sound.arrange.saveNative',{}, {origin:'mcp'}));}finally{off();resetArrangement();}});

test('track.move reorders tracks atomically with boundary no-ops and undo',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 await commandDispatcher.runCommand('sound.arrange.track.add');await commandDispatcher.runCommand('sound.arrange.track.add');await commandDispatcher.runCommand('sound.arrange.track.add');
 const ids=()=>getArrangementState().document.tracks.map(t=>t.id);const before=ids();
 await commandDispatcher.runCommand('sound.arrange.track.move',{id:before[1],delta:-1});
 assert.deepEqual(ids(),[before[1],before[0],before[2]]);
 await commandDispatcher.runCommand('sound.arrange.track.move',{id:before[1],delta:-1});
 assert.deepEqual(ids(),[before[1],before[0],before[2]],'top boundary is a no-op');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.track.move',{id:'missing',delta:1}));
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.deepEqual(ids(),before,'undo restores the order');
}finally{off();resetArrangement();}});

test('track.duplicate copies a track with fresh ids right after the original and undo removes the copy',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:4800,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','Voice'),clips:[{...newClip('c1',source,0),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.track.duplicate',{id:'t1'});
 const tracks=getArrangementState().document.tracks;
 assert.equal(tracks.length,2);
 assert.equal(tracks[1].name,'Voice','copy keeps the name');
 assert.notEqual(tracks[1].id,'t1','copy gets a fresh track id');
 assert.equal(tracks[1].clips.length,1);
 assert.notEqual(tracks[1].clips[0].id,'c1','copied clips get fresh ids');
 assert.deepEqual({...tracks[1].clips[0],id:'c1'},{...tracks[0].clips[0]},'clip content is identical');
 await commandDispatcher.runCommand('sound.arrange.track.duplicate',{id:'t1'});
 const all=getArrangementState().document.tracks.flatMap(t=>t.clips.map(c=>c.id));assert.equal(new Set(all).size,all.length,'repeated copies never collide');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.track.duplicate',{id:'missing'}));
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.tracks.length,2,'undo removes the latest copy');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.tracks.length,1,'a second undo restores the original alone');
}finally{off();resetArrangement();}});

test('clip nudge never pushes a clip before zero: the validator rejects negative starts atomically',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:4800,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','Voice'),clips:[{...newClip('c1',source,0),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.clip.set',{id:'c1',start:4800});
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.set',{id:'c1',start:-1}));
 assert.equal(getArrangementState().document.tracks[0].clips[0].start,4800,'rejection preserves the position');
}finally{off();resetArrangement();}});

test('session.splitAt splits every clip under the frame in one undoable step',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:9600}]},{...newTrack('t2','B'),clips:[{...newClip('b',source,4800),length:9600},{...newClip('c',source,48000),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.session.splitAt',{frame:7200});
 const tracks=getArrangementState().document.tracks;
 assert.equal(tracks[0].clips.length,2,'clip a split');
 assert.equal(tracks[1].clips.length,3,'clip b split, clip c untouched');
 assert.deepEqual(tracks[0].clips.map(c=>[c.start,c.length]),[[0,7200],[7200,2400]]);
 assert.deepEqual(tracks[1].clips.filter(c=>c.start<48000).map(c=>[c.start,c.length]),[[4800,2400],[7200,7200]]);
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.splitAt',{frame:40000}),/No clip at the playhead/);
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.tracks[0].clips.length,1,'one undo restores both tracks');
}finally{off();resetArrangement();}});

test('marker.set renames atomically, rejects empty names and undo restores the old name',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 await commandDispatcher.runCommand('sound.arrange.marker.add',{name:'Verse',frame:4800});
 const id=getArrangementState().document.markers[0].id;
 await commandDispatcher.runCommand('sound.arrange.marker.set',{id,name:'Chorus'});
 assert.equal(getArrangementState().document.markers[0].name,'Chorus');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.marker.set',{id,name:'  '}));
 assert.equal(getArrangementState().document.markers[0].name,'Chorus','rejection preserves the name');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.marker.set',{id:'missing',name:'X'}));
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.markers[0].name,'Verse');
}finally{off();resetArrangement();}});
