import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SoundProposalReview} from './SoundProposalReview';
import {DEFAULT_SETTINGS} from '../../lib/sound/recipe';
import {serializeSound} from '../../lib/agent/soundStudio';
test('review lists each change; invalid and no-op proposals say so and disable preview',()=>{
 const a=serializeSound(DEFAULT_SETTINGS),b=serializeSound({...DEFAULT_SETTINGS,pitch:3,reverse:true});
 const html=renderToStaticMarkup(<SoundProposalReview name="a.mp3" beforeText={a} afterText={b}/>);
 assert.match(html,/data-testid="sound-review-pitch"/);assert.match(html,/0 st → 3 st/);assert.match(html,/data-testid="sound-review-reverse"/);assert.ok(!/sound-review-trim/.test(html));
 const same=renderToStaticMarkup(<SoundProposalReview name="a.mp3" beforeText={a} afterText={a}/>);assert.match(same,/disabled/);
 const bad=renderToStaticMarkup(<SoundProposalReview name="a.mp3" beforeText={a} afterText="{}x"/>);assert.match(bad,/role="alert"/);assert.match(bad,/disabled/);
});
