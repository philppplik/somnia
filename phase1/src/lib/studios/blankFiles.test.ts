import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {blankDocx,blankXlsx,blankPptx,blankWav,blankName} from './blankFiles';
import {sniffOffice,listZip} from '../office/zipProbe';
import {inspectDocx} from '../documents/inspect';
import {readRuns,makeEditedCopy} from '../slides/editCopy';
import {sniffAudio} from '../sound/format';

test('blank Documents package has an empty editable paragraph and no fidelity-risk parts',()=>{
 const bytes=blankDocx();assert.equal(sniffOffice(bytes),'docx');assert.deepEqual(inspectDocx(bytes),{ok:true,risks:[]});
 const xml=strFromU8(unzipSync(bytes)['word/document.xml']);assert.match(xml,/<w:p><w:r><w:t xml:space="preserve"><\/w:t>/);assert.match(xml,/w:pgSz/);
});
test('blank Sheets package uses a real empty worksheet and a valid relationship',()=>{
 const bytes=blankXlsx();assert.equal(sniffOffice(bytes),'xlsx');const files=unzipSync(bytes);
 assert.match(strFromU8(files['xl/worksheets/sheet1.xml']),/<sheetData\/>/);assert.match(strFromU8(files['xl/_rels/workbook.xml.rels']),/Target="worksheets\/sheet1.xml"/);
 assert.doesNotMatch(strFromU8(files['xl/worksheets/sheet1.xml']),/<c\b/);
});
test('blank Slides is one 16:9 slide with an empty editable run and retained package parts',()=>{
 const bytes=blankPptx();assert.equal(sniffOffice(bytes),'pptx');assert.equal(listZip(bytes).length,11);
 const runs=readRuns(bytes);assert.equal(runs.length,1);assert.equal(runs[0].text,'');
 const edited=makeEditedCopy(bytes,[{...runs[0],old:'',text:'My first slide'}]);assert.equal(readRuns(edited)[0].text,'My first slide');
 assert.match(strFromU8(unzipSync(bytes)['ppt/presentation.xml']),/cx="12192000" cy="6858000"/);
});
test('blank Sound is one second of stereo PCM16 silence, not a broken zero-byte audio input',()=>{
 const wav=blankWav();assert.equal(sniffAudio(wav)?.ext,'wav');const view=new DataView(wav.buffer);
 assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint32(40,true),192000);
 assert.ok(wav.slice(44).every(v=>v===0));
});
test('names are case-insensitive and never replace open projects',()=>{
 assert.equal(blankName('Untitled.docx',[]),'Untitled.docx');assert.equal(blankName('Untitled.docx',['untitled.DOCX','Untitled-2.docx']),'Untitled-3.docx');
 assert.equal(blankName('Untitled',['Untitled']),'Untitled-2');
});
