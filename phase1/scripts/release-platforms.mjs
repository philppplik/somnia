// Release selection is evaluated from the checked-out commit, never user-supplied shell text.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function armRelease(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(version);
  if (!m) throw new Error(`unsupported release version: ${version}`);
  const core = m.slice(1, 4).map(Number);
  if (core[0] < 12 || (core[0] === 12 && core[1] < 2)) return false;
  if (m[4] === 'alpha') return false;
  if (core[0] === 12 && core[1] === 2 && core[2] === 0 && m[4] === 'beta') return Number(m[5]) >= 4;
  return true;
}
export function cliMatrix(arm) {
  return { include: [
    { os: 'ubuntu-24.04', arch: 'x64' },
    { os: 'windows-latest', arch: 'x64' },
    ...(arm ? [
      { os: 'ubuntu-24.04-arm', arch: 'arm64' },
      { os: 'windows-11-arm', arch: 'arm64' },
    ] : []),
  ] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).somniaRelease;
  const enabled = armRelease(version) && process.argv.includes('--full');
  console.log(`arm=${enabled}`);
  console.log(`cli-matrix=${JSON.stringify(cliMatrix(enabled))}`);
}
