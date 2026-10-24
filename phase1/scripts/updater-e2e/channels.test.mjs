import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const py=(code)=>spawnSync('python3',['-c',`import importlib.util,json
spec=importlib.util.spec_from_file_location('m','scripts/make-latest-json.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
${code}`],{encoding:'utf8'});
test('tag to channel',()=>{
 const r=py(`print(json.dumps([m.channel_of(t) for t in ['v12.0.1','12.2.0','v12.2.0-beta.2','v12.2.0-rc.1','v12.2.0-alpha.7','v12.2.0-nightly.3','v12.2.0+build-1','v12.2.0-beta.1+x']]))`);
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(JSON.parse(r.stdout),['stable','stable','beta','beta','alpha','alpha','stable','beta']);
});
test('a release refreshes its own and all less stable channel manifests',()=>{
 const r=py(`print(json.dumps({t:m.channels_for(t) for t in ['v1.0.0','v1.0.0-beta.1','v1.0.0-alpha.1']}))`);
 const o=JSON.parse(r.stdout);
 assert.deepEqual(o['v1.0.0'],['latest.json','latest-beta.json','latest-alpha.json']);
 assert.deepEqual(o['v1.0.0-beta.1'],['latest-beta.json','latest-alpha.json']);
 assert.deepEqual(o['v1.0.0-alpha.1'],['latest-alpha.json']);
});
test('--channels-dir writes the manifests with the full prerelease version',()=>{
 const r=spawnSync('bash',['-c','d=$(mktemp -d); mkdir $d/w $d/l; touch $d/w/a.exe $d/l/a.AppImage; echo c2ln > $d/w/a.exe.sig; echo c2ln > $d/l/a.AppImage.sig; echo n > $d/n; python3 scripts/make-latest-json.py v12.2.0-beta.2 $d/n $d/w $d/l $d/o.json --channels-dir $d/c >/dev/null && ls $d/c && python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[\'version\'])" $d/c/latest-beta.json'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/latest-alpha\.json\nlatest-beta\.json\n12\.2\.0-beta\.2/);
});
