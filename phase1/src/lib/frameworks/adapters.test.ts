import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {planProject,parseNodeStart,isCanonicalBuildScript,declaredEnvNames,buildEnvFor,runtimeEnvFor,isUploadExcluded,verifyArtifactListing,safeRelativePath,planIsRunnable,type ProjectFiles} from './adapters';

const ROOT=join(import.meta.dirname,'fixtures/adapters');
function load(name:string):ProjectFiles{
 const files:Record<string,string>={};
 (function walk(dir:string,prefix:string){for(const e of readdirSync(dir,{withFileTypes:true})){if(e.isDirectory())walk(join(dir,e.name),prefix+e.name+'/');else files[prefix+e.name]=readFileSync(join(dir,e.name),'utf8');}})(join(ROOT,name),'');
 return files;
}
const plan=(name:string)=>{const p=planProject(load(name));assert.ok(p,name+' should be classified');return p;};
const P='frameworks.plan.';

test('every fixture folder is covered by a case below',()=>{
 const covered=new Set(['static-site','vite-react-ts','vite-vue-base','vite-outdir-escape','vite-custom-script','astro-static','astro-node','astro-vercel','next-export','next-standalone','next-plain','sveltekit-static','sveltekit-node','sveltekit-auto','nuxt-node','nuxt-generate','nuxt-cloudflare','express-js','express-hardcoded','express-ts','express-shell-start','express-no-lock','hostile-json','empty-folder']);
 assert.deepEqual(readdirSync(ROOT).sort(),[...covered].sort());
});

test('plain static folder: no install, no build, whole folder is the artifact',()=>{
 const p=plan('static-site');
 assert.equal(p.adapter,'static-html');assert.equal(p.output,'static');assert.equal(p.install.needed,false);assert.equal(p.build.needed,false);
 assert.equal(p.artifact.path,'.');assert.equal(p.artifact.index,'index.html');assert.equal(p.start,null);assert.deepEqual(p.blockers,[]);
});

test('vite react: static dist, locked install without scripts, fixed argv, loopback dev flags',()=>{
 const p=plan('vite-react-ts');
 assert.equal(p.adapter,'vite-spa');assert.equal(p.family,'react');assert.equal(p.language,'ts');assert.equal(p.output,'static');
 assert.deepEqual(p.install.argv,['npm','ci','--ignore-scripts']);assert.equal(p.install.ignoreScripts,true);
 assert.deepEqual(p.build.argv,['npm','run','build']);assert.equal(p.build.scriptReviewed,true);
 assert.equal(p.artifact.path,'dist');assert.equal(p.artifact.index,'dist/index.html');assert.equal(p.artifact.spaFallback,true);
 assert.deepEqual(p.dev.portArgs(5173),['--host','127.0.0.1','--port','5173','--strictPort']);
 assert.equal(p.env.publicPrefix,'VITE_');assert.deepEqual(p.env.clientExposed,['VITE_API_URL','VITE_SECRET_TOKEN']);
 assert.ok(p.warnings.includes(P+'secretInPublicEnv'));
});

test('vite: custom outDir and base are read, an escaping outDir blocks',()=>{
 const v=plan('vite-vue-base');assert.equal(v.family,'vue');assert.equal(v.artifact.path,'public-dist');assert.ok(v.warnings.includes(P+'viteBase'));assert.ok(v.warnings.includes(P+'noLockfile'));assert.deepEqual(v.install.argv,['npm','install','--ignore-scripts']);
 const e=plan('vite-outdir-escape');assert.equal(e.artifact.path,'dist');assert.ok(e.blockers.includes(P+'unsafeOutDir'));assert.equal(planIsRunnable(e),false);
});

test('a custom build script is flagged, never rewritten',()=>{
 const p=plan('vite-custom-script');
 assert.equal(p.family,'preact');assert.equal(p.build.scriptReviewed,false);assert.ok(p.warnings.includes(P+'customBuildScript'));assert.deepEqual(p.build.argv,['npm','run','build']);
});

