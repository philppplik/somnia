import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {markdownToDocx,docxToMarkdown,docxToText,pdfToText,imagesToPdf,sniffImage} from './docConvert.ts';

const MD='# Titel\n\nEin **fetter** und *schiefer* Text mit [Link](https://example.com) und `code`.\n\n- eins\n- zwei\n  - zwei-a\n\n1. a\n2. b\n\n> Zitat\n\n```\nlet x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
const PNG=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));

test('markdown -> docx is a valid OOXML zip with the expected parts',async()=>{
 const b=await markdownToDocx(MD);const z=unzipSync(b);
 assert.ok(z['word/document.xml']&&z['[Content_Types].xml']);
 const x=strFromU8(z['word/document.xml']);
 for(const s of ['Titel','Heading1','w:b','w:i','w:hyperlink','Consolas','w:tbl','let x = 1;'])assert.ok(x.includes(s),s);});

test('markdown -> docx -> markdown round-trips structure',async()=>{
 const {markdown}=await docxToMarkdown(await markdownToDocx(MD));
 assert.match(markdown,/^# Titel/m);assert.match(markdown,/\*\*fetter\*\*/);assert.match(markdown,/\[Link\]\(<https:\/\/example\.com>\)/);
 assert.match(markdown,/^-\s+eins/m);assert.match(markdown,/^1\.\s+a/m);assert.match(markdown,/zwei-a/);assert.match(markdown,/\| *A *\| *B *\|/);});

test('docx -> text',async()=>{const t=await docxToText(await markdownToDocx('# Hallo\n\nWelt'));assert.match(t,/Hallo\s+Welt/);});

test('images -> pdf -> text pipeline: page count, sizes, sniffing',async()=>{
 assert.equal(sniffImage(PNG),'png');assert.equal(sniffImage(new Uint8Array([1,2])),null);
 const pdf=await imagesToPdf([{bytes:PNG,type:'png'},{bytes:PNG,type:'png'}],{fit:'a4'});
 const d=await PDFDocument.load(pdf);assert.equal(d.getPageCount(),2);assert.equal(Math.round(d.getPage(0).getWidth()),595);
 const d2=await PDFDocument.load(await imagesToPdf([{bytes:PNG,type:'png'}]));assert.equal(d2.getPage(0).getWidth(),1);
 await assert.rejects(()=>imagesToPdf([]));});

test('pdf -> text extracts per page',async()=>{
 const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);
 d.addPage().drawText('Hello Somnia',{x:50,y:700,font:f,size:18});d.addPage().drawText('Second page',{x:50,y:700,font:f,size:18});
 const r=await pdfToText(await d.save());assert.equal(r.pages.length,2);assert.match(r.pages[0],/Hello Somnia/);assert.match(r.text,/Second page/);});
