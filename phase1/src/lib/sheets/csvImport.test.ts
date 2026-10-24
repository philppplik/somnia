import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDelimited,sniffDelimiter,importSheetName,planImport,importPreview,escapeCellInput,decodeDelimitedFile,MAX_IMPORT_ROWS,MAX_IMPORT_COLS,MAX_BLOCK_CELLS} from './csvImport';

test('parseDelimited reads plain rows, CRLF and LF, and ignores one trailing newline',()=>{
 assert.deepEqual(parseDelimited('a,b\n1,2','comma'),[['a','b'],['1','2']]);
 assert.deepEqual(parseDelimited('a,b\r\n1,2\r\n','comma'),[['a','b'],['1','2']]);
 assert.deepEqual(parseDelimited('a\tb\n1\t2','tab'),[['a','b'],['1','2']]);
});

test('parseDelimited honours quotes: delimiters, newlines and doubled quotes inside',()=>{
 assert.deepEqual(parseDelimited('"a,b","c"\r\n"x""y",z','comma'),[['a,b','c'],['x"y','z']]);
 assert.deepEqual(parseDelimited('"one\ntwo",b','comma'),[['one\ntwo','b']]);
 assert.deepEqual(parseDelimited('a;"b;b"','semicolon'),[['a','b;b']]);
});

test('decodeDelimitedFile strips a UTF-8 BOM and falls back to Windows-1252',()=>{
 assert.deepEqual(decodeDelimitedFile(new Uint8Array([0xef,0xbb,0xbf,0x61,0x2c,0x62])),{text:'a,b',encoding:'utf-8'});
 assert.deepEqual(decodeDelimitedFile(new TextEncoder().encode('a,b')),{text:'a,b',encoding:'utf-8'});
 // 0xE4 is "ä" in Windows-1252 and invalid UTF-8.
 assert.deepEqual(decodeDelimitedFile(new Uint8Array([0xE4])),{text:'ä',encoding:'windows-1252'});
});

test('planImport pads ragged rows into one rectangular block',()=>{
 const plan=planImport('a,b,c\n1,2','comma');
 assert.ok(plan.ok);
 assert.deepEqual(plan.plan.chunks.length,1);
 assert.deepEqual(plan.plan.chunks[0].values,[['a','b','c'],['1','2','']]);
 assert.deepEqual([plan.plan.rows,plan.plan.cols],[2,3]);
});

test('sniffDelimiter prefers a consistent multi-column candidate',()=>{
 assert.equal(sniffDelimiter('a;b;c\n1;2;3'),'semicolon');
 assert.equal(sniffDelimiter('a,b\n1,2\n3,4'),'comma');
 assert.equal(sniffDelimiter('a\tb\n1\t2'),'tab');
 assert.equal(sniffDelimiter('a,b\n1;2;3\n4;5;6'),'semicolon');
 assert.equal(sniffDelimiter('abc\ndef'),'comma');
});

test('importSheetName strips path, extension and forbidden characters and dedupes',()=>{
 assert.equal(importSheetName('/data/report.csv',[]),'report');
 assert.equal(importSheetName('a/b:c?.tsv',[]),'b c');
 assert.equal(importSheetName('report.csv',['Report']),'report (2)');
 assert.equal(importSheetName('report.csv',['report','report (2)']),'report (3)');
 assert.equal(importSheetName('.csv',[]),'Import');
});

test('escapeCellInput keeps formula-looking text as text, the way Excel imports CSV',()=>{
 assert.equal(escapeCellInput('=SUM(A1:A2)',),"'=SUM(A1:A2)");
 assert.equal(escapeCellInput('42'),'42');
 assert.equal(escapeCellInput(''),'');
});

test('planImport rejects empty and oversized input',()=>{
 assert.deepEqual(planImport('','comma'),{ok:false,reason:'empty'});
 assert.ok(planImport('  ','comma').ok); // one cell of spaces is data
 assert.equal(planImport('x'.repeat(33*1024*1024),'comma').ok,false);
});

test('planImport clips to the caps and marks the plan truncated',()=>{
 const manyRows=Array.from({length:MAX_IMPORT_ROWS+5},(_,i)=>`r${i},x`).join('\n');
 const plan=planImport(manyRows,'comma');
 assert.ok(plan.ok);
 assert.equal(plan.plan.rows,MAX_IMPORT_ROWS);
 assert.equal(plan.plan.truncated,true);
 const manyCols=Array.from({length:MAX_IMPORT_COLS+3},(_,i)=>`c${i}`).join(',');
 const plan2=planImport(manyCols,'comma');
 assert.ok(plan2.ok);
 assert.equal(plan2.plan.cols,MAX_IMPORT_COLS);
 assert.equal(plan2.plan.truncated,true);
});

test('planImport splits wide data into engine-sized rectangular chunks',()=>{
 const text=Array.from({length:100},()=>Array.from({length:500},()=>'x').join(',')).join('\n');
 const plan=planImport(text,'comma');
 assert.ok(plan.ok);
 assert.equal(plan.plan.rows,100);
 assert.equal(plan.plan.cols,500);
 const per=Math.floor(MAX_BLOCK_CELLS/500); // 20 rows per chunk
 assert.equal(plan.plan.chunks.length,5);
 for(const c of plan.plan.chunks){assert.ok(c.values.length*c.values[0].length<=MAX_BLOCK_CELLS);assert.equal(c.values[0].length,500);}
 assert.equal(plan.plan.chunks[1].rowOffset,per);
});

test('planImport anchors at the origin, clips at the sheet edge and rejects overlong cells',()=>{
 const plan=planImport('a,b','comma',{row:5,col:3});
 assert.ok(plan.ok);
 const edge=planImport('a,b','comma',{row:1048575,col:16383});
 assert.ok(edge.ok);
 assert.equal(edge.plan.rows,1);
 assert.equal(edge.plan.cols,1);
 assert.deepEqual(planImport('x'.repeat(40000),'comma'),{ok:false,reason:'tooLong'});
});

test('importPreview returns the first rows padded to the block width',()=>{
 const plan=planImport('a,b\n1,2\n3,4\n5,6','comma');
 assert.ok(plan.ok);
 assert.deepEqual(importPreview(plan.plan,2,5),[['a','b'],['1','2']]);
 assert.deepEqual(importPreview(plan.plan,10,1),[['a'],['1'],['3'],['5']]);
});
