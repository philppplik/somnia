import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {VectorToolsPanel} from './vectorstudio/tools/VectorToolsPanel';
import {VectorNodePanel} from './vectorstudio/tools/VectorNodePanel';
import {importSvg} from '../lib/vectorio';

const doc=importSvg('<svg width="100" height="100"><rect x="10" y="20" width="30" height="40"/></svg>').doc;
const noop=()=>{};

test('tools panel renders tool toggles and dimension inputs through native primitives',()=>{
 const html=renderToStaticMarkup(<VectorToolsPanel value={doc} selection={[doc.paths[0].id]} onSelectionChange={noop} onCommit={noop} onToolChange={noop}/>);
 const toggles=html.match(/<button[^>]*data-slot="native-button"[^>]*aria-pressed="true"[^>]*>/g)??[];
 assert.ok(toggles.length>=1,'active tool toggle is a native button');
 const dims=html.match(/<input[^>]*data-slot="native-input"[^>]*aria-label="Selection (width|height)"[^>]*>/g)??[];
 assert.equal(dims.length,2);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*data-testid="vector-import-svg"[^>]*>/);
});

test('node panel renders position inputs and node-type actions as native controls',()=>{
 const html=renderToStaticMarkup(<VectorNodePanel value={doc} nodeSelection={[{pathId:doc.paths[0].id,nodeId:doc.paths[0].nodes[0].id}]} onNodeSelectionChange={noop} onCommit={noop}/>);
 assert.match(html,/<input[^>]*data-slot="native-input"[^>]*aria-label="Node x"[^>]*value="10"[^>]*>/);
 const actions=html.match(/<button[^>]*data-slot="native-button"[^>]*data-testid="vector-node-(corner|smooth|symmetric|straighten|delete)"[^>]*>/g)??[];
 assert.equal(actions.length,5);
});

test('no raw form controls remain anywhere in the vectorstudio area',()=>{
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
 for(const f of walk(new URL('./vectorstudio/',import.meta.url).pathname).filter(f=>f.endsWith('.tsx')&&!f.includes('.test.'))) {
  assert.doesNotMatch(readFileSync(f,'utf8'),/<(button|input|select|textarea)\b/,f);
 }
});
