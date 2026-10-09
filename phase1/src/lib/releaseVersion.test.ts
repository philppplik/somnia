import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const release = JSON.parse(readFileSync('package.json', 'utf8')).somniaRelease as string;

test('somniaRelease is a x.y.z[-suffix] string and not the stale 11.2.0', () => {
  assert.match(release, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
  assert.ok(!release.startsWith('11.2.'), `stale release ${release}`);
});
test('sync-version writes the numeric release into the Tauri config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'somnia-ver-'));
  mkdirSync(join(dir, 'src-tauri')); mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ somniaRelease: release }));
  writeFileSync(join(dir, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.1.0' }));
  copyFileSync('scripts/sync-version.mjs', join(dir, 'scripts/sync-version.mjs'));
  execFileSync('node', ['scripts/sync-version.mjs'], { cwd: dir });
  const v = JSON.parse(readFileSync(join(dir, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  assert.equal(v, release.split('-')[0]);
});
