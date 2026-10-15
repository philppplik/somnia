import {test} from 'node:test';import assert from 'node:assert/strict';
import {registerArrangeCommands} from './arrangeCommands';
import {commandDispatcher} from '../commandDispatcher';
import {getArrangementState,resetArrangement,editArrangement,loadArrangement} from './arrangeStore';
import {serializeArrangement,newTrack} from './arrangement';
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
