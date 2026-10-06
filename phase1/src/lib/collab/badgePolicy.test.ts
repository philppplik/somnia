import test from 'node:test';import assert from 'node:assert/strict';
import {badgeOpacity,tokenFor,initialOf,PERSON_LIGHT,PERSON_DARK} from './badgePolicy';
import {contrastRatio} from '../look';
test('badge activity timeout, hover, always / never and initials',()=>{assert.equal(badgeOpacity('activity',3999),1);assert.equal(badgeOpacity('activity',4000),0);assert.equal(badgeOpacity('activity',9000,true),1);assert.equal(badgeOpacity('always',9000),.55);assert.equal(badgeOpacity('never',0,true),0);assert.equal(initialOf('Mara'),'M');assert.equal(tokenFor('same'),tokenFor('same'));assert.notEqual(tokenFor('p1'),tokenFor('p2'));});
test('all eight person colours satisfy 4.5:1 badge text contrast',()=>{for(const c of PERSON_LIGHT)assert.ok(contrastRatio(c,'#FFFFFF')>=4.5,c);for(const c of PERSON_DARK)assert.ok(contrastRatio(c,'#0B0C10')>=4.5,c);});
