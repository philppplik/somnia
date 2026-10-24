import {test} from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {FrameworkChoice} from './NewProjectDialog';
test('gallery offers React, Vue, Svelte and Solid with React preselected and a plain hint',()=>{
 const html=renderToStaticMarkup(<FrameworkChoice framework="react" onChange={()=>{}}/>);
 for(const name of ['React','Vue','Svelte','Solid'])assert.match(html,new RegExp(`data-framework="${name.toLowerCase()}"[^>]*>${name}</button>`));
 assert.match(html,/data-framework="react" aria-pressed="true"/);assert.match(html,/data-framework="vue" aria-pressed="false"/);
 assert.match(html,/data-testid="framework-hint"/);
});
