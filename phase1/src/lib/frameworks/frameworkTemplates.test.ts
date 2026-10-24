import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {scaffoldProject} from './scaffold';
import {frameworkTemplateFromFiles,templateEntryFile,TEMPLATE_FRAMEWORKS,FRAMEWORK_LABELS,type FrameworkLanguage,type TemplateFramework} from './templates';
import {validateTemplateManifest} from './templateManifest';
import {detectFramework,frameworkLabel} from './detect';
import {newProjectFlow} from './newProjectFlow';

const dir=join(import.meta.dirname,'templates');
function bundle(framework:string,language:string){
 const out:Record<string,string>={};const root=join(dir,`${framework}-${language}`);
 (function walk(d:string,prefix=''){for(const e of readdirSync(d,{withFileTypes:true})){const p=prefix+e.name;if(e.isDirectory())walk(join(d,e.name),p+'/');else out[`./templates/${framework}-${language}/${p}`]=readFileSync(join(d,e.name),'utf8');}})(root);
 return out;
}
const combos=TEMPLATE_FRAMEWORKS.flatMap(f=>(['ts','js'] as const).map(l=>[f,l] as [TemplateFramework,FrameworkLanguage]));

test('every framework ships a TypeScript and a JavaScript template with a matching manifest',()=>{
 assert.deepEqual([...TEMPLATE_FRAMEWORKS],['react','vue','svelte','solid']);
 for(const [framework,language] of combos){
  const t=frameworkTemplateFromFiles(framework,language,bundle(framework,language));
  assert.equal(t.manifest.id,`${framework}-${language}`);assert.equal(t.manifest.output,'static');assert.equal(t.manifest.artifactPath,'dist');
 }
});
test('template assembly rejects a mismatched manifest or an unknown framework',()=>{
 const files=bundle('vue','ts');
 assert.throws(()=>frameworkTemplateFromFiles('svelte','ts',Object.fromEntries(Object.entries(files).map(([k,v])=>[k.replace('vue-ts','svelte-ts'),v]))),/Invalid template/);
 assert.throws(()=>frameworkTemplateFromFiles('angular' as never,'ts',files),/Invalid template/);
 assert.throws(()=>frameworkTemplateFromFiles('vue','js',files),/Invalid template/);
 for(const bad of [{id:'vue-js',framework:'vue',language:'ts'},{id:'angular-ts',framework:'angular',language:'ts'}])assert.throws(()=>validateTemplateManifest({...bad,output:'static',artifactPath:'dist',scripts:{dev:'dev',build:'build'}}),/Invalid template/);
});
test('scaffold output is complete, pinned, offline and detected as the right framework',()=>{
 for(const [framework,language] of combos){
  const files=scaffoldProject(frameworkTemplateFromFiles(framework,language,bundle(framework,language)),'my-app');
  const pkg=JSON.parse(files['package.json']);const lock=JSON.parse(files['package-lock.json']);
  assert.equal(pkg.name,'my-app');assert.equal(lock.name,'my-app');assert.equal(lock.packages[''].name,'my-app');
  assert.deepEqual(Object.keys(pkg.scripts),['dev','build']);assert.equal(pkg.scripts.build,'vite build');
  for(const v of [...Object.values(pkg.dependencies),...Object.values(pkg.devDependencies)])assert.match(String(v),/^\d+\.\d+\.\d+$/,`${framework}-${language} pins exact versions`);
  assert.ok(files['somnia-preview.mjs']&&files['.gitignore']&&files['vite.config.mjs']&&files['src/style.css']);
  assert.match(files['index.html'],/lang="en"/);assert.match(files['index.html'],/<title>my-app<\/title>/);
  assert.ok(files[templateEntryFile(framework,language)],`${framework}-${language} entry exists`);
  assert.ok(Object.values(lock.packages as Record<string,{resolved?:string}>).every(p=>!p.resolved||p.resolved.startsWith('https://registry.npmjs.org/')));
  assert.ok(Object.values(lock.packages as Record<string,{integrity?:string;resolved?:string}>).every(p=>!p.resolved||p.integrity));
  assert.ok(!/https?:\/\//.test(files['index.html'].replace(/<!doctype[^>]*>/i,'')));
  const found=detectFramework(files);assert.equal(found?.framework,framework);assert.equal(found?.language,language);assert.equal(found?.managed,true);assert.equal(found?.output,'static');assert.equal(found?.entry,templateEntryFile(framework,language));
  assert.equal(language==='ts',Boolean(files['tsconfig.json']));
  assert.equal(Object.keys(files).some(p=>p.startsWith('./')||p.includes('node_modules')),false);
 }
});
test('starters are accessible and share one look',()=>{
 for(const [framework,language] of combos){
  const entry=bundle(framework,language)[`./templates/${framework}-${language}/${templateEntryFile(framework,language)}`];
  assert.match(entry,/role="status"/);assert.match(entry,/aria-live="polite"/);assert.match(entry,/Made with Somnia/);assert.match(entry,new RegExp(`working ${FRAMEWORK_LABELS[framework]} app`));
  assert.equal(bundle(framework,language)[`./templates/${framework}-${language}/src/style.css`],bundle('react','ts')['./templates/react-ts/src/style.css']);
 }
});
test('the dev-only preview plugin copy is identical in every template',()=>{
 const central=readFileSync(join(dir,'somnia-vite-plugin.mjs'),'utf8');
 for(const [framework,language] of combos)assert.equal(readFileSync(join(dir,`${framework}-${language}`,'somnia-preview.mjs'),'utf8'),central,`${framework}-${language}`);
 for(const [framework,language] of combos){const cfg=readFileSync(join(dir,`${framework}-${language}`,'vite.config.mjs'),'utf8');assert.match(cfg,/somniaPreview\(\)/);}
});
test('framework projects other than react are detected without being managed unless a manifest says so',()=>{
 for(const [dep,framework] of [['vue','vue'],['svelte','svelte'],['solid-js','solid']] as const){
  const found=detectFramework({'package.json':JSON.stringify({dependencies:{[dep]:'1.0.0'}}),'src/main.js':''});
  assert.equal(found?.framework,framework);assert.equal(found?.managed,false);
 }
 assert.equal(frameworkLabel('vue'),'Vue');assert.equal(frameworkLabel('solid'),'Solid');assert.equal(frameworkLabel('mystery'),'mystery');
});
test('new project flow rejects an unknown framework before calling the handler',async()=>{
 let calls=0;const off=newProjectFlow.install(async()=>{calls++;return true;});newProjectFlow.open();
 await newProjectFlow.create({name:'app',language:'ts',framework:'angular' as never});
 assert.equal(calls,0);assert.equal(newProjectFlow.getSnapshot().errorKey,'frameworks.invalidTemplate');
 await newProjectFlow.create({name:'app',language:'ts',framework:'vue'});assert.equal(calls,1);assert.equal(newProjectFlow.getSnapshot().open,false);off();
});
