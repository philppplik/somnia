#!/usr/bin/env node
/**
 * Post-build assertion: the v2 dev-fixture host (devHost.ts, jsWorker.ts,
 * exampleGuest.ts, example.json) must NOT land in the release artifact.
 * App.tsx legitimately keeps its statically-dead gate strings
 * ('somnia.extensions.v2dev', 'extensions.v2dev'), so the markers below are
 * guest/manifest/worker-specific literals that only exist in the dev-fixture
 * modules. String literals survive minification; lazy worker/module chunks are
 * separate files under dist/, so every file under dist/ is scanned.
 *
 * Usage:
 *   node scripts/assert-no-dev-fixture.mjs [distDir]   assert a build output (default: dist)
 *   node scripts/assert-no-dev-fixture.mjs --selftest  prove detection on synthetic artifacts
 */
import {readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

export const MARKERS=[
 {needle:'acme.word-count',origin:'fixture manifest id (example.json / devHost / exampleGuest)'},
 {needle:'v2 live event:',origin:'exampleGuest event notice'},
 {needle:'Word count: ',origin:'exampleGuest command notice'},
 {needle:'does not export activate',origin:'jsWorker bootstrap error'},
];

export function scanDir(root){
 const hits=[];
 const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){
  const p=join(dir,e.name);
  if(e.isDirectory()){walk(p);continue;}
  let text;try{text=readFileSync(p,'utf8');}catch{continue;}
  for(const m of MARKERS)if(text.includes(m.needle))hits.push({file:p,marker:m});
 };};
 walk(root);
 return hits;
}

const arg=process.argv[2];
if(arg==='--selftest'){
 const dir=mkdtempSync(join(tmpdir(),'devfixture-assert-'));
 const {mkdirSync}=await import('node:fs');
 try{
  writeFileSync(join(dir,'index-clean.js'),'const flag=\'somnia.extensions.v2dev\';reportError(\'extensions.v2dev\',e);console.log(1);');
  if(scanDir(dir).length)throw new Error('selftest: clean artifact was flagged (false positive)');
  for(const m of MARKERS){
   const sub=join(dir,'chunk-'+m.needle.replace(/[^a-z0-9]/gi,'_'));
   mkdirSync(sub);
   writeFileSync(join(sub,'lazy-chunk.js'),`// minified\n!function(){const s="${m.needle}";console.log(s)}();`);
   const hits=scanDir(dir);
   if(!hits.some(h=>h.marker===m))throw new Error(`selftest: marker not detected: ${m.needle}`);
   rmSync(sub,{recursive:true,force:true});
  }
  console.log(`selftest ok: clean artifact passes, all ${MARKERS.length} markers detected in separate chunks`);
 }finally{rmSync(dir,{recursive:true,force:true});}
}else{
 const root=arg??'dist';
 const hits=scanDir(root);
 if(hits.length){
  for(const h of hits)console.error(`DEV-FIXTURE IN RELEASE ARTIFACT: ${h.file} contains '${h.marker.needle}' (${h.marker.origin})`);
  process.exit(1);
 }
 console.log(`ok: no v2 dev-fixture markers in ${root} (${MARKERS.length} markers scanned)`);
}
