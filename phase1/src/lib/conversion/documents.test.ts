import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell} from 'docx';
import {unzipSync} from 'fflate';
import {convertDocument} from './documents';
const enc=new TextEncoder(),dec=new TextDecoder();
const markdown='# Hello Somnia\n\nGrüße für Philipp. **Bold** and *italic*.\n\n- First\n- Second\n\n> A quote\n\n```js\nconst answer = 42;\n```\n\n| A | B |\n|---|---|\n| one | two |';
async function samplePdf(source=markdown) {return convertDocument({from:'md',to:'pdf',data:enc.encode(source)});}

test('Markdown -> PDF -> text performs real Unicode conversion and leaves input intact',async()=>{
 const input=enc.encode(markdown),copy=input.slice();
 const pdf=await convertDocument({from:'md',to:'pdf',data:input,title:'Somnia test'});
 assert.equal(dec.decode(pdf.data.subarray(0,5)),'%PDF-');
 assert.equal(pdf.mimeType,'application/pdf');assert.deepEqual(input,copy);
 const converted=await convertDocument({from:'pdf',to:'txt',data:pdf.data});
 const text=dec.decode(converted.data);
 for(const phrase of ['Hello Somnia','Grüße für Philipp.','First','Second','A quote','const answer = 42;','one','two'])assert.ok(text.includes(phrase),`${phrase} missing in ${text}`);
 assert.ok(converted.warnings.some(w=>w.includes('reading order')));
 assert.equal(dec.decode(pdf.data.subarray(0,5)),'%PDF-','PDF.js must not detach caller input');
});

test('PDF -> DOCX emits actual Word XML, then DOCX -> Markdown preserves text',async()=>{
 const pdf=await samplePdf();
 const docx=await convertDocument({from:'pdf',to:'docx',data:pdf.data});
 const zip=unzipSync(docx.data),xml=dec.decode(zip['word/document.xml']);
 assert.ok(xml.includes('Hello Somnia'));assert.ok(xml.includes('Grüße für Philipp.'));
 assert.equal(docx.extension,'docx');assert.ok(docx.warnings.some(w=>w.includes('layout')));
 const md=await convertDocument({from:'docx',to:'md',data:docx.data});
 assert.ok(dec.decode(md.data).includes('Hello Somnia'));
});

test('DOCX -> Markdown preserves semantic headings, inline marks and tables',async()=>{
 const cell=(text:string)=>new TableCell({children:[new Paragraph(text)]});
 const doc=new Document({sections:[{children:[
  new Paragraph({text:'Document title',heading:HeadingLevel.HEADING_1}),
  new Paragraph({children:[new TextRun({text:'Bold text',bold:true}),new TextRun(' and '),new TextRun({text:'italic text',italics:true})]}),
  new Table({rows:[new TableRow({children:[cell('Name'),cell('Value')]}),new TableRow({children:[cell('foo'),cell('bar')]})]}),
 ]}]});
 const bytes=new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
 const result=await convertDocument({from:'docx',to:'md',data:bytes});
 const md=dec.decode(result.data);
 assert.match(md,/# Document title/);assert.match(md,/\*\*Bold text\*\*/);assert.match(md,/[_*]italic text[_*]/);
 assert.match(md,/\| Name \| Value \|/);assert.match(md,/\| foo \| bar \|/);
});

test('long Markdown paginates PDF, preserves page separators and DOCX page breaks',async()=>{
 const pdf=await samplePdf(Array.from({length:180},(_,i)=>`Paragraph ${i}: A long body line, ending here.`).join('\n\n'));
 const txt=await convertDocument({from:'pdf',to:'txt',data:pdf.data});assert.ok(dec.decode(txt.data).includes('\f'));
 const word=await convertDocument({from:'pdf',to:'docx',data:pdf.data});
 const xml=dec.decode(unzipSync(word.data)['word/document.xml']);assert.ok(xml.includes('pageBreakBefore'));
 assert.ok(xml.includes('Paragraph 179'));
});

test('image-only PDF explains missing OCR, never silently reports full conversion',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const doc=await PDFDocument.create();doc.addPage();const data=await doc.save();
 const txt=await convertDocument({from:'pdf',to:'txt',data});
 assert.equal(dec.decode(txt.data),'');assert.ok(txt.warnings.some(w=>w.includes('OCR')));
});

test('Markdown does not fetch images or evaluate HTML',async()=>{
 const original=globalThis.fetch;let fetched=false;
 globalThis.fetch=(async()=>{fetched=true;throw Error('No network allowed');}) as typeof fetch;
 try {
  const pdf=await samplePdf('![private](https://example.invalid/private.png)\n\n<script>alert(1)</script>');
  assert.equal(fetched,false);assert.ok(pdf.warnings.some(w=>w.includes('images')));
  const text=await convertDocument({from:'pdf',to:'txt',data:pdf.data});assert.match(dec.decode(text.data),/<script>alert\(1\)<\/script>/);
 } finally {globalThis.fetch=original;}
});

test('invalid, unsupported, oversized and cancelled inputs fail explicitly',async()=>{
 await assert.rejects(convertDocument({from:'txt',to:'docx',data:enc.encode('x')}),/Unsupported/);
 await assert.rejects(convertDocument({from:'md',to:'pdf',data:new Uint8Array()}),/empty/);
 await assert.rejects(convertDocument({from:'md',to:'pdf',data:new Uint8Array(33*1024*1024)}),/32 MiB/);
 await assert.rejects(convertDocument({from:'md',to:'pdf',data:new Uint8Array([255])}),/UTF-8/);
 await assert.rejects(convertDocument({from:'pdf',to:'txt',data:enc.encode('not a pdf')}),/Invalid PDF/);
 await assert.rejects(convertDocument({from:'docx',to:'md',data:enc.encode('not a zip')}),/ZIP directory/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(convertDocument({from:'md',to:'pdf',data:enc.encode('text'),signal:controller.signal}),{name:'AbortError'});
});
