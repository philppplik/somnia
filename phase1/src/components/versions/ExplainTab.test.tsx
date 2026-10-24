import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExplainTab} from './ExplainTab';
import {SafetyBrowser} from './SafetyBrowser';
import {SafetyController} from '../../lib/git/refs/safety';
import {createFakeRefs} from '../../lib/git/refs/fakeRefs';
import {createFakeBackend} from './fakeBackend';
import {CATALOGUES} from '../../lib/i18n';
test('explain and safety render labelled shells without effects', () => {
  const git = createFakeBackend(), refs = createFakeRefs({a: {}, b: {}});
  assert.match(renderToStaticMarkup(<ExplainTab backend={git} refs={refs}/>), /data-testid="versions-explain"/);
  assert.match(renderToStaticMarkup(<SafetyBrowser controller={new SafetyController(git, refs, () => false)} onRestored={async () => {}}/>), /aria-label="Safety copies"/);
});
test('new keys exist in every locale, with matching placeholders and no em dashes', () => {
  const keys = Object.keys(CATALOGUES.en).filter(k => /^versions\.(explain|compareRefs|safety|tab\.explain)/.test(k));
  assert.ok(keys.length > 60);
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  for (const [loc, c] of Object.entries(CATALOGUES)) for (const k of keys) {
    assert.ok(c[k], `${loc} ${k}`); assert.equal(ph(c[k]), ph(CATALOGUES.en[k]), `${loc} ${k}`); assert.ok(!c[k].includes('\u2014'), `${loc} ${k}`);
  }
});
