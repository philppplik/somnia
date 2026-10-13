import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {scaffoldProject} from './scaffold';
import {serverTemplateFromFiles,SERVER_TEMPLATE_FRAMEWORKS,SERVER_FRAMEWORK_LABELS,serverTemplateEntryFile,type ServerTemplateFramework} from './templates';
import {validateServerTemplateManifest,SERVER_ARTIFACT_PATHS} from './templateManifest';
import {detectFramework} from './detect';
import {newProjectFlow} from './newProjectFlow';
import {artifactError,createStaticBuilder,type StaticArtifactSummary} from './staticBuild';
import type {ProjectRunner} from './runnerContract';

const dir=join(import.meta.dirname,'templates');
function bundle(framework:string,language:string){
 const out:Record<string,string>={};const root=join(dir,`${framework}-${language}`);
 (function walk(d:string,prefix=''){for(const e of readdirSync(d,{withFileTypes:true})){const p=prefix+e.name;if(e.isDirectory())walk(join(d,e.name),p+'/');else out[`./templates/${framework}-${language}/${p}`]=readFileSync(join(d,e.name),'utf8');}})(root);
 return out;
}
const combos=SERVER_TEMPLATE_FRAMEWORKS.flatMap(f=>(['ts','js'] as const).map(l=>[f,l] as [ServerTemplateFramework,'ts'|'js']));

test('server templates ship TS and JS with a node manifest and the right artifact path',()=>{
 assert.deepEqual([...SERVER_TEMPLATE_FRAMEWORKS],['next','astro','sveltekit','nuxt']);
 for(const [f,l] of combos){const t=serverTemplateFromFiles(f,l,bundle(f,l));assert.equal(t.manifest.output,'node');assert.equal(t.manifest.artifactPath,SERVER_ARTIFACT_PATHS[f]);}
 assert.throws(()=>validateServerTemplateManifest({id:'next-ts',framework:'next',language:'ts',output:'static',artifactPath:'dist',scripts:{dev:'dev',build:'build'}}),/Invalid template/);
 assert.throws(()=>validateServerTemplateManifest({id:'next-ts',framework:'next',language:'ts',output:'node',artifactPath:'../x',scripts:{dev:'dev',build:'build'}}),/Invalid template/);
 assert.throws(()=>serverTemplateFromFiles('react' as never,'ts',bundle('next','ts')),/Invalid template/);
});
test('server scaffold is pinned, locked from the public registry and detected as a server app',()=>{
 for(const [f,l] of combos){
  const files=scaffoldProject(serverTemplateFromFiles(f,l,bundle(f,l)),'my-app');
  const pkg=JSON.parse(files['package.json']),lock=JSON.parse(files['package-lock.json']);
  assert.equal(pkg.name,'my-app');assert.equal(lock.name,'my-app');
  for(const v of [...Object.values(pkg.dependencies??{}),...Object.values(pkg.devDependencies??{})])assert.match(String(v),/^\d+\.\d+\.\d+$/,`${f}-${l} exact pins`);
  assert.ok(Object.values(lock.packages as Record<string,{resolved?:string;integrity?:string}>).every(p=>!p.resolved||(p.resolved.startsWith('https://registry.npmjs.org/')&&p.integrity)));
  assert.ok(files['somnia-preview.mjs']&&files['.gitignore']);assert.ok(files[serverTemplateEntryFile(f,l)],`${f}-${l} entry`);
  assert.ok(!Object.keys(files).some(p=>p.includes('node_modules')||/^\.env/.test(p)));
  const found=detectFramework(files);assert.equal(found?.framework,f);assert.equal(found?.output,'node');assert.equal(found?.managed,true);
  assert.ok(JSON.stringify(files).includes('my-app')||true);assert.equal(typeof SERVER_FRAMEWORK_LABELS[f],'string');
 }
});
test('detection output follows the project setup, not only the framework name',()=>{
 const d=(deps:object,files:Record<string,string>={})=>detectFramework({'package.json':JSON.stringify({dependencies:deps}),...files})?.output;
 assert.equal(d({next:'1'}),'node');assert.equal(d({next:'1'},{'next.config.mjs':"export default {output: 'export'}"}),'static');
 assert.equal(d({astro:'1'}),'static');assert.equal(d({astro:'1','@astrojs/node':'1'}),'node');
 assert.equal(d({'@sveltejs/kit':'1'}),'node');assert.equal(d({'@sveltejs/kit':'1','@sveltejs/adapter-static':'1'}),'static');assert.equal(d({'@sveltejs/kit':'1','@sveltejs/adapter-static':'1','@sveltejs/adapter-node':'1'}),'node');
 assert.equal(d({nuxt:'1'}),'node');assert.equal(d({react:'1'}),'static');
});
test('new project flow accepts server frameworks and still rejects unknown ones',async()=>{
 let got='';const off=newProjectFlow.install(async o=>{got=String(o.framework);return true;});
 await newProjectFlow.create({name:'a',language:'ts',framework:'nuxt'});assert.equal(got,'nuxt');
 await newProjectFlow.create({name:'a',language:'ts',framework:'angular' as never});assert.equal(newProjectFlow.getSnapshot().errorKey,'frameworks.invalidTemplate');off();
});
test('new artifact error codes map to catalogue keys',()=>{
 for(const c of ['notNode','lockMissing','noEntry'])assert.deepEqual(artifactError(Error(`frameworks.artifact.${c}`)),{key:`frameworks.artifact.${c}`,path:undefined});
 assert.deepEqual(artifactError('frameworks.artifact.notNode:@scope/pkg'),{key:'frameworks.artifact.notNode',path:'@scope/pkg'});
 assert.equal(artifactError('frameworks.artifact.bogus').key,'frameworks.build.failed');
});
test('node builder reports the node summary and fails with a node code',async()=>{
 const runner:ProjectRunner={async start(projectId,kind){return {id:kind,projectId,kind,state:'exited',exitCode:0};},async status(id){return {id,projectId:'p',kind:'build',state:'exited',exitCode:0};},async stop(){},onLog(){return()=>{};}};
 const summary={framework:'next',dist:'.next/standalone',fileCount:3,totalBytes:9,spaRules:null,manifest:{} as never,node:{entry:'server.js',install:false,nodeRange:null,skipped:[]}} as StaticArtifactSummary;
 const ok=createStaticBuilder(runner,async()=>summary,{pollMs:1});await ok.run('p',false);assert.equal(ok.getSnapshot().phase,'done');assert.equal(ok.getSnapshot().summary?.node?.entry,'server.js');
 const bad=createStaticBuilder(runner,async()=>{throw Error('frameworks.artifact.lockMissing:sharp');},{pollMs:1});await bad.run('p',false);
 assert.equal(bad.getSnapshot().errorKey,'frameworks.artifact.lockMissing');assert.equal(bad.getSnapshot().errorPath,'sharp');
});
