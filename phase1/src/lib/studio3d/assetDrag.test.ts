import test from 'node:test';import assert from 'node:assert/strict';
import {ASSET_MIME,assetDragData,parseAssetDrag} from './assetDrag';
test('asset drag payloads round-trip through the mime data',()=>{
 assert.deepEqual(parseAssetDrag(assetDragData({kind:'primitive',primitive:'sphere'})),{kind:'primitive',primitive:'sphere'});
 assert.deepEqual(parseAssetDrag(assetDragData({kind:'material',key:'abc-123'})),{kind:'material',key:'abc-123'});
 assert.deepEqual(parseAssetDrag(assetDragData({kind:'preset',preset:'wood'})),{kind:'preset',preset:'wood'});
 assert.deepEqual(parseAssetDrag(assetDragData({kind:'userPreset',name:'My metal'})),{kind:'userPreset',name:'My metal'});
 assert.ok(ASSET_MIME.includes('somnia3d'));
});
test('foreign or damaged drop data is rejected',()=>{
 assert.equal(parseAssetDrag(''),null);
 assert.equal(parseAssetDrag('not json'),null);
 assert.equal(parseAssetDrag('null'),null);
 assert.equal(parseAssetDrag('{"kind":"primitive","primitive":"pyramid"}'),null);
 assert.equal(parseAssetDrag('{"kind":"material"}'),null);
 assert.equal(parseAssetDrag('{"kind":"preset","preset":"nope"}'),null);
 assert.equal(parseAssetDrag('{"kind":"userPreset","name":""}'),null);
 assert.equal(parseAssetDrag('{"kind":"other"}'),null);
});
