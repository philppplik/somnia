import test from 'node:test';import assert from 'node:assert/strict';
import {LOCAL_MODELS_CATALOGUES} from '../localModelsI18n';
test('new Local application, lint and health keys have de/en coverage with matching placeholders',()=>{
 const en=LOCAL_MODELS_CATALOGUES.en,de=LOCAL_MODELS_CATALOGUES.de;
 for(const key of Object.keys(en).filter(k=>/^local\.(apply|lint|health)\./.test(k))){assert.ok(de[key],key);assert.deepEqual((de[key].match(/\{\w+\}/g)??[]).sort(),(en[key].match(/\{\w+\}/g)??[]).sort(),key);}
});
