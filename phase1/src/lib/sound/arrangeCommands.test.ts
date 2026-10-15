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

test('slip edits: clip.set offset stays inside the source and rejects overflow atomically',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:9600,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.clip.set',{id:'a',offset:2400});
 assert.equal(getArrangementState().document.tracks[0].clips[0].offset,2400);
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.set',{id:'a',offset:7200}),'offset+length beyond the source');
 assert.equal(getArrangementState().document.tracks[0].clips[0].offset,2400,'rejection preserves the offset');
}finally{off();resetArrangement();}});

test('clip copy/paste lands at the playhead with a fresh id and undo removes the paste',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800,gainDb:-3}]});});
 const {hasClipClipboard}=await import('./arrangeCommands');
 assert.equal(hasClipClipboard(),false);
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.paste',{frame:9600}),/Clipboard is empty/);
 await commandDispatcher.runCommand('sound.arrange.clip.copy',{id:'a'});
 assert.equal(hasClipClipboard(),true);
 await commandDispatcher.runCommand('sound.arrange.clip.paste',{frame:9600});
 const clips=getArrangementState().document.tracks[0].clips;
 assert.equal(clips.length,2);
 assert.equal(clips[1].start,9600);
 assert.equal(clips[1].gainDb,-3,'paste keeps the clip settings');
 assert.notEqual(clips[1].id,'a','paste gets a fresh id');
 await commandDispatcher.runCommand('sound.arrange.clip.paste',{frame:20000});
 assert.equal(getArrangementState().document.tracks[0].clips.length,3,'the clipboard survives pasting');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.tracks[0].clips.length,2,'undo removes the latest paste');
}finally{off();resetArrangement();}});

test('clips.move shifts a selection atomically with clamping and undo; clips.delete removes it',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800},{...newClip('b',source,9600),length:4800}]},{...newTrack('t2','B'),clips:[{...newClip('c',source,19200),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.clips.move',{ids:['a','c'],delta:4800});
 const tracks=()=>getArrangementState().document.tracks;
 assert.deepEqual(tracks()[0].clips.map(c=>c.start),[4800,9600]);
 assert.equal(tracks()[1].clips[0].start,24000,'selection spans tracks');
 await commandDispatcher.runCommand('sound.arrange.clips.move',{ids:['a','c'],delta:-9600});
 assert.deepEqual(tracks()[0].clips.map(c=>c.start),[0,9600],'clamped at zero, never negative');
 assert.equal(tracks()[1].clips[0].start,14400);
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clips.move',{ids:['a','missing'],delta:4800}));
 assert.deepEqual(tracks()[0].clips.map(c=>c.start),[0,9600],'rejection leaves every clip untouched');
 await commandDispatcher.runCommand('sound.arrange.clips.delete',{ids:['a','c']});
 assert.deepEqual(tracks()[0].clips.map(c=>c.id),['b']);
 assert.equal(tracks()[1].clips.length,0);
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(tracks()[0].clips.length,2,'undo restores the group delete');
 assert.equal(tracks()[1].clips.length,1);
}finally{off();resetArrangement();}});

test('clips.mute toggles a selection atomically and undo restores the flags',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800},{...newClip('b',source,9600),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.clips.mute',{ids:['a','b'],muted:true});
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>c.muted),[true,true]);
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clips.mute',{ids:['a','missing'],muted:false}));
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>c.muted),[true,true],'rejection is atomic');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>c.muted),[false,false]);
}finally{off();resetArrangement();}});

test('clips.rippleDelete closes the gap per track, keeps other tracks and undoes cleanly',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);
  s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800},{...newClip('b',source,9600),length:4800},{...newClip('c',source,19200),length:4800}]});
  s.tracks.push({...newTrack('t2','B'),clips:[{...newClip('x',source,4800),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.clips.rippleDelete',{ids:['a','b']});
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>[c.id,c.start]),[['c',9600]],'both clips shift: 19200 - 4800 - 4800 = 9600');
 assert.deepEqual(getArrangementState().document.tracks[1].clips.map(c=>[c.id,c.start]),[['x',4800]],'other tracks untouched');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.clips.rippleDelete',{ids:['missing']}));
 assert.equal(getArrangementState().document.tracks[0].clips.length,1,'rejection is atomic');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>[c.id,c.start]),[['a',0],['b',9600],['c',19200]],'undo restores clips and positions');
}finally{off();resetArrangement();}});

