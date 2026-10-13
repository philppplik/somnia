import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error plain ESM script without declarations
import { assemble, verifyRun } from '../../../docs/release-tools/assemble-assets.mjs';
// @ts-expect-error plain ESM script without declarations
import { sha256Hex } from '../../scripts/package-cli.mjs';
function fixture(version = '12.2.0-beta.4', arm = true, macosCli = false) {
  const root = mkdtempSync(join(tmpdir(), 'somnia-assets-'));
  const entries = {
    'windows-alpha': ['nsis/Somnia_12.2.0_x64-setup.exe', 'nsis/Somnia_12.2.0_x64-setup.exe.sig', 'msi/Somnia_12.2.0_x64_en-US.msi'],
    'linux-alpha': ['src-tauri/target/release/bundle/deb/somnia_12.2.0_amd64.deb', 'src-tauri/target/release/bundle/appimage/somnia_12.2.0_amd64.AppImage'],
    'macos-alpha': ['dmg/Somnia_12.2.0_aarch64.dmg', 'macos-verification.txt'],
    'windows-arm64-alpha': arm ? ['nsis/Somnia_12.2.0_arm64-setup.exe', 'msi/Somnia_12.2.0_arm64_en-US.msi'] : [],
    'linux-arm64-alpha': arm ? ['somnia_12.2.0_arm64.deb'] : [],
    cli: ['linux-x86_64.tar.gz', 'windows-x86_64.zip', ...(arm ? ['linux-aarch64.tar.gz', 'windows-aarch64.zip'] : []), ...(macosCli ? ['macos-aarch64.tar.gz'] : [])].map(s => `somnia-cli-${version}-${s}`),
  };
  for (const [kind, names] of Object.entries(entries)) {
    mkdirSync(join(root, kind), { recursive: true });
    for (const name of names) { const p = join(root, kind, name); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, 'fixture:' + name); }
  }
  return root;
}
test('release assembly includes the optional macOS CLI archive when present', () => {
  const root = fixture('12.2.0-beta.4', true, true);
  try {
    const out = join(root, 'out'); const names = assemble('12.2.0-beta.4', root, out);
    assert.ok(names.includes('somnia-cli-12.2.0-beta.4-macos-aarch64.tar.gz'));
    const lines = readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    assert.ok(lines.some(l => l.endsWith('  somnia-cli-12.2.0-beta.4-macos-aarch64.tar.gz')));
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('release assembly preserves x64, adds ARM files and checksums, retains signature pairing', () => {
  const root = fixture();
  try {
    const out = join(root, 'out'); const names = assemble('12.2.0-beta.4', root, out);
    assert.equal(names.length, 14); // 9 desktop/evidence files + 1 signature + 4 CLI archives
    assert.equal(names.filter((n: string) => n.endsWith('.deb')).length, 2);
    assert.ok(names.includes('Somnia-v12.2.0-beta.4-arm64.msi'));
    assert.equal(names.filter((n: string) => /arm64.*AppImage/.test(n)).length, 0);
    assert.ok(names.includes('Somnia-v12.2.0-beta.4-x64-setup.exe.sig'));
    const lines = readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 12);
    for (const line of lines) { const [digest, name] = line.split('  '); assert.equal(digest, sha256Hex(readFileSync(join(out, name)))); }
    assert.throws(() => assemble('12.2.0-beta.4', root, out), /empty/);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test('beta.3 remains x64-only and does not require updater archive or ARM artifacts', () => {
  const root = fixture('12.2.0-beta.3', false);
  try { const names = assemble('12.2.0-beta.3', root, join(root, 'out')); assert.equal(names.filter((n: string) => n.includes('arm64')).length, 0); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('missing, duplicate and wrong-version files fail closed', () => {
  for (const fault of ['missing', 'duplicate', 'version']) {
    const root = fixture();
    try {
      if (fault === 'missing') rmSync(join(root, 'linux-arm64-alpha/somnia_12.2.0_arm64.deb'));
      if (fault === 'duplicate') writeFileSync(join(root, 'windows-arm64-alpha/duplicate_arm64-setup.exe'), 'duplicate');
      if (fault === 'version') rmSync(join(root, 'cli/somnia-cli-12.2.0-beta.4-linux-aarch64.tar.gz'));
      assert.throws(() => assemble('12.2.0-beta.4', root, join(root, 'out')));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
test('run verifier rejects failed, skipped ARM, unrelated workflow and wrong-SHA runs', () => {
  const run = { head_sha: 'abc', status: 'completed', conclusion: 'success', path: '.github/workflows/phase1-core-bootstrap.yml' };
  const jobs = ['frontend','native','windows','macos','cli-checksums','windows-arm','linux-arm'].map(name => ({name, conclusion: 'success'}));
  verifyRun(run, jobs, 'abc', '12.2.0-beta.4');
  assert.throws(() => verifyRun(run, jobs.slice(0, -1), 'abc', '12.2.0-beta.4'), /linux-arm/);
  assert.throws(() => verifyRun({...run, conclusion: 'failure'}, jobs, 'abc', '12.2.0-beta.4'));
  assert.throws(() => verifyRun({...run, path: 'unrelated.yml'}, jobs, 'abc', '12.2.0-beta.4'));
  assert.throws(() => verifyRun(run, jobs, 'other', '12.2.0-beta.4'));
  verifyRun(run, jobs.slice(0, -2), 'abc', '12.2.0-beta.3');
});
