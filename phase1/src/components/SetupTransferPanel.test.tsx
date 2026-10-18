import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SetupTransferPanel} from './SetupTransferPanel';
import {baseState} from '../lib/settingsTransfer/format.test';
import {TRANSFER_CATEGORIES} from '../lib/settingsTransfer/classify';
Object.assign(globalThis,{localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
test('setup panel renders export categories, import entry and the no-secrets promise; no review before a file is chosen',()=>{
 const html=renderToStaticMarkup(<SetupTransferPanel state={baseState()} onApply={()=>{}}/>);
 for(const c of TRANSFER_CATEGORIES)assert.ok(html.includes(`data-testid="export-cat-${c}"`),c);
 for(const text of ['Import &amp; export setup','Export setup...','Import setup...','never included','Not transferable: 1 setting(s)'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('setup-review'));
 assert.ok(!html.includes('setup-undo'),'no undo without a restore point');
});
