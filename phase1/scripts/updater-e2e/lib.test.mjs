import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {compareSemver,validateManifest,pickPlatform} from './lib.mjs';
const good={version:'9.19.0',pub_date:'2026-10-05T12:00:00Z',platforms:{'windows-x86_64':{signature:'s',url:'https://github.com/philppplik/somnia/releases/download/v9.19.0/Somnia-v9.19.0-x64-setup.exe'}}};
test('semver compare',()=>{assert.equal(compareSemver('9.19.0','9.18.0'),1);assert.equal(compareSemver('9.18.0','9.18.0'),0);assert.equal(compareSemver('9.9.0','9.10.0'),-1);assert.equal(compareSemver('v10.0.0','9.99.9'),1);});
test('valid manifest',()=>assert.deepEqual(validateManifest(good,'v9.19.0'),[]));
test('rejects v-prefixed version, empty platforms, dmg on macOS, foreign url',()=>{
  assert.ok(validateManifest({...good,version:'v9.19.0'}).length);
  assert.ok(validateManifest({...good,platforms:{}}).length);
  assert.ok(validateManifest({...good,platforms:{'darwin-aarch64':{signature:'s',url:good.platforms['windows-x86_64'].url.replace('x64-setup.exe','macos.dmg')}}}).some(p=>p.includes('.dmg')));
  assert.ok(validateManifest({...good,platforms:{'windows-x86_64':{signature:'s',url:'https://evil.example/a.exe'}}}).length);
  assert.ok(validateManifest(good,'v9.20.0').length);
});
test('pickPlatform',()=>{assert.ok(pickPlatform(good,'windows-x86_64'));assert.equal(pickPlatform(good,'linux-x86_64'),null);});
test('full harness passes',()=>{const r=spawnSync('node',['scripts/updater-e2e/harness.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
test('harness: windows+linux only still works (backward compatible CLI)',()=>{
  const r=spawnSync('bash',['-c','d=$(mktemp -d); mkdir $d/w $d/l; touch $d/w/a.exe $d/l/a.AppImage; echo c2ln > $d/w/a.exe.sig; echo c2ln > $d/l/a.AppImage.sig; echo n > $d/n; python3 scripts/make-latest-json.py v9.19.0 $d/n $d/w $d/l $d/o.json && python3 -c "import json,sys;print(sorted(json.load(open(sys.argv[1]))[\'platforms\']))" $d/o.json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/linux-x86_64.*windows-x86_64|\['linux-x86_64', 'windows-x86_64'\]/);});
test('no signatures -> exit 3',()=>{const r=spawnSync('bash',['-c','d=$(mktemp -d); mkdir $d/w $d/l; echo n > $d/n; python3 scripts/make-latest-json.py v9.19.0 $d/n $d/w $d/l $d/o.json'],{encoding:'utf8'});assert.equal(r.status,3);});
test('prerelease manifests and numeric prerelease ordering',()=>{
 assert.equal(compareSemver('12.2.0-beta.10','12.2.0-beta.3'),1);
 assert.equal(compareSemver('12.2.0-beta.3','12.2.0-alpha.7'),1);
 assert.equal(compareSemver('12.2.0','12.2.0-beta.3'),1);
 assert.deepEqual(validateManifest({...good,version:'12.2.0-beta.3'},'v12.2.0-beta.3'),[]);
 const r=spawnSync('node',['scripts/updater-e2e/harness.mjs','--current','12.2.0-beta.2','--next','12.2.0-beta.3'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('manifest uses existing asset names, never invented tag-based names',()=>{
 const r=spawnSync('python3',['-c',`
import importlib.util, tempfile, pathlib
spec=importlib.util.spec_from_file_location('manifest','scripts/make-latest-json.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as root:
 d=pathlib.Path(root)
 for name in ['Somnia_12.2.0_x64-setup.exe','Somnia_12.2.0_amd64.AppImage','Somnia.app.tar.gz']:
  (d/name).write_text('artifact'); (d/(name+'.sig')).write_text('c2ln')
 p=m.platforms('v12.2.0-beta.3',root,root,root)
 assert p['windows-x86_64']['url'].endswith('/Somnia_12.2.0_x64-setup.exe')
 assert p['linux-x86_64']['url'].endswith('/Somnia_12.2.0_amd64.AppImage')
 assert p['darwin-aarch64']['url'].endswith('/Somnia.app.tar.gz')
 (d/'Somnia_12.2.0_x64-setup.exe').unlink()
 try: m.platforms('v12.2.0-beta.3',root,root,root)
 except ValueError: pass
 else: raise AssertionError('orphan signature accepted')
 (d/'Somnia_12.2.0_x64-setup.exe').write_text('artifact')
 (d/'other.exe').write_text('artifact'); (d/'other.exe.sig').write_text('sig')
 try: m.platforms('v12.2.0-beta.3',root,root,root)
 except ValueError: pass
 else: raise AssertionError('ambiguous signatures accepted')
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
