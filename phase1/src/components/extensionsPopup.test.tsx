import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {Dialog} from './ui/dialog';
import {ExtensionsPopupBody} from './extensions/ExtensionsPopup';
import {DetailView,ExtensionCard,InstalledView} from './extensions/InstalledDetail';
import {ExtensionActivityTable} from './extensions/AddBrowseActivity';
import {FIXTURE_EVENTS,FIXTURE_EXTENSIONS,fixtureHost} from '../lib/extensions/popupFixtures';

const host=fixtureHost();const noop=()=>{};
const count=(html:string,needle:string)=>html.split(needle).length-1;

test('shell renders the network notice exactly once, with nav semantics and a labelled dialog title',()=>{
 const html=renderToStaticMarkup(<Dialog open><ExtensionsPopupBody host={host} onClose={noop}/></Dialog>);
 assert.equal(count(html,'role="note"'),1);assert.equal(count(html,'Extensions can use the network. Install only what you trust.'),1);
 assert.match(html,/role="tablist"/);assert.match(html,/aria-selected="true"/);
});
test('card: switch is a sibling of the open button, not nested, and has a named switch',()=>{
 const html=renderToStaticMarkup(<ul><ExtensionCard ext={FIXTURE_EXTENSIONS[1]} host={host} onOpen={noop} onOverflow={noop} onChanged={noop}/></ul>);
 assert.match(html,/role="switch"[^>]*aria-label="Disable Tidy HTML"|aria-label="Disable Tidy HTML"[^>]*role="switch"/);
 const main=/<button[^>]*ext-card-main[^>]*>([\s\S]*?)<\/button>/.exec(html)![1];
 assert.equal(main.includes('role="switch"'),false);assert.equal(main.includes('<button'),false);
 assert.match(html,/Reads project|Edits project/);assert.match(html,/aria-label="Publisher identity confirmed by the signed index"/);
});
test('card for an extension without grants says "No sensitive access" and "No permission calls"',()=>{
 const html=renderToStaticMarkup(<ul><ExtensionCard ext={FIXTURE_EXTENSIONS[0]} host={host} onOpen={noop} onOverflow={noop} onChanged={noop}/></ul>);
 assert.match(html,/No sensitive access/);assert.match(html,/No permission calls/);assert.equal(html.includes('role="note"'),false);
});
test('installed empty and search-empty states',()=>{
 const empty=renderToStaticMarkup(<InstalledView list={[]} host={host} query="" setQuery={noop} filter="all" setFilter={noop} onOpen={noop} onBrowse={noop} onAdd={noop} onChanged={noop}/>);
 assert.match(empty,/No extensions installed/);
 const none=renderToStaticMarkup(<InstalledView list={FIXTURE_EXTENSIONS} host={host} query="zzz" setQuery={noop} filter="all" setFilter={noop} onOpen={noop} onBrowse={noop} onAdd={noop} onChanged={noop}/>);
 assert.match(none,/No matching extensions/);assert.match(none,/Clear filters/);
});
test('detail: permissions, update needs OK, signed-match only with a digest, no second notice',()=>{
 const html=renderToStaticMarkup(<DetailView ext={FIXTURE_EXTENSIONS[1]} host={host} log={{events:FIXTURE_EVENTS.slice(0,3),state:{status:'ready',events:[],nextOffset:null,total:3}}} onBack={noop} onChanged={noop} onActivity={noop} onRemoved={noop}/>);
 assert.match(html,/Read project files/);assert.match(html,/Update needs your OK/);assert.match(html,/Matches signed index entry/);assert.match(html,/Copy full hash/);
 assert.match(html,/History stays after restart/);assert.equal(html.includes('role="note"'),false);
 assert.match(html,/a41d7e…90bc/);assert.match(html,/aria-label="Full SHA-256: a41d7e0c/);
});
test('detail activity shows unreadable, not empty, on read failure',()=>{
 const html=renderToStaticMarkup(<DetailView ext={FIXTURE_EXTENSIONS[1]} host={host} log={{events:[],state:{status:'error'}}} onBack={noop} onChanged={noop} onActivity={noop} onRemoved={noop}/>);
 assert.match(html,/Activity log could not be read/);assert.equal(html.includes('No activity recorded yet'),false);
});
test('activity table: columns, newest first, expandable target is a real button',()=>{
 const html=renderToStaticMarkup(<ExtensionActivityTable events={FIXTURE_EVENTS} tz="UTC"/>);
 for(const c of ['Time','Extension','Action','Target','Result'])assert.match(html,new RegExp(`columnheader">${c}<`));
 assert.ok(html.indexOf('Edit file')<html.indexOf('Permission changed')||html.indexOf('Edit file')<html.indexOf('Enabled'));
 assert.match(html,/<button[^>]*ext-target-btn[^>]*aria-expanded="false"/);
});

// ---- locale coverage ----
const LOCALES=['en','de','es','fr','pt-BR'];
const cat=Object.fromEntries(LOCALES.map(l=>[l,JSON.parse(readFileSync(new URL(`../locales/${l}.json`,import.meta.url),'utf8')) as Record<string,string>]));
function staticKeys(){
 const dir=new URL('./extensions/',import.meta.url);const keys=new Set<string>();
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.tsx')))for(const m of readFileSync(new URL(f,dir),'utf8').matchAll(/\bt\('(ext\.[A-Za-z0-9.\-]+)'/g))keys.add(m[1]);
 for(const m of readFileSync(new URL('../lib/extensions/popupModel.ts',import.meta.url),'utf8').matchAll(/'(ext\.change\.[a-z-]+)'/g))keys.add(m[1]);
 return keys;
}
test('every static ext.* key exists in all five locales with matching placeholders',()=>{
 const dyn=[...['panels','themes','commands','snippets'].map(c=>`ext.contrib.${c}`),...['all','enabled','panels','themes','commands'].map(c=>`ext.filter.${c}`),...['all','allowed','denied','prompts','changes','network'].map(c=>`ext.chip.${c}`),...['allowed','denied','prompted','saved'].map(c=>`ext.result.${c}`),
  ...['project.read','project.write','clipboard','folders','agent'].flatMap(k=>[`ext.grant.${k}.title`,`ext.grant.${k}.desc`]),'ext.grant.network.desc',
  ...['network.request','folder.access','clipboard.read','agent.request','lifecycle.enable','lifecycle.disable','consent.change','project.read','project.write'].map(a=>`ext.api.${a}`),
  ...['project','network','fs','secret','inject','activation','proposal','clipboard','agent','tier','runtime','identity','workspace-capabilities','other'].map(c=>`ext.change.${c}`)];
 const keys=[...new Set([...staticKeys(),...dyn])];assert.ok(keys.length>150);
 const ph=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
 for(const k of keys){assert.ok(k in cat.en,`en missing ${k}`);for(const l of LOCALES){assert.ok(cat[l][k]!==undefined&&cat[l][k]!=='',`${l} missing ${k}`);assert.equal(ph(cat[l][k]),ph(cat.en[k]),`${l} placeholders ${k}`);}}
});
test('no em dashes or old WebSocket-to-any-host wording in the popup strings',()=>{
 for(const l of LOCALES)for(const [k,v] of Object.entries(cat[l]))if(k.startsWith('ext.')){assert.equal(v.includes('\u2014'),false,`${l} ${k}`);assert.equal(/websocket/i.test(v),false,`${l} ${k}`);}
});
