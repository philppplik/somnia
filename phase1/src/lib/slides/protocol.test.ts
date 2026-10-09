import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPptx,MAX_PPTX_BYTES} from './protocol';
import {slidesStudio} from '../studios/slides';
test('PPTX intake rejects wrong formats and compressed input cap',()=>{assert.doesNotThrow(()=>assertPptx({name:'DECK.PPTX',size:100}));assert.throws(()=>assertPptx({name:'deck.ppt',size:100}),/pptx/);assert.throws(()=>assertPptx({name:'deck.pptx',size:MAX_PPTX_BYTES+1}),/cap/);});
test('Slides only advertises its implemented module-only tool surface',()=>{assert.deepEqual(slidesStudio.formats,[{ext:'pptx',priority:100}]);assert.equal(slidesStudio.canvas,'slides.canvas');assert.deepEqual(slidesStudio.agent.tools,['deck_inspect','deck_propose_changes']);assert.deepEqual(slidesStudio.commands,[]);});
