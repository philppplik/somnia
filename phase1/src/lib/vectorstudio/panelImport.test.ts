import test from 'node:test';
import assert from 'node:assert/strict';
import {patchState} from '../../store/appStore';
import {vectorCommandsReady} from '../../store/vectorBootstrap';
import {replaceVectorFromFile} from './panelImport';
import * as S from './session';
import {rectPath} from './shapes';
const svg='<svg width="80" height="60"><rect width="30" height="20"/></svg>';
const file=(text=svg)=>({size:text.length,text:async()=>text});
test.beforeEach(async()=>{await vectorCommandsReady;S.resetVectorSession();patchState({activeStudio:'vector'});S.createBlankVector();S.addPath(rectPath({x:1,y:2,w:10,h:20}));});
test('strict rejection preserves artwork, redo and existing undo snapshots',async()=>{
 const drawn=S.getVectorSession().doc;S.undo();const before=S.getVectorSession();
 await assert.rejects(replaceVectorFromFile(file('<svg><rect onclick="alert(1)" width="10" height="10"/></svg>')),/event attribute/);
 assert.equal(S.getVectorSession(),before);S.redo();assert.deepEqual(S.getVectorSession().doc,drawn);
 S.undo();assert.equal(S.getVectorSession().doc.paths.length,0);
});
test('successful replacement is one edit and undo reaches earlier artwork and history',async()=>{
 const before=S.getVectorSession().doc;
 await replaceVectorFromFile(file());assert.equal(S.getVectorSession().doc.width,80);assert.equal(S.getVectorSession().doc.paths.length,1);
 S.undo();assert.deepEqual(S.getVectorSession().doc,before);S.undo();assert.equal(S.getVectorSession().doc.paths.length,0);
 S.redo();S.redo();assert.equal(S.getVectorSession().doc.width,80);
});
test('document edits during async file reading cannot be overwritten',async()=>{
 let resolve!:(s:string)=>void;
 const pending=replaceVectorFromFile({size:svg.length,text:()=>new Promise(r=>{resolve=r;})});
 S.resizePage(200,300);const edited=S.getVectorSession();resolve(svg);
 await assert.rejects(pending,/changed while reading SVG/);assert.equal(S.getVectorSession(),edited);
});
test('oversized input is refused before reading bytes or touching history',async()=>{
 const before=S.getVectorSession();let read=false;
 await assert.rejects(replaceVectorFromFile({size:9*1024*1024,text:async()=>{read=true;return svg;}}),/limit/);
 assert.equal(read,false);assert.equal(S.getVectorSession(),before);
});
test.after(()=>{S.resetVectorSession();patchState({activeStudio:'code'});});
