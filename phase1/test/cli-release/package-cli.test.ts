import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
// @ts-expect-error plain ESM script without types
import * as pkg from '../../scripts/package-cli.mjs';

test('archive names follow somnia-cli-<ver>-<os>-x86_64', () => {
  const lin = pkg.target('linux', 'x64');
  const win = pkg.target('win32', 'x64');
  assert.equal(pkg.archiveName('12.2.0-alpha.7', lin), 'somnia-cli-12.2.0-alpha.7-linux-x86_64.tar.gz');
  assert.equal(pkg.archiveName('12.2.0', win), 'somnia-cli-12.2.0-windows-x86_64.zip');
});

test('macOS and non-x86_64 are refused', () => {
  assert.throws(() => pkg.target('darwin', 'arm64'));
  assert.throws(() => pkg.target('linux', 'arm64'));
  assert.throws(() => pkg.target('darwin', 'x64'));
});

test('versions that could escape a path are rejected', () => {
  for (const v of ['../x', '1.2', '1.2.3/evil', '', 'v1.2.3', '1.2.3 ']) assert.throws(() => pkg.assertVersion(v), v);
  assert.equal(pkg.assertVersion('1.0.0-beta.2'), '1.0.0-beta.2');
});

test('sums lines are sha256sum compatible and validated', () => {
  const hex = pkg.sha256Hex(Buffer.from('abc'));
  assert.equal(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(pkg.sumsLine(hex, 'a.zip'), `${hex}  a.zip`);
  assert.throws(() => pkg.sumsLine('zz', 'a'));
  assert.throws(() => pkg.sumsLine(hex, 'a\nb'));
});

test('sums covers only cli archives, sorted, and writes SHA256SUMS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-sums-'));
  writeFileSync(join(dir, 'somnia-cli-1.0.0-windows-x86_64.zip'), 'w');
  writeFileSync(join(dir, 'somnia-cli-1.0.0-linux-x86_64.tar.gz'), 'l');
  writeFileSync(join(dir, 'somnia-cli-1.0.0-linux-x86_64.tar.gz.sha256'), 'x');
  writeFileSync(join(dir, 'other.zip'), 'o');
  const lines: string[] = pkg.sums(dir);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /linux-x86_64\.tar\.gz$/);
  assert.match(lines[1], /windows-x86_64\.zip$/);
  assert.equal(readFileSync(join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n').length, 2);
  assert.throws(() => pkg.sums(mkdtempSync(join(tmpdir(), 'cli-empty-'))));
});

test('install notes are honest about Windows limits and signing', () => {
  const w = pkg.installNotes('1.0.0', pkg.target('win32', 'x64'));
  assert.match(w, /not code-signed/);
  assert.match(w, /named-pipe/);
  assert.match(w, /\r\n/);
  const l = pkg.installNotes('1.0.0', pkg.target('linux', 'x64'));
  assert.match(l, /sha256sum -c/);
  assert.match(l, /somnia-cli-1\.0\.0-linux-x86_64\/somnia/);
});

test('isCliArchive', () => {
  assert.equal(pkg.isCliArchive('somnia-cli-12.2.0-alpha.7-linux-x86_64.tar.gz'), true);
  assert.equal(pkg.isCliArchive('somnia-cli-1.0.0-macos-x86_64.tar.gz'), false);
});
