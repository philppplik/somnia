import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slidesExportSchema,valuesToSlidesOptions,slidesOptionsToValues,SLIDES_EXPORT_DEFAULTS} from './slidesExportSchema';
test('slides export schema: name is required, metadata is optional',()=>{
 const s=slidesExportSchema();
 assert.equal(s.studio,'slides');
 assert.equal(s.validate(slidesOptionsToValues(SLIDES_EXPORT_DEFAULTS)),'export.error.name');
 assert.equal(s.validate({...slidesOptionsToValues(SLIDES_EXPORT_DEFAULTS),name:'deck'}),null);
});
test('values round-trip and trim the name',()=>{
 const o=valuesToSlidesOptions({name:'  deck  ',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
 assert.deepEqual(o,{name:'deck',metaTitle:'T',metaAuthor:'A',metaDescription:'D'});
});
