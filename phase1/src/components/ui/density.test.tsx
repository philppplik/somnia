import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Button} from './button';
import {Input} from './input';
import {IconButton} from './icon-button';
import {PanelSection} from './panel';
for(const density of ['compact','normal','comfortable'] as const)test(`${density}: opt-in density is consumed as data, stable hooks and semantics`,()=>{for(const html of [renderToStaticMarkup(<Button density={density}>Action</Button>),renderToStaticMarkup(<Input density={density} aria-label="Field"/>),renderToStaticMarkup(<IconButton density={density} aria-label="Zoom"><svg/></IconButton>),renderToStaticMarkup(<PanelSection density={density} title="Properties" id="properties" open onOpenChange={()=>{}}>Body</PanelSection>)]){assert.match(html,new RegExp(`data-density="${density}"`));assert.doesNotMatch(html,/(?<!data-)density="/);assert.match(html,/data-slot=/);}assert.match(renderToStaticMarkup(<PanelSection density={density} title="Properties" id="properties" open onOpenChange={()=>{}}>Body</PanelSection>),/aria-controls="properties"/);});
test('omitted density keeps old size classes and no opt-in geometry attribute',()=>{const html=renderToStaticMarkup(<Button size="compact">Action</Button>);assert.match(html,/h-7/);assert.doesNotMatch(html,/data-density=/);});
