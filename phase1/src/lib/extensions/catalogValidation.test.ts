import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCatalog, rawGithubURL, type CatalogEntry} from './catalogValidation';
import {validateCatalog as legacyValidate, rawGithubURL as legacyURL} from './catalog';
import {parseSignedCatalog, SignedCatalogError} from './signedCatalog';

const entry: CatalogEntry = {id: 'acme.palette', name: 'Palette', version: '1.0.0', author: 'Acme', description: 'Theme', repo: 'https://github.com/acme/palette', download: 'https://raw.githubusercontent.com/acme/palette/main/package.zip', sha256: 'a'.repeat(64), apiVersion: 1, permissions: ['project.read']};
const index = (entries: unknown[]) => ({schemaVersion: 1, extensions: entries});
const signed = (entries: unknown[]) => JSON.stringify({schemaVersion: 2, serial: 1, issuedAt: '2026-10-12T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z', keyId: 'k1', extensions: entries, revoked: []});

test('catalog keeps the shared schema exports compatible', () => {
  assert.equal(legacyValidate, validateCatalog);
  assert.equal(legacyURL, rawGithubURL);
});

test('shared schema normalizes reviewed and permissions without changing its input', () => {
  const input = {...entry, permissions: ['project.read', 'project.read']};
  const validated = validateCatalog(index([input]))[0];
  assert.equal(validated.reviewed, false);
  assert.deepEqual(validated.permissions, ['project.read']);
  assert.deepEqual(input.permissions, ['project.read', 'project.read']);
  assert.equal('reviewed' in input, false);
  assert.deepEqual(parseSignedCatalog(signed([input])).extensions, [validated]);
});

test('legacy and signed parsing share entry rejection rules', () => {
  for (const entries of [
    [entry, entry],
    [{...entry, permissions: ['network']}],
    [{...entry, sha256: 'bad'}],
    [{...entry, reviewed: 'true'}],
    [{...entry, reviewedBy: 'Acme'}],
    [{...entry, download: 'https://evil.example/package.zip'}],
  ]) {
    assert.throws(() => validateCatalog(index(entries)));
    assert.throws(() => parseSignedCatalog(signed(entries)), (error: unknown) => error instanceof SignedCatalogError && error.code === 'invalid');
  }
});

test('shared URL check rejects credentials and transport modifiers', () => {
  assert.equal(rawGithubURL(entry.download), true);
  for (const url of [entry.download + '?token=x', entry.download + '#hash', 'http://raw.githubusercontent.com/a/b/main/p.zip', 'https://user@raw.githubusercontent.com/a/b/main/p.zip', 'https://raw.githubusercontent.com:444/a/b/main/p.zip']) {
    assert.equal(rawGithubURL(url), false);
  }
});
