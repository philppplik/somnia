#!/usr/bin/env node
// Packages the headless `somnia` CLI (phase1/cli) for GitHub Releases.
//
//   node scripts/package-cli.mjs build [--version V] [--out DIR] [--skip-build]
//       Bundles the agent engine sidecar (`npm run build:cli-engine`, needs `npm ci`), builds cli/ in release
//       mode and writes somnia-cli-<ver>-<os>-<x86_64|aarch64>.(tar.gz|zip)
//       plus a matching .sha256 file into DIR (default: cli-dist).
//   node scripts/package-cli.mjs sums DIR
//       Writes DIR/SHA256SUMS for every somnia-cli-* archive in DIR (sha256sum -c compatible).
//
// Archive layout: <name>/somnia(.exe), <name>/sidecar/engine.mjs (the binary finds it next to itself), docs.
// Linux and Windows x86_64 and aarch64. macOS is not shipped (alpha runs skip it by policy).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const phase1 = resolve(here, '..');
const cliDir = join(phase1, 'cli');

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

export function assertVersion(v) {
  if (typeof v !== 'string' || !VERSION_RE.test(v)) throw new Error(`invalid release version: ${JSON.stringify(v)}`);
  return v;
}

/** Maps Node's platform/arch to the release label. Linux and Windows x86_64 and aarch64 ship. */
export function target(platform = process.platform, arch = process.arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`unsupported architecture ${arch}: only x86_64 and aarch64 are packaged`);
  const label = arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (platform === 'linux') return { os: 'linux', arch: label, ext: 'tar.gz', bin: 'somnia' };
  if (platform === 'win32') return { os: 'windows', arch: label, ext: 'zip', bin: 'somnia.exe' };
  throw new Error(`unsupported platform ${platform}: only linux and win32 are packaged`);
}

export function archiveName(version, t) {
  return `somnia-cli-${assertVersion(version)}-${t.os}-${t.arch}.${t.ext}`;
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** One `sha256sum -c` line (two spaces, text mode name). */
export function sumsLine(hex, name) {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('bad digest');
  if (/[\r\n]/.test(name)) throw new Error('bad file name');
  return `${hex}  ${name}`;
}

export function isCliArchive(name) {
  return /^somnia-cli-\d+\.\d+\.\d+[0-9A-Za-z.-]*-(linux|windows)-(x86_64|aarch64)\.(tar\.gz|zip)$/.test(name);
}

export function installNotes(version, t) {
  const archive = archiveName(version, t);
  const lines = [
    `Somnia CLI ${version} (${t.os} ${t.arch})`,
    '',
    'Install',
    ...(t.os === 'windows'
      ? [
          '  1. Extract the zip, for example to C:\\Tools\\somnia-cli.',
          '  2. Add that folder to your PATH, or run somnia.exe by full path.',
          '  3. Check: somnia --version',
          '',
          'Keep the sidecar folder next to somnia.exe: it holds the agent engine.',
        ]
      : [
          `  1. tar -xzf ${archive}`,
          `  2. mkdir -p ~/.local/share ~/.local/bin && mv ${archive.replace(/\.tar\.gz$/, '')} ~/.local/share/somnia-cli`,
          '  3. ln -sf ~/.local/share/somnia-cli/somnia ~/.local/bin/somnia',
          '  4. Check: somnia --version',
          '',
          'Keep the sidecar folder next to the somnia binary: it holds the agent engine.',
          'The symlink is fine, the binary resolves its real location.',
        ]),
    '',
    'Verify the download',
    '  Compare the archive with the matching line in SHA256SUMS from the same release.',
    ...(t.os === 'windows'
      ? ['  PowerShell: Get-FileHash .\\' + archive + ' -Algorithm SHA256']
      : ['  sha256sum -c SHA256SUMS --ignore-missing']),
    '',
    'The binary is not code-signed (SmartScreen may warn on Windows).',
    'It needs git and node (20 or newer) on PATH; node runs the bundled agent engine. It never pushes.',
    'Docs: https://github.com/philppplik/somnia/blob/main/phase1/cli/README.md',
    '',
  ];
  return lines.join(t.os === 'windows' ? '\r\n' : '\n');
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`);
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
  return v;
}

function gitShort() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 9);
  const r = spawnSync('git', ['rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8', cwd: phase1 });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

export function build(argv) {
  const pkg = JSON.parse(readFileSync(join(phase1, 'package.json'), 'utf8'));
  const version = assertVersion(argValue(argv, '--version') ?? pkg.somniaRelease);
  const out = resolve(argValue(argv, '--out') ?? join(phase1, 'cli-dist'));
  const t = target();
  const engine = join(cliDir, 'sidecar', 'engine.mjs');
  if (!argv.includes('--skip-build')) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:cli-engine'], { cwd: phase1, shell: process.platform === 'win32' });
    run('cargo', ['build', '--release', '--locked'], {
      cwd: cliDir,
      env: { ...process.env, SOMNIA_RELEASE: version, SOMNIA_COMMIT: gitShort() },
    });
  }
  const bin = join(cliDir, 'target', 'release', t.bin);
  if (!existsSync(bin)) throw new Error(`missing binary ${bin}`);

  const stageName = archiveName(version, t).replace(/\.(tar\.gz|zip)$/, '');
  const stageRoot = join(out, '.stage');
  const stage = join(stageRoot, stageName);
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  if (!existsSync(engine)) throw new Error(`missing agent engine ${engine} (run npm run build:cli-engine)`);
  copyFileSync(bin, join(stage, t.bin));
  mkdirSync(join(stage, 'sidecar'), { recursive: true });
  copyFileSync(engine, join(stage, 'sidecar', 'engine.mjs'));
  copyFileSync(join(cliDir, 'README.md'), join(stage, 'README.md'));
  copyFileSync(join(phase1, '..', 'LICENSE'), join(stage, 'LICENSE'));
  writeFileSync(join(stage, 'INSTALL.txt'), installNotes(version, t));

  mkdirSync(out, { recursive: true });
  const archive = join(out, archiveName(version, t));
  rmSync(archive, { force: true });
  // GNU tar on Linux; bsdtar on Windows runners writes zip with -a.
  if (t.ext === 'tar.gz') run('tar', ['-czf', archive, '-C', stageRoot, stageName]);
  else run('tar', ['-a', '-cf', archive, '-C', stageRoot, stageName]);
  rmSync(stageRoot, { recursive: true, force: true });

  const line = sumsLine(sha256Hex(readFileSync(archive)), archiveName(version, t));
  writeFileSync(`${archive}.sha256`, line + '\n');
  console.log(line);
  return archive;
}

export function sums(dir) {
  const d = resolve(dir);
  const names = readdirSync(d).filter(isCliArchive).sort();
  if (names.length === 0) throw new Error(`no somnia-cli archives in ${d}`);
  const lines = names.map((n) => sumsLine(sha256Hex(readFileSync(join(d, n))), n));
  writeFileSync(join(d, 'SHA256SUMS'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  return lines;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'build') build(rest);
    else if (cmd === 'sums' && rest[0]) sums(rest[0]);
    else {
      console.error('usage: package-cli.mjs build [--version V] [--out DIR] [--skip-build] | sums DIR');
      process.exit(2);
    }
  } catch (e) {
    console.error(`package-cli: ${e.message}`);
    process.exit(1);
  }
}
