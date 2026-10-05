import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEntities,decodeEntities} from './entities';
test('encode escapes markup characters and non-ASCII',()=>{assert.equal(encodeEntities('<a href="x">Tom & Jerry\'s café €</a>'),'&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s caf&#233; &#8364;&lt;/a&gt;');});
test('decode handles named, decimal and hex references and leaves unknown ones',()=>{assert.equal(decodeEntities('&lt;p&gt;caf&eacute; &#8364; &#x20AC; &amp;amp; &unknown; &#0;'),'<p>café € € &amp; &unknown; &#0;');});
test('round trip',()=>{const s='Größe <b>fett</b> & "zitat" – 😀';assert.equal(decodeEntities(encodeEntities(s)),s);});
test('decode covers the full HTML named table, not only common names',()=>{assert.equal(decodeEntities('&aring;&Aring;&iacute;&oslash;&Scaron;&hearts;&frac12;&euro;'),'åÅíøŠ♥½€');});
test('decode keeps unknown and unterminated names',()=>{assert.equal(decodeEntities('&auml &nosuchentity; AT&T'),'&auml &nosuchentity; AT&T');});