test('astro: static by default, node adapter makes a server plan, other adapters block',()=>{
 const s=plan('astro-static');assert.equal(s.adapter,'astro-static');assert.equal(s.artifact.index,'dist/index.html');assert.equal(s.start,null);assert.equal(s.build.scriptReviewed,true);
 const n=plan('astro-node');assert.equal(n.adapter,'astro-node');assert.equal(n.output,'node');assert.deepEqual(n.start?.argv,['node','dist/server/entry.mjs']);assert.deepEqual(n.start?.derivedEnv,['PORT']);assert.equal(n.start?.nodeRange,'>=22');assert.deepEqual(n.blockers,[]);
 const v=plan('astro-vercel');assert.ok(v.blockers.includes(P+'adapterNotNode'));
});

test('next: export is static out/, standalone is a node bundle with static and public copied in',()=>{
 const e=plan('next-export');assert.equal(e.adapter,'next-export');assert.equal(e.artifact.index,'out/index.html');assert.ok(e.warnings.includes(P+'nextImageOptimizer'));assert.equal(e.env.publicPrefix,'NEXT_PUBLIC_');
 const s=plan('next-standalone');assert.equal(s.adapter,'next-standalone');assert.equal(s.output,'node');assert.equal(s.artifact.entry,'.next/standalone/server.js');
 assert.deepEqual(s.artifact.copies,[{from:'.next/static',to:'.next/standalone/.next/static'},{from:'public',to:'.next/standalone/public'}]);
 assert.deepEqual(s.start?.argv,['node','server.js']);assert.equal(s.start?.cwd,'.next/standalone');assert.equal(s.start?.env.HOSTNAME,'127.0.0.1');assert.equal(s.build.env.NEXT_TELEMETRY_DISABLED,'1');
 const n=plan('next-plain');assert.ok(n.blockers.includes(P+'nextNeedsOutput'));
});

test('sveltekit: static adapter, node adapter with ORIGIN from the deploy domain, auto adapter blocks',()=>{
 const s=plan('sveltekit-static');assert.equal(s.adapter,'sveltekit-static');assert.equal(s.artifact.path,'build');assert.equal(s.artifact.spaFallback,true);
 const n=plan('sveltekit-node');assert.equal(n.output,'node');assert.deepEqual(n.start?.argv,['node','build/index.js']);assert.deepEqual(n.start?.derivedEnv,['PORT','ORIGIN']);
 assert.ok(plan('sveltekit-auto').blockers.includes(P+'svelteAdapterAuto'));
});

test('nuxt: generate is static .output/public, default is a node server, unknown preset blocks',()=>{
 const g=plan('nuxt-generate');assert.equal(g.adapter,'nuxt-generate');assert.equal(g.artifact.index,'.output/public/index.html');
 const n=plan('nuxt-node');assert.equal(n.adapter,'nuxt-node');assert.deepEqual(n.start?.argv,['node','.output/server/index.mjs']);assert.equal(n.start?.env.NITRO_HOST,'127.0.0.1');
 assert.ok(plan('nuxt-cloudflare').blockers.includes(P+'nuxtPreset'));
});

test('plain node server: start from a simple node script, lockfile required, port and interface warnings',()=>{
 const e=plan('express-js');assert.equal(e.adapter,'node-server');assert.equal(e.output,'node');assert.deepEqual(e.start?.argv,['node','server.js']);assert.equal(e.build.needed,false);assert.deepEqual(e.blockers,[]);assert.deepEqual(e.env.declared,['DATABASE_URL','SESSION_SECRET']);assert.deepEqual(e.env.clientExposed,[]);assert.equal(e.artifact.entry,'server.js');
 const h=plan('express-hardcoded');assert.ok(h.warnings.includes(P+'hardcodedPort'));assert.ok(h.warnings.includes(P+'listensOnAllInterfaces'));
 const t=plan('express-ts');assert.deepEqual(t.start?.argv,['node','dist/server.js']);assert.equal(t.build.needed,true);assert.equal(t.language,'ts');
 assert.ok(plan('express-no-lock').blockers.includes(P+'lockMissing'));
});

