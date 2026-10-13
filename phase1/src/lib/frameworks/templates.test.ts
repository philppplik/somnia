import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {scaffoldProject} from './scaffold';

test('public template module imports under Node without evaluating Vite glob',async()=>{
 const module=await import('./templates');
 assert.equal(typeof module.reactTemplate,'function');
 assert.equal(typeof module.reactTemplateFromFiles,'function');
});

test('pure template assembly preserves both bundled languages and hidden files',async()=>{
 const {reactTemplateFromFiles}=await import('./templates');
 const bundled:Record<string,string>={};
 for(const language of ['ts','js'] as const){
  const root=join(import.meta.dirname,'templates/react-'+language);
  function walk(dir:string,prefix=''){
   for(const entry of readdirSync(dir,{withFileTypes:true})){
    const path=prefix+entry.name;
    if(entry.isDirectory())walk(join(dir,entry.name),path+'/');
    else bundled[`./templates/react-${language}/${path}`]=readFileSync(join(dir,entry.name),'utf8');
   }
  }
  walk(root);
 }
 for(const language of ['ts','js'] as const){
  const template=reactTemplateFromFiles(language,bundled);
  assert.equal(template.manifest.language,language);
  const files=scaffoldProject(template,'node-safe-app');
  assert.ok(files['.gitignore']);assert.ok(files['somnia-preview.mjs']);
  assert.ok(files[`src/App.${language}x`]);
  assert.equal(JSON.parse(files['package.json']).name,'node-safe-app');
  assert.equal(Object.keys(files).some(path=>path.startsWith('./templates/')),false);
 }
});
