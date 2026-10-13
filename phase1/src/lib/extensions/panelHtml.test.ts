import {test} from 'node:test';
import assert from 'node:assert/strict';
import {panelSrcdoc,panelDocument,panelUrl,isPanelUrl,PANEL_CSP} from './panelHtml';
test('panel CSP forbids network, forms and base changes',()=>{
  for(const d of ["default-src 'none'","script-src 'unsafe-inline'","form-action 'none'","base-uri 'none'"])assert.ok(PANEL_CSP.includes(d));
  const d=panelSrcdoc('<p>x</p>','tok');
  assert.match(d,/Content-Security-Policy/);assert.match(d,/form-action 'none'/);assert.match(d,/base-uri 'none'/);
});
test('native document carries no meta CSP (header) and reads the token from the fragment',()=>{
  const d=panelDocument('<p>x</p>');assert.ok(!d.includes('Content-Security-Policy'));assert.match(d,/location\.hash/);
});
test('bridge keeps the window.somnia API and never uses allow-same-origin features',()=>{
  const d=panelDocument('');
  for(const m of ['project.listFiles','project.readFile','selection.get','storage.get','storage.set','ui.notify'])assert.ok(d.includes(m));
  assert.ok(!d.includes("parent.postMessage({type:'api.call'"));
});
test('panel url follows the somnia-ext contract and encodes ids',()=>{
  const u=panelUrl('acme.hello','side','t0k');assert.equal(u,'somnia-ext://panel/acme.hello/side#t0k');assert.ok(isPanelUrl(u));
  assert.ok(!isPanelUrl('https://evil.example/'));assert.ok(!isPanelUrl('somnia-ext://panel/a/b/c'));
  assert.ok(!panelUrl('a/../b','x','t').includes('a/../b'));
});
import {DARK_PANEL_THEME,LIGHT_PANEL_THEME} from './panelHtml';
test('panel document declares the app colour scheme so a dark app never gets an opaque white frame',()=>{
  const d=panelDocument('<p>x</p>',null,DARK_PANEL_THEME);
  assert.match(d,/<meta name="color-scheme" content="dark">/);assert.match(d,/color-scheme:dark/);assert.match(d,/background:transparent/);assert.match(d,/color:#fafafa/);
  assert.match(panelDocument('',null,LIGHT_PANEL_THEME),/color-scheme:light/);
});

test('panel surface tokens and controls stay readable in both schemes',()=>{
 const dark=panelDocument('',null,DARK_PANEL_THEME);
 assert.match(dark,/--bg-panel:#1a1a20/);assert.match(dark,/--bg-surface:#29292f/);
 const light=panelDocument('',null,LIGHT_PANEL_THEME);
 assert.match(light,/--bg-panel:#ffffff/);assert.match(light,/--bg-surface:#f1f2f7/);
});