test('a shell style start script is refused, not interpreted',()=>{
 const p=plan('express-shell-start');assert.equal(p.start,null);assert.ok(p.blockers.includes(P+'startNotPlain'));
 for(const bad of ['node a.js && rm -rf /','node --require ./x.js a.js','node -e "1"','npx tsx server.ts','node ../a.js','node /etc/a.js','node a.js; ls','node a.sh','NODE_OPTIONS=x node a.js','node --env-file=.env a.js','node a.js $(id)'])assert.equal(parseNodeStart(bad),null,bad);
 assert.deepEqual(parseNodeStart('node dist/server.js --port=3000'),['node','dist/server.js','--port=3000']);
 assert.deepEqual(parseNodeStart('node --enable-source-maps dist/app.mjs'),['node','--enable-source-maps','dist/app.mjs']);
});

test('hostile or unrelated folders are inert',()=>{
 assert.equal(planProject(load('hostile-json')),null);assert.equal(planProject(load('empty-folder')),null);
 assert.equal(planProject({'package.json':'x'.repeat(300*1024)}),null);
 assert.equal(planProject({'package.json':'[]'}),null);assert.equal(planProject({'package.json':'null'}),null);
 const proto=planProject({'package.json':'{"__proto__":{"x":1},"dependencies":{"vite":"1"},"scripts":{"build":"vite build"}}','index.html':''});assert.equal(proto?.adapter,'vite-spa');assert.equal(({} as Record<string,unknown>).x,undefined);
});

test('canonical build scripts are an exact allowlist',()=>{
 for(const ok of ['vite build','tsc -b && vite build','vue-tsc -b && vite build','astro check && astro build','next build','nuxt generate','svelte-kit sync && vite build'])assert.equal(isCanonicalBuildScript(ok),true,ok);
 for(const bad of ['vite build && node x.js','vite build; ls','curl x | sh','vite build --mode $(id)','node build.js',undefined,''])assert.equal(isCanonicalBuildScript(bad as string),false,String(bad));
});

test('env names are read from the example file, values are never kept',()=>{
 assert.deepEqual(declaredEnvNames({'.env.example':'# c\nA=1\nexport B="s3cret"\n9BAD=1\nC =x\nA=2\n'}),['A','B','C']);
 assert.deepEqual(declaredEnvNames({'.env':'SECRET=1'}),[]);
});

test('build env accepts only public prefixed names and never reserved ones',()=>{
 const p=plan('vite-react-ts');
 const {env,rejected}=buildEnvFor(p,{VITE_API_URL:'https://x.test',DATABASE_URL:'postgres://u:p@h/db',NODE_ENV:'development',SOMNIA_TOKEN:'t',SSH_AUTH_SOCK:'/s','bad name':'1',VITE_BIG:'x'.repeat(5000),PATH:'/evil'});
 assert.equal(env.VITE_API_URL,'https://x.test');assert.equal(env.NODE_ENV,'production');assert.equal(env.CI,'1');
 assert.deepEqual(Object.keys(env).sort(),['CI','NODE_ENV','VITE_API_URL']);
 assert.deepEqual(rejected.map(r=>r.reason).sort(),['invalidName','notPublic','reserved','reserved','reserved','reserved','tooLong']);
 assert.ok(!JSON.stringify(rejected).includes('postgres://'));
});

