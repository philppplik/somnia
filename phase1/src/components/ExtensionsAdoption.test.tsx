import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExtensionCard,InstalledView} from './extensions/InstalledDetail';
import {StoreBadge,TabList} from './extensions/StoreParts';
import {FIXTURE_EXTENSIONS,fixtureHost} from '../lib/extensions/popupFixtures';

const host=fixtureHost();const noop=()=>{};

test('extension card keeps its open/switch structure through native control primitives',()=>{
 const html=renderToStaticMarkup(<ul><ExtensionCard ext={FIXTURE_EXTENSIONS[1]} host={host} onOpen={noop} onOverflow={noop} onChanged={noop}/></ul>);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*class="ext-card-main"/);
 assert.match(html,/role="switch"[^>]*aria-label="Disable Tidy HTML"/);
 assert.match(html,/aria-label="Open Tidy HTML"/);
});

test('installed toolbar search and chips keep labels and pressed state',()=>{
 const html=renderToStaticMarkup(<InstalledView list={FIXTURE_EXTENSIONS} host={host} query="" setQuery={noop} filter="enabled" setFilter={noop} onOpen={noop} onBrowse={noop} onAdd={noop} onChanged={noop}/>);
 assert.match(html,/<input[^>]*data-slot="native-input"[^>]*type="search"/);
 assert.match(html,/aria-label="Search installed extensions"/);
 assert.match(html,/<button[^>]*aria-pressed="true"[^>]*class="ext-chip"/);
});

test('store tabs keep roving focus tab semantics through the primitive',()=>{
 const html=renderToStaticMarkup(<TabList idPrefix="store-report" label="Report" value="public" onChange={noop} tabs={[{id:'private',label:'Private'},{id:'public',label:'Public'}]}/>);
 const tabs=html.match(/<button[^>]*role="tab"[^>]*>/g)??[];
 assert.equal(tabs.length,2);
 assert.match(tabs[0],/tabindex="-1"/);assert.match(tabs[1],/tabindex="0"/);
 assert.match(tabs[1],/aria-selected="true"/);
 assert.match(html,/data-slot="native-button"/);
});

test('verified badge keeps its named icon-only button and stop-propagation source',()=>{
 const html=renderToStaticMarkup(<StoreBadge onExplain={noop}/>);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*class="store-badge"/);
 assert.match(html,/aria-label="Verified publisher"/);
 const source=readFileSync(new URL('./extensions/StoreParts.tsx',import.meta.url),'utf8');
 assert.match(source,/stopPropagation/);
});

test('no raw form controls remain anywhere in the extensions area',()=>{
 const dir=new URL('./extensions/',import.meta.url);
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.tsx'))) {
  const source=readFileSync(new URL(f,dir),'utf8');
  assert.doesNotMatch(source,/<(button|input|select|textarea)\b/,f);
 }
});
