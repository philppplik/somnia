import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {StudioEmptyState} from './StudioEmptyState';
import {studioStarterCopy,type StarterStudioId} from '../../lib/studios/starterCopy';
for(const studio of Object.keys(studioStarterCopy) as StarterStudioId[])test(`${studio} starter has English copy, accessible description and both actions`,()=>{
 const html=renderToStaticMarkup(<StudioEmptyState studio={studio} icon={<svg/>} onOpen={()=>{}} onCreate={()=>{}}/>);
 assert.ok(html.includes(studioStarterCopy[studio].headline));
 assert.ok(html.includes(studioStarterCopy[studio].description));
 assert.ok(html.includes(studioStarterCopy[studio].openLabel));
 assert.match(html,/lang="en"/);assert.match(html,/aria-labelledby="[^"]+-title"/);assert.match(html,/aria-describedby="[^"]+-body"/);
 assert.ok(html.includes(`data-testid="${studio}-open"`));assert.ok(html.includes(`data-testid="${studio}-create-blank"`));
 assert.match(html,/Create blank project/);assert.doesNotMatch(html,/coming soon/i);
});
test('extra actions and existing test hooks are preserved',()=>{
 const html=renderToStaticMarkup(<StudioEmptyState studio="code" icon={<svg/>} testId="existing-hook" onOpen={()=>{}} onCreate={()=>{}} extraActions={<button>Open folder</button>}/>);
 assert.match(html,/existing-hook/);assert.match(html,/Open folder/);
});
