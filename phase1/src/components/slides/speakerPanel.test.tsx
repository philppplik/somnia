import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlidesSpeakerPanel} from './SlidesSpeakerPanel';
const timer={running:true,slideMs:65000,totalMs:3725000,toggle:()=>{},reset:()=>{}};
test('speaker panel shows both clocks, an honest empty notes state and the next slide',()=>{
 const html=renderToStaticMarkup(<SlidesSpeakerPanel bytes={null} slideId={undefined} next="blob:next" timer={timer}/>);
 assert.match(html,/Speaker notes/);assert.match(html,/62:05/);assert.match(html,/01:05/);assert.match(html,/No notes on this slide/);assert.match(html,/blob:next/);assert.match(html,/Pause/);
 assert.doesNotMatch(html,/coming soon/i);
});
test('speaker panel fails closed on an unreadable deck without throwing',()=>{
 const html=renderToStaticMarkup(<SlidesSpeakerPanel bytes={new Uint8Array([1,2,3])} slideId={256} next={undefined} timer={{...timer,running:false}}/>);
 assert.match(html,/Notes could not be read/);assert.match(html,/Start/);assert.doesNotMatch(html,/<img/);
});
