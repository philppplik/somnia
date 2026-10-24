import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designExportSchema,valuesToDesignOptions,designOptionsToValues,DESIGN_EXPORT_DEFAULTS} from './designExportSchema';
test('design export schema: name is required, scope and metadata have defaults',()=>{
 const s=designExportSchema();
 assert.equal(s.studio,'design');
 assert.equal(s.validate(designOptionsToValues(DESIGN_EXPORT_DEFAULTS)),'export.error.name');
 assert.equal(s.validate({...designOptionsToValues(DESIGN_EXPORT_DEFAULTS),name:'icon'}),null);
});
test('values round-trip; unknown scope falls back to current',()=>{
 assert.deepEqual(valuesToDesignOptions({name:' icon ',scope:'all',metaTitle:'T',metaDescription:'D'}),{name:'icon',scope:'all',metaTitle:'T',metaDescription:'D'});
 assert.equal(valuesToDesignOptions({name:'x',scope:'bogus'}).scope,'current');
});
