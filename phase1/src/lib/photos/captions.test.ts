import test from 'node:test';
import assert from 'node:assert/strict';
import {setCaption,getCaption,allCaptions,MAX_CAPTION_LENGTH} from './captions.ts';
test('captions: set, read, clear, cap',()=>{
 setCaption('a.png','Golden hour at the lake');
 assert.equal(getCaption('a.png'),'Golden hour at the lake');
 setCaption('b.png','  ');
 assert.equal(getCaption('b.png'),''); // whitespace-only clears
 setCaption('a.png','x'.repeat(MAX_CAPTION_LENGTH+50));
 assert.equal(getCaption('a.png').length,MAX_CAPTION_LENGTH);
 setCaption('a.png','');
 assert.equal(getCaption('a.png'),'');
 assert.deepEqual(Object.keys(allCaptions()),[]);
});
