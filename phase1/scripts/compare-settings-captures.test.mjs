import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/compare-settings-captures.mjs');
function fixture(run){const root=mkdtempSync(resolve(tmpdir(),'settings-evidence-'));const a=resolve(root,'before'),b=resolve(root,'after');mkdirSync(a);mkdirSync(b);for(const mode of ['light','dark','high'])for(const dir of [a,b]){writeFileSync(resolve(dir,`${mode}-manifest.json`),JSON.stringify({results:[{section:'General',status:'captured',controls:[{tag:'input',id:'language',value:'en',slot:dir===a?null:'native-input'}]}]}));writeFileSync(resolve(dir,`${mode}-general-top.png`),'fixture, not visual proof');}try{run(a,b);}finally{rmSync(root,{recursive:true,force:true});}}
const compare=(a,b)=>spawnSync(process.execPath,[script,a,b],{encoding:'utf8'});
test('additive slot alone does not change control contract',()=>fixture((a,b)=>{const result=compare(a,b);assert.equal(result.status,0);assert.match(result.stdout,/does not approve visual parity/);}));
test('changed control contract fails',()=>fixture((a,b)=>{writeFileSync(resolve(b,'light-manifest.json'),JSON.stringify({results:[{section:'General',status:'captured',controls:[]}]}));assert.equal(compare(a,b).status,1);}));
test('missing screenshot inventory fails',()=>fixture((a,b)=>{rmSync(resolve(b,'dark-general-top.png'));assert.equal(compare(a,b).status,1);}));
test('missing scheme manifest fails rather than claiming completion',()=>fixture((a,b)=>{rmSync(resolve(b,'high-manifest.json'));assert.notEqual(compare(a,b).status,0);}));
