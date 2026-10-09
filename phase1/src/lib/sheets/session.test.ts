import test from 'node:test';import assert from 'node:assert/strict';
import {copyFileName,hasDirtySheets,setSheetsDirty,sheetsIsDirty} from './session';
test('dirty registry tracks workbooks by name',()=>{assert.equal(hasDirtySheets(),false);setSheetsDirty('a.xlsx',true);assert.ok(sheetsIsDirty('a.xlsx'));assert.ok(!sheetsIsDirty('b.xlsx'));assert.ok(hasDirtySheets());setSheetsDirty('a.xlsx',false);assert.equal(hasDirtySheets(),false);});
test('copy names never reuse the source name',()=>{assert.equal(copyFileName('dir/Budget.XLSX'),'Budget-edited.xlsx');assert.equal(copyFileName('plain'),'plain-edited.xlsx');});
