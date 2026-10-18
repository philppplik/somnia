import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain ESM scripts without declarations
import { armRelease, cliMatrix } from '../../scripts/release-platforms.mjs';
// @ts-expect-error plain ESM scripts without declarations
import { verifyArm64 } from '../../scripts/verify-native-arch.mjs';
test('ARM release gate starts at beta.4, excludes alphas and older core versions', () => {
  for (const version of ['12.0.1', '12.1.5', '12.2.0-beta.1', '12.2.0-beta.3', '12.2.0-alpha.99', '13.0.0-alpha.1']) assert.equal(armRelease(version), false, version);
  for (const version of ['12.2.0-beta.4', '12.2.0-beta.10', '12.2.0-rc.1', '12.2.0', '12.2.1', '13.0.0-beta.1']) assert.equal(armRelease(version), true, version);
  for (const version of ['../x', 'v12.2.0', '', '12.2.0-nightly.1']) assert.throws(() => armRelease(version));
});
test('dev matrix stays two jobs, release matrix only uses standard free runners', () => {
  assert.deepEqual(cliMatrix(false), { include: [{os: 'ubuntu-24.04', arch: 'x64'}, {os: 'windows-latest', arch: 'x64'}] });
  assert.deepEqual(cliMatrix(true).include.slice(2), [{os: 'ubuntu-24.04-arm', arch: 'arm64'}, {os: 'windows-11-arm', arch: 'arm64'}]);
});
test('binary-header checks reject emulated x64 binaries and malformed files', () => {
  // Deliberate header fixtures test parsing only, not native app execution.
  const pe = Buffer.alloc(128); pe.write('MZ'); pe.writeUInt32LE(64, 0x3c); pe.write('PE\0\0', 64); pe.writeUInt16LE(0xaa64, 68);
  verifyArm64('windows', pe);
  pe.writeUInt16LE(0x8664, 68); assert.throws(() => verifyArm64('windows', pe), /not ARM64/);
  pe.writeUInt32LE(0xffffffff, 0x3c); assert.throws(() => verifyArm64('windows', pe), /invalid PE/);
  const elf = Buffer.alloc(64); Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(elf); elf.writeUInt16LE(183, 18);
  verifyArm64('linux', elf);
  elf.writeUInt16LE(62, 18); assert.throws(() => verifyArm64('linux', elf), /not AArch64/);
  elf[5] = 2; assert.throws(() => verifyArm64('linux', elf), /little-endian/);
  for (const platform of ['linux', 'windows', 'macos']) assert.throws(() => verifyArm64(platform, Buffer.alloc(0)));
});
test('workflow wires explicit ARM targets, architecture-specific uploads and public guards', () => {
  const yml = readFileSync(new URL('../../../.github/workflows/phase1-core-bootstrap.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const job of ['windows-arm', 'linux-arm']) {
    const block = yml.split(`  ${job}:\n`)[1].split(/\n  [a-z][\w-]*:\n/)[0];
    assert.match(block, /needs: release-plan/);
    assert.match(block, /needs\.release-plan\.outputs\.arm == 'true'/);
    assert.match(block, /verify-native-arch\.mjs/);
    assert.match(block, /if-no-files-found: error/);
  }
  assert.match(yml, /--target aarch64-pc-windows-msvc --bundles nsis,msi/);
  assert.match(yml, /--target aarch64-unknown-linux-gnu --bundles deb\n/);
  assert.match(yml, /name: somnia-cli-\$\{\{ runner.os \}\}-\$\{\{ matrix.arch \}\}/);
  assert.match(yml, /github.event.repository.visibility == 'public'/);
});