test('runtime env: project values pass, Somnia values win, derived values are required',()=>{
 const p=plan('sveltekit-node');
 const r=runtimeEnvFor(p,{DATABASE_URL:'postgres://x',HOST:'0.0.0.0',NODE_ENV:'development',PORT:'1',NODE_OPTIONS:'--require x'},{PORT:'18080'});
 assert.equal(r.env.HOST,'127.0.0.1');assert.equal(r.env.NODE_ENV,'production');assert.equal(r.env.PORT,'18080');assert.equal(r.env.DATABASE_URL,'postgres://x');assert.equal(r.env.NODE_OPTIONS,undefined);
 assert.deepEqual(r.missing,['ORIGIN']);
 const ok=runtimeEnvFor(p,{},{PORT:'18080',ORIGIN:'https://site.test'});assert.deepEqual(ok.missing,[]);assert.equal(ok.env.ORIGIN,'https://site.test');
 assert.deepEqual(runtimeEnvFor(plan('vite-react-ts'),{A:'1'},{}),{env:{},missing:[],rejected:[]});
});

test('upload exclusion covers env files, keys and VCS folders but keeps example env files out of the secret list',()=>{
 for(const p of ['.env','.env.local','.env.production','dist/.env','.git/config','.ssh/id_rsa','id_ed25519','cert.pem','server.key','.npmrc','.htpasswd','somnia.template.json','a/.somnia/state'])assert.equal(isUploadExcluded(p),true,p);
 for(const p of ['index.html','dist/assets/app.js','.env.example','.htaccess','env.js','keyboard.js'])assert.equal(isUploadExcluded(p),false,p);
});

test('artifact listing checks: missing index or entry, excluded files, source maps, unsafe paths',()=>{
 const react=plan('vite-react-ts');
 const good=verifyArtifactListing(react,['dist/index.html','dist/assets/a.js','dist/.env','dist/assets/a.js.map','src/App.tsx']);
 assert.equal(good.ok,true);assert.deepEqual(good.files,['dist/index.html','dist/assets/a.js','dist/assets/a.js.map']);assert.deepEqual([...good.warnings].sort(),[P+'excludedFiles',P+'sourceMaps']);
 assert.deepEqual(verifyArtifactListing(react,['dist/assets/a.js']).errors,[P+'noIndex']);assert.deepEqual(verifyArtifactListing(react,[]).errors,[P+'distMissing']);
 assert.equal(verifyArtifactListing(react,['dist/index.html','dist/../../x']).ok,false);
 const next=plan('next-standalone');
 assert.deepEqual(verifyArtifactListing(next,['.next/standalone/package.json']).errors,[P+'noEntry']);
 const withEntry=verifyArtifactListing(next,['.next/standalone/server.js','.next/static/a.js','public/x.png']);assert.equal(withEntry.ok,true);assert.ok(withEntry.warnings.includes(P+'copyPending'));
 const done=verifyArtifactListing(next,['.next/standalone/server.js','.next/standalone/.next/static/a.js','.next/standalone/public/x.png','.next/static/a.js']);assert.ok(!done.warnings.includes(P+'copyPending'));
 const ex=plan('express-js');const chk=verifyArtifactListing(ex,['server.js','package.json','package-lock.json','node_modules/express/index.js','.env']);
 assert.equal(chk.ok,true);assert.deepEqual(chk.files,['server.js','package.json','package-lock.json']);
 assert.deepEqual(verifyArtifactListing(ex,['server.js']).errors,[P+'noPackage']);
 const st=plan('static-site');assert.equal(verifyArtifactListing(st,['index.html','style.css','.git/HEAD']).ok,true);
 const srv=verifyArtifactListing(react,['dist/index.html','dist/server/app.js']);assert.ok(srv.warnings.includes(P+'serverCodeInStatic'));
});

test('safeRelativePath rejects traversal, absolute, drive, space and shell characters',()=>{
 for(const p of ['','../a','a/../b','/a','C:/a','a\\b','a b','a;b','a|b','$(x)','a//b','a/','x'.repeat(201)])assert.equal(safeRelativePath(p),false,p);
 for(const p of ['a','dist/server/entry.mjs','.next/standalone/server.js','a-b_c.d/e'])assert.equal(safeRelativePath(p),true,p);
});
