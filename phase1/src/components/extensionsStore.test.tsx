import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExtensionsPopupBody} from './extensions/ExtensionsPopup';
import {Dialog} from './ui/dialog';
import {StoreBadge,PermissionRowItem,EvidenceList} from './extensions/StoreParts';
import {fixtureHost,FIXTURE_EXTENSIONS} from '../lib/extensions/popupFixtures';
import {FIXTURE_NOW,POLICY,fixtureCatalog,fixtureEvidence,fixtureStoreHost} from '../lib/extensions/storeFixtures';
import {accessRows,evidenceRows} from '../lib/extensions/storeView';

const noop=()=>{};
test('verified badge is a named button, never colour only',()=>{
 const html=renderToStaticMarkup(<StoreBadge onExplain={noop}/>);
 assert.match(html,/<button[^>]*aria-label="Verified publisher"/);assert.match(html,/role="img"/);
});
test('permission row renders the reviewed sentence and the exact host, not a raw id',()=>{
 const rel=fixtureCatalog().extensions.find(e=>e.id==='margot-weiss.ftp-deploy')!.releases[0];
 const html=renderToStaticMarkup(<ul>{accessRows(rel).map(r=><PermissionRowItem key={r.id} row={r}/>)}</ul>);
 assert.match(html,/Connect to one server: sftp\.example-host\.com/);assert.match(html,/Store one password in your system keyring/);assert.equal(/secrets|project\.read/.test(html),false);
});
test('evidence list carries text chips for every status',()=>{
 const rel=fixtureCatalog().extensions[0].releases[0];
 const html=renderToStaticMarkup(<EvidenceList rows={evidenceRows(rel,fixtureEvidence(rel,{missing:true}),POLICY,FIXTURE_NOW,null)} now={FIXTURE_NOW} lastTrustedCheck={null} hasEvidence={false}/>);
 assert.match(html,/Not run/);assert.match(html,/Your app has not checked yet/);assert.equal(html.includes('store-chip-ok'),false);
});
test('popup without a store host keeps the legacy browse list; with one it renders the Store heading path',()=>{
 const legacy=renderToStaticMarkup(<Dialog open><ExtensionsPopupBody host={fixtureHost()} onClose={noop} initial="browse"/></Dialog>);
 assert.equal(legacy.includes('store-view'),false);
 const host={...fixtureHost({list:async()=>FIXTURE_EXTENSIONS}),store:fixtureStoreHost()};
 const html=renderToStaticMarkup(<Dialog open><ExtensionsPopupBody host={host} onClose={noop} initial="browse"/></Dialog>);
 assert.match(html,/Store/);
});
