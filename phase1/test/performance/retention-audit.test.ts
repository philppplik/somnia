import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attachEngine,editParagraph,undoEdit,redoEdit,loadBlocks} from '../../src/lib/documents/session';
import {getDocumentsState,resetDocuments} from '../../src/lib/documents/store';
import {applyEdit,type TextEdit} from '../../src/lib/documents/edit';
import type {DocumentsEngine} from '../../src/lib/documents/engine';
import {setSheetsDirty,sheetsIsDirty} from '../../src/lib/sheets/session';

// Characterization, not a passing retention gate. No WASM or React mount is simulated as real.
function documentDouble(original='Original Ä 😀') {
 let text=original;
 const info=()=>({pages:1,pageSizes:[],text});
 const engine={blocks:async()=>[{index:0,kind:'para' as const,editable:true,text}],
  replace:async(edit:TextEdit)=>{text=applyEdit(text,edit);return info();}};
 return {engine:engine as unknown as DocumentsEngine,info,text:()=>text};
}
afterEach(()=>{attachEngine(null);resetDocuments();setSheetsDirty('audit.xlsx',false);});
test('control: accepted Documents edit is dirty and undo/redo works before detachment',async()=>{
 const d=documentDouble();attachEngine(d.engine);await loadBlocks(d.info());
 await editParagraph(0,'Accepted Ä 😀');assert.equal(d.text(),'Accepted Ä 😀');
 assert.equal(getDocumentsState().edited,true);assert.equal(getDocumentsState().canUndo,true);
 await undoEdit();assert.equal(d.text(),'Original Ä 😀');await redoEdit();assert.equal(d.text(),'Accepted Ä 😀');
});
test('baseline hazard witness: reattaching an original Documents engine clears dirty and history',async()=>{
 const first=documentDouble();attachEngine(first.engine);await loadBlocks(first.info());await editParagraph(0,'Accepted');
 const reopened=documentDouble();attachEngine(reopened.engine);await loadBlocks(reopened.info());
 assert.equal(getDocumentsState().blocks[0].text,'Original Ä 😀');
 assert.equal(getDocumentsState().edited,false);assert.equal(getDocumentsState().canUndo,false);
 await undoEdit();assert.equal(reopened.text(),'Original Ä 😀');
});
test('baseline source ownership: Documents remount reads original URL and disposes engine',()=>{
 const canvas=readFileSync(new URL('../../src/components/documents/DocumentsCanvas.tsx',import.meta.url),'utf8');
 assert.match(canvas,/fetch\(item\.url\)/);assert.match(canvas,/attachEngine\(e\)/);
 assert.match(canvas,/return\(\)=>\{live=false;e\.dispose\(\)/);
});
test('baseline hazard witness: Sheets view cleanup removes the global dirty guard',()=>{
 const canvas=readFileSync(new URL('../../src/components/sheets/SheetsCanvas.tsx',import.meta.url),'utf8');
 assert.match(canvas,/return\(\)=>setSheetsDirty\(item\.name,false\)/);
 assert.match(canvas,/return\(\)=>\{live=false;eng\.dispose\(\)/);
 setSheetsDirty('audit.xlsx',true);assert.equal(sheetsIsDirty('audit.xlsx'),true);
 // Exact dirty cleanup operation from the source, not a React remount test.
 setSheetsDirty('audit.xlsx',false);assert.equal(sheetsIsDirty('audit.xlsx'),false);
});
