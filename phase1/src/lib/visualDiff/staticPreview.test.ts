import test from 'node:test';
import assert from 'node:assert/strict';
import {staticPreview} from './staticPreview';
const preview = (source: string, extra = {}) => staticPreview({label: 'Before', files: {'pages/a.html': source, ...extra}}, 'pages/a.html');
test('drops scripts/handlers/frames/SVG/meta-refresh/network attributes and enforces first CSP', () => {
  const p = preview(`<meta http-equiv="refresh" content="0;https://example.com"><script>evil()</script><img src="https://example.com/x" onerror="evil()"><iframe srcdoc="evil"></iframe><svg><script>evil()</script></svg><form action="https://example.com"><input></form><a href="javascript:evil()">safe</a><style>@import 'https://example.com/a.css'; div{background:url(https://example.com/b)}</style><div onclick="evil()" style="color:red">kept</div>`);
  assert.ok(p.available);
  assert.doesNotMatch(p.html, /<script|<iframe|<svg|<form|onerror|onclick|srcdoc|javascript:|http-equiv="refresh"/i);
  assert.match(p.html, /<head><meta http-equiv="Content-Security-Policy"/);
  assert.match(p.html, /connect-src 'none'/);
  assert.match(p.html, /img-src 'none'/);
  assert.match(p.html, /color:red/);
  assert.ok(p.warnings.length);
});
test('inlines only supplied relative CSS, handles nested paths and closing style injection', () => {
  const p = preview('<link rel="stylesheet" href="../styles/main.css"><div class="test">hello</div>', {'styles/main.css': '.test{color:red} </style><script>bad()</script>'});
  assert.match(p.html, /color:red/);
  assert.doesNotMatch(p.html, /<script>/);
  assert.match(p.html, /\\3c \/style/);
  assert.ok(preview('<link rel="stylesheet" href="../../escape.css">').warnings.some(w => /unavailable/.test(w)));
});
test('limits are explicit; incomplete, missing and non-HTML do not fabricate a render', () => {
  assert.equal(staticPreview({label: 'After', files: {}}, 'a.html').available, false);
  assert.equal(staticPreview({label: 'After', files: {'a.html': '<p>partial</p>'}, incomplete: true}, 'a.html').available, false);
  assert.equal(staticPreview({label: 'After', files: {'a.css': 'a{}'}}, 'a.css').available, false);
  assert.equal(preview('x'.repeat(1024 * 1024 + 1)).available, false);
  assert.equal(preview('ü'.repeat(600000)).available, false);
  assert.equal(staticPreview({label: 'After', files: Object.create({'a.html': 'secret'})}, 'a.html').available, false);
});
