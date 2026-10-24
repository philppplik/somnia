import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentsExportSchema,valuesToDocumentsOptions,documentsOptionsToValues,DOCUMENTS_EXPORT_DEFAULTS} from './documentsExportSchema';
test('documents export schema: name is required, metadata is optional',()=>{
 const s=documentsExportSchema();
 assert.equal(s.studio,'documents');
 assert.equal(s.validate(documentsOptionsToValues(DOCUMENTS_EXPORT_DEFAULTS)),'export.error.name');
 assert.equal(s.validate({...documentsOptionsToValues(DOCUMENTS_EXPORT_DEFAULTS),name:'brief'}),null);
});
test('values round-trip and trim the name',()=>{
 const o=valuesToDocumentsOptions({name:'  brief  ',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
 assert.deepEqual(o,{name:'brief',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
});
