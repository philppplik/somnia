import {test} from 'node:test';
import assert from 'node:assert/strict';
import {panelSrcdoc} from './panelHtml';
test('panel CSP forbids forms and base changes and the host documents frame navigation',()=>{
  const d=panelSrcdoc('<p>x</p>');
  assert.match(d,/form-action 'none'/);assert.match(d,/base-uri 'none'/);assert.match(d,/default-src 'none'/);
});
