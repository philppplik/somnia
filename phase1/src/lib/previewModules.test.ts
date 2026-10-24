import test from 'node:test';
import assert from 'node:assert/strict';
import {findImportSpecs,newModuleState,rewriteImports,toJsDataUrl} from './previewModules';
import {collectDeps,planPreviewUpdate} from './previewDeps';
const decode=(url:string)=>Buffer.from(url.slice(url.indexOf(',')+1),'base64').toString('utf8');
test('findImportSpecs finds relative static, re-export and dynamic specifiers and ignores bare ones, comments and strings with //',()=>{
 const js=`import a from './a.js';\nimport {b} from "../lib/b.js";\nexport * from './re.js';\nimport 'pkg';\nimport x from 'https://cdn/x.js';\n// import c from './commented.js'\n/* import d from './block.js' */\nconst u='http://x/y';\nconst m=await import('./lazy.js');`;
 assert.deepEqual(findImportSpecs(js).map(s=>s.spec),['./a.js','../lib/b.js','./re.js','./lazy.js']);
 for(const s of findImportSpecs(js))assert.equal(js.slice(s.start,s.end),s.spec);
});
test('rewriteImports inlines nested relative imports as data: URLs and keeps line numbers',async()=>{
 const files={'main.js':`import {a} from './lib/a.js';\nglobalThis.out=a+1;`,'lib/a.js':`import {b} from '../util/b.js';\nexport const a=b*2;`,'util/b.js':`export const b=21;`};
 const state=newModuleState();
 const out=rewriteImports(files,'main.js',files['main.js'],state);
 assert.match(out,/^import \{a\} from 'data:text\/javascript;base64,/);
 assert.equal(out.split('\n').length,2);assert.deepEqual(state.cycles,[]);
 const mod=await import(toJsDataUrl(out));void mod;assert.equal((globalThis as any).out,43);
 const inner=out.match(/'(data:[^']+)'/)![1];assert.match(decode(inner),/export const a=b\*2/);assert.doesNotMatch(decode(inner),/\.\.\/util/);
});
test('a module imported by two parents gets one URL (one instance)',()=>{
 const files={'a.js':`import './s.js';`,'b.js':`import './s.js';`,'s.js':`export const n=1;`};const st=newModuleState();
 const a=rewriteImports(files,'a.js',files['a.js'],st),b=rewriteImports(files,'b.js',files['b.js'],st);
 assert.equal(a.match(/'(data:[^']+)'/)![1],b.match(/'(data:[^']+)'/)![1]);
});
test('import cycles are reported and broken with an empty module, so the rest still links',async()=>{
 const files={'a.js':`import './b.js';\nglobalThis.cyc='a ran';`,'b.js':`import './a.js';\nexport const x=1;`};const st=newModuleState();
 const out=rewriteImports(files,'a.js',files['a.js'],st);
 assert.deepEqual(st.cycles,['a.js → b.js → a.js']);
 await import(toJsDataUrl(out));assert.equal((globalThis as any).cyc,'a ran');
 const self={'s.js':`import './s.js';`};const st2=newModuleState();rewriteImports(self,'s.js',self['s.js'],st2);assert.deepEqual(st2.cycles,['s.js → s.js']);
});
test('missing modules and unresolved specifiers stay untouched (the resolver reports the file)',()=>{
 const js=`import './gone.js';import '../../outside.js';`;const st=newModuleState();
 assert.equal(rewriteImports({'m.js':js},'m.js',js,st),js);
});
test('non-ASCII module text survives the data: URL',()=>{
 const url=toJsDataUrl('export const s="Größe ✓ 日本語";');assert.equal(decode(url),'export const s="Größe ✓ 日本語";');
});
test('plan: editing an imported module (not just the entry script) rebuilds the preview',()=>{
 const base={'index.html':'<script type="module" src="js/main.js"></script>','js/main.js':`import './lib/x.js';`,'js/lib/x.js':'export const x=1;'};
 const deps=collectDeps(base,'index.html');assert.deepEqual(deps.js,['js/main.js','js/lib/x.js']);
 assert.deepEqual(planPreviewUpdate({files:base,active:'index.html'},{files:{...base,'js/lib/x.js':'export const x=2;'},active:'index.html'}),{kind:'full'});
 const inline={'index.html':'<script type="module">import "./m.js"</script>','m.js':'1'};
 assert.deepEqual(collectDeps(inline,'index.html').js,['m.js']);
 assert.deepEqual(planPreviewUpdate({files:inline,active:'index.html'},{files:{...inline,'m.js':'2'},active:'index.html'}),{kind:'full'});
});
