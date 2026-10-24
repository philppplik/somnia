import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interfaceExportSchema,valuesToInterfaceOptions,interfaceOptionsToValues,injectInterfaceSvgMeta,INTERFACE_EXPORT_DEFAULTS} from './interfaceExportSchema';
import {visibleExportFields} from '../export/schema';
test('interface export schema: name is required, scope/preset and metadata have defaults',()=>{
 const s=interfaceExportSchema();
 assert.equal(s.studio,'interface');
 assert.equal(s.validate(interfaceOptionsToValues(INTERFACE_EXPORT_DEFAULTS)),'export.error.name');
 assert.equal(s.validate({...interfaceOptionsToValues(INTERFACE_EXPORT_DEFAULTS),name:'hero'}),null);
});
test('values round-trip; unknown scope/preset fall back to selected/svg',()=>{
 assert.deepEqual(valuesToInterfaceOptions({name:' hero ',scope:'page',preset:'png2x',metaTitle:'T',metaDescription:'D'}),{name:'hero',scope:'page',preset:'png2x',metaTitle:'T',metaDescription:'D'});
 assert.equal(valuesToInterfaceOptions({name:'x',scope:'bogus'}).scope,'selected');
 assert.equal(valuesToInterfaceOptions({name:'x',preset:'tiff'}).preset,'svg');
});
test('metadata fields are only visible for the SVG preset',()=>{
 const s=interfaceExportSchema();
 const svgIds=visibleExportFields(s,interfaceOptionsToValues({...INTERFACE_EXPORT_DEFAULTS,preset:'svg'})).map(f=>f.id);
 const pngIds=visibleExportFields(s,interfaceOptionsToValues({...INTERFACE_EXPORT_DEFAULTS,preset:'png2x'})).map(f=>f.id);
 assert.ok(svgIds.includes('metaTitle')&&svgIds.includes('metaDescription'));
 assert.ok(!pngIds.includes('metaTitle')&&!pngIds.includes('metaDescription'));
});
test('SVG metadata injection escapes and inserts after the opening tag; no-op without metadata or non-SVG',()=>{
 assert.equal(injectInterfaceSvgMeta('<svg width="1"></svg>','A & B','<desc>'),'<svg width="1"><title>A &amp; B</title><desc>&lt;desc&gt;</desc></svg>');
 assert.equal(injectInterfaceSvgMeta('<svg width="1"></svg>','',''),'<svg width="1"></svg>');
 assert.equal(injectInterfaceSvgMeta('not svg','T',''),'not svg');
});
