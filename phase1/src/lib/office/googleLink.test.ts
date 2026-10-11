import test from 'node:test';import assert from 'node:assert/strict';
import {parseGoogleLink,googleLinkMessage,googleKindOfName} from './googleLink';
test('parses .gdoc pointer',()=>{const l=parseGoogleLink('Plan.gdoc','{"url":"x","doc_id":"1AbCdEfGhIjKlMnOp","email":"a@b.c"}');
 assert.equal(l?.kind,'document');assert.equal(l?.url,'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit');assert.equal(l?.exportAs,'docx');});
test('rejects bad input',()=>{assert.equal(parseGoogleLink('a.gdoc','nope'),undefined);assert.equal(parseGoogleLink('a.gdoc','{"doc_id":"../x"}'),undefined);assert.equal(parseGoogleLink('a.docx','{"doc_id":"1AbCdEfGhIjKlMnOp"}'),undefined);});
test('kinds and message',()=>{assert.equal(googleKindOfName('x.GSHEET'),'spreadsheet');assert.match(googleLinkMessage('x.gdoc'),/Download > DOCX/);});
