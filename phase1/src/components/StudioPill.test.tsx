import test from 'node:test';
import assert from 'node:assert/strict';
import {studioShortName} from './studios/studioShortName';

test('short product names include Docs and Sounds plus future design/vector studios',()=>{
 for(const [id,name] of Object.entries({code:'Code',documents:'Docs',sheets:'Sheets',slides:'Slides',sound:'Sounds',photos:'Photos',video:'Video',design:'Design',vector:'Vector'}))assert.equal(studioShortName(id,`Somnia ${id}`),name);
});
test('new studios use their translated label instead of an empty or internal ID tooltip',()=>{
 assert.equal(studioShortName('new','Somnia Animation'),'Animation');
 assert.equal(studioShortName('new','Animation'),'Animation');
});
