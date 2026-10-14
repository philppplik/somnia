import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {PdfEditInspector} from './pdf/PdfEditInspector';
import {PDF_EDIT_SCHEMA,type PdfEditDocument} from '../lib/pdf/model';
import type {PdfFieldInfo} from '../lib/pdfforms/types';

const doc:PdfEditDocument={schema:PDF_EDIT_SCHEMA,sourcePageCount:2,
 pages:[{sourcePage:0,rotation:0},{sourcePage:1,rotation:90}],annotations:[],fieldValues:{}};
const fields:readonly PdfFieldInfo[]=[{name:'title',kind:'text',value:'Hello',readOnly:false,required:false}];
const noop=()=>{};
const render=(over:Partial<Parameters<typeof PdfEditInspector>[0]>={})=>renderToStaticMarkup(
 <PdfEditInspector document={doc} locale="en" fields={fields} activeSourcePage={0}
  onSelectPage={noop} onCommand={noop} onExport={noop} onExtract={noop} onUndo={noop} onRedo={noop}
  canUndo={false} canRedo={false} {...over}/>);

test('undo/redo and page actions render as native buttons and stay disabled',()=>{
 const html=render();
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*disabled=""[^>]*>Undo<\/button>/);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*disabled=""[^>]*>Redo<\/button>/);
 const pages=html.match(/<button[^>]*data-slot="native-button"[^>]*aria-current="page"[^>]*>/g)??[];
 assert.equal(pages.length,1,'exactly the active page carries aria-current');
});

test('page selection checkboxes render as native inputs',()=>{
 const html=render();
 const boxes=html.match(/<input[^>]*data-slot="native-input"[^>]*type="checkbox"[^>]*aria-label="Select page for extraction/g)??[];
 assert.equal(boxes.length,2);
});

test('annotation form keeps select, textarea, color and submit through native primitives',()=>{
 const html=render();
 assert.match(html,/<select[^>]*data-slot="native-select"[^>]*>/);
 assert.match(html,/<textarea[^>]*data-slot="textarea"[^>]*max[Ll]ength="20000"[^>]*>/);
 assert.match(html,/<input[^>]*data-slot="native-input"[^>]*type="color"[^>]*value="#f5d547"[^>]*>/);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*type="submit"[^>]*>Add annotation<\/button>/);
});

test('text form field renders through the shared textarea with its value',()=>{
 const html=render();
 assert.match(html,/<textarea[^>]*data-slot="textarea"[^>]*>Hello<\/textarea>/);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*disabled=""[^>]*>Reset field<\/button>/);
});

test('no raw form controls remain anywhere in the pdf and pdfedit areas',()=>{
 for(const rel of ['./pdf/','./pdfedit/']) {
  const dir=new URL(rel,import.meta.url);
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.tsx')&&!f.includes('.test.'))) {
   const source=readFileSync(new URL(f,dir),'utf8');
   assert.doesNotMatch(source,/<(button|input|select|textarea)\b/,rel+f);
  }
 }
});
