// Assemble files extracted from same-SHA CI artifacts. No network or publishing here.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armRelease } from '../../phase1/scripts/release-platforms.mjs';
import { assertVersion, isCliArchive, sha256Hex, sumsLine } from '../../phase1/scripts/package-cli.mjs';
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
export function assemble(version, root, out) {
  assertVersion(version);
  if (existsSync(out) && readdirSync(out).length) throw new Error('output directory must be empty');
  mkdirSync(out, { recursive: true });
  const n = `Somnia-v${version}`;
  const copied = [];
  const copy = (source, name) => { copyFileSync(source, join(out, name)); copied.push(name); };
  function select(kind, regex, name, optional = false) {
    const matches = files(join(root, kind)).filter(f => regex.test(basename(f)));
    if (!matches.length && optional) return;
    if (matches.length !== 1) throw new Error(`${kind}: expected one ${regex}, found ${matches.length}`);
    copy(matches[0], name);
    if (existsSync(matches[0] + '.sig')) copy(matches[0] + '.sig', name + '.sig');
  }
  select('windows-alpha', /_x64-setup\.exe$/, `${n}-x64-setup.exe`);
  select('windows-alpha', /_x64[^/]*\.msi$/, `${n}-x64.msi`);
  select('linux-alpha', /_amd64\.AppImage$/, `${n}-amd64.AppImage`);
  select('linux-alpha', /_amd64\.deb$/, `${n}-amd64.deb`);
  select('macos-alpha', /\.dmg$/, `${n}-macos.dmg`);
  select('macos-alpha', /\.app\.tar\.gz$/, `${n}-macos-aarch64.app.tar.gz`, true);
  select('macos-alpha', /^macos-verification\.txt$/, 'macos-verification.txt');
  if (armRelease(version)) {
    select('windows-arm64-alpha', /_arm64-setup\.exe$/, `${n}-arm64-setup.exe`);
    select('windows-arm64-alpha', /_arm64[^/]*\.msi$/, `${n}-arm64.msi`);
    select('linux-arm64-alpha', /_arm64\.deb$/, `${n}-arm64.deb`);
  }
  const cli = files(join(root, 'cli')).filter(f => isCliArchive(basename(f)));
  const expected = ['linux-x86_64.tar.gz', 'windows-x86_64.zip', ...(armRelease(version) ? ['linux-aarch64.tar.gz', 'windows-aarch64.zip'] : [])];
  for (const suffix of expected) {
    const name = `somnia-cli-${version}-${suffix}`;
    const matches = cli.filter(f => basename(f) === name);
    if (matches.length !== 1) throw new Error(`missing or duplicate CLI archive: ${name}`);
    copy(matches[0], name);
  }
  if (cli.length !== expected.length) throw new Error('unexpected CLI archives in run');
  const lines = copied.filter(name => name !== 'macos-verification.txt' && !name.endsWith('.sig')).sort().map(name => sumsLine(sha256Hex(readFileSync(join(out, name))), name));
  writeFileSync(join(out, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  return copied;
}
export function verifyRun(run, jobs, sha, version) {
  if (run.head_sha !== sha || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/phase1-core-bootstrap.yml') throw new Error('need successful validation workflow on the exact release SHA');
  const required = ['frontend', 'native', 'windows', 'macos', 'cli-checksums', ...(armRelease(version) ? ['windows-arm', 'linux-arm'] : [])];
  for (const name of required) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== 'success') throw new Error(`required job not green: ${name}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, version, ...args] = process.argv.slice(2);
  if (cmd === 'assemble') assemble(version, ...args);
  else if (cmd === 'verify') verifyRun(JSON.parse(readFileSync(args[0])), JSON.parse(readFileSync(args[1])).jobs, args[2], version);
  else throw new Error('usage: assemble-assets.mjs assemble VERSION ROOT OUT | verify VERSION RUN_JSON JOBS_JSON SHA');
}
