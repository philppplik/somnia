import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeLook,contrastRatio,textOnAccent,DEFAULT_LOOK} from './look';
test('sanitize clamps and rejects bad values',()=>{const l=sanitizeLook({accent:'red',uiScale:500,editorFont:'x',lineHeight:0.1,density:'huge'});assert.deepEqual(l,{...DEFAULT_LOOK,uiScale:130,lineHeight:1.2});assert.equal(sanitizeLook({accent:'#ABCDEF'}).accent,'#abcdef');});
test('contrast ratio and text colour on accent',()=>{assert.equal(contrastRatio('#000000','#ffffff'),21);assert.equal(textOnAccent('#ffff00'),'#101014');assert.equal(textOnAccent('#1e1b4b'),'#ffffff');});

test('glass and outer radius clamp to integer slider bounds',()=>{
 assert.deepEqual(sanitizeLook(null),DEFAULT_LOOK);
 const l=sanitizeLook({glassBlur:99,glassPanels:false,outerRadius:-4});
 assert.equal(l.glassBlur,40);assert.equal(l.glassPanels,false);assert.equal(l.outerRadius,0);
 assert.equal(sanitizeLook({glassBlur:0,outerRadius:0}).glassBlur,0);
 assert.equal(sanitizeLook({glassBlur:NaN,outerRadius:Infinity,glassPanels:'false'}).glassBlur,24);
 assert.equal(sanitizeLook({outerRadius:Infinity}).outerRadius,25);
 assert.equal(sanitizeLook({glassBlur:4.8,outerRadius:17.3}).glassBlur,5);
 assert.equal(sanitizeLook({outerRadius:17.3}).outerRadius,17);
 assert.equal(sanitizeLook({glassPanels:'false'}).glassPanels,true);
});
