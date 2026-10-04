import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeLook,contrastRatio,textOnAccent,DEFAULT_LOOK} from './look';
test('sanitize clamps and rejects bad values',()=>{const l=sanitizeLook({accent:'red',uiScale:500,editorFont:'x',lineHeight:0.1,density:'huge'});assert.deepEqual(l,{...DEFAULT_LOOK,uiScale:130,lineHeight:1.2});assert.equal(sanitizeLook({accent:'#ABCDEF'}).accent,'#abcdef');});
test('contrast ratio and text colour on accent',()=>{assert.equal(contrastRatio('#000000','#ffffff'),21);assert.equal(textOnAccent('#ffff00'),'#101014');assert.equal(textOnAccent('#1e1b4b'),'#ffffff');});
