import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfExportFileName,pdfExportSchema,pdfFileStem,pdfOptionsToValues,pdfPipelineOptions,valuesToPdfOptions,PDF_EXPORT_DEFAULTS as D,type PdfAdvancedOptions,type PdfExportContext} from './exportAdvanced';
import {EXPORT_GROUP_IDS} from '../exportCenter';
const ctx=(o:Partial<PdfExportContext>={}):PdfExportContext=>({hasBytes:true,protectedDoc:false,canvas:true,...o});
const v=(o:Partial<PdfAdvancedOptions>={})=>pdfOptionsToValues({...D,name:'doc',...o});
test('schema: name, bytes, protection, canvas and screen limits are validated',()=>{
 const s=pdfExportSchema(ctx());
 assert.equal(s.validate(pdfOptionsToValues(D)),'export.error.name');
 assert.equal(s.validate(v()),null);
 assert.equal(pdfExportSchema(ctx({hasBytes:false})).validate(v()),'export.error.empty');
 const p=pdfExportSchema(ctx({protectedDoc:true}));
 assert.equal(p.validate(v({output:'print'})),'export.error.pdfProtected');
 assert.equal(p.validate(v({output:'screen'})),'export.error.pdfProtected');
 assert.equal(p.validate(v({output:'edited'})),null,'the editable copy is allowed for protected files');
 assert.equal(pdfExportSchema(ctx({canvas:false})).validate(v({output:'screen'})),'export.error.pdfCanvas');
 assert.equal(pdfExportSchema(ctx({canvas:false})).validate(v({output:'print'})),null);
 assert.equal(s.validate(v({output:'screen',dpi:50})),'export.error.pdfScreen');
 assert.equal(s.validate(v({output:'screen',quality:101})),'export.error.pdfScreen');
 assert.equal(s.validate(v({output:'screen',dpi:300,quality:100})),null);
 assert.equal(s.validate(v({output:'print',dpi:5})),null,'dpi only matters for the screen copy');
});
test('fields show per output',()=>{
 const s=pdfExportSchema(ctx());const vis=(o:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(o)).map(f=>f.id);
 assert.deepEqual(vis({output:'edited'}),['output','name']);
 assert.deepEqual(vis({output:'print'}),['output','name','title','author','subject','keywords']);
 assert.deepEqual(vis({output:'screen'}),['output','name','dpi','quality','title','author','subject','keywords']);
});
test('options: bad input falls back to defaults',()=>{
 const o=valuesToPdfOptions({output:'pdfa',dpi:'x',quality:'80'});
 assert.deepEqual([o.output,o.dpi,o.quality],['edited',120,80]);
});
test('file names say what kind of copy it is',()=>{
 assert.equal(pdfExportFileName({...D,name:'Report.pdf',output:'edited'}),'Report-edited.pdf');
 assert.equal(pdfExportFileName({...D,name:'a/b',output:'print'}),'a_b-flattened.pdf');
 assert.equal(pdfExportFileName({...D,name:' ',output:'screen'}),'document-screen.pdf');
 assert.equal(pdfFileStem('x.PDF'),'x');
});
test('pipeline options carry only the metadata the user filled in',()=>{
 assert.deepEqual(pdfPipelineOptions({...D,quality:50,dpi:150}),{dpi:150,quality:0.5,metadata:{}});
 assert.deepEqual(pdfPipelineOptions({...D,title:'T',keywords:'a, b,,c'}).metadata,{title:'T',keywords:['a','b','c']});
});
test('export center lists the advanced command first for PDF',()=>{assert.deepEqual(EXPORT_GROUP_IDS.pdf,['pdf.export.advanced','pdf.saveCopy']);});
