import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sheetsExportSchema,valuesToSheetsOptions,sheetsOptionsToValues,SHEETS_EXPORT_DEFAULTS} from './sheetsExportSchema';
test('sheets export schema: name is required, metadata is optional',()=>{
 const s=sheetsExportSchema();
 assert.equal(s.studio,'sheets');
 assert.equal(s.validate(sheetsOptionsToValues(SHEETS_EXPORT_DEFAULTS)),'export.error.name');
 assert.equal(s.validate({...sheetsOptionsToValues(SHEETS_EXPORT_DEFAULTS),name:'book'}),null);
});
test('values round-trip and trim the name',()=>{
 const o=valuesToSheetsOptions({name:'  book  ',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
 assert.deepEqual(o,{name:'book',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
});
