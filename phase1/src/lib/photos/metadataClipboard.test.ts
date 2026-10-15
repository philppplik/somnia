import test from 'node:test';
import assert from 'node:assert/strict';
import {copyMetadata,pasteMetadata,hasMetadataClip} from './metadataClipboard.ts';
import {setRating,getRating} from './ratings.ts';
import {setFlag,getFlag} from './flags.ts';
import {setLabel,getLabel} from './labels.ts';
import {setTags,getTags} from './tags.ts';
import {setCaption,getCaption} from './captions.ts';
test('metadata clipboard: copy replaces targets on paste',()=>{
 setRating('src.png',4);setFlag('src.png','pick');setLabel('src.png','red');setTags('src.png',['lake','sunset']);setCaption('src.png','Golden hour');
 copyMetadata('src.png');
 assert.ok(hasMetadataClip());
 pasteMetadata(['a.png','b.png']);
 for(const n of['a.png','b.png']){
  assert.equal(getRating(n),4);assert.equal(getFlag(n),'pick');assert.equal(getLabel(n),'red');assert.deepEqual(getTags(n),['lake','sunset']);assert.equal(getCaption(n),'Golden hour');
 }
 // a later copy with cleared metadata replaces instead of merging
 setRating('src.png',0);setFlag('src.png',null);setLabel('src.png',null);setTags('src.png',[]);setCaption('src.png','');
 copyMetadata('src.png');
 pasteMetadata(['a.png']);
 assert.equal(getRating('a.png'),0);assert.equal(getFlag('a.png'),null);assert.equal(getLabel('a.png'),null);assert.deepEqual(getTags('a.png'),[]);assert.equal(getCaption('a.png'),'');
});
