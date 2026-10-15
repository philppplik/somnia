import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVideoHistory,GESTURE_MS,pushHistory,redoHistory,undoHistory,VIDEO_HISTORY_LIMIT} from './history';
import type {TimelineClip} from './timeline';
const clip=(id:string,out_s=1):TimelineClip=>({id,source:'s.webm',in_s:0,out_s,gain:1,muted:false});
const snap=(clips:TimelineClip[])=>({clips,audioClips:[]});

test('push, undo and redo walk the clip snapshots in order',()=>{
 let h=emptyVideoHistory();
 const v0=[clip('a')],v1=[clip('a'),clip('b')],v2=[clip('a'),clip('b',2)];
 h=pushHistory(h,snap(v0),null,0);
 h=pushHistory(h,snap(v1),null,10);
 assert.equal(h.past.length,2);assert.equal(h.future.length,0);
 const u1=undoHistory(h,snap(v2))!;
 assert.deepEqual(u1.snapshot.clips,v1);assert.equal(u1.history.future.length,1);
 const u2=undoHistory(u1.history,snap(v1))!;
 assert.deepEqual(u2.snapshot.clips,v0);assert.equal(u2.history.future.length,2);
 assert.equal(undoHistory(u2.history,snap(v0)),null,'empty past stops undoing');
 const r1=redoHistory(u2.history,snap(v0))!;
 assert.deepEqual(r1.snapshot.clips,v1);assert.equal(r1.history.past.length,1);
 const r2=redoHistory(r1.history,snap(v1))!;
 assert.deepEqual(r2.snapshot.clips,v2);assert.equal(redoHistory(r2.history,snap(v2)),null);
});

test('a new edit clears the redo stack',()=>{
 let h=pushHistory(emptyVideoHistory(),snap([clip('a')]),null,0);
 const u=undoHistory(h,snap([clip('a'),clip('b')]))!;
 h=pushHistory(u.history,snap([clip('a')]),null,20);
 assert.equal(h.future.length,0,'the forked edit drops the redo branch');
});

test('history is capped at the limit, oldest entries drop first',()=>{
 let h=emptyVideoHistory();
 for(let i=0;i<VIDEO_HISTORY_LIMIT+5;i++)h=pushHistory(h,snap([clip(`c${i}`)]),null,i*GESTURE_MS*2);
 assert.equal(h.past.length,VIDEO_HISTORY_LIMIT);
 assert.equal(h.past[0].clips[0].id,'c5');
});

test('a repeated gesture key inside the window keeps the original snapshot',()=>{
 let h=pushHistory(emptyVideoHistory(),snap([clip('a')]),'trim:x:out',1000);
 const mid=[clip('a',1.2)],late=[clip('a',1.5)];
 h=pushHistory(h,snap(mid),'trim:x:out',1400);
 assert.equal(h.past.length,1,'the drag stays one entry');
 h=pushHistory(h,snap(late),'trim:x:out',1900);
 assert.equal(h.past.length,1);
 const u=undoHistory(h,snap([clip('a',1.8)]))!;
 assert.deepEqual(u.snapshot.clips,[clip('a')],'undoing the drag returns to the pre-drag state');
 h=pushHistory(u.history,snap([clip('a')]),'trim:x:out',1000+GESTURE_MS+1);
 assert.equal(h.past.length,1,'after the window the same key opens a fresh entry over the undone state');
 const other=pushHistory(h,snap([clip('b')]),'trim:y:out',1000+GESTURE_MS+2);
 assert.equal(other.past.length,2,'a different key never coalesces');
});

test('undo and redo close any open gesture',()=>{
 const h=pushHistory(emptyVideoHistory(),snap([clip('a')]),'gain:x',100);
 const u=undoHistory(h,snap([clip('a',2)]))!;
 assert.equal(u.history.gestureKey,null);
 const again=pushHistory(u.history,snap([clip('a')]),'gain:x',150);
 assert.equal(again.past.length,1,'the entry after undo is fresh, not coalesced into the undone one');
});