test('clip.set renames a clip and undo restores the name',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[newClip('a',source)]});});
 await commandDispatcher.runCommand('sound.arrange.clip.set',{id:'a',name:'Chorus take'});
 assert.equal(getArrangementState().document.tracks[0].clips[0].name,'Chorus take');
 await commandDispatcher.runCommand('sound.arrange.clip.set',{id:'a',name:''});
 assert.equal(getArrangementState().document.tracks[0].clips[0].name,'','clearing falls back to the source name');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.equal(getArrangementState().document.tracks[0].clips[0].name,'Chorus take');
}finally{off();resetArrangement();}});

test('session.cutRange cuts across tracks, rejects stale ranges and undoes fully',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);
  s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800}]});
  s.tracks.push({...newTrack('t2','B'),clips:[{...newClip('b',source,2400),length:4800}]});});
 await commandDispatcher.runCommand('sound.arrange.session.cutRange',{start:1200,end:3600});
 assert.deepEqual([...getArrangementState().document.tracks[0].clips].sort((x,y)=>x.start-y.start).map(c=>[c.start,c.offset,c.length]),[[0,0,1200],[1200,3600,1200]],'track A split at both boundaries, gap closed');
 assert.deepEqual([...getArrangementState().document.tracks[1].clips].sort((x,y)=>x.start-y.start).map(c=>[c.start,c.offset,c.length]),[[1200,1200,3600]],'track B: the cut removes the clip head, the remainder closes the gap');
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.cutRange',{start:0,end:999999}),/Invalid cut range/);
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.deepEqual(getArrangementState().document.tracks.map(t=>t.clips.map(c=>[c.start,c.length])),[[[0,4800]],[[2400,4800]]],'undo restores both tracks');
}finally{off();resetArrangement();}});

test('session.splitAtMarkers splits every clip at every marker, including several markers in one clip',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);
  s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:9600}]});
  s.tracks.push({...newTrack('t2','B'),clips:[{...newClip('b',source,4800),length:4800}]});
  s.markers.push({id:'m2',name:'two',frame:4800},{id:'m1',name:'one',frame:2400},{id:'m3',name:'three',frame:50000});});
 await commandDispatcher.runCommand('sound.arrange.session.splitAtMarkers');
 assert.deepEqual([...getArrangementState().document.tracks[0].clips].sort((x,y)=>x.start-y.start).map(c=>[c.start,c.offset,c.length]),[[0,0,2400],[2400,2400,2400],[4800,4800,4800]],'both markers split clip a, offsets follow');
 assert.deepEqual(getArrangementState().document.tracks[1].clips.map(c=>[c.start,c.length]),[[4800,4800]],'a marker exactly at a clip edge does not split');
 await commandDispatcher.runCommand('sound.arrange.undo');
 assert.deepEqual(getArrangementState().document.tracks[0].clips.map(c=>[c.start,c.length]),[[0,9600]],'undo restores');
}finally{off();resetArrangement();}});

test('session.splitAtMarkers rejects without markers and without material under any marker',async()=>{resetArrangement();const off=registerArrangeCommands();try{
 const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
 editArrangement(s=>{s.sources.push(source);s.tracks.push({...newTrack('t1','A'),clips:[{...newClip('a',source,0),length:4800}]});});
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.splitAtMarkers'),/No markers/);
 editArrangement(s=>s.markers.push({id:'m',name:'far',frame:50000}));
 await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.splitAtMarkers'),/No clip at any marker/);
 assert.equal(getArrangementState().document.tracks[0].clips.length,1,'rejections are atomic');
}finally{off();resetArrangement();}});
